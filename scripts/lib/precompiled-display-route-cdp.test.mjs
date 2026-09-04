// @vitest-environment node
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  isRetryableBrowserDevToolsStartupFailure,
  runBrowserDevToolsStartupWithSingleRetry,
  waitForBrowserDevTools,
} from './precompiled-display-route-browser-startup.mjs';

import {
  CdpPageSession,
  closePrecompiledRouteBrowser,
  parsePrecompiledRouteCdpCommandTimeoutMs,
  retryPrecompiledRouteBrowserProfileCleanup,
  terminatePrecompiledRouteBrowserProcessTree,
} from './precompiled-display-route-cdp.mjs';

class FakeSocket extends EventEmitter {
  sent = [];

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.emit('close', 1000, Buffer.from(''));
  }
}

const startupChild = () => Object.assign(new EventEmitter(), {
  pid: 4321,
  exitCode: null,
  signalCode: null,
  stdout: new EventEmitter(),
  stderr: new EventEmitter(),
});
const startupResponse = (webSocketDebuggerUrl = 'ws://127.0.0.1:9333/devtools/browser/test-id') => (
  new Response(JSON.stringify({ webSocketDebuggerUrl, ignored: 'private browser data' }))
);
const startupDiagnostic = error => JSON.parse(error.message.split('startup failed: ')[1]);

describe('browser startup lifecycle and safe diagnostics', () => {
  it('accepts only the local browser endpoint and removes startup listeners on success', async () => {
    const browser = startupChild();
    const fetchEndpoint = vi.fn().mockResolvedValue(startupResponse());
    await expect(waitForBrowserDevTools(browser, 9333, { fetchEndpoint })).resolves.toEqual({
      webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser/test-id',
    });
    expect(fetchEndpoint).toHaveBeenCalledWith('http://127.0.0.1:9333/json/version', {
      signal: expect.any(AbortSignal), redirect: 'error',
    });
    expect(browser.listenerCount('exit')).toBe(0);
    expect(browser.listenerCount('error')).toBe(0);
    expect(browser.stderr.listenerCount('data')).toBe(0);
    expect(browser.stdout.listenerCount('data')).toBe(0);
  });

  it('polls a not-yet-listening browser without restarting it', async () => {
    const browser = startupChild();
    const fetchEndpoint = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED with private URL'))
      .mockResolvedValueOnce(startupResponse());
    await expect(waitForBrowserDevTools(browser, 9333, { fetchEndpoint })).resolves.toBeDefined();
    expect(fetchEndpoint).toHaveBeenCalledTimes(2);
  });

  it('retries only a silent, live browser that never opens its local endpoint', () => {
    const diagnostic = {
      reason: 'deadline', lastProbe: 'request-failed', probeErrorCode: 'ECONNREFUSED',
      processSpawned: true, exitCode: null, signal: null, stdoutBytes: 0, stderrBytes: 0,
      outputMarkers: [],
    };
    const failure = Object.assign(new Error('safe startup failure'), {
      browserStartupDiagnostic: diagnostic,
    });
    expect(isRetryableBrowserDevToolsStartupFailure(failure)).toBe(true);
    for (const override of [
      { reason: 'process-exited' }, { probeErrorCode: 'OTHER' }, { processSpawned: false },
      { exitCode: 1 }, { stdoutBytes: 1 }, { outputMarkers: ['profile-lock'] },
    ]) {
      failure.browserStartupDiagnostic = { ...diagnostic, ...override };
      expect(isRetryableBrowserDevToolsStartupFailure(failure)).toBe(false);
    }
    expect(isRetryableBrowserDevToolsStartupFailure(new Error('unclassified'))).toBe(false);
  });

  it('performs one fresh startup only after the classified infrastructure failure', async () => {
    const diagnostic = {
      reason: 'deadline', lastProbe: 'request-failed', probeErrorCode: 'ECONNREFUSED',
      processSpawned: true, exitCode: null, signal: null, stdoutBytes: 0, stderrBytes: 0,
      outputMarkers: [],
    };
    const retryable = Object.assign(new Error('safe startup failure'), {
      browserStartupDiagnostic: diagnostic,
    });
    const start = vi.fn()
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce('ready');
    const prepareRetry = vi.fn().mockResolvedValue(undefined);

    await expect(runBrowserDevToolsStartupWithSingleRetry(start, prepareRetry))
      .resolves.toBe('ready');
    expect(start.mock.calls).toEqual([[0], [1]]);
    expect(prepareRetry).toHaveBeenCalledOnce();

    const productFailure = new Error('route assertion failed');
    start.mockReset().mockRejectedValue(productFailure);
    prepareRetry.mockClear();
    await expect(runBrowserDevToolsStartupWithSingleRetry(start, prepareRetry))
      .rejects.toBe(productFailure);
    expect(start).toHaveBeenCalledOnce();
    expect(prepareRetry).not.toHaveBeenCalled();
  });

  it.each([0, -1, 65536, NaN, Infinity, '9333', null, [], {}])(
    'rejects invalid port %j before touching a child or endpoint', async port => {
      const fetchEndpoint = vi.fn();
      await expect(waitForBrowserDevTools(null, port, { fetchEndpoint })).rejects.toThrow('Invalid browser DevTools port');
      expect(fetchEndpoint).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 15_001, NaN, Infinity, '15000', null])(
    'does not allow an invalid or expanded startup budget %j', async timeoutMs => {
      await expect(waitForBrowserDevTools(null, 9333, { timeoutMs })).rejects.toThrow('Invalid browser startup timeout');
    },
  );

  it.each(['request', 'body'])(
    'enforces the original total deadline even when the %s never completes', async stage => {
      vi.useFakeTimers();
      try {
        let signal;
        const fetchEndpoint = vi.fn().mockImplementation((_url, options) => {
          signal = options.signal;
          return stage === 'request' ? new Promise(() => {}) : Promise.resolve(new Response(
            new ReadableStream({ start() {} }),
          ));
        });
        const browser = startupChild();
        const result = waitForBrowserDevTools(browser, 9333, { fetchEndpoint });
        const failed = result.catch(startupDiagnostic);
        await vi.advanceTimersByTimeAsync(14_999);
        expect(signal.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(await failed).toMatchObject({
          reason: 'deadline', elapsedMs: 15_000, attempts: 1,
          lastProbe: stage === 'request' ? 'request-pending' : 'body-pending',
        });
        expect(signal.aborted).toBe(true);
        expect(browser.listenerCount('exit')).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('fails immediately when the child exits during an unresolved request', async () => {
    const browser = startupChild();
    let signal;
    const result = waitForBrowserDevTools(browser, 9333, {
      fetchEndpoint: (_url, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    });
    browser.exitCode = 23;
    browser.emit('exit', 23);
    expect(await result.catch(startupDiagnostic)).toMatchObject({
      reason: 'process-exited', exitCode: 23, attempts: 1,
    });
    expect(signal.aborted).toBe(true);
  });

  it('does not probe a child that has already exited', async () => {
    const browser = startupChild();
    browser.exitCode = 0;
    const fetchEndpoint = vi.fn();
    expect(await waitForBrowserDevTools(browser, 9333, { fetchEndpoint }).catch(startupDiagnostic))
      .toMatchObject({ reason: 'process-exited', exitCode: 0, attempts: 0 });
    expect(fetchEndpoint).not.toHaveBeenCalled();
  });

  it('does not accept a late successful response after child exit', async () => {
    const browser = startupChild();
    const result = waitForBrowserDevTools(browser, 9333, {
      fetchEndpoint: async () => {
        browser.exitCode = 1;
        browser.emit('exit', 1);
        return startupResponse();
      },
    });
    expect(await result.catch(startupDiagnostic)).toMatchObject({ reason: 'process-exited' });
  });

  it.each(['ECONNREFUSED', 'private-network-code'])(
    'retains only safe network failure codes: %s', async code => {
      vi.useFakeTimers();
      try {
        const result = waitForBrowserDevTools(startupChild(), 9333, {
          fetchEndpoint: async () => {
            throw new Error('token=private', { cause: { code } });
          },
        }).catch(startupDiagnostic);
        await vi.advanceTimersByTimeAsync(15_000);
        const diagnostic = await result;
        expect(diagnostic).toMatchObject({
          reason: 'deadline', lastProbe: 'request-failed',
          probeErrorCode: code === 'ECONNREFUSED' ? code : 'OTHER',
        });
        expect(JSON.stringify(diagnostic)).not.toContain('private');
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each(['ENOENT', 'EACCES', 'private error code'])(
    'handles spawn failure and emits only allowlisted error code %s', async code => {
      const browser = startupChild();
      browser.pid = undefined;
      const result = waitForBrowserDevTools(browser, 9333, {
        fetchEndpoint: () => new Promise(() => {}),
      });
      browser.emit('error', Object.assign(new Error('token=private-value C:/private/profile'), { code }));
      const diagnostic = await result.catch(startupDiagnostic);
      expect(diagnostic).toMatchObject({
        reason: 'spawn-error', processSpawned: false,
        errorCode: code === 'private error code' ? 'OTHER' : code,
      });
      expect(JSON.stringify(diagnostic)).not.toContain('private');
    },
  );

  it.each([
    null, [], {}, { webSocketDebuggerUrl: 123 },
    { webSocketDebuggerUrl: 'ws://remote.invalid:9333/devtools/browser/id' },
    { webSocketDebuggerUrl: 'ws://127.0.0.1:9334/devtools/browser/id' },
    { webSocketDebuggerUrl: 'ws://user:secret@127.0.0.1:9333/devtools/browser/id' },
    { webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser/id?token=secret' },
    { webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/id' },
    { webSocketDebuggerUrl: 'x'.repeat(513) },
  ])('rejects malformed, foreign or unsafe endpoint data %j', async value => {
    vi.useFakeTimers();
    try {
      const browser = startupChild();
      const result = waitForBrowserDevTools(browser, 9333, {
        fetchEndpoint: async () => new Response(JSON.stringify(value)),
      }).catch(startupDiagnostic);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await result).toMatchObject({ reason: 'deadline', lastProbe: 'invalid-response' });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['invalid-json', 'oversized', 'http-error'])(
    'rejects %s responses without including the response body', async mode => {
      vi.useFakeTimers();
      try {
        const body = mode === 'oversized' ? 'secret'.repeat(3000) : 'private-body';
        const result = waitForBrowserDevTools(startupChild(), 9333, {
          fetchEndpoint: async () => new Response(body, { status: mode === 'http-error' ? 503 : 200 }),
        }).catch(startupDiagnostic);
        await vi.advanceTimersByTimeAsync(15_000);
        const diagnostic = await result;
        expect(diagnostic).toMatchObject({
          reason: 'deadline',
          lastProbe: mode === 'http-error' ? 'http-error' : 'invalid-response',
        });
        expect(JSON.stringify(diagnostic)).not.toMatch(/secret|private-body/);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('keeps bounded counters and split stderr markers but never returns raw process output', async () => {
    const browser = startupChild();
    const result = waitForBrowserDevTools(browser, 9333, { fetchEndpoint: () => new Promise(() => {}) });
    browser.stdout.emit('data', Buffer.alloc(9 * 1024 * 1024));
    browser.stderr.emit('data', Buffer.from('token=private-value Cookie=secret C:/private/profile ProcessSingle'));
    browser.stderr.emit('data', Buffer.from('ton DevTools listening on ws://private?token=secret'));
    browser.signalCode = 'private signal';
    browser.emit('exit', null);
    const diagnostic = await result.catch(startupDiagnostic);
    expect(diagnostic).toMatchObject({
      reason: 'process-exited', stdoutBytes: 8 * 1024 * 1024, signal: null,
      outputMarkers: ['devtools-listening', 'profile-lock'],
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/token|Cookie|private|secret/);
  });

  it('wires both real harnesses to the lifecycle-aware startup boundary', () => {
    const cdpSource = readFileSync(new URL('./precompiled-display-route-cdp.mjs', import.meta.url), 'utf8');
    const smokeSource = readFileSync(new URL('../smoke-routes.mjs', import.meta.url), 'utf8');
    expect(cdpSource).toContain('await waitForBrowserDevTools(browser, port)');
    expect(cdpSource).toContain('runBrowserDevToolsStartupWithSingleRetry(');
    expect(cdpSource).toContain("stdio: ['ignore', 'pipe', 'pipe']");
    expect(smokeSource).toContain('version = await waitForBrowserDevTools(child, DEBUG_PORT)');
    expect(smokeSource).toContain('await killProcessTree(child);\n    throw error;');
    expect(smokeSource).toContain('runBrowserDevToolsStartupWithSingleRetry(');
  });
});

describe('precompiled display route CDP boundary', () => {
  it.each([undefined, null, '', 30_000, '45000'])(
    'accepts an empty or bounded command timeout: %s',
    value => expect(parsePrecompiledRouteCdpCommandTimeoutMs(value)).toBe(
      value === undefined || value === null || value === '' ? 30_000 : Number(value),
    ),
  );

  it.each([0, 999, 120_001, 1.5, 'not-a-number', {}, []])(
    'rejects an invalid command timeout: %s',
    value => expect(() => parsePrecompiledRouteCdpCommandTimeoutMs(value)).toThrow(
      'Invalid PRECOMPILED_ROUTE_CDP_COMMAND_TIMEOUT_MS',
    ),
  );

  it('resolves a matching response and clears its pending command', async () => {
    const socket = new FakeSocket();
    const session = new CdpPageSession('ws://local', 1_000, () => socket);
    const opened = session.open();
    socket.emit('open');
    await opened;
    const result = session.send('Runtime.evaluate', { expression: '1 + 1' });
    const [{ id }] = socket.sent;
    socket.emit('message', JSON.stringify({ id, result: { value: 2 } }));
    await expect(result).resolves.toEqual({ value: 2 });
    session.close();
  });

  it('rejects a command that receives no response within its bounded timeout', async () => {
    vi.useFakeTimers();
    try {
      const socket = new FakeSocket();
      const session = new CdpPageSession('ws://local', 1_000, () => socket);
      const opened = session.open();
      socket.emit('open');
      await opened;
      const result = session.send('Runtime.evaluate');
      const assertion = expect(result).rejects.toThrow('CDP command timed out: Runtime.evaluate');
      await vi.advanceTimersByTimeAsync(1_000);
      await assertion;
      session.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses taskkill with the exact spawned PID on Windows', async () => {
    const killer = new EventEmitter();
    killer.exitCode = null;
    killer.signalCode = null;
    const spawnProcess = vi.fn().mockReturnValue(killer);
    const waitForExit = vi.fn().mockResolvedValue(undefined);
    const browser = { pid: 4321, exitCode: null, signalCode: null, kill: vi.fn() };

    await terminatePrecompiledRouteBrowserProcessTree(browser, {
      platform: 'win32',
      spawnProcess,
      waitForExit,
    });

    expect(spawnProcess).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '4321', '/t', '/f'],
      { stdio: 'ignore', windowsHide: true },
    );
    expect(waitForExit).toHaveBeenCalledWith(killer);
    expect(browser.kill).not.toHaveBeenCalled();
  });
});

describe('precompiled display route browser profile cleanup', () => {
  it('requests graceful browser shutdown before profile cleanup', async () => {
    const session = {
      send: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };
    const browser = {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(),
    };
    const waitForExit = vi.fn().mockImplementation(async () => {
      browser.exitCode = 0;
    });

    await closePrecompiledRouteBrowser(session, browser, waitForExit);

    expect(session.send).toHaveBeenCalledWith('Browser.close');
    expect(session.close).toHaveBeenCalledOnce();
    expect(browser.kill).not.toHaveBeenCalled();
    expect(waitForExit).toHaveBeenCalledOnce();
  });

  it('falls back to process termination when graceful shutdown fails', async () => {
    const session = {
      send: vi.fn().mockRejectedValue(new Error('closed socket')),
      close: vi.fn(),
    };
    const browser = {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(),
    };
    const waitForExit = vi.fn().mockImplementation(async () => {
      browser.signalCode = 'SIGTERM';
    });

    await closePrecompiledRouteBrowser(session, browser, waitForExit);

    expect(session.close).toHaveBeenCalledOnce();
    expect(browser.kill).toHaveBeenCalledOnce();
    expect(waitForExit).toHaveBeenCalledOnce();
  });

  it('leaves final lock detection to bounded profile cleanup after termination', async () => {
    const session = {
      send: vi.fn().mockRejectedValue(new Error('closed socket')),
      close: vi.fn(),
    };
    const browser = {
      exitCode: null,
      signalCode: null,
      kill: vi.fn(),
    };
    const waitForExit = vi.fn().mockResolvedValue(undefined);

    await expect(closePrecompiledRouteBrowser(session, browser, waitForExit))
      .resolves.toBeUndefined();
    expect(browser.kill).toHaveBeenCalledTimes(2);
    expect(waitForExit).toHaveBeenCalledTimes(2);
  });

  it('returns immediately after a successful cleanup', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const wait = vi.fn();

    await expect(retryPrecompiledRouteBrowserProfileCleanup(remove, wait)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it('retries bounded Windows file-lock failures', async () => {
    const remove = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('locked'), { code: 'EBUSY' }))
      .mockRejectedValueOnce(Object.assign(new Error('permission'), { code: 'EPERM' }))
      .mockResolvedValue(undefined);
    const wait = vi.fn().mockResolvedValue(undefined);

    await retryPrecompiledRouteBrowserProfileCleanup(remove, wait, 4);

    expect(remove).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 150);
    expect(wait).toHaveBeenNthCalledWith(2, 300);
  });

  it('fails closed for non-retryable and exhausted cleanup errors', async () => {
    const invalid = Object.assign(new Error('invalid path'), { code: 'EINVAL' });
    const locked = Object.assign(new Error('still locked'), { code: 'ENOTEMPTY' });
    await expect(retryPrecompiledRouteBrowserProfileCleanup(
      vi.fn().mockRejectedValue(invalid),
      vi.fn(),
    )).rejects.toBe(invalid);

    const remove = vi.fn().mockRejectedValue(locked);
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(retryPrecompiledRouteBrowserProfileCleanup(remove, wait, 2)).rejects.toBe(locked);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledOnce();
  });
});
