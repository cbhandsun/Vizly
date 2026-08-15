import { describe, expect, it } from 'vitest';

import {
  auditPrecompiledDisplayRouteCommercialQuality,
  precompiledDisplayRouteCommercialQualityIsClean,
} from './precompiled-display-route-commercial-quality.mjs';

const patch = (id, computedPath, data = {}) => ({ id, data: { ...data, computedPath } });

describe('precompiled display route commercial quality', () => {
  it('accepts compact and topology-required outer routes', () => {
    expect(precompiledDisplayRouteCommercialQualityIsClean([
      patch('outer', [
        { x: 1062, y: 593 }, { x: 1062, y: 59 }, { x: -96, y: 59 },
        { x: -96, y: 1450 }, { x: 1216, y: 1450 }, { x: 1216, y: 1539 },
      ]),
      patch('bounded-terminal-retreat', [
        { x: 6347, y: 1582 }, { x: 6403, y: 1582 }, { x: 6403, y: 205 },
        { x: 4874, y: 205 }, { x: 4874, y: 36 }, { x: 2917, y: 36 },
        { x: 2917, y: 1253 }, { x: 3029, y: 1253 },
      ]),
      patch('shared-trunk-retreat', [
        { x: 6145, y: 1612 }, { x: 6145, y: 2081 }, { x: 5338, y: 2081 },
        { x: 5338, y: 2120 }, { x: 5052, y: 2120 }, { x: 5052, y: 2081 },
        { x: 1860, y: 2081 }, { x: 1860, y: 2016 }, { x: 1558, y: 2016 },
        { x: 1558, y: 2081 }, { x: 1350, y: 2081 }, { x: 1350, y: 1498 },
        { x: 1286, y: 1498 },
      ], { sharedTrunkSynthesized: true }),
    ])).toBe(true);
  });

  it('rejects invalid, micro-segment, terminal-backtrack, and excessive-bend artifacts', () => {
    const issues = auditPrecompiledDisplayRouteCommercialQuality([
      patch('invalid', [{ x: 0, y: 0 }]),
      patch('micro', [
        { x: 0, y: 0 }, { x: 0, y: 80 }, { x: 7, y: 80 }, { x: 7, y: 160 },
      ]),
      patch('terminal-retreat', [
        { x: 1336, y: 1700 }, { x: 1336, y: 1588 }, { x: 1372, y: 1588 },
        { x: 1372, y: 1396 }, { x: 88, y: 1396 }, { x: 88, y: 2164 },
        { x: 58, y: 2164 }, { x: 58, y: 2612 }, { x: 88, y: 2612 },
        { x: 88, y: 2828 }, { x: 216, y: 2828 }, { x: 216, y: 2884 },
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
      'terminal-retreat:terminal-backtrack-chain',
      'bends:excessive-bends',
    ]);
  });
});
