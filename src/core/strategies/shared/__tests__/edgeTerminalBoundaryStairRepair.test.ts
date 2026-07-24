import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairTerminalBoundaryStairs } from '../edgeTerminalBoundaryStairRepair';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { countEndpointNodeTraversalHits } from '../edgeWaypointCandidateRepair';

const node = (
  id: string, x: number, y: number, width: number, height: number,
): Node & { positionAbsolute: { x: number; y: number } } => ({
  id,
  position: { x, y },
  positionAbsolute: { x, y },
  measured: { width, height },
  data: {},
});

describe('repairTerminalBoundaryStairs', () => {
  it('slides a corner-adjacent top anchor inward to widen a tiny terminal stair', () => {
    const edge: Edge = {
      id: 'cross-domain-carrier',
      source: 'tms',
      target: 'carrier',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 1533.25, y: 962 },
          { x: 1533.25, y: 865 },
          { x: 1546.25, y: 865 },
          { x: 1546.25, y: 585 },
          { x: 1769, y: 585 },
          { x: 1769, y: 277 },
        ],
      },
    };
    const nodes = [
      node('tms', 1113.25, 962, 420, 236),
      node('carrier', 1608.49, 80, 322, 197),
      node('l-oms', 1120.25, 605, 406, 197),
    ];

    const [repaired] = repairTerminalBoundaryStairs([edge], nodes);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).terminalBoundaryStairRepaired).toBe(true);
    expect(path[0]).toEqual({ x: 1498.25, y: 962 });
    expect(path[1]).toEqual({ x: 1498.25, y: 865 });
    expect(Math.abs(path[2].x - path[1].x)).toBeGreaterThanOrEqual(48);
    expect(path[path.length - 1]).toEqual({ x: 1769, y: 277 });
    expect(calculateEdgePathQualityScore([repaired]).nonOrthogonalSegments).toBe(0);
    expect(calculateEdgePathQualityScore([repaired]).tinyInteriorDoglegs).toBe(0);
  });

  it('replaces a long tangential boundary run with an outward terminal stub', () => {
    const edge: Edge = {
      id: 'boundary-trunk-carrier',
      source: 'tms',
      target: 'carrier',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 1311, y: 962 },
          { x: 1533, y: 962 },
          { x: 1533, y: 890 },
          { x: 1557, y: 890 },
          { x: 1557, y: 801 },
          { x: 1769, y: 801 },
          { x: 1769, y: 277 },
        ],
      },
    };

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('tms', 1113.25, 962, 420, 236),
      node('carrier', 1608.49, 80, 322, 197),
      node('l-oms', 1120.25, 605, 406, 197),
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path[0]).toEqual({ x: 1509, y: 962 });
    expect(path[1].x).toBe(path[0].x);
    expect(path[1].y).toBeLessThan(path[0].y);
    expect(path[0].y - path[1].y).toBeGreaterThanOrEqual(48);
    expect(Math.abs(path[2].x - path[1].x)).toBeGreaterThanOrEqual(48);
    expect(calculateEdgePathQualityScore([repaired]).nonOrthogonalSegments).toBe(0);
  });

  it('moves both boundary-tangential terminal runs outward without changing their handles', () => {
    const edge: Edge = {
      id: 'two-sided-boundary-trunk',
      source: 'tms',
      target: 'carrier',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 1306, y: 961 },
          { x: 1558, y: 961 },
          { x: 1558, y: 278 },
          { x: 1769, y: 278 },
        ],
      },
    };

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('tms', 1113.25, 962, 420, 236),
      node('carrier', 1608.49, 80, 322, 197),
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;
    const start = path[0];
    const sourceStub = path[1];
    const targetStub = path[path.length - 2];
    const end = path[path.length - 1];

    expect((repaired.data as any).terminalBoundaryStairRepaired).toBe(true);
    expect(repaired.sourceHandle).toBe('top');
    expect(repaired.targetHandle).toBe('bottom');
    expect(Math.abs(start.y - 962)).toBeLessThanOrEqual(2);
    expect(sourceStub.x).toBe(start.x);
    expect(start.y - sourceStub.y).toBeGreaterThanOrEqual(48);
    expect(Math.abs(end.y - 277)).toBeLessThanOrEqual(2);
    expect(targetStub.x).toBe(end.x);
    expect(targetStub.y - end.y).toBeGreaterThanOrEqual(48);
    const quality = calculateEdgePathQualityScore([repaired]);
    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('replaces an inward boundary turn with an outward source stub and a direct safe lane', () => {
    const edge: Edge = {
      id: 'loms-customs',
      source: 'l-oms',
      target: 'customs',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 1323, y: 803 },
          { x: 1379, y: 803 },
          { x: 1379, y: 54 },
          { x: 2063, y: 54 },
          { x: 2063, y: 981 },
        ],
      },
    };
    const sourceRect = { x: 1120.25, y: 605, width: 406, height: 197 };
    const targetRect = { x: 1853.25, y: 981, width: 420, height: 197 };
    const obstacles = new Map([
      ['l-oms', sourceRect],
      ['customs', targetRect],
    ]);

    expect(countEndpointNodeTraversalHits((edge.data as any).computedPath, edge, obstacles)).toBe(1);

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('l-oms', sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height),
      node('customs', targetRect.x, targetRect.y, targetRect.width, targetRect.height),
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect((repaired.data as any).terminalBoundaryStairRepaired).toBe(true);
    expect(path[0].x).toBeGreaterThanOrEqual(sourceRect.x);
    expect(path[0].x).toBeLessThanOrEqual(sourceRect.x + sourceRect.width);
    expect(path[0].y).toBe(sourceRect.y + sourceRect.height);
    expect(path[1].x).toBe(path[0].x);
    expect(path[1].y - path[0].y).toBeGreaterThanOrEqual(48);
    expect(path.length).toBeLessThanOrEqual(4);
    expect(Math.min(...path.map(point => point.y))).toBeGreaterThanOrEqual(path[0].y);
    expect(countEndpointNodeTraversalHits(path, repaired, obstacles)).toBe(0);
    const quality = calculateEdgePathQualityScore([repaired]);
    expect(quality.nonOrthogonalSegments).toBe(0);
    expect(quality.shortEndpointStubs).toBe(0);
    expect(quality.hairpins).toBe(0);
  });

  it('reanchors a direct route that enters both endpoint node interiors', () => {
    const edge: Edge = {
      id: 'direct-inward',
      source: 'source',
      target: 'target',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 50, y: 0 },
          { x: 50, y: 400 },
        ],
      },
    };
    const obstacles = new Map([
      ['source', { x: 0, y: 0, width: 100, height: 100 }],
      ['target', { x: 0, y: 300, width: 100, height: 100 }],
    ]);

    expect(countEndpointNodeTraversalHits((edge.data as any).computedPath, edge, obstacles)).toBe(2);
    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('source', 0, 0, 100, 100),
      node('target', 0, 300, 100, 100),
    ]);

    expect(repaired.sourceHandle).toBe('bottom');
    expect(repaired.targetHandle).toBe('top');
    expect((repaired.data as any).computedPath).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 300 },
    ]);
    expect((repaired.data as any).terminalInteriorTraversalRepaired).toBe(true);
    expect(countEndpointNodeTraversalHits((repaired.data as any).computedPath, repaired, obstacles)).toBe(0);
  });

  it('keeps source-authored exact terminals immutable during interior traversal repair', () => {
    const originalPath = [{ x: 50, y: 0 }, { x: 50, y: 400 }];
    const edge: Edge = {
      id: 'manual-direct-inward',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-top-port-1',
      targetHandle: 'target-bottom-port-1',
      data: {
        _manualHandles: { source: true, target: true },
        computedPath: originalPath,
      },
    };

    const [result] = repairTerminalBoundaryStairs([edge], [
      node('source', 0, 0, 100, 100),
      node('target', 0, 300, 100, 100),
    ]);

    expect(result.sourceHandle).toBe('source-top-port-1');
    expect(result.targetHandle).toBe('target-bottom-port-1');
    expect((result.data as any).computedPath).toEqual(originalPath);
  });

  it('allows interior traversal repair to refine router-owned runtime terminals', () => {
    const edge: Edge = {
      id: 'runtime-direct-inward',
      source: 'source',
      target: 'target',
      sourceHandle: 'source-top-runtime',
      targetHandle: 'target-bottom-runtime',
      data: {
        runtimeHandleLock: { source: true, target: true },
        computedPath: [{ x: 50, y: 0 }, { x: 50, y: 400 }],
      },
    };

    const [result] = repairTerminalBoundaryStairs([edge], [
      node('source', 0, 0, 100, 100),
      node('target', 0, 300, 100, 100),
    ]);

    expect(result.sourceHandle).toBe('bottom');
    expect(result.targetHandle).toBe('top');
  });

  it('uses the geometric exit side when a same-side outward lane would cross another edge', () => {
    const feedback: Edge = {
      id: 'feedback',
      source: 'labor',
      target: 'allocation',
      sourceHandle: 'left',
      targetHandle: 'right',
      data: { computedPath: [
        { x: 5365, y: 1582 },
        { x: 5365, y: 1510 },
        { x: 4862, y: 1510 },
        { x: 4862, y: 73 },
        { x: 1257, y: 73 },
        { x: 1257, y: 1301 },
        { x: 1059, y: 1301 },
        { x: 1059, y: 1466 },
        { x: 1115, y: 1466 },
      ] },
    };
    const blocker: Edge = {
      id: 'blocker',
      source: 'missing-source',
      target: 'missing-target',
      data: { computedPath: [
        { x: 1100, y: 1400 },
        { x: 1200, y: 1400 },
      ] },
    };
    const nodes = [
      node('allocation', 969, 1418, 146, 96),
      node('labor', 5365, 1514, 240, 136),
    ];
    const obstacles = new Map([
      ['allocation', { x: 969, y: 1418, width: 146, height: 96 }],
      ['labor', { x: 5365, y: 1514, width: 240, height: 136 }],
    ]);
    const originalPath = (feedback.data as any).computedPath;

    expect(countEndpointNodeTraversalHits(originalPath, feedback, obstacles)).toBe(2);
    expect(calculateEdgePathQualityScore([feedback, blocker]).strictCrossings).toBe(0);

    const [repaired] = repairTerminalBoundaryStairs(
      [feedback, blocker],
      nodes,
      { maxEdges: 0 },
    );

    expect((repaired.data as any).computedPath).not.toEqual(originalPath);
    expect(repaired.targetHandle).toBe('top');
    expect(((repaired.data as any).computedPath as Array<{ x: number; y: number }>).at(-1)).toEqual({
      x: 1059,
      y: 1418,
    });
    expect(countEndpointNodeTraversalHits(
      (repaired.data as any).computedPath,
      repaired,
      obstacles,
    )).toBe(0);
    expect(calculateEdgePathQualityScore([repaired, blocker]).strictCrossings).toBe(0);
  });

  it('moves a wrong-side tangential route to the facing endpoint sides', () => {
    const edge: Edge = {
      id: 'tangential-inward',
      source: 'source',
      target: 'target',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: { computedPath: [
        { x: 50, y: 0 },
        { x: 82, y: 0 },
        { x: 82, y: 400 },
        { x: 50, y: 400 },
      ] },
    };
    const obstacles = new Map([
      ['source', { x: 0, y: 0, width: 100, height: 100 }],
      ['target', { x: 0, y: 300, width: 100, height: 100 }],
    ]);

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('source', 0, 0, 100, 100),
      node('target', 0, 300, 100, 100),
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(repaired.sourceHandle).toBe('bottom');
    expect(repaired.targetHandle).toBe('top');
    expect(path[0].y).toBe(100);
    expect(path[1].x).toBe(path[0].x);
    expect(path[1].y - path[0].y).toBeGreaterThanOrEqual(48);
    expect(path.at(-1)?.y).toBe(300);
    expect(path.at(-2)?.x).toBe(path.at(-1)?.x);
    expect((path.at(-1)?.y ?? 0) - (path.at(-2)?.y ?? 0)).toBeGreaterThanOrEqual(48);
    expect(countEndpointNodeTraversalHits(path, repaired, obstacles)).toBe(0);
    expect(calculateEdgePathQualityScore([repaired]).shortEndpointStubs).toBe(0);
  });

  it('keeps a facing target side while bypassing an interior target approach', () => {
    const edge: Edge = {
      id: 'target-interior-approach',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { computedPath: [
        { x: 20, y: 100 },
        { x: 20, y: 332 },
        { x: 50, y: 332 },
        { x: 50, y: 300 },
      ] },
    };
    const obstacles = new Map([
      ['source', { x: 0, y: 0, width: 100, height: 100 }],
      ['target', { x: 0, y: 300, width: 100, height: 100 }],
    ]);

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('source', 0, 0, 100, 100),
      node('target', 0, 300, 100, 100),
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(repaired.targetHandle).toBe('top');
    expect(path.at(-1)?.y).toBe(300);
    expect(path.at(-2)?.x).toBe(path.at(-1)?.x);
    expect((path.at(-1)?.y ?? 0) - (path.at(-2)?.y ?? 0)).toBeGreaterThanOrEqual(48);
    expect(countEndpointNodeTraversalHits(path, repaired, obstacles)).toBe(0);
    expect(calculateEdgePathQualityScore([repaired]).nonOrthogonalSegments).toBe(0);
  });

  it('removes a long tangential target re-entry without crossing the target body', () => {
    const edge: Edge = {
      id: 'wave-target-reentry',
      source: 'tms',
      target: 'wms',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { computedPath: [
        { x: 851, y: 1058 },
        { x: 851, y: 1154 },
        { x: 606, y: 1154 },
        { x: 606, y: 2120 },
        { x: 310, y: 2120 },
        { x: 310, y: 1900 },
        { x: 366, y: 1900 },
      ] },
    };
    const obstacles = new Map([
      ['tms', { x: 774, y: 940, width: 155, height: 118 }],
      ['wms', { x: 288.8, y: 1901, width: 155, height: 118 }],
    ]);

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('tms', 774, 940, 155, 118),
      node('wms', 288.8, 1901, 155, 118),
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;

    expect(countEndpointNodeTraversalHits(path, repaired, obstacles)).toBe(0);
    expect(calculateEdgePathQualityScore([repaired]).nonOrthogonalSegments).toBe(0);
    expect(calculateEdgePathQualityScore([repaired]).hairpins).toBe(0);
  });

  it('aligns movable facing-side endpoints instead of keeping a five-pixel dogleg', () => {
    const edge: Edge = {
      id: 'cycle-inventory',
      source: 'cycle',
      target: 'inventory',
      sourceHandle: 'left',
      targetHandle: 'right',
      data: { computedPath: [
        { x: 2790.14, y: 200 },
        { x: 2475, y: 200 },
        { x: 2475, y: 205 },
        { x: 2385.34, y: 205 },
      ] },
    };

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('cycle', 2790.14, 100, 200, 200),
      node('inventory', 2185.34, 100, 200, 200),
    ]);
    const path = (repaired.data as any).computedPath as Array<{ x: number; y: number }>;
    const quality = calculateEdgePathQualityScore([repaired]);

    expect(path.length).toBe(2);
    expect(path[0].y).toBe(path[1].y);
    expect(quality.tinyInteriorDoglegs).toBe(0);
    expect(quality.nonOrthogonalSegments).toBe(0);
  });

  it('keeps the original terminal corridor when every anchor nudge adds a hard crossing', () => {
    const edges: Edge[] = [
      {
        id: 'carrier',
        source: 'tms',
        target: 'carrier-node',
        data: {
          computedPath: [
            { x: 1311, y: 962 }, { x: 1533, y: 962 }, { x: 1533, y: 887 },
            { x: 1557, y: 887 }, { x: 1557, y: 801 }, { x: 1769, y: 801 },
            { x: 1769, y: 277 },
          ],
        },
      },
      {
        id: 'loms-customs',
        source: 'l-oms',
        target: 'customs',
        data: { computedPath: [
          { x: 1323, y: 802 }, { x: 1323, y: 885 },
          { x: 2063, y: 885 }, { x: 2063, y: 981 },
        ] },
      },
      {
        id: 'loms-tms',
        source: 'l-oms',
        target: 'tms',
        data: { computedPath: [{ x: 1323, y: 802 }, { x: 1323, y: 962 }] },
      },
      {
        id: 'loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        data: { computedPath: [
          { x: 1323, y: 802 }, { x: 1323, y: 887 },
          { x: 1790, y: 887 }, { x: 1790, y: 1922 },
        ] },
      },
    ];

    const result = repairTerminalBoundaryStairs(edges, [
      node('tms', 1113.25, 962, 420, 236),
      node('carrier-node', 1608.49, 80, 322, 197),
      node('l-oms', 1120.25, 605, 406, 197),
      node('customs', 1853.25, 981.5, 420, 197),
      node('visibility', 1579.69, 1922, 420, 236),
    ]);
    const path = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;
    expect(path).toEqual((edges[0].data as any).computedPath);
    expect((result[0].data as any).terminalBoundaryStairRepaired).toBeUndefined();
  });

  it('removes a micro boundary slide and widens a safe near-terminal staircase', () => {
    const edges: Edge[] = [
      {
        id: 'carrier',
        source: 'tms',
        target: 'carrier-node',
        data: { computedPath: [
          { x: 1306, y: 962 }, { x: 1310, y: 962 }, { x: 1310, y: 826 },
          { x: 1535, y: 826 }, { x: 1535, y: 787 }, { x: 1769, y: 787 },
          { x: 1769, y: 277 },
        ] },
      },
      {
        id: 'loms-customs',
        source: 'l-oms',
        target: 'customs',
        data: { computedPath: [
          { x: 1258, y: 802 }, { x: 1322, y: 802 }, { x: 1322, y: 858 },
          { x: 2063, y: 858 }, { x: 2063, y: 981 },
        ] },
      },
      {
        id: 'loms-tms',
        source: 'l-oms',
        target: 'tms',
        data: { computedPath: [
          { x: 1164, y: 802 }, { x: 1164, y: 865 }, { x: 1212, y: 865 },
          { x: 1212, y: 962 },
        ] },
      },
      {
        id: 'loms-visibility',
        source: 'l-oms',
        target: 'visibility',
        data: { computedPath: [
          { x: 1323, y: 802 }, { x: 1323, y: 850 }, { x: 2320, y: 850 },
          { x: 2320, y: 1665 }, { x: 1790, y: 1665 }, { x: 1790, y: 1922 },
        ] },
      },
    ];

    const result = repairTerminalBoundaryStairs(edges, [
      node('tms', 1113.25, 962, 420, 236),
      node('carrier-node', 1608.49, 80, 322, 197),
      node('l-oms', 1120.25, 605, 406, 197),
      node('customs', 1853.25, 981.5, 420, 197),
      node('visibility', 1579.69, 1922, 420, 236),
    ]);
    const path = (result[0].data as any).computedPath as Array<{ x: number; y: number }>;

    expect(path[0]).toEqual({ x: 1310, y: 962 });
    expect(path[1].x).toBe(path[0].x);
    expect(path[1].y).toBeLessThan(path[0].y);
    expect(path.slice(1, -1).map((point, index) => (
      Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y)
    )).every(length => length >= 48)).toBe(true);
    expect((result[0].data as any).terminalBoundaryStairRepaired).toBe(true);
  });

  it('keeps explicitly fixed endpoint positions unchanged', () => {
    const originalPath = [
      { x: 100, y: 100 },
      { x: 100, y: 40 },
      { x: 112, y: 40 },
      { x: 112, y: 0 },
    ];
    const edge: Edge = {
      id: 'fixed-position',
      source: 'source',
      target: 'target',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        sourcePortPolicy: 'fixed-pos',
        computedPath: originalPath,
      },
    };

    const [repaired] = repairTerminalBoundaryStairs([edge], [
      node('source', 0, 100, 100, 60),
      node('target', 62, -60, 100, 60),
    ]);

    expect((repaired.data as any).computedPath).toEqual(originalPath);
    expect((repaired.data as any).terminalBoundaryStairRepaired).toBeUndefined();
  });
});
