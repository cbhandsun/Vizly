import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { shouldRetryEvaluateAfterTimeout } from '../smokeRouteBudgetUtils.mjs';

const fail = (message, details) => {
  const error = new Error(message);
  if (details) error.details = details;
  throw error;
};

export class CdpSession {
  constructor(browserUrl, targetId, { viewport = null, isMobile = false } = {}) {
    this.browserUrl = browserUrl;
    this.targetId = targetId;
    this.viewport = viewport;
    this.isMobile = isMobile;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.logs = [];
    this.networkIssues = [];
    this.pendingLogEnrichments = [];
    this.requests = new Map();
  }

  async open() {
    if (!this.browserUrl) {
      fail('Browser did not provide a browser-level DevTools WebSocket URL.');
    }

    this.socket = new WebSocket(this.browserUrl);
    this.socket.on('message', (data) => {
      this.onMessage(data).catch((error) => {
        this.logs.push({ level: 'error', message: `Failed to parse CDP message: ${error.message}` });
      });
    });
    await new Promise((resolveOpen, rejectOpen) => {
      const timeout = setTimeout(() => rejectOpen(new Error('Timed out opening CDP WebSocket')), 10000);
      this.socket.once('open', () => {
        clearTimeout(timeout);
        resolveOpen();
      });
      this.socket.once('error', rejectOpen);
    });

    const attachResult = await this.send('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    }, 10000, false);
    this.sessionId = attachResult.sessionId;

    await Promise.all([
      this.send('Runtime.enable'),
      this.send('Page.enable'),
      this.send('Log.enable'),
      this.send('Network.enable'),
    ]);
    await this.send('Runtime.evaluate', {
      expression: `
        (function () {
          if (window.__smokeErrorCaptureInstalled) return;
          window.__smokeErrorCaptureInstalled = true;
          window.__smokeErrorCapture = [];
          window.__smokeErrorCaptureLimit = 50;

          const record = (entry) => {
            window.__smokeErrorCapture.push({
              ...entry,
              at: Date.now(),
            });
            if (window.__smokeErrorCapture.length > window.__smokeErrorCaptureLimit) {
              window.__smokeErrorCapture.shift();
            }
          };

          window.addEventListener('error', (event) => {
            const err = event?.error;
            record({
              type: 'error',
              message: err?.message || String(event?.message || 'unknown error'),
              stack: err?.stack || null,
              filename: event?.filename || null,
              lineno: event?.lineno || null,
              colno: event?.colno || null,
              source: event?.type || 'window',
            });
          });

          window.addEventListener('unhandledrejection', (event) => {
            const reason = event?.reason;
            record({
              type: 'unhandledrejection',
              message: reason?.message || String(reason || 'unknown rejection'),
              stack: reason?.stack || null,
              source: 'unhandledrejection',
            });
          });
        })();
      `,
      awaitPromise: true,
    }).catch(() => {});
    if (this.viewport) {
      await this.send('Emulation.setDeviceMetricsOverride', {
        width: this.viewport.width,
        height: this.viewport.height,
        deviceScaleFactor: this.viewport.scale,
        mobile: this.viewport.width <= 600,
      });
      await this.send('Emulation.setVisibleSize', {
        width: this.viewport.width,
        height: this.viewport.height,
      }).catch(() => {});
    }
    await this.send('Page.bringToFront').catch(() => {});
  }

  close() {
    this.socket?.close();
  }

  async onMessage(messageData) {
    const data = typeof messageData === 'string'
      ? messageData
      : Buffer.isBuffer(messageData)
        ? messageData.toString('utf8')
        : String(messageData);
    const message = JSON.parse(data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
      else resolve(message.result);
      return;
    }

    const waiters = this.eventWaiters.get(message.method);
    if (waiters?.length) {
      const waiter = waiters.shift();
      waiter.resolve(message.params);
      if (waiters.length === 0) this.eventWaiters.delete(message.method);
    }

    const describeConsoleArg = (arg) => {
      if (!arg) return '';
      if (arg.value !== undefined) return String(arg.value);
      if (arg.description) return String(arg.description);
      if (arg.preview?.description) return String(arg.preview.description);
      if (arg.type === 'object' && arg.className) return `[${arg.className}]`;
      return '';
    };

    if (message.method === 'Runtime.consoleAPICalled') {
      const { type, args = [] } = message.params;
      if (['warning', 'warn', 'error'].includes(type)) {
        const formattedArgs = args.map((arg) => describeConsoleArg(arg)).filter(Boolean);
        const includeRaw = process.env.SMOKE_LOG_RAW === '1';
        const logEntry = {
          level: type === 'warning' ? 'warn' : type,
          message: formattedArgs.length ? formattedArgs.join(' ') : `[${type}]`,
          ...(includeRaw ? {
            rawArgs: args.map((arg) => ({
              type: arg.type,
              objectId: arg.objectId,
              value: arg.value,
              description: arg.description,
              className: arg.className,
              preview: arg.preview
                ? {
                    type: arg.preview.type,
                    subtype: arg.preview.subtype,
                    description: arg.preview.description,
                    overflow: arg.preview.overflow,
                    properties: (arg.preview.properties || []).map((property) => ({
                      name: property.name,
                      type: property.type,
                      value: property.value ? String(property.value.value ?? property.value.description ?? '') : undefined,
                    })),
                }
                : undefined,
            })),
          } : {}),
        };
        const entryIndex = this.logs.push(logEntry) - 1;
        const enrichObjectArg = async (arg, rawArg) => {
          if (!arg.objectId || !includeRaw) return;
          try {
            const objectProperties = await this.send('Runtime.getProperties', {
              objectId: arg.objectId,
              ownProperties: true,
            }, 2000);
            const properties = objectProperties?.result || [];
            const getValue = (name) => {
              const matched = properties.find((property) => property.name === name);
              const rawValue = matched?.value;
              if (!rawValue) return undefined;
              return rawValue.unserializableValue ?? rawValue.value ?? rawValue.description;
            };
            const objectSnapshot = {
              name: getValue('name') ?? null,
              message: getValue('message') ?? null,
              stack: getValue('stack') ?? null,
            };
            if (!rawArg.rawSnapshot) {
              rawArg.rawSnapshot = objectSnapshot;
            }
          } catch {
            // Keep best-effort enrichment.
          }
        };

        if (includeRaw) {
          this.pendingLogEnrichments.push(...logEntry.rawArgs.map((rawArg, rawArgIndex) => enrichObjectArg(args[rawArgIndex], rawArg)));
        }
        this.logs[entryIndex] = logEntry;
      }
    }

    if (message.method === 'Log.entryAdded') {
      const { entry } = message.params;
      if (['warning', 'error'].includes(entry.level)) {
        this.logs.push({
          level: entry.level === 'warning' ? 'warn' : entry.level,
          message: entry.text || entry.url || '',
        });
      }
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const { exceptionDetails } = message.params || {};
      const text = exceptionDetails?.text
        || exceptionDetails?.exception?.description
        || exceptionDetails?.exception?.value
        || 'Unhandled browser exception';
      const stack = exceptionDetails?.exception?.stackTrace?.callFrames
        ?.map((frame) => `${frame.functionName || '<anonymous>'}@${frame.url}:${frame.lineNumber}:${frame.columnNumber}`)
        .join('\n');
      this.logs.push({
        level: 'error',
        message: stack ? `${text}\n${stack}` : text,
      });
    }

    if (message.method === 'Network.loadingFailed') {
      const request = this.requests.get(message.params.requestId);
      this.networkIssues.push({
        type: 'loadingFailed',
        url: request?.url,
        resourceType: message.params.type,
        errorText: message.params.errorText,
        blockedReason: message.params.blockedReason,
      });
    }

    if (message.method === 'Network.requestWillBeSent') {
      this.requests.set(message.params.requestId, {
        url: message.params.request?.url,
        type: message.params.type,
        initiator: message.params.initiator,
      });
    }

    if (message.method === 'Network.responseReceived') {
      const { response } = message.params;
      if (response.status >= 400) {
        this.networkIssues.push({
          type: 'http',
          status: response.status,
          url: response.url,
          mimeType: response.mimeType,
        });
      }
    }
  }

  send(method, params = {}, timeoutMs = 10000, useSession = true) {
    const id = this.nextId++;
    const payload = JSON.stringify({
      id,
      method,
      params,
      ...(useSession && this.sessionId ? { sessionId: this.sessionId } : {}),
    });
    const promise = new Promise((resolveCommand, rejectCommand) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectCommand(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolveCommand(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          rejectCommand(error);
        },
      });
    });
    this.socket.send(payload);
    return promise;
  }

  waitForEvent(method, timeoutMs = 15000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const waiter = {
        resolve: (params) => {
          clearTimeout(timeout);
          resolveEvent(params);
        },
      };
      const timeout = setTimeout(() => {
        const waiters = this.eventWaiters.get(method) || [];
        this.eventWaiters.set(method, waiters.filter((item) => item !== waiter));
        rejectEvent(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);

      const waiters = this.eventWaiters.get(method) || [];
      waiters.push(waiter);
      this.eventWaiters.set(method, waiters);
    });
  }

  async evaluate(expression) {
    const evaluateOnce = () => this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: 10000,
    });

    let result;
    try {
      result = await evaluateOnce();
    } catch (error) {
      if (!shouldRetryEvaluateAfterTimeout(error, { isMobile: this.isMobile })) {
        throw error;
      }
      await delay(250);
      result = await evaluateOnce();
    }

    if (result.exceptionDetails) {
      fail('Route evaluation threw in the browser', result.exceptionDetails);
    }
    return result.result?.value;
  }

  async navigate(url) {
    const loadPromise = this.waitForEvent('Page.loadEventFired', 30000).catch(() => null);
    await this.send('Page.navigate', { url });
    await loadPromise;
  }
}
