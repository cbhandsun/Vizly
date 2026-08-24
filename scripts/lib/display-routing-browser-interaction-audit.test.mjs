import { describe, expect, it } from 'vitest';

import { assertDisplayRoutingInteractionPaint } from './display-routing-browser-interaction-audit.mjs';

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
    ['slow paint', {}, 100.1],
  ])('fails closed for %s', (_name, overrides, durationMs) => {
    expect(() => assertDisplayRoutingInteractionPaint({
      kind: 'hover',
      state: { ...state, hovered: true, ...overrides },
      durationMs,
    })).toThrow(/paint failed/);
  });
});
