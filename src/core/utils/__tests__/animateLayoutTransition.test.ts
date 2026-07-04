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

import { animateLayoutTransition } from '../animateLayoutTransition';

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
});
