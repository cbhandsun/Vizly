import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingInteractionPaint,
  assertDisplayRoutingInteractionReset,
} from './display-routing-browser-interaction-audit.mjs';

const state = {
  hovered: false,
  focused: false,
  focusVisible: false,
  selected: false,
  interactionPathCount: 1,
  traceVisible: true,
  traceCoverage: 1.02,
};

describe('display routing browser interaction audit', () => {
  it.each([
    ['hover', { hovered: true }],
    ['focus', { focused: true, focusVisible: true }],
    ['selected', { selected: true }],
  ])('accepts a complete %s trace inside the paint budget', (kind, active) => {
    expect(assertDisplayRoutingInteractionPaint({
      kind,
      state: { ...state, ...active },
      durationMs: 99.9,
    })).toEqual({ kind, durationMs: 99.9 });
  });

  it.each([
    ['duplicate interaction path', { interactionPathCount: 2 }, 10],
    ['hidden trace', { traceVisible: false }, 10],
    ['partial trace', { traceCoverage: 0.5 }, 10],
    ['trace below complete-coverage tolerance', { traceCoverage: 0.994 }, 10],
    ['implausibly long trace', { traceCoverage: 1.201 }, 10],
    ['slow paint', {}, 100.1],
  ])('fails closed for %s', (_name, overrides, durationMs) => {
    expect(() => assertDisplayRoutingInteractionPaint({
      kind: 'hover',
      state: { ...state, hovered: true, ...overrides },
      durationMs,
    })).toThrow(/paint failed/);
  });

  it.each([0.995, 1.2])('accepts the bounded complete-coverage boundary %s', (traceCoverage) => {
    expect(assertDisplayRoutingInteractionPaint({
      kind: 'hover',
      state: { ...state, hovered: true, traceCoverage },
      durationMs: 100,
    })).toEqual({ kind: 'hover', durationMs: 100 });
  });

  it('accepts a fully settled interaction state', () => {
    const resetState = {
      activeEdgeCount: 0,
      visibleTraceCount: 0,
      runningAnimationCount: 0,
    };
    expect(assertDisplayRoutingInteractionReset(resetState)).toBe(resetState);
  });

  it.each([
    ['active edge', { activeEdgeCount: 1 }],
    ['visible trace', { visibleTraceCount: 1 }],
    ['running animation', { runningAnimationCount: 1 }],
  ])('fails closed when reset leaves an %s', (_name, overrides) => {
    expect(() => assertDisplayRoutingInteractionReset({
      activeEdgeCount: 0,
      visibleTraceCount: 0,
      runningAnimationCount: 0,
      ...overrides,
    })).toThrow(/interaction reset failed/);
  });
});
