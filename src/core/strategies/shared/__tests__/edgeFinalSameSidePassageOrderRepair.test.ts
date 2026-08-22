import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { auditFinalSameSideEndpointOrder } from '../edgeFinalSameSideEndpointOrderRepair';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import {
  auditFinalSameSidePassageOrder,
  repairFinalSameSidePassageOrder,
} from '../edgeFinalSameSidePassageOrderRepair';

type Point = { x: number; y: number };

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ReactFlowNode => ({ id, position: { x, y }, width, height, data: {} });

const edge = (
  id: string,
  source: string,
  target: string,
  path: unknown,
  data: Record<string, unknown> = {},
): Edge => ({
  id,
  source,
  target,
  sourceHandle: 'bottom',
  targetHandle: 'top',
  data: { sharedTrunkAware: true, ...data, computedPath: path },
});

const pathOf = (item: Edge | undefined): Point[] => {
  const raw = item?.data && typeof item.data === 'object' && !Array.isArray(item.data)
    ? (item.data as Record<string, unknown>).computedPath
    : undefined;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    return typeof record.x === 'number' && typeof record.y === 'number'
      ? [{ x: record.x, y: record.y }]
      : [];
  });
};

describe('final same-side passage order repair', () => {
  it('does not report port weaving against a direct leg that ends before the sibling passage', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('left', 0, 300, 60, 60),
      node('right', 210, 300, 60, 60),
    ];
    const edges = [
      edge('direct-right', 'hub', 'right', [
        { x: 240, y: 100 }, { x: 240, y: 300 },
      ]),
      edge('detour-left', 'hub', 'left', [
        { x: 270, y: 100 }, { x: 270, y: 200 },
        { x: 30, y: 200 }, { x: 30, y: 300 },
      ]),
    ];

    expect(auditFinalSameSideEndpointOrder(edges, nodes).inversions).toBe(0);
    expect(auditFinalSameSidePassageOrder(edges, nodes).portOrderInversions).toBe(0);
    expect(repairFinalSameSidePassageOrder(edges, nodes)).toBe(edges);
  });

  it('recognizes half-pixel endpoint rounding as one rendered true trunk', () => {
    const nodes = [
      node('hub', 0, 0, 200, 100),
      node('upper', 400, -200, 100, 80),
      node('lower', 400, 200, 100, 80),
    ];
    const edges = [
      {
        ...edge('upper-edge', 'hub', 'upper', [
          { x: 200, y: 50 }, { x: 256, y: 50 }, { x: 256, y: -160 }, { x: 400, y: -160 },
        ]),
        sourceHandle: 'right',
        targetHandle: 'left',
      },
      {
        ...edge('lower-edge', 'hub', 'lower', [
          { x: 199.5, y: 50 }, { x: 255.5, y: 50 }, { x: 255.5, y: 240 }, { x: 400, y: 240 },
        ]),
        sourceHandle: 'right',
        targetHandle: 'left',
      },
    ];

    const passage = auditFinalSameSidePassageOrder(edges, nodes);
    const trunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;

    expect(passage.nearTrunkOpportunities).toBe(0);
    expect(trunks.map(trunk => trunk.id)).toContain(
      'hub|source|right|lower-edge,upper-edge',
    );
  });

  it('jointly repairs TMS endpoint order and first right-branch event lanes', () => {
    const nodes = [
      node('tms', 850, 812, 200, 118),
      node('bms', 650, 1200, 100, 80),
      node('yms', 950, 1200, 100, 80),
      node('visibility', 1250, 1200, 100, 80),
      node('downstream', 1550, 1200, 100, 80),
    ];
    const edges = [
      edge('bms', 'tms', 'bms', [
        { x: 892, y: 930 }, { x: 892, y: 1000 }, { x: 700, y: 1000 }, { x: 700, y: 1200 },
      ]),
      edge('visibility', 'tms', 'visibility', [
        { x: 904, y: 930 }, { x: 904, y: 1077 }, { x: 1300, y: 1077 }, { x: 1300, y: 1200 },
      ]),
      edge('yms', 'tms', 'yms', [
        { x: 916, y: 930 }, { x: 916, y: 1024 }, { x: 1000, y: 1024 }, { x: 1000, y: 1200 },
      ]),
      edge('downstream', 'tms', 'downstream', [
        { x: 928, y: 930 }, { x: 928, y: 1019 }, { x: 1600, y: 1019 }, { x: 1600, y: 1200 },
      ]),
    ];
    const before = auditFinalSameSidePassageOrder(edges, nodes);

    expect(before.portOrderInversions).toBe(1);
    for (const orderedEdges of [edges, [edges[0], edges[3], edges[1], edges[2]]]) {
      const validateCandidate = vi.fn(() => true);
      const result = repairFinalSameSidePassageOrder(orderedEdges, nodes, { validateCandidate });
      const after = auditFinalSameSidePassageOrder(result, nodes);
      const byId = new Map(result.map(item => [item.id, pathOf(item)] as const));
      const trunkIds = auditFinalSameSideEndpointOrder(result, nodes).legalSharedTrunks.map(trunk => trunk.id);

      expect(after.passageDefects).toBeLessThan(before.passageDefects);
      expect(['bms', 'yms', 'visibility', 'downstream'].map(id => byId.get(id)?.[0]?.x))
        .toEqual([892, 904, 904, 928]);
      expect((byId.get('yms')?.[1]?.y ?? 0)).toBeLessThan(byId.get('visibility')?.[1]?.y ?? 0);
      expect((byId.get('visibility')?.[1]?.y ?? 0)).toBeGreaterThan(byId.get('downstream')?.[1]?.y ?? 0);
      expect(trunkIds).toContain('tms|source|bottom|visibility,yms');
      expect(trunkIds).not.toContain('tms|source|bottom|downstream,yms');
      expect(validateCandidate).toHaveBeenCalled();
      expect(calculateEdgePathQualityScore(result).strictCrossings)
        .toBeLessThanOrEqual(calculateEdgePathQualityScore(orderedEdges).strictCrossings);
    }
  });

  it('promotes overlapping WMS right branches into one protected source trunk', () => {
    const nodes = [
      node('wms', 80, 812, 200, 118),
      node('wcs', -100, 1200, 100, 80),
      node('bms', 650, 1200, 100, 80),
      node('visibility', 1250, 1200, 100, 80),
    ];
    const edges = [
      edge('wcs', 'wms', 'wcs', [
        { x: 144, y: 930 }, { x: 144, y: 1044 }, { x: -50, y: 1044 }, { x: -50, y: 1200 },
      ]),
      edge('bms', 'wms', 'bms', [
        { x: 156, y: 930 }, { x: 156, y: 1020 }, { x: 700, y: 1020 }, { x: 700, y: 1200 },
      ]),
      edge('visibility', 'wms', 'visibility', [
        { x: 168, y: 930 }, { x: 168, y: 1020 }, { x: 1300, y: 1020 }, { x: 1300, y: 1200 },
      ]),
    ];
    const before = auditFinalSameSidePassageOrder(edges, nodes);

    const result = repairFinalSameSidePassageOrder(edges, nodes);
    const after = auditFinalSameSidePassageOrder(result, nodes);
    const wcs = pathOf(result.find(item => item.id === 'wcs'));
    const bms = pathOf(result.find(item => item.id === 'bms'));
    const visibility = pathOf(result.find(item => item.id === 'visibility'));
    const trunkIds = auditFinalSameSideEndpointOrder(result, nodes).legalSharedTrunks
      .map(trunk => trunk.id);

    expect(before.reversePassageDefects).toBe(1);
    expect(before.parallelChildOverlaps).toBe(1);
    expect(after.reversePassageDefects).toBe(0);
    expect(after.parallelChildOverlaps).toBe(0);
    expect(wcs[0]?.x).toBe(144);
    expect(bms[1]?.y).toBe(1020);
    expect(visibility[0]?.x).toBe(156);
    expect(visibility[1]?.x).toBe(156);
    expect(trunkIds).toContain('wms|source|bottom|bms,visibility');
  });

  it('moves a singleton child event beyond an opposite-direction true-trunk child', () => {
    const nodes = [
      node('tms', 900, 812, 300, 118),
      node('bms', 650, 1200, 100, 80),
      node('yms', 1050, 1200, 200, 80),
      node('downstream', 1600, 1200, 100, 80),
    ];
    const edges = [
      edge('bms', 'tms', 'bms', [
        { x: 1065, y: 930 }, { x: 1065, y: 1020 }, { x: 812, y: 1020 }, { x: 812, y: 1200 },
      ]),
      edge('downstream', 'tms', 'downstream', [
        { x: 1065, y: 930 }, { x: 1065, y: 1019 }, { x: 1650, y: 1019 }, { x: 1650, y: 1200 },
      ]),
      edge('yms', 'tms', 'yms', [
        { x: 1054, y: 930 }, { x: 1054, y: 1020 }, { x: 1107, y: 1020 }, { x: 1107, y: 1200 },
      ]),
    ];
    const before = auditFinalSameSidePassageOrder(edges, nodes);
    const beforeTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;

    const result = repairFinalSameSidePassageOrder(edges, nodes);
    const after = auditFinalSameSidePassageOrder(result, nodes);
    const afterTrunks = auditFinalSameSideEndpointOrder(result, nodes).legalSharedTrunks;
    const yms = pathOf(result.find(item => item.id === 'yms'));

    expect(before.oppositeChildOverlaps).toBe(1);
    expect(after.oppositeChildOverlaps).toBe(0);
    expect(yms[0]?.x).toBe(1065);
    expect(yms[1]?.y).toBe(1020);
    expect(beforeTrunks.map(trunk => trunk.id)).toContain('tms|source|bottom|bms,downstream');
    expect(afterTrunks.map(trunk => trunk.id)).toContain('tms|source|bottom|bms,downstream,yms');
  });

  it('tries the next ranked child-overlap trunk when the first candidate is rejected', () => {
    const nodes = [
      node('hub', 0, 0, 500, 100),
      node('a-anchor-target', 550, 500, 100, 80),
      node('a-moving-target', 850, 500, 100, 80),
      node('b-anchor-target', 1150, 500, 100, 80),
      node('b-moving-target', 1450, 500, 100, 80),
      node('upstream', 1500, 0, 100, 100),
    ];
    const edges = [
      edge('a-anchor', 'hub', 'a-anchor-target', [
        { x: 100, y: 100 }, { x: 100, y: 200 }, { x: 600, y: 200 }, { x: 600, y: 500 },
      ]),
      edge('a-moving', 'hub', 'a-moving-target', [
        { x: 120, y: 100 }, { x: 120, y: 200 }, { x: 900, y: 200 }, { x: 900, y: 500 },
      ]),
      edge('b-anchor', 'hub', 'b-anchor-target', [
        { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 1200, y: 200 }, { x: 1200, y: 500 },
      ]),
      edge('b-moving', 'hub', 'b-moving-target', [
        { x: 320, y: 100 }, { x: 320, y: 200 }, { x: 1500, y: 200 }, { x: 1500, y: 500 },
      ]),
      edge('b-target-buddy', 'upstream', 'b-moving-target', [
        { x: 1550, y: 100 }, { x: 1550, y: 200 }, { x: 1500, y: 200 }, { x: 1500, y: 500 },
      ]),
    ];
    const attempts: string[][] = [];
    const result = repairFinalSameSidePassageOrder(edges, nodes, {
      validateCandidate: ({ candidateEdges, changedEdgeIndexes }) => {
        const changedIds = changedEdgeIndexes
          .map(index => candidateEdges[index]?.id ?? '')
          .sort();
        attempts.push(changedIds);
        return changedIds.length === 1 && changedIds[0] === 'b-moving';
      },
    });
    const trunks = auditFinalSameSideEndpointOrder(result, nodes).legalSharedTrunks;

    expect(attempts.slice(0, 2)).toEqual([['a-moving'], ['b-moving']]);
    expect(pathOf(result.find(item => item.id === 'a-moving'))[0]?.x).toBe(120);
    expect(pathOf(result.find(item => item.id === 'b-moving'))[0]?.x).toBe(300);
    expect(trunks.map(trunk => trunk.id)).toContain('hub|source|bottom|b-anchor,b-moving');
    expect(trunks.map(trunk => trunk.id)).toContain(
      'b-moving-target|target|top|b-moving,b-target-buddy',
    );
  });

  it('tries the next ranked opposite-child trunk when the first candidate is rejected', () => {
    const nodes = [
      node('hub', 0, 0, 500, 100),
      node('a-trunk-1-target', 250, 500, 100, 80),
      node('a-trunk-2-target', 300, 500, 100, 80),
      node('a-single-target', 0, 500, 100, 80),
      node('b-trunk-1-target', 450, 500, 100, 80),
      node('b-trunk-2-target', 500, 500, 100, 80),
      node('b-single-target', 200, 500, 100, 80),
    ];
    const edges = [
      edge('a-trunk-1', 'hub', 'a-trunk-1-target', [
        { x: 150, y: 100 }, { x: 150, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 500 },
      ]),
      edge('a-trunk-2', 'hub', 'a-trunk-2-target', [
        { x: 150, y: 100 }, { x: 150, y: 200 }, { x: 350, y: 200 }, { x: 350, y: 500 },
      ]),
      edge('b-trunk-1', 'hub', 'b-trunk-1-target', [
        { x: 350, y: 100 }, { x: 350, y: 200 }, { x: 500, y: 200 }, { x: 500, y: 500 },
      ]),
      edge('b-trunk-2', 'hub', 'b-trunk-2-target', [
        { x: 350, y: 100 }, { x: 350, y: 200 }, { x: 550, y: 200 }, { x: 550, y: 500 },
      ]),
      edge('a-single', 'hub', 'a-single-target', [
        { x: 170, y: 100 }, { x: 170, y: 200 }, { x: 50, y: 200 }, { x: 50, y: 500 },
      ]),
      edge('b-single', 'hub', 'b-single-target', [
        { x: 370, y: 100 }, { x: 370, y: 200 }, { x: 250, y: 200 }, { x: 250, y: 500 },
      ]),
    ];
    const attempts: string[][] = [];
    const result = repairFinalSameSidePassageOrder(edges, nodes, {
      validateCandidate: ({ candidateEdges, changedEdgeIndexes }) => {
        const changedIds = changedEdgeIndexes
          .map(index => candidateEdges[index]?.id ?? '')
          .sort();
        attempts.push(changedIds);
        return changedIds.length === 1 && changedIds[0] === 'b-single';
      },
    });

    expect(attempts.slice(0, 2)).toEqual([['a-single'], ['b-single']]);
    expect(pathOf(result.find(item => item.id === 'a-single'))[0]?.x).toBe(170);
    expect(pathOf(result.find(item => item.id === 'b-single'))[0]?.x).toBe(350);
    expect(auditFinalSameSideEndpointOrder(result, nodes).legalSharedTrunks.map(trunk => trunk.id))
      .toContain('hub|source|bottom|b-single,b-trunk-1,b-trunk-2');
  });

  it('assimilates a 1px near target trunk while retaining a bridge source trunk identity', () => {
    const nodes = [
      node('loms', 0, 0, 300, 100),
      node('loms-peer', 300, 500, 80, 80),
      node('tms', 800, 0, 100, 100),
      node('wms', 950, 0, 100, 100),
      node('visibility', 1100, 500, 300, 100),
    ];
    const edges = [
      edge('loms-visibility', 'loms', 'visibility', [
        { x: 60, y: 100 }, { x: 60, y: 160 }, { x: 1100, y: 160 },
        { x: 1100, y: 419 }, { x: 1217, y: 419 }, { x: 1217, y: 500 },
      ]),
      edge('loms-peer', 'loms', 'loms-peer', [
        { x: 60, y: 100 }, { x: 60, y: 160 }, { x: 340, y: 160 }, { x: 340, y: 500 },
      ]),
      edge('tms-visibility', 'tms', 'visibility', [
        { x: 850, y: 100 }, { x: 850, y: 300 }, { x: 1080, y: 300 },
        { x: 1080, y: 411 }, { x: 1216, y: 411 }, { x: 1216, y: 500 },
      ]),
      edge('wms-visibility', 'wms', 'visibility', [
        { x: 1000, y: 100 }, { x: 1000, y: 320 }, { x: 1120, y: 320 },
        { x: 1120, y: 411 }, { x: 1216, y: 411 }, { x: 1216, y: 500 },
      ]),
    ];
    const before = auditFinalSameSidePassageOrder(edges, nodes);
    const initialTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;

    const result = repairFinalSameSidePassageOrder(edges, nodes);
    const after = auditFinalSameSidePassageOrder(result, nodes);
    const finalTrunks = auditFinalSameSideEndpointOrder(result, nodes).legalSharedTrunks;
    const lomsVisibility = pathOf(result.find(item => item.id === 'loms-visibility'));
    const trunkIds = finalTrunks.map(trunk => trunk.id);

    expect(before.nearTrunkOpportunities).toBeGreaterThan(0);
    expect(after.nearTrunkOpportunities).toBe(0);
    expect(lomsVisibility.at(-1)?.x).toBe(1216);
    expect(trunkIds).toContain('loms|source|bottom|loms-peer,loms-visibility');
    expect(trunkIds).toContain(
      'visibility|target|top|loms-visibility,tms-visibility,wms-visibility',
    );
    expect(trunkIds).toContain('visibility|target|top|tms-visibility,wms-visibility');
    expect(finalTrunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'visibility|target|top|loms-visibility,tms-visibility,wms-visibility',
        commonStemLength: 81,
      }),
      expect.objectContaining({
        id: 'visibility|target|top|tms-visibility,wms-visibility',
        commonStemLength: 89,
      }),
    ]));
    expect(initialTrunks.map(trunk => trunk.id)).toContain(
      'loms|source|bottom|loms-peer,loms-visibility',
    );
    expect(initialTrunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'visibility|target|top|tms-visibility,wms-visibility',
        commonStemLength: 89,
      }),
    ]));
  });

  it('keeps an exact fixed near-trunk terminal unchanged', () => {
    const nodes = [
      node('left', 0, 0, 100, 100),
      node('right', 200, 0, 100, 100),
      node('hub', 0, 500, 300, 100),
    ];
    const edges = [
      edge('fixed', 'left', 'hub', [
        { x: 50, y: 100 }, { x: 50, y: 300 }, { x: 121, y: 300 }, { x: 121, y: 440 }, { x: 121, y: 500 },
      ], { targetPortPolicy: 'fixed-pos' }),
      edge('peer', 'right', 'hub', [
        { x: 250, y: 100 }, { x: 250, y: 320 }, { x: 120, y: 320 }, { x: 120, y: 440 }, { x: 120, y: 500 },
      ]),
    ];

    expect(repairFinalSameSidePassageOrder(edges, nodes)).toBe(edges);
    expect(pathOf(edges[0]).at(-1)?.x).toBe(121);
  });

  it('does not assimilate near stems whose first child sectors are opposite', () => {
    const nodes = [
      node('left', 0, 0, 100, 100),
      node('right', 300, 0, 100, 100),
      node('hub', 50, 500, 300, 100),
    ];
    const edges = [
      edge('left', 'left', 'hub', [
        { x: 50, y: 100 }, { x: 50, y: 300 }, { x: 120, y: 300 }, { x: 120, y: 440 }, { x: 120, y: 500 },
      ]),
      edge('right', 'right', 'hub', [
        { x: 350, y: 100 }, { x: 350, y: 320 }, { x: 121, y: 320 }, { x: 121, y: 440 }, { x: 121, y: 500 },
      ]),
    ];

    expect(auditFinalSameSidePassageOrder(edges, nodes).nearTrunkOpportunities).toBe(1);
    expect(repairFinalSameSidePassageOrder(edges, nodes)).toBe(edges);
  });

  it('fails closed for malformed paths and a throwing final validator', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('left', 0, 400, 60, 60),
      node('right', 240, 400, 60, 60),
    ];
    const malformed = [
      edge('bad', 'hub', 'left', 'bad-path'),
      edge('nan', 'hub', 'right', [{ x: Number.NaN, y: 100 }, { x: 270, y: 400 }]),
    ];
    expect(auditFinalSameSidePassageOrder(malformed, nodes).invalidLegCount).toBe(4);
    expect(repairFinalSameSidePassageOrder(malformed, nodes)).toBe(malformed);

    const valid = [
      edge('left', 'hub', 'left', [
        { x: 145, y: 100 }, { x: 145, y: 160 }, { x: 30, y: 160 }, { x: 30, y: 400 },
      ]),
      edge('right', 'hub', 'right', [
        { x: 155, y: 100 }, { x: 155, y: 160 }, { x: 270, y: 160 }, { x: 270, y: 400 },
      ]),
    ];
    const validator = vi.fn((): boolean => {
      throw new Error('display gate unavailable');
    });
    expect(repairFinalSameSidePassageOrder(valid, nodes, { validateCandidate: validator }))
      .toBe(valid);
  });
});
