import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  auditFinalSameSideEndpointOrder,
  repairFinalSameSideEndpointOrder,
} from '../edgeFinalSameSideEndpointOrderRepair';

type Point = { x: number; y: number };

const node = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ReactFlowNode => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
});

const edge = (
  id: string,
  source: string,
  target: string,
  computedPath: unknown,
  data: Record<string, unknown> = {},
): Edge => ({
  id,
  source,
  target,
  sourceHandle: 'bottom',
  targetHandle: 'top',
  data: { ...data, computedPath },
});

const pathOf = (value: Edge | undefined): Point[] => {
  const raw = value?.data && typeof value.data === 'object' && !Array.isArray(value.data)
    ? (value.data as Record<string, unknown>).computedPath
    : undefined;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    return typeof record.x === 'number' && typeof record.y === 'number'
      ? [{ x: record.x, y: record.y }]
      : [];
  });
};

const sourceFanoutFixture = (): { nodes: ReactFlowNode[]; edges: Edge[] } => {
  const nodes = [
    node('hub', 0, 0, 300, 100),
    node('left', 0, 300, 60, 60),
    node('middle', 120, 300, 60, 60),
    node('right', 240, 300, 60, 60),
  ];
  const edges = [
    edge('to-left', 'hub', 'left', [
      { x: 270, y: 100 }, { x: 270, y: 140 }, { x: 30, y: 140 }, { x: 30, y: 300 },
    ]),
    edge('to-middle', 'hub', 'middle', [
      { x: 150, y: 100 }, { x: 150, y: 160 }, { x: 150, y: 300 },
    ]),
    edge('to-right', 'hub', 'right', [
      { x: 30, y: 100 }, { x: 30, y: 180 }, { x: 270, y: 180 }, { x: 270, y: 300 },
    ]),
  ];
  return { nodes, edges };
};

describe('final same-side endpoint order repair', () => {
  it('uses a supplied exact audit evaluator without changing candidate acceptance', () => {
    const fixture = sourceFanoutFixture();
    const expected = repairFinalSameSideEndpointOrder(fixture.edges, fixture.nodes);
    const evaluateEndpointOrder = vi.fn((edges: readonly Edge[]) => (
      auditFinalSameSideEndpointOrder(edges, fixture.nodes)
    ));
    const validateCandidate = vi.fn(() => true);

    const result = repairFinalSameSideEndpointOrder(fixture.edges, fixture.nodes, {
      evaluateEndpointOrder,
      validateCandidate,
    });

    expect(result).toEqual(expected);
    expect(evaluateEndpointOrder).toHaveBeenCalledTimes(2);
    expect(evaluateEndpointOrder.mock.calls[0]?.[0]).toBe(fixture.edges);
    expect(validateCandidate).toHaveBeenCalledTimes(1);
  });

  it('sorts a source fan-out using only its existing endpoint-coordinate multiset', () => {
    const fixture = sourceFanoutFixture();
    const before = auditFinalSameSideEndpointOrder(fixture.edges, fixture.nodes);
    const originalCoordinates = fixture.edges.map(item => pathOf(item)[0].x).sort((a, b) => a - b);

    const result = repairFinalSameSideEndpointOrder(fixture.edges, fixture.nodes);
    const after = auditFinalSameSideEndpointOrder(result, fixture.nodes);
    const sourceCoordinates = result.map(item => pathOf(item)[0].x);
    const reassignedCoordinates = [...sourceCoordinates].sort((a, b) => a - b);

    expect(before.inversions).toBe(3);
    expect(after.inversions).toBe(0);
    expect(sourceCoordinates).toEqual([30, 150, 270]);
    expect(reassignedCoordinates).toEqual(originalCoordinates);
    result.forEach((item) => {
      const path = pathOf(item);
      expect(path[0].x).toBe(path[1].x);
    });
  });

  it('classifies a shared 48px+ geometric stem as one legal trunk block', () => {
    const fixture = sourceFanoutFixture();
    const tiedEdges = fixture.edges.map((item, index) => {
      if (index === 0) return item;
      const path = pathOf(item).map(point => ({ ...point }));
      path[0].x = 30;
      path[1].x = 30;
      return { ...item, data: { ...item.data, computedPath: path } };
    });
    const before = auditFinalSameSideEndpointOrder(tiedEdges, fixture.nodes);
    expect(before.inversions).toBe(1);
    expect(before.sharedLaneTies).toBe(1);
    expect(before.legalSharedTrunkTies).toBe(1);
    expect(before.ambiguousLaneTies).toBe(0);
    expect(before.legalSharedTrunks[0]?.edgeIds).toEqual(['to-middle', 'to-right']);
  });

  it('clusters near-equal true trunks across an EPS quantization boundary', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('left', 0, 300, 60, 60),
      node('right', 240, 300, 60, 60),
    ];
    const edges = [
      edge('left', 'hub', 'left', [
        { x: 30.24, y: 100 }, { x: 30.24, y: 160 }, { x: 30, y: 160 }, { x: 30, y: 300 },
      ]),
      edge('right', 'hub', 'right', [
        { x: 30.26, y: 100 }, { x: 30.26, y: 180 }, { x: 270, y: 180 }, { x: 270, y: 300 },
      ]),
    ];

    const audit = auditFinalSameSideEndpointOrder(edges, nodes);

    expect(audit.legalSharedTrunks[0]?.edgeIds).toEqual(['left', 'right']);
    expect(audit.legalSharedTrunks[0]?.commonStemLength).toBe(60);
    expect(audit.ambiguousLaneTies).toBe(0);
    expect(audit.collapsedLanePairs).toBe(0);
    expect(repairFinalSameSideEndpointOrder(edges, nodes)).toBe(edges);
  });

  it('splits a false same-coordinate collapse when the routes have no real shared stem', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('left', 0, 300, 60, 60),
      node('right', 240, 300, 60, 60),
    ];
    const edges = [
      edge('left', 'hub', 'left', [
        { x: 150, y: 100 }, { x: 150, y: 130 }, { x: 30, y: 130 }, { x: 30, y: 300 },
      ]),
      edge('right', 'hub', 'right', [
        { x: 150, y: 100 }, { x: 150, y: 130 }, { x: 270, y: 130 }, { x: 270, y: 300 },
      ]),
    ];
    const before = auditFinalSameSideEndpointOrder(edges, nodes);

    const result = repairFinalSameSideEndpointOrder(edges, nodes);
    const after = auditFinalSameSideEndpointOrder(result, nodes);
    const coordinates = result.map(item => pathOf(item)[0].x);

    expect(before.inversions).toBe(0);
    expect(before.ambiguousLaneTies).toBe(1);
    expect(before.collapsedLanePairs).toBe(1);
    expect(before.legalSharedTrunkTies).toBe(0);
    expect(after.inversions).toBe(0);
    expect(after.ambiguousLaneTies).toBe(0);
    expect(after.collapsedLanePairs).toBe(0);
    expect(coordinates[0]).toBeLessThan(coordinates[1]);
  });

  it('widens distinct ordered ports that are closer than the 12px readability floor', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('left', 0, 300, 60, 60),
      node('right', 240, 300, 60, 60),
    ];
    const edges = [
      edge('left', 'hub', 'left', [
        { x: 145, y: 100 }, { x: 145, y: 130 }, { x: 30, y: 130 }, { x: 30, y: 300 },
      ]),
      edge('right', 'hub', 'right', [
        { x: 155, y: 100 }, { x: 155, y: 130 }, { x: 270, y: 130 }, { x: 270, y: 300 },
      ]),
    ];
    const before = auditFinalSameSideEndpointOrder(edges, nodes);

    const result = repairFinalSameSideEndpointOrder(edges, nodes);
    const after = auditFinalSameSideEndpointOrder(result, nodes);
    const coordinates = result.map(item => pathOf(item)[0].x);

    expect(before.inversions).toBe(0);
    expect(before.ambiguousLaneTies).toBe(0);
    expect(before.collapsedLanePairs).toBe(1);
    expect(after.collapsedLanePairs).toBe(0);
    expect(coordinates[1] - coordinates[0]).toBeGreaterThanOrEqual(12);
  });

  it('reports equal remote positions as desired-order ties instead of inversions', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('first', 100, 300, 60, 60),
      node('second', 100, 500, 60, 60),
    ];
    const edges = [
      edge('first', 'hub', 'first', [
        { x: 240, y: 100 }, { x: 240, y: 180 }, { x: 130, y: 180 }, { x: 130, y: 300 },
      ]),
      edge('second', 'hub', 'second', [
        { x: 60, y: 100 }, { x: 60, y: 200 }, { x: 130, y: 200 }, { x: 130, y: 500 },
      ]),
    ];
    const metrics = auditFinalSameSideEndpointOrder(edges, nodes);

    expect(metrics.desiredOrderTies).toBe(1);
    expect(metrics.comparablePairs).toBe(0);
    expect(metrics.inversions).toBe(0);
    expect(repairFinalSameSideEndpointOrder(edges, nodes)).toBe(edges);
  });

  it('widens visually collapsed independent ports even when their remote order is tied', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('first', 100, 300, 60, 60),
      node('second', 100, 500, 60, 60),
    ];
    const edges = [
      edge('first', 'hub', 'first', [
        { x: 145, y: 100 }, { x: 145, y: 180 }, { x: 130, y: 180 }, { x: 130, y: 300 },
      ]),
      edge('second', 'hub', 'second', [
        { x: 153, y: 100 }, { x: 153, y: 200 }, { x: 130, y: 200 }, { x: 130, y: 500 },
      ]),
    ];

    const before = auditFinalSameSideEndpointOrder(edges, nodes);
    const repaired = repairFinalSameSideEndpointOrder(edges, nodes);
    const after = auditFinalSameSideEndpointOrder(repaired, nodes);
    const coordinates = repaired.map(item => pathOf(item)[0].x);

    expect(before.desiredOrderTies).toBe(1);
    expect(before.collapsedLanePairs).toBe(1);
    expect(after.desiredOrderTies).toBe(1);
    expect(after.collapsedLanePairs).toBe(0);
    expect(coordinates[1] - coordinates[0]).toBeGreaterThanOrEqual(12);
  });

  it('anchors a true trunk and moves only its collapsed independent branch', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('left', 0, 300, 60, 60),
      node('middle', 120, 300, 60, 60),
      node('right', 240, 300, 60, 60),
    ];
    const edges = [
      edge('trunk-left', 'hub', 'left', [
        { x: 150, y: 100 }, { x: 150, y: 180 }, { x: 30, y: 180 }, { x: 30, y: 300 },
      ]),
      edge('trunk-right', 'hub', 'right', [
        { x: 150, y: 100 }, { x: 150, y: 180 }, { x: 270, y: 180 }, { x: 270, y: 300 },
      ]),
      edge('independent', 'hub', 'middle', [
        { x: 158, y: 100 }, { x: 158, y: 220 }, { x: 150, y: 220 }, { x: 150, y: 300 },
      ]),
    ];

    const validateCandidate = vi.fn(context => (
      context.changedEdgeIndexes.length === 1
      && context.changedEdgeIndexes[0] === 2
    ));
    const repaired = repairFinalSameSideEndpointOrder(edges, nodes, { validateCandidate });
    const trunkCoordinates = repaired.slice(0, 2).map(item => pathOf(item)[0].x);
    const independentCoordinate = pathOf(repaired[2])[0].x;

    expect(validateCandidate).toHaveBeenCalled();
    expect(trunkCoordinates).toEqual([150, 150]);
    expect(independentCoordinate - trunkCoordinates[0]).toBeGreaterThanOrEqual(12);
    expect(auditFinalSameSideEndpointOrder(repaired, nodes).collapsedLanePairs).toBe(0);
  });

  it.each([
    ['manual exact handle', { manualHandles: { source: true } }],
    ['fixed position', { sourcePortPolicy: 'fixed-pos' }],
  ])('does not reassign a %s terminal', (_label, terminalData) => {
    const fixture = sourceFanoutFixture();
    const edges = fixture.edges.slice(0, 2).map((item, index) => (
      index === 0 ? { ...item, data: { ...item.data, ...terminalData } } : item
    ));
    const originalPath = pathOf(edges[0]);
    const before = auditFinalSameSideEndpointOrder(edges, fixture.nodes);

    const result = repairFinalSameSideEndpointOrder(edges, fixture.nodes);

    expect(before.fixedEndpointCount).toBe(1);
    expect(before.inversions).toBe(1);
    expect(result).toBe(edges);
    expect(pathOf(result[0])).toEqual(originalPath);
  });

  it.each([
    ['manual side', { manualHandleSides: ['source'] }],
    ['strong side', { sourcePortPolicy: 'strong' }],
  ])('allows a %s terminal to slide without changing its handle', (_label, terminalData) => {
    const fixture = sourceFanoutFixture();
    const edges = [fixture.edges[0], fixture.edges[2]].map((item, index) => (
      index === 0 ? { ...item, data: { ...item.data, ...terminalData } } : item
    ));

    const result = repairFinalSameSideEndpointOrder(edges, fixture.nodes);

    expect(auditFinalSameSideEndpointOrder(result, fixture.nodes).inversions).toBe(0);
    expect(pathOf(result[0])[0].x).toBe(30);
    expect(result[0].sourceHandle).toBe('bottom');
  });

  it('mirrors the same ordering rule for a target fan-in', () => {
    const nodes = [
      node('left', 0, 0, 60, 60),
      node('middle', 120, 0, 60, 60),
      node('right', 240, 0, 60, 60),
      node('hub', 0, 300, 300, 100),
    ];
    const edges = [
      edge('from-left', 'left', 'hub', [
        { x: 30, y: 60 }, { x: 30, y: 220 }, { x: 270, y: 220 }, { x: 270, y: 300 },
      ]),
      edge('from-middle', 'middle', 'hub', [
        { x: 150, y: 60 }, { x: 150, y: 240 }, { x: 150, y: 300 },
      ]),
      edge('from-right', 'right', 'hub', [
        { x: 270, y: 60 }, { x: 270, y: 200 }, { x: 30, y: 200 }, { x: 30, y: 300 },
      ]),
    ];

    const result = repairFinalSameSideEndpointOrder(edges, nodes);

    expect(auditFinalSameSideEndpointOrder(edges, nodes).inversions).toBe(3);
    expect(auditFinalSameSideEndpointOrder(result, nodes).inversions).toBe(0);
    expect(result.map(item => pathOf(item).at(-1)?.x)).toEqual([30, 150, 270]);
    result.forEach((item) => {
      const path = pathOf(item);
      expect(path.at(-1)?.x).toBe(path.at(-2)?.x);
    });
  });

  it('moves real endpoint trunks atomically and preserves both identities of a bridge edge', () => {
    const nodes = [
      node('source-hub', 0, 0, 300, 100),
      node('left-a', 0, 400, 40, 60),
      node('left-b', 40, 400, 40, 60),
      node('right-a', 220, 400, 40, 60),
      node('right-b', 260, 400, 40, 60),
      node('upstream', 100, 220, 40, 40),
      node('upstream-short', 160, 220, 40, 40),
    ];
    const trunkData = { sharedTrunkAware: true };
    const edges = [
      edge('bridge', 'source-hub', 'left-a', [
        { x: 240, y: 100 }, { x: 240, y: 160 }, { x: 20, y: 160 },
        { x: 20, y: 340 }, { x: 20, y: 400 },
      ], trunkData),
      edge('source-buddy', 'source-hub', 'left-b', [
        { x: 240, y: 100 }, { x: 240, y: 160 }, { x: 60, y: 160 }, { x: 60, y: 400 },
      ], trunkData),
      edge('right-a', 'source-hub', 'right-a', [
        { x: 60, y: 100 }, { x: 60, y: 180 }, { x: 240, y: 180 }, { x: 240, y: 400 },
      ], trunkData),
      edge('right-b', 'source-hub', 'right-b', [
        { x: 60, y: 100 }, { x: 60, y: 180 }, { x: 280, y: 180 }, { x: 280, y: 400 },
      ], trunkData),
      edge('target-buddy', 'upstream', 'left-a', [
        { x: 120, y: 260 }, { x: 120, y: 340 }, { x: 20, y: 340 }, { x: 20, y: 400 },
      ], trunkData),
      edge('target-short', 'upstream-short', 'left-a', [
        { x: 180, y: 260 }, { x: 180, y: 352 }, { x: 20, y: 352 }, { x: 20, y: 400 },
      ], trunkData),
    ];
    const before = auditFinalSameSideEndpointOrder(edges, nodes);

    const result = repairFinalSameSideEndpointOrder(edges, nodes);
    const after = auditFinalSameSideEndpointOrder(result, nodes);
    const bridge = pathOf(result.find(item => item.id === 'bridge'));
    const sourceBuddy = pathOf(result.find(item => item.id === 'source-buddy'));
    const targetBuddy = pathOf(result.find(item => item.id === 'target-buddy'));
    const sourceGroup = after.groups.find(group => (
      group.nodeId === 'source-hub' && group.role === 'source'
    ));
    const targetGroup = after.groups.find(group => (
      group.nodeId === 'left-a' && group.role === 'target'
    ));

    expect(before.inversions).toBe(1);
    expect(after.inversions).toBe(0);
    expect(bridge[0]).toEqual({ x: 60, y: 100 });
    expect(sourceBuddy[0]).toEqual(bridge[0]);
    expect(bridge.at(-1)).toEqual({ x: 20, y: 400 });
    expect(targetBuddy.at(-1)).toEqual(bridge.at(-1));
    expect(sourceGroup?.legalSharedTrunkTies).toBe(2);
    expect(targetGroup?.legalSharedTrunkTies).toBe(3);
    expect(after.legalSharedTrunks.map(trunk => trunk.id)).toContain(
      'source-hub|source|bottom|bridge,source-buddy',
    );
    expect(after.legalSharedTrunks.map(trunk => trunk.id)).toContain(
      'left-a|target|top|bridge,target-buddy',
    );
    expect(after.legalSharedTrunks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'left-a|target|top|bridge,target-buddy',
        commonStemLength: 60,
      }),
      expect.objectContaining({
        id: 'left-a|target|top|bridge,target-buddy,target-short',
        commonStemLength: 48,
      }),
    ]));
  });

  it('audits logistics port-order debt without breaking true trunks on an unsafe local swap', () => {
    const nodes = [
      node('l-oms', 935.25, 534, 259, 118),
      node('wms', 50, 812, 282, 118),
      node('wcs', 32, 1090, 298, 118),
      node('tms', 923.75, 812, 282, 118),
      node('customs', 1525.75, 823, 282, 96),
      node('bms', 650, 1090, 243, 118),
      node('yms', 1213, 1090, 250, 118),
      node('visibility', 1286.3375, 1540, 296, 118),
      node('downstream', 1851.1125, 106.5, 219, 73),
    ];
    const trunkData = { sharedTrunkAware: true, sharedTrunkSynthesized: true };
    const edges = [
      edge('edge-loms-customs', 'l-oms', 'customs', [
        { x: 1176, y: 652 }, { x: 1176, y: 787 }, { x: 1224, y: 787 },
        { x: 1224, y: 867 }, { x: 1525.75, y: 867 },
      ], trunkData),
      edge('edge-loms-tms', 'l-oms', 'tms', [
        { x: 1065, y: 652 }, { x: 1065, y: 812 },
      ], trunkData),
      edge('edge-loms-visibility', 'l-oms', 'visibility', [
        { x: 1065, y: 652 }, { x: 1065, y: 751 }, { x: 811, y: 751 },
        { x: 811, y: 1044 }, { x: 902, y: 1044 }, { x: 902, y: 1392 },
        { x: 1435, y: 1392 }, { x: 1435, y: 1540 },
      ], trunkData),
      edge('edge-loms-wms', 'l-oms', 'wms', [
        { x: 1065, y: 652 }, { x: 1065, y: 722 }, { x: 191, y: 722 }, { x: 191, y: 812 },
      ], trunkData),
      edge('edge-tms-bms', 'tms', 'bms', [
        { x: 1065, y: 930 }, { x: 1065, y: 1020 }, { x: 812, y: 1020 }, { x: 812, y: 1090 },
      ], trunkData),
      edge('edge-tms-downstream', 'tms', 'downstream', [
        { x: 1065, y: 930 }, { x: 1065, y: 1019 }, { x: 1929, y: 1019 }, { x: 1929, y: 179.5 },
      ], trunkData),
      edge('edge-tms-yms', 'tms', 'yms', [
        { x: 1054, y: 930 }, { x: 1054, y: 1020 }, { x: 1107, y: 1020 },
        { x: 1107, y: 1148 }, { x: 1213, y: 1148 },
      ], trunkData),
      edge('edge-tms-visibility', 'tms', 'visibility', [
        { x: 1135, y: 930 }, { x: 1135, y: 1020 }, { x: 1487, y: 1020 },
        { x: 1487, y: 1376 }, { x: 1435, y: 1376 }, { x: 1435, y: 1540 },
      ], trunkData),
      edge('edge-wms-bms', 'wms', 'bms', [
        { x: 191, y: 930 }, { x: 191, y: 1000 }, { x: 731, y: 1000 }, { x: 731, y: 1090 },
      ], trunkData),
      edge('edge-wms-visibility', 'wms', 'visibility', [
        { x: 186, y: 930 }, { x: 186, y: 1020 }, { x: 382, y: 1020 },
        { x: 382, y: 1450 }, { x: 1435, y: 1450 }, { x: 1435, y: 1540 },
      ], trunkData),
      edge('edge-wms-wcs', 'wms', 'wcs', [
        { x: 181, y: 930 }, { x: 181, y: 1090 },
      ], trunkData),
    ];
    const before = auditFinalSameSideEndpointOrder(edges, nodes);

    const result = repairFinalSameSideEndpointOrder(edges, nodes);
    const after = auditFinalSameSideEndpointOrder(result, nodes);
    const wmsCoordinates = ['edge-wms-wcs', 'edge-wms-bms', 'edge-wms-visibility']
      .map(id => pathOf(result.find(item => item.id === id))[0].x);
    const trunkIds = after.legalSharedTrunks.map(trunk => trunk.id);

    expect(before.inversions).toBeGreaterThan(0);
    expect(before.collapsedLanePairs).toBeGreaterThan(0);
    expect(after.inversions).toBe(before.inversions);
    expect(wmsCoordinates).toEqual([181, 191, 186]);
    expect(trunkIds).toContain(
      'l-oms|source|bottom|edge-loms-tms,edge-loms-visibility,edge-loms-wms',
    );
    expect(trunkIds).toContain(
      'tms|source|bottom|edge-tms-bms,edge-tms-downstream',
    );
    expect(trunkIds).toContain(
      'visibility|target|top|edge-loms-visibility,edge-tms-visibility,edge-wms-visibility',
    );
  });

  it('fails closed for malformed, non-finite, and extreme router paths', () => {
    const fixture = sourceFanoutFixture();
    const malformed = [
      edge('string-path', 'hub', 'left', 'not-a-path'),
      edge('nan-path', 'hub', 'middle', [{ x: Number.NaN, y: 100 }, { x: 0, y: 300 }]),
      edge('extreme-path', 'hub', 'right', [{ x: 1e12, y: 100 }, { x: 1e12, y: 300 }]),
    ];

    const metrics = auditFinalSameSideEndpointOrder(malformed, fixture.nodes);

    expect(metrics.invalidEndpointCount).toBe(6);
    expect(metrics.inversions).toBe(0);
    expect(repairFinalSameSideEndpointOrder(malformed, fixture.nodes)).toBe(malformed);
  });

  it('rejects an order improvement that introduces a routing-obstacle hit', () => {
    const nodes = [
      node('hub', 0, 0, 300, 100),
      node('left', 0, 300, 60, 60),
      node('right', 240, 300, 60, 60),
      node('blocker', 22, 145, 16, 20),
    ];
    const edges = [
      edge('to-left', 'hub', 'left', [
        { x: 270, y: 100 }, { x: 270, y: 210 }, { x: 30, y: 210 }, { x: 30, y: 300 },
      ]),
      edge('to-right', 'hub', 'right', [
        { x: 30, y: 100 }, { x: 30, y: 130 }, { x: 270, y: 130 }, { x: 270, y: 300 },
      ]),
    ];

    expect(auditFinalSameSideEndpointOrder(edges, nodes).inversions).toBe(1);
    expect(repairFinalSameSideEndpointOrder(edges, nodes)).toBe(edges);
  });

  it('lets a final-layer validator reject or fail without leaking a partial candidate', () => {
    const fixture = sourceFanoutFixture();
    const reject = vi.fn(() => false);
    const rejected = repairFinalSameSideEndpointOrder(fixture.edges, fixture.nodes, {
      validateCandidate: reject,
    });
    const failure = vi.fn((): boolean => {
      throw new Error('display gate unavailable');
    });
    const failed = repairFinalSameSideEndpointOrder(fixture.edges, fixture.nodes, {
      validateCandidate: failure,
    });

    expect(reject).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledOnce();
    expect(rejected).toBe(fixture.edges);
    expect(failed).toBe(fixture.edges);
  });
});
