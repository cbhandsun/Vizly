import { describe, expect, it } from 'vitest';

import {
  auditPrecompiledDisplayRouteCommercialQuality,
  precompiledDisplayRouteCommercialQualityIsClean,
} from './precompiled-display-route-commercial-quality.mjs';

const patch = (id, computedPath) => ({ id, data: { computedPath } });

describe('precompiled display route commercial quality', () => {
  it('accepts compact and topology-required outer routes', () => {
    expect(precompiledDisplayRouteCommercialQualityIsClean([
      patch('outer', [
        { x: 1062, y: 593 }, { x: 1062, y: 59 }, { x: -96, y: 59 },
        { x: -96, y: 1450 }, { x: 1216, y: 1450 }, { x: 1216, y: 1539 },
      ]),
    ])).toBe(true);
  });

  it('rejects invalid, micro-segment, and excessive-bend artifacts', () => {
    const issues = auditPrecompiledDisplayRouteCommercialQuality([
      patch('invalid', [{ x: 0, y: 0 }]),
      patch('micro', [
        { x: 0, y: 0 }, { x: 0, y: 80 }, { x: 7, y: 80 }, { x: 7, y: 160 },
      ]),
      patch('bends', [
        { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 40 },
        { x: 40, y: 40 }, { x: 40, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 80 },
        { x: 80, y: 80 }, { x: 80, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 120 },
        { x: 120, y: 120 }, { x: 120, y: 140 }, { x: 140, y: 140 },
      ]),
    ]);
    expect(issues.map(issue => `${issue.edgeId}:${issue.kind}`)).toEqual([
      'invalid:invalid-path',
      'micro:tiny-interior-segment',
      'bends:excessive-bends',
    ]);
  });
});
