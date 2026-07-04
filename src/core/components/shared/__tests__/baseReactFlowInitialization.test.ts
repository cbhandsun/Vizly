import type { MutableRefObject } from 'react';
import type { Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  computeBaseReactFlowNodeStructureSignature,
  scheduleBaseReactFlowInitializationReset,
  shouldResetBaseReactFlowInitialization,
} from '../baseReactFlowInitialization';

describe('baseReactFlowInitialization', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes a stable signature from node ids', () => {
    const nodes = [
      { id: 'b' },
      { id: 'a' },
    ] as Node[];

    expect(computeBaseReactFlowNodeStructureSignature(nodes)).toBe('a|b');
  });

  it('only resets when the structural signature changes and nodes exist', () => {
    expect(shouldResetBaseReactFlowInitialization({
      currentSignature: 'a|b',
      previousSignature: 'a',
      nodeCount: 2,
    })).toBe(true);

    expect(shouldResetBaseReactFlowInitialization({
      currentSignature: 'a|b',
      previousSignature: 'a|b',
      nodeCount: 2,
    })).toBe(false);

    expect(shouldResetBaseReactFlowInitialization({
      currentSignature: '',
      previousSignature: 'a',
      nodeCount: 0,
    })).toBe(false);
  });

  it('clears runtime refs and schedules initialized state reset', () => {
    vi.useFakeTimers();
    const setHasInitialized = vi.fn();
    const prevBBoxRef = { current: { x: 1 } } as MutableRefObject<any>;
    const prevContainerRef = { current: { width: 100 } } as MutableRefObject<any>;
    const cooldownUntilRef = { current: 123 } as MutableRefObject<number>;
    const lastZoomRef = { current: 0.8 } as MutableRefObject<number | null>;
    const initAtRef = { current: 0 } as MutableRefObject<number>;

    const timer = scheduleBaseReactFlowInitializationReset({
      setHasInitialized,
      prevBBoxRef,
      prevContainerRef,
      cooldownUntilRef,
      lastZoomRef,
      initAtRef,
      now: 456,
    });

    expect(prevBBoxRef.current).toBeNull();
    expect(prevContainerRef.current).toBeNull();
    expect(cooldownUntilRef.current).toBe(0);
    expect(lastZoomRef.current).toBeNull();
    expect(initAtRef.current).toBe(456);
    expect(setHasInitialized).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(setHasInitialized).toHaveBeenCalledWith(false);

    clearTimeout(timer);
  });
});
