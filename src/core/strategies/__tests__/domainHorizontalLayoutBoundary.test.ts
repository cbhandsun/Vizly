import { describe, expect, it } from 'vitest';

import {
  boundedLayoutNumber,
  resolveDomainHorizontalLayoutBoundary,
} from '../domainHorizontalLayoutBoundary';

describe('domain horizontal layout boundary', () => {
  it('resolves valid configuration and typed options', () => {
    const result = resolveDomainHorizontalLayoutBoundary({
      domain: { padding: { horizontal: 32 }, gap: 50 },
      layout: { autoGapScale: { h: 0.5 } },
      diagram: { layout: { nodeStrategy: 'grid' } },
    }, {
      NODE_H_GAP: 140,
      NODE_V_GAP: 90,
    }, {
      padding: { top: 60, left: 70 },
      domainWhitelist: [' A ', 'A', 'B'],
      subDomainWhitelist: ['S'],
      generateDomainGroups: false,
      nodeLayout: 'dagre',
      stopAfterPhase: 'phase1',
    });

    expect(result).toMatchObject({
      padH: 32,
      domainGapEffH: 25,
      nodeV: 90,
      baseHGap: 140,
      hGap: 70,
      anchorTop: 60,
      anchorLeft: 70,
      domainWhitelist: ['A', 'B'],
      subDomainWhitelist: ['S'],
      showDomainGroups: false,
      showSubDomainGroups: true,
      nodeLayout: 'dagre',
      stopAfterPhase: 'phase1',
    });
  });

  it('bounds hostile numbers and rejects mistyped flags and lists', () => {
    const result = resolveDomainHorizontalLayoutBoundary({
      domain: { padding: { horizontal: -100 }, gap: Number.POSITIVE_INFINITY },
      layout: { autoGapScale: { h: 1_000 } },
    }, {
      NODE_H_GAP: 1_000_000,
      NODE_V_GAP: Number.NaN,
    }, {
      padding: { top: Number.NEGATIVE_INFINITY, left: 2_000_000 },
      domainWhitelist: 'A',
      generateDomainGroups: 'false',
      nodeLayout: { bad: true },
      stopAfterPhase: 'later',
    });

    expect(result.padH).toBe(0);
    expect(result.domainGapEffH).toBe(400);
    expect(result.baseHGap).toBe(5_000);
    expect(result.nodeV).toBe(80);
    expect(result.anchorTop).toBe(40);
    expect(result.anchorLeft).toBe(1_000_000);
    expect(result.domainWhitelist).toBeUndefined();
    expect(result.showDomainGroups).toBe(true);
    expect(result.nodeLayout).toBe('vertical');
    expect(result.stopAfterPhase).toBeUndefined();
  });

  it('coerces only finite numbers within explicit bounds', () => {
    expect(boundedLayoutNumber(5, 1, 0, 10)).toBe(5);
    expect(boundedLayoutNumber(-5, 1, 0, 10)).toBe(0);
    expect(boundedLayoutNumber(50, 1, 0, 10)).toBe(10);
    expect(boundedLayoutNumber('5', 1, 0, 10)).toBe(1);
  });
});
