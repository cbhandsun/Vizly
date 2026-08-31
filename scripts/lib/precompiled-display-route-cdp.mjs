import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { waitForBrowserDevTools } from './precompiled-display-route-browser-startup.mjs';

const DEFAULT_CDP_COMMAND_TIMEOUT_MS = 30_000;

export const parsePrecompiledRouteCdpCommandTimeoutMs = (
  rawValue,
  fallbackMs = DEFAULT_CDP_COMMAND_TIMEOUT_MS,
) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return fallbackMs;
  const candidate = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
  if (!Number.isSafeInteger(candidate) || candidate < 1_000 || candidate > 120_000) {
    throw new Error('Invalid PRECOMPILED_ROUTE_CDP_COMMAND_TIMEOUT_MS');
  }
  return candidate;
};

const findBrowserExecutable = () => {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    process.env.BROWSER_PATH,
    join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  return candidates.find(candidate => existsSync(candidate)) || null;
};

const findAvailablePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    server.close();
    resolve(port);
  });
});

const RETRYABLE_PROFILE_CLEANUP_CODES = new Set(['EBUSY', 'EPERM', 'ENOTEMPTY']);

export const retryPrecompiledRouteBrowserProfileCleanup = async (
  remove,
  wait = delay,
  maxAttempts = 8,
) => {
  const attemptLimit = Number.isSafeInteger(maxAttempts)
    ? Math.max(1, Math.min(20, maxAttempts))
    : 8;
  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    try {
      await remove();
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && !Array.isArray(error)
        ? error.code
        : undefined;
      if (!RETRYABLE_PROFILE_CLEANUP_CODES.has(code) || attempt + 1 >= attemptLimit) {
        throw error;
      }
      await wait(Math.min(2_000, 150 * (attempt + 1)));
    }
  }
};

const waitForBrowserExit = async (browser, timeoutMs = 5_000) => {
  if (browser.exitCode != null || browser.signalCode != null) return;
  await Promise.race([
    new Promise(resolve => browser.once('exit', resolve)),
    delay(timeoutMs),
  ]);
};

const waitForChildExit = async (child, timeoutMs = 5_000) => {
  if (!child || child.exitCode != null || child.signalCode != null) return;
  await Promise.race([
    new Promise(resolve => {
      child.once('exit', resolve);
      child.once('error', resolve);
    }),
    delay(timeoutMs),
  ]);
};

/** Terminates only the exact browser PID spawned by this harness. */
export const terminatePrecompiledRouteBrowserProcessTree = async (
  browser,
  {
    platform = process.platform,
    spawnProcess = spawn,
    waitForExit = waitForChildExit,
  } = {},
) => {
  if (!browser || browser.exitCode != null || browser.signalCode != null) return;
  const pid = Number(browser.pid);
  if (platform === 'win32' && Number.isSafeInteger(pid) && pid > 0) {
    try {
      const killer = spawnProcess('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      await waitForExit(killer);
      return;
    } catch {
      // Fall through to the exact direct child when taskkill is unavailable.
    }
  }
  browser.kill();
};

export const closePrecompiledRouteBrowser = async (
  session,
  browser,
  waitForExit = waitForBrowserExit,
  terminateProcessTree = terminatePrecompiledRouteBrowserProcessTree,
) => {
  let gracefulCloseRequested = false;
  if (session) {
    try {
      await Promise.race([
        session.send('Browser.close'),
        delay(2_000).then(() => { throw new Error('Timed out closing browser through CDP'); }),
      ]);
      gracefulCloseRequested = true;
    } catch {
      // The browser process fallback below owns cleanup after a failed CDP close.
    } finally {
      session.close();
    }
  }
  if (!gracefulCloseRequested && browser.exitCode == null && browser.signalCode == null) {
    await terminateProcessTree(browser);
  }
  await waitForExit(browser);
  if (browser.exitCode == null && browser.signalCode == null) {
    await terminateProcessTree(browser);
    await waitForExit(browser);
  }
};

export class CdpPageSession {
  constructor(
    webSocketUrl,
    commandTimeoutMs = DEFAULT_CDP_COMMAND_TIMEOUT_MS,
    createSocket = url => new WebSocket(url),
  ) {
    this.webSocketUrl = webSocketUrl;
    this.commandTimeoutMs = parsePrecompiledRouteCdpCommandTimeoutMs(commandTimeoutMs);
    this.createSocket = createSocket;
    this.sequence = 0;
    this.pending = new Map();
    this.socket = null;
  }

  async open() {
    this.socket = this.createSocket(this.webSocketUrl);
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
    this.socket.on('message', raw => {
      const message = JSON.parse(String(raw));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timeoutId);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    const rejectPending = (reason) => {
      const error = reason instanceof Error
        ? reason
        : new Error('CDP session closed before receiving a response');
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeoutId);
        pending.reject(error);
      }
      this.pending.clear();
    };
    this.socket.on('error', rejectPending);
    this.socket.on('close', (code, reason) => rejectPending(new Error(
      `CDP session closed before receiving a response (code ${code}${reason?.length ? `: ${String(reason)}` : ''})`,
    )));
  }

  send(method, params = {}) {
    if (!this.socket) return Promise.reject(new Error('CDP session is not open'));
    return new Promise((resolve, reject) => {
      const id = this.sequence += 1;
      const timeoutId = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error(`CDP command timed out: ${method}`));
      }, this.commandTimeoutMs);
      this.pending.set(id, { resolve, reject, timeoutId });
      try {
        this.socket.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timeoutId);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error('CDP command send failed'));
      }
    });
  }

  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || 'Browser evaluation failed');
    }
    return response.result?.value;
  }

  close() {
    const error = new Error('CDP session closed before receiving a response');
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
    this.socket?.close();
    this.socket = null;
  }
}

export const withPrecompiledRouteBrowser = async (run) => {
  const browserPath = findBrowserExecutable();
  if (!browserPath) throw new Error('Chrome or Edge was not found');
  const port = await findAvailablePort();
  const profile = await mkdtemp(join(tmpdir(), 'vizly-precompiled-routes-'));
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let session = null;
  try {
    await waitForBrowserDevTools(browser, port);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: 'PUT',
    });
    if (!targetResponse.ok) throw new Error('Failed to create a browser target');
    const target = await targetResponse.json();
    const commandTimeoutMs = parsePrecompiledRouteCdpCommandTimeoutMs(
      process.env.PRECOMPILED_ROUTE_CDP_COMMAND_TIMEOUT_MS,
    );
    session = new CdpPageSession(target.webSocketDebuggerUrl, commandTimeoutMs);
    await session.open();
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    return await run(session);
  } finally {
    await closePrecompiledRouteBrowser(session, browser);
    await retryPrecompiledRouteBrowserProfileCleanup(() => (
      rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    ), delay, 12);
  }
};
