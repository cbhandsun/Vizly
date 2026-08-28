import { describe, expect, it } from 'vitest';
import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import { repairEndpointOrthogonalPaths } from '../edgeEndpointPathRepair';
import { createEndpointBridgeScoringDiagnostics } from '../edgeEndpointBridgeScoring';
import {
  endpointNodeRect,
  inferEndpointSide,
  projectEndpointPointToSide,
} from '../edgeEndpointGeometry';

function node(id: string, x: number, y: number, width = 100, height = 50): ReactFlowNode {
  return {
    id,
    position: { x, y },
    measured: { width, height } as any,
    style: { width, height },
    data: {},
  };
}

describe('repairEndpointOrthogonalPaths', () => {
  it('normalizes runtime node geometry and terminal sides at the boundary', () => {
    const runtimeNode: ReactFlowNode = {
      id: 'runtime',
      position: { x: 10, y: 20 },
      style: { width: '120px', height: '80px' },
      data: {},
    };
    const rect = endpointNodeRect(runtimeNode);

    expect(rect).toEqual({ x: 10, y: 20, width: 120, height: 80 });
    expect(inferEndpointSide({ x: 70, y: 20 }, rect!, 'invalid')).toBe('t');
    expect(projectEndpointPointToSide({ x: 500, y: 60 }, rect!, 't')).toEqual({ x: 70, y: 20 });
    expect(endpointNodeRect({ ...runtimeNode, style: { width: 'bad', height: 80 } })).toBeNull();
  });

  it('forces a locked bottom endpoint path to leave the source orthogonally', () => {
    const edges: Edge[] = [{
      id: 'source-to-target',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 50 },
          { x: 350, y: 468 },
          { x: 350, y: 500 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 300, 500),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path.length).toBeGreaterThanOrEqual(4);
    expect(path[1].x).toBeCloseTo(path[0].x, 1);
    expect(path[1].y).toBeGreaterThan(path[0].y);
    expect(path[1].y - path[0].y).toBeGreaterThanOrEqual(28);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);
  });

  it('removes an inward same-axis source segment instead of compacting the repaired stub away', () => {
    const edges: Edge[] = [{
      id: 'visibility-to-downstream',
      source: 'visibility',
      target: 'downstream',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 180, y: 200 },
          { x: 180, y: 226 },
          { x: 860, y: 226 },
          { x: 860, y: 20 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('visibility', 0, 200, 360, 160),
      node('downstream', 760, -60, 200, 80),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path[1].x).toBeCloseTo(path[0].x, 1);
    expect(path[1].y).toBeLessThan(path[0].y);
    expect(path[0].y - path[1].y).toBeGreaterThanOrEqual(48);
    expect(path.some(point => point.x === 180 && point.y === 226)).toBe(false);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);
  });

  it('reanchors a source endpoint that was detached onto a remote target lane', () => {
    const edges: Edge[] = [{
      id: 'tms-to-downstream',
      source: 'tms',
      target: 'downstream',
      sourceHandle: 'top',
      targetHandle: 'bottom',
      data: {
        computedPath: [
          { x: 2362, y: 961 },
          { x: 2362, y: 239 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('tms', 1113, 962, 420, 236),
      node('downstream', 2250, 119, 336, 119),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path[0]).toEqual({ x: 1323, y: 962 });
    expect(path[1].x).toBe(path[0].x);
    expect(path[1].y).toBeLessThan(path[0].y);
    expect(path[0].y - path[1].y).toBeGreaterThanOrEqual(48);
    expect(path[path.length - 1]).toEqual({ x: 2362, y: 239 });
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);
  });

  it('does not straighten synthesized shared target trunks back into direct entries', () => {
    const sharedTargetPath = [
      { x: 366, y: 2648 },
      { x: 366, y: 2710 },
      { x: 338, y: 2710 },
      { x: 338, y: 2806 },
    ];
    const edges: Edge[] = [{
      id: 'edge-wms-outbound-tms-planning',
      source: 'wms-outbound',
      target: 'tms-planning',
      data: {
        computedPath: sharedTargetPath,
        sharedTrunkSynthesized: true,
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('wms-outbound', 286, 2588, 160, 60),
      node('tms-planning', 250, 2806, 176, 100),
    ]);

    expect((repaired.data as any)?.computedPath).toEqual(sharedTargetPath);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBeUndefined();
  });

  it('extends a detached source stub far enough to avoid crossing existing lanes', () => {
    const edges: Edge[] = [
      {
        id: 'tms-to-downstream',
        source: 'tms',
        target: 'downstream',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: {
          computedPath: [
            { x: 2362, y: 961 },
            { x: 2362, y: 239 },
          ],
        },
      },
      {
        id: 'loms-to-customs',
        source: 'loms',
        target: 'customs',
        data: {
          computedPath: [
            { x: 1445, y: 803 },
            { x: 1445, y: 843 },
            { x: 1453, y: 851 },
            { x: 2055, y: 851 },
            { x: 2063, y: 859 },
            { x: 2063, y: 981 },
          ],
        },
      },
      {
        id: 'loms-to-visibility',
        source: 'loms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 1364, y: 803 },
            { x: 1364, y: 843 },
            { x: 1372, y: 851 },
            { x: 2301, y: 851 },
            { x: 2309, y: 859 },
            { x: 2309, y: 1865 },
          ],
        },
      },
    ];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('tms', 1113, 962, 420, 236),
      node('downstream', 2250, 119, 336, 119),
      node('loms', 1120, 605, 406, 197),
      node('customs', 1853, 981, 420, 197),
      node('visibility', 1579, 1922, 420, 236),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path[0]).toEqual({ x: 1323, y: 962 });
    expect(path[1].y).toBeLessThanOrEqual(858);
    expect(path.some(point => point.x === 2362 && point.y === 914)).toBe(false);
  });

  it('retunes an already reanchored source bridge when it still crosses existing lanes', () => {
    const edges: Edge[] = [
      {
        id: 'tms-to-downstream',
        source: 'tms',
        target: 'downstream',
        sourceHandle: 'top',
        targetHandle: 'bottom',
        data: {
          computedPath: [
            { x: 1323, y: 962 },
            { x: 1323, y: 914 },
            { x: 2362, y: 914 },
            { x: 2362, y: 239 },
          ],
        },
      },
      {
        id: 'loms-to-customs',
        source: 'loms',
        target: 'customs',
        data: {
          computedPath: [
            { x: 1453, y: 851 },
            { x: 2055, y: 851 },
            { x: 2063, y: 859 },
            { x: 2063, y: 981 },
          ],
        },
      },
      {
        id: 'loms-to-visibility',
        source: 'loms',
        target: 'visibility',
        data: {
          computedPath: [
            { x: 1372, y: 851 },
            { x: 2301, y: 851 },
            { x: 2309, y: 859 },
            { x: 2309, y: 1865 },
          ],
        },
      },
    ];

    const repairNodes = [
      node('tms', 1113, 962, 420, 236),
      node('downstream', 2250, 119, 336, 119),
      node('loms', 1120, 605, 406, 197),
      node('customs', 1853, 981, 420, 197),
      node('visibility', 1579, 1922, 420, 236),
    ];
    const [repaired] = repairEndpointOrthogonalPaths(edges, repairNodes);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path[1].y).toBeLessThanOrEqual(858);
    expect(path.some(point => point.x === 2362 && point.y === 914)).toBe(false);

    const crossingSweepResult = repairEndpointOrthogonalPaths(edges, repairNodes, {
      detectExistingBridgeCrossings: false,
    });
    const crossingSweepPath = (
      (crossingSweepResult[0].data as any)?.computedPath ?? []
    ) as Array<{ x: number; y: number }>;
    expect(crossingSweepPath[1].y).toBeGreaterThan(path[1].y);
    expect(crossingSweepPath[1].y).toBe(866);
  });

  it('shortens only the stub that would share a same-axis endpoint lane', () => {
    const edges: Edge[] = [
      {
        id: 'outgoing',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: {
          computedPath: [
            { x: 50, y: 50 },
            { x: 350, y: 468 },
            { x: 350, y: 500 },
          ],
        },
      },
      {
        id: 'incoming',
        source: 'other',
        target: 'source',
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        data: {
          computedPath: [
            { x: 50, y: 200 },
            { x: 50, y: 50 },
          ],
        },
      },
    ];

    const repairedEdges = repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 300, 500),
      node('other', 0, 200),
    ]);
    const outgoingPath = ((repairedEdges[0].data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(outgoingPath[1].x).toBeCloseTo(outgoingPath[0].x, 1);
    expect(outgoingPath[1].y - outgoingPath[0].y).toBeLessThan(24);
    expect(outgoingPath[1].y - outgoingPath[0].y).toBeGreaterThanOrEqual(18);
  });

  it('uses the actual boundary side when a stale handle disagrees with the path anchor', () => {
    const edges: Edge[] = [{
      id: 'right-boundary-edge',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 100, y: 20 },
          { x: 100, y: 160 },
          { x: 220, y: 160 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 220, 120),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path[1].y).toBeCloseTo(path[0].y, 1);
    expect(path[1].x).toBeGreaterThan(path[0].x);
    expect(path[1].x - path[0].x).toBeGreaterThanOrEqual(48);
  });

  it('extends short but correctly directed endpoint stubs before the first bend', () => {
    const edges: Edge[] = [{
      id: 'short-source-stub',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 100, y: 25 },
          { x: 114, y: 25 },
          { x: 114, y: 80 },
          { x: 220, y: 80 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 220, 55),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path[1].y).toBeCloseTo(path[0].y, 1);
    expect(path[1].x - path[0].x).toBeGreaterThanOrEqual(48);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);
  });

  it('extends short but correctly directed target stubs before entering a node', () => {
    const edges: Edge[] = [{
      id: 'short-target-stub',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 100, y: 25 },
          { x: 186, y: 25 },
          { x: 186, y: 160 },
          { x: 200, y: 160 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 200, 135),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const end = path[path.length - 1];
    const previous = path[path.length - 2];

    expect(previous.y).toBeCloseTo(end.y, 1);
    expect(end.x - previous.x).toBeGreaterThanOrEqual(48);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);
  });

  it('slides a near-aligned target anchor to remove a tiny endpoint dogleg', () => {
    const edge: Edge = {
      id: 'wms-wcs',
      source: 'wms',
      target: 'wcs',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 252, y: 1199 },
          { x: 252, y: 1295 },
          { x: 242, y: 1295 },
          { x: 242, y: 1357 },
        ],
      },
    };

    const [repaired] = repairEndpointOrthogonalPaths([edge], [
      node('wms', 0, 1000, 504, 199),
      node('wcs', 160, 1357, 180, 120),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path).toEqual([
      { x: 252, y: 1199 },
      { x: 252, y: 1357 },
    ]);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);

  });

  it('uses node-size-aware alignment to remove a visible endpoint dogleg on large nodes', () => {
    const edge: Edge = {
      id: 'loms-tms',
      source: 'l-oms',
      target: 'tms',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 1323, y: 803 },
          { x: 1323, y: 887 },
          { x: 1283, y: 887 },
          { x: 1283, y: 961 },
        ],
      },
    };

    const [repaired] = repairEndpointOrthogonalPaths([edge], [
      node('l-oms', 1120, 606, 406, 197),
      node('tms', 1113, 961, 420, 236),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path).toEqual([
      { x: 1323, y: 803 },
      { x: 1323, y: 961 },
    ]);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);
  });

  it('keeps a near-aligned endpoint dogleg when the straight lane would hit an unrelated node', () => {
    const computedPath = [
      { x: 1323, y: 803 },
      { x: 1323, y: 887 },
      { x: 1283, y: 887 },
      { x: 1283, y: 961 },
    ];
    const edge: Edge = {
      id: 'loms-tms',
      source: 'l-oms',
      target: 'tms',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: { computedPath },
    };

    const [repaired] = repairEndpointOrthogonalPaths([edge], [
      node('l-oms', 1120, 606, 406, 197),
      node('tms', 1113, 961, 420, 236),
      node('blocking-node', 1290, 850, 70, 60),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path).not.toEqual([
      { x: 1323, y: 803 },
      { x: 1323, y: 961 },
    ]);
    expect(path[0]).toEqual(computedPath[0]);
    expect(path[path.length - 1]).toEqual(computedPath[computedPath.length - 1]);
    expect(path.some((point, index) => index > 0 && point.y === path[index - 1].y && point.x !== path[index - 1].x))
      .toBe(true);
  });

  it('shortens a correctly directed source trunk when it crosses an unrelated node', () => {
    const edges: Edge[] = [{
      id: 'source-to-target',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 50 },
          { x: 50, y: 280 },
          { x: 300, y: 280 },
          { x: 300, y: 500 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 250, 500),
      node('middle', 10, 120, 80, 100),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;

    expect(path[1].x).toBeCloseTo(path[0].x, 1);
    expect(path[1].y - path[0].y).toBeLessThan(100);
    expect(pathHitsRect(path, { x: 10, y: 120, width: 80, height: 100 })).toBe(false);
    expect((repaired.data as any)?.endpointOrthogonalRepaired).toBe(true);
  });

  it('keeps a repaired tangential endpoint bridge at or above the 24px commercial floor', () => {
    const edges: Edge[] = [{
      id: 'tangential-source',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        computedPath: [
          { x: 50, y: 128 },
          { x: 98, y: 128 },
          { x: 98, y: 244 },
          { x: 300, y: 244 },
          { x: 300, y: 1000 },
        ],
      },
    }];

    const [repaired] = repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0, 100, 128),
      node('target', 250, 1000, 100, 50),
    ]);
    const path = ((repaired.data as any)?.computedPath ?? []) as Array<{ x: number; y: number }>;
    const segmentLengths = path.slice(1).map((point, index) => (
      Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y)
    ));

    expect(path[1].x).toBe(path[0].x);
    expect(path[1].y).toBeGreaterThan(path[0].y);
    expect(Math.min(...segmentLengths)).toBeGreaterThanOrEqual(24);
  });

  it('preserves the input array identity when endpoint paths are already valid', () => {
    const edges: Edge[] = [{
      id: 'already-valid',
      source: 'source',
      target: 'target',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [
          { x: 100, y: 25 },
          { x: 300, y: 25 },
        ],
      },
    }];

    expect(repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 300, 0),
    ])).toBe(edges);
  });

  it('reports aggregate bridge candidate-pair diagnostics through the repair boundary', () => {
    const diagnostics = createEndpointBridgeScoringDiagnostics();
    const edges: Edge[] = [
      {
        id: 'candidate',
        source: 'source',
        target: 'target',
        sourceHandle: 'bottom',
        targetHandle: 'top',
        data: {
          computedPath: [
            { x: 50, y: 50 },
            { x: 150, y: 50 },
            { x: 150, y: 200 },
          ],
        },
      },
      {
        id: 'peer',
        source: 'peer-source',
        target: 'peer-target',
        data: { computedPath: [{ x: 100, y: 60 }, { x: 100, y: 100 }] },
      },
    ];

    repairEndpointOrthogonalPaths(edges, [
      node('source', 0, 0),
      node('target', 100, 200),
    ], { diagnostics });

    expect(diagnostics.evaluationCount).toBeGreaterThan(0);
    expect(diagnostics.fullScanCandidatePairCount).toBeGreaterThan(0);
    expect(diagnostics.indexedCandidatePairCount)
      .toBeLessThanOrEqual(diagnostics.fullScanCandidatePairCount);
  });
});

function pathHitsRect(
  path: Array<{ x: number; y: number }>,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const horizontal = Math.abs(a.y - b.y) < 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.5;
    if (horizontal) {
      const y = a.y;
      if (y <= rect.y || y >= rect.y + rect.height) continue;
      if (Math.max(Math.min(a.x, b.x), rect.x) < Math.min(Math.max(a.x, b.x), rect.x + rect.width)) return true;
    }
    if (vertical) {
      const x = a.x;
      if (x <= rect.x || x >= rect.x + rect.width) continue;
      if (Math.max(Math.min(a.y, b.y), rect.y) < Math.min(Math.max(a.y, b.y), rect.y + rect.height)) return true;
    }
  }
  return false;
}
