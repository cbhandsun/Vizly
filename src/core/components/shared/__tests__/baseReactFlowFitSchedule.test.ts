import { describe, expect, it } from 'vitest';

import {
  hasBaseReactFlowSignificantContainerDelta,
  resolveBaseReactFlowFitDebounceTime,
  resolveBaseReactFlowFitSchedule,
} from '../baseReactFlowFitSchedule';

describe('baseReactFlowFitSchedule', () => {
  it('detects whether container changes are significant', () => {
    expect(hasBaseReactFlowSignificantContainerDelta({
      containerSize: { width: 1000, height: 800 },
      previousContainer: { width: 1003, height: 804 },
    })).toBe(false);

    expect(hasBaseReactFlowSignificantContainerDelta({
      containerSize: { width: 1000, height: 800 },
      previousContainer: { width: 1012, height: 804 },
    })).toBe(true);

    expect(hasBaseReactFlowSignificantContainerDelta({
      containerSize: { width: 1000, height: 800 },
      previousContainer: null,
    })).toBe(true);
  });

  it('resolves debounce time for init, active triggers, and passive updates', () => {
    expect(resolveBaseReactFlowFitDebounceTime({
      defaultDebounceMs: 120,
      hasInitialized: false,
      isTriggerKeyChanged: false,
    })).toBe(200);

    expect(resolveBaseReactFlowFitDebounceTime({
      defaultDebounceMs: 160,
      hasInitialized: true,
      isTriggerKeyChanged: true,
    })).toBe(100);

    expect(resolveBaseReactFlowFitDebounceTime({
      defaultDebounceMs: 90,
      hasInitialized: true,
      isTriggerKeyChanged: false,
    })).toBe(90);
  });

  it('skips scheduling when the fit context is not ready', () => {
    expect(resolveBaseReactFlowFitSchedule({
      fitMode: 'none',
      hasInstance: true,
      nodeCount: 10,
      fitTriggerKey: 'a',
      lastFitTriggerKey: 'a',
      pinFit: true,
      hasInitialized: true,
      containerSize: { width: 1000, height: 800 },
      previousContainer: { width: 1000, height: 800 },
      defaultDebounceMs: 100,
    })).toEqual({
      shouldSchedule: false,
      isTriggerKeyChanged: false,
    });
  });

  it('skips passive updates when pinFit is disabled and container changes are tiny', () => {
    expect(resolveBaseReactFlowFitSchedule({
      fitMode: 'fitWidthTop',
      hasInstance: true,
      nodeCount: 10,
      fitTriggerKey: 'a',
      lastFitTriggerKey: 'a',
      pinFit: false,
      hasInitialized: true,
      containerSize: { width: 1000, height: 800 },
      previousContainer: { width: 1004, height: 803 },
      defaultDebounceMs: 100,
    })).toEqual({
      shouldSchedule: false,
      isTriggerKeyChanged: false,
    });
  });

  it('schedules active or pinned updates with a computed debounce', () => {
    expect(resolveBaseReactFlowFitSchedule({
      fitMode: 'fitWidthTop',
      hasInstance: true,
      nodeCount: 10,
      fitTriggerKey: 'b',
      lastFitTriggerKey: 'a',
      pinFit: false,
      hasInitialized: true,
      containerSize: { width: 1000, height: 800 },
      previousContainer: { width: 1000, height: 800 },
      defaultDebounceMs: 180,
    })).toEqual({
      shouldSchedule: true,
      isTriggerKeyChanged: true,
      debounceTime: 100,
    });

    expect(resolveBaseReactFlowFitSchedule({
      fitMode: 'fitAll',
      hasInstance: true,
      nodeCount: 10,
      fitTriggerKey: 'a',
      lastFitTriggerKey: 'a',
      pinFit: true,
      hasInitialized: true,
      containerSize: { width: 1020, height: 820 },
      previousContainer: { width: 1000, height: 800 },
      defaultDebounceMs: 140,
    })).toEqual({
      shouldSchedule: true,
      isTriggerKeyChanged: false,
      debounceTime: 140,
    });
  });
});
