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
    const timeout = await result;
    expect(timeout).toMatchObject({ kind: 'failure', reason: 'timeout' });
  });

  it('normalizes invalid and extreme timeout values', async () => {
    vi.useFakeTimers();
    const invalid = loadWorkspaceInventoryWithDeadline(
      () => new Promise<never>(() => undefined),
      Number.NaN,
    );
    await vi.advanceTimersByTimeAsync(WORKSPACE_INVENTORY_LOAD_TIMEOUT_MS);
    await expect(invalid).resolves.toMatchObject({ kind: 'failure', reason: 'timeout' });

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
    await expect(extreme).resolves.toMatchObject({ kind: 'failure', reason: 'timeout' });
  });

  it('exposes a late empty inventory as success after the timeout result is settled', async () => {
    vi.useFakeTimers();
    let finish: ((value: string[]) => void) | undefined;
    const result = loadWorkspaceInventoryWithDeadline(
      () => new Promise<string[]>(resolve => { finish = resolve; }),
      10,
    );

    await vi.advanceTimersByTimeAsync(10);
    const timeout = await result;
    expect(timeout).toMatchObject({ kind: 'failure', reason: 'timeout' });
    if (timeout.kind !== 'failure' || timeout.reason !== 'timeout') {
      throw new Error('Expected timeout result');
    }
    finish?.([]);
    await expect(timeout.completion).resolves.toEqual({ kind: 'success', value: [] });
  });

  it('exposes a late failure without rejecting the completion channel', async () => {
    vi.useFakeTimers();
    let fail: ((error: unknown) => void) | undefined;
    const result = loadWorkspaceInventoryWithDeadline(
      () => new Promise<never>((_resolve, reject) => { fail = reject; }),
      10,
    );

    await vi.advanceTimersByTimeAsync(10);
    const timeout = await result;
    expect(timeout).toMatchObject({ kind: 'failure', reason: 'timeout' });
    if (timeout.kind !== 'failure' || timeout.reason !== 'timeout') {
      throw new Error('Expected timeout result');
    }
    const error = new Error('late failure');
    fail?.(error);
    await expect(timeout.completion).resolves.toEqual({ kind: 'failure', reason: 'failed', error });
  });
});
