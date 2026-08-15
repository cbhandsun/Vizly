import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../consoleCleanup', () => ({
  safeLog: safeLogState,
}));

import { animateLayoutTransition, runAfterLayoutRenderFrames } from '../animateLayoutTransition';

describe('animateLayoutTransition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('warns via safeLog when target nodes are missing positions and falls back to the origin', async () => {
    let state: Array<{ id: string; position?: { x: number; y: number } }> = [];
    const setNodes = vi.fn((value: unknown) => {
      state = typeof value === 'function'
        ? (value as (nodes: typeof state) => typeof state)(state)
        : value as typeof state;
    });

    const targetNodes = [{ id: 'node-1' }] as unknown as Parameters<typeof animateLayoutTransition>[1];
    const animationPromise = animateLayoutTransition(setNodes, targetNodes);

    await vi.runAllTimersAsync();
    await animationPromise;

    expect(safeLogState.warn).toHaveBeenCalledWith(
      '[animateLayoutTransition] Target node node-1 is missing position, falling back.'
    );
    expect(state).toEqual([{ id: 'node-1', position: { x: 0, y: 0 } }]);
  });

  it('settles to the target when requestAnimationFrame is suspended', async () => {
    type LayoutNodes = Parameters<typeof animateLayoutTransition>[1];
    let state: LayoutNodes = [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
    const setNodes: Parameters<typeof animateLayoutTransition>[0] = (value) => {
      state = typeof value === 'function'
        ? value(state)
        : value;
    };
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const targetNodes: LayoutNodes = [{ id: 'node-1', position: { x: 240, y: 160 }, data: {} }];
    const animationPromise = animateLayoutTransition(setNodes, targetNodes);

    await vi.advanceTimersByTimeAsync(1_300);
    await animationPromise;

    expect(state).toEqual(targetNodes);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it('runs post-layout reconciliation when render frames are suspended', async () => {
    const reconcile = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const reconciliationPromise = runAfterLayoutRenderFrames(reconcile);
    await vi.advanceTimersByTimeAsync(1_000);
    await reconciliationPromise;

    expect(reconcile).toHaveBeenCalledOnce();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });

  it('rejects instead of leaving reconciliation pending when the callback fails', async () => {
    const failure = new Error('reconciliation failed');
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 9));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const reconciliationPromise = runAfterLayoutRenderFrames(() => {
      throw failure;
    });
    const rejection = expect(reconciliationPromise).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(cancelAnimationFrame).toHaveBeenCalledWith(9);
  });

  it('rejects instead of leaving the animation pending when completion fails', async () => {
    type LayoutNodes = Parameters<typeof animateLayoutTransition>[1];
    let state: LayoutNodes = [{ id: 'node-1', position: { x: 0, y: 0 }, data: {} }];
    const setNodes: Parameters<typeof animateLayoutTransition>[0] = (value) => {
      state = typeof value === 'function' ? value(state) : value;
    };
    const failure = new Error('fit failed');

    const animationPromise = animateLayoutTransition(setNodes, state, {
      onComplete: () => {
        throw failure;
      },
    });
    const rejection = expect(animationPromise).rejects.toBe(failure);
    await vi.runAllTimersAsync();

    await rejection;
  });
});
