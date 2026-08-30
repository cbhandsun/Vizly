import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

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
