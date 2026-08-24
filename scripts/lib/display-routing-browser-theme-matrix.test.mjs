import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingThemeState,
  DISPLAY_ROUTING_THEME_CASES,
} from './display-routing-browser-theme-matrix.mjs';

const stateFor = themeCase => ({
  dataTheme: themeCase.mode,
  primary: themeCase.primary.toUpperCase(),
  outputRouteSignature: 'route-v2:14:61:8e8bdf697cad3bb7',
  workerStartCount: 1,
  workerAbortCount: 0,
  stage: 'final-applied',
});

describe('display routing browser theme matrix', () => {
  it('accepts all canonical themes without a geometry or Worker lifecycle change', () => {
    for (const themeCase of DISPLAY_ROUTING_THEME_CASES) {
      expect(assertDisplayRoutingThemeState({
        themeCase,
        state: stateFor(themeCase),
        expectedSignature: 'route-v2:14:61:8e8bdf697cad3bb7',
        expectedWorkerStartCount: 1,
        expectedWorkerAbortCount: 0,
      })).toMatchObject({ workerStartCount: 1, workerAbortCount: 0 });
    }
  });

  it('fails closed for the wrong palette, route signature, or Worker count', () => {
    const themeCase = DISPLAY_ROUTING_THEME_CASES[1];
    const assertState = state => assertDisplayRoutingThemeState({
      themeCase,
      state,
      expectedSignature: 'route-v2:14:61:8e8bdf697cad3bb7',
      expectedWorkerStartCount: 1,
      expectedWorkerAbortCount: 0,
    });

    expect(() => assertState({ ...stateFor(themeCase), primary: '#ffffff' }))
      .toThrow(/theme state failed/);
    expect(() => assertState({ ...stateFor(themeCase), outputRouteSignature: 'stale' }))
      .toThrow(/theme state failed/);
    expect(() => assertState({ ...stateFor(themeCase), workerStartCount: 2 }))
      .toThrow(/theme state failed/);
    expect(() => assertState(null)).toThrow(/theme state failed/);
  });
});
