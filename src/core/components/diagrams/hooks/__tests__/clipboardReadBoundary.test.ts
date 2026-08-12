import { afterEach, describe, expect, it, vi } from 'vitest';
import { readClipboardTextWithTimeout } from '../clipboardReadBoundary';

describe('readClipboardTextWithTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns clipboard text when the system read completes in time', async () => {
    await expect(readClipboardTextWithTimeout(
      vi.fn().mockResolvedValue('clipboard text'),
      50,
    )).resolves.toBe('clipboard text');
  });

  it('rejects when the clipboard boundary rejects', async () => {
    await expect(readClipboardTextWithTimeout(
      vi.fn().mockRejectedValue(new Error('permission denied')),
      50,
    )).rejects.toThrow('permission denied');
  });

  it('returns a timeout result when the browser never settles the read', async () => {
    vi.useFakeTimers();
    const pendingRead = vi.fn(() => new Promise<string>(() => undefined));

    const resultPromise = readClipboardTextWithTimeout(pendingRead, 25);
    await vi.advanceTimersByTimeAsync(25);

    await expect(resultPromise).resolves.toBeNull();
  });

  it('coerces a negative timeout to an immediate bounded result', async () => {
    vi.useFakeTimers();
    const resultPromise = readClipboardTextWithTimeout(
      () => new Promise<string>(() => undefined),
      -1,
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toBeNull();
  });
});
