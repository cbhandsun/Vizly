import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS,
  loadWorkspaceInventoryWithDeadline,
} from '../workspaceInventoryLoad';

afterEach(() => {
  vi.useRealTimers();
});

describe('loadWorkspaceInventoryWithDeadline', () => {
  it('returns successful values including an empty inventory', async () => {
    await expect(loadWorkspaceInventoryWithDeadline(async () => [])).resolves.toEqual({
      kind: 'success',
      value: [],
    });
  });

  it('turns rejected and synchronous failures into explicit results', async () => {
    const rejected = new Error('remote rejected');
    await expect(loadWorkspaceInventoryWithDeadline(async () => {
      throw rejected;
    })).resolves.toEqual({ kind: 'failure', reason: 'failed', error: rejected });

    const synchronous = new Error('sync failure');
    await expect(loadWorkspaceInventoryWithDeadline(() => {
      throw synchronous;
    })).resolves.toEqual({ kind: 'failure', reason: 'failed', error: synchronous });
  });

  it('bounds a request that never settles', async () => {
    vi.useFakeTimers();
    const result = loadWorkspaceInventoryWithDeadline(
      () => new Promise<never>(() => undefined),
      25,
    );

    await vi.advanceTimersByTimeAsync(24);
    let settled = false;
    void result.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ kind: 'failure', reason: 'timeout' });
  });

  it('normalizes invalid and extreme timeout values', async () => {
    vi.useFakeTimers();
    const invalid = loadWorkspaceInventoryWithDeadline(
      () => new Promise<never>(() => undefined),
      Number.NaN,
    );
    await vi.advanceTimersByTimeAsync(WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS);
    await expect(invalid).resolves.toEqual({ kind: 'failure', reason: 'timeout' });

    const extreme = loadWorkspaceInventoryWithDeadline(
      () => new Promise<never>(() => undefined),
      Number.MAX_SAFE_INTEGER,
    );
    await vi.advanceTimersByTimeAsync(59_999);
    let settled = false;
    void extreme.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(extreme).resolves.toEqual({ kind: 'failure', reason: 'timeout' });
  });

  it('ignores a late completion after the timeout result is settled', async () => {
    vi.useFakeTimers();
    let finish: ((value: string) => void) | undefined;
    const result = loadWorkspaceInventoryWithDeadline(
      () => new Promise<string>(resolve => { finish = resolve; }),
      10,
    );

    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toEqual({ kind: 'failure', reason: 'timeout' });
    finish?.('late result');
    await expect(result).resolves.toEqual({ kind: 'failure', reason: 'timeout' });
  });
});
