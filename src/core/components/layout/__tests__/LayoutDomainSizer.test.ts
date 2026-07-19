import { describe, expect, it, vi } from 'vitest';

import { LayoutDomainSizer } from '../LayoutDomainSizer';

const config = {
  NODE_H_GAP: 20,
  NODE_V_GAP: 30,
  DOMAIN_H_GAP: 40,
  BE_COLUMN_GAP: 50,
  GROUP_PADDING: { H: 10, V: 12 },
  SUB_GROUP_PADDING: { H: 8, V_TOP: 6, V_BOTTOM: 7 },
};

const createSizer = () => {
  const calculateMultipleNodeWidths = vi.fn((descriptions: string[]) =>
    descriptions.map((_, index) => 100 + index * 10)
  );
  const calculateMultipleNodeHeights = vi.fn((descriptions: string[]) =>
    descriptions.map((_, index) => 50 + index * 5)
  );

  return {
    calculateMultipleNodeHeights,
    calculateMultipleNodeWidths,
    sizer: new LayoutDomainSizer({
      getConfig: () => config,
      calculateMultipleNodeWidths,
      calculateMultipleNodeHeights,
    }),
  };
};

const domain = {
  title: 'Domain',
  nodes: ['a', 'b'],
  descs: ['Alpha', 'Beta'],
};

describe('LayoutDomainSizer', () => {
  it('calculates deterministic subdomain and domain widths from injected measurements', () => {
    const { sizer } = createSizer();

    expect(sizer.calculateSubDomainWidth(domain.descs, 'single')).toBe(146);
    expect(sizer.calculateSubDomainWidth(domain.descs, 'double')).toBe(286);
    expect(sizer.calculateDomainWidth([100, 120], [], 'horizontal')).toBe(340);
    expect(sizer.calculateDomainWidth([100, 120], [], 'vertical')).toBe(200);
    expect(sizer.calculateSingleLayerDomainWidth(domain, 'data')).toBe(250);
  });

  it('keeps empty domains at padding size without creating a negative gap', () => {
    const { sizer } = createSizer();
    const emptyDomain = { title: 'Empty', nodes: [], descs: [] };

    expect(sizer.calculateSingleLayerDomainWidth(emptyDomain)).toBe(20);
    expect(sizer.calculateSingleLayerDomainHeight(emptyDomain)).toBe(24);
  });

  it('uses the existing safe defaults for empty and invalid boundary input', () => {
    const { sizer, calculateMultipleNodeHeights, calculateMultipleNodeWidths } = createSizer();

    expect(sizer.calculateComplexDomainWidth('mid', null)).toBe(800);
    expect(sizer.calculateComplexDomainHeight('mid', [])).toBe(400);
    expect(sizer.calculateAllDomainWidths('not-an-object')).toEqual({});
    expect(sizer.calculateUnifiedDomainWidth({ invalid: { nodes: [], descs: [] } })).toBe(1200);
    expect(sizer.calculateBackendComplexDomainWidth(undefined)).toBe(2520);
    expect(sizer.calculateBackendComplexDomainHeight(undefined)).toBe(424);
    expect(calculateMultipleNodeWidths).not.toHaveBeenCalled();
    expect(calculateMultipleNodeHeights).not.toHaveBeenCalled();
  });

  it('rejects wrong item types and excessive strings before text measurement', () => {
    const { sizer, calculateMultipleNodeWidths } = createSizer();
    const wrongItemType = {
      title: 'Invalid',
      nodes: ['a'],
      descs: [42],
    };
    const excessiveTitle = {
      title: 'x'.repeat(10_001),
      nodes: [],
      descs: [],
    };

    expect(sizer.calculateSingleLayerDomainWidth(wrongItemType)).toBe(800);
    expect(sizer.calculateSingleLayerDomainWidth(excessiveTitle)).toBe(800);
    expect(calculateMultipleNodeWidths).not.toHaveBeenCalled();
  });

  it('contains non-finite dimensions and rejects prototype keys', () => {
    const sizer = new LayoutDomainSizer({
      getConfig: () => config,
      calculateMultipleNodeWidths: () => [Number.NaN, Number.POSITIVE_INFINITY, -1],
      calculateMultipleNodeHeights: () => [Number.NEGATIVE_INFINITY],
    });
    const unsafeMasterData = JSON.parse(
      '{"__proto__":{"title":"Unsafe","nodes":[],"descs":[]}}'
    ) as unknown;
    const sparseScm = {
      title: 'SCM',
      nodes: Array.from({ length: 6 }, (_, index) => `node-${index}`),
      descs: Array.from({ length: 6 }, (_, index) => `Node ${index}`),
    };
    const sparseMid = {
      title: 'Middle',
      nodes: ['a', 'b'],
      descs: ['A', 'B'],
    };

    expect(Number.isFinite(sizer.calculateSubDomainWidth(domain.descs, 'double'))).toBe(true);
    expect(Number.isFinite(sizer.calculateDomainWidth([Number.NaN, Infinity, -1], domain.descs))).toBe(true);
    expect(Number.isFinite(sizer.calculateSingleLayerDomainHeight(domain))).toBe(true);
    expect(Number.isFinite(sizer.calculateBackendDomainMinWidth(sparseScm))).toBe(true);
    expect(Number.isFinite(sizer.calculateComplexDomainWidth('mid', { mid: sparseMid }))).toBe(true);
    expect(Number.isFinite(sizer.calculateComplexDomainHeight('mid', { mid: sparseMid }))).toBe(true);
    expect(sizer.calculateAllDomainWidths(unsafeMasterData)).toEqual({});
  });

  it('calculates all valid domain widths without exposing backend subdomains', () => {
    const { sizer } = createSizer();
    const masterData = {
      'be-scm': domain,
      'be-logistics': domain,
      'be-corp': domain,
      mid: {
        title: 'Middle',
        nodes: Array.from({ length: 10 }, (_, index) => `m${index}`),
        descs: Array.from({ length: 10 }, (_, index) => `Middle ${index}`),
      },
      data: domain,
    };

    const widths = sizer.calculateAllDomainWidths(masterData);

    expect(widths.backend).toBeGreaterThan(0);
    expect(widths.mid).toBeGreaterThan(0);
    expect(widths.data).toBe(250);
    expect(widths['be-scm']).toBeUndefined();
    expect(sizer.calculateAdaptiveCanvasWidth(masterData)).toBeGreaterThanOrEqual(1240);
  });
});
