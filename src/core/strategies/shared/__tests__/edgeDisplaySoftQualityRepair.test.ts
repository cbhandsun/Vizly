import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { repairDisplaySoftQualityRisks } from '../edgeDisplaySoftQualityRepair';

describe('repairDisplaySoftQualityRisks', () => {
  it('moves a severe logistics fan-out detour onto a shorter target-entry lane without hard-quality regression', () => {
    const nodes: Node[] = [
      node('upstream', 985.487, 119, 303, 119),
      node('l-oms', 1120.25, 605, 406, 197),
      node('wms', 42, 962, 420, 236),
      node('wcs', 32, 1358, 420, 236),
      node('tms', 1113.25, 962, 420, 236),
      node('customs', 1853.25, 981.5, 420, 197),
      node('bms', 772, 1377.5, 378, 197),
      node('yms', 1470, 1377.5, 389, 197),
      node('visibility', 1579.69, 1922, 420, 236),
      node('carrier-portal', 1608.49, 80, 322, 197),
      node('downstream', 2250.49, 119, 336, 119),
    ];
    const edges = [
      edge('edge-loms-customs', 'l-oms', 'customs', [{ x: 1323, y: 803 }, { x: 1323, y: 885 }, { x: 2063, y: 885 }, { x: 2063, y: 981 }]),
      edge('edge-loms-tms', 'l-oms', 'tms', [{ x: 1323, y: 803 }, { x: 1323, y: 962 }]),
      edge('edge-loms-visibility', 'l-oms', 'visibility', [{ x: 1323, y: 803 }, { x: 1323, y: 887 }, { x: -6, y: 887 }, { x: -6, y: 1849 }, { x: 1790, y: 1849 }, { x: 1790, y: 1921 }]),
      edge('edge-loms-wms', 'l-oms', 'wms', [{ x: 1323, y: 803 }, { x: 1323, y: 887 }, { x: 252, y: 887 }, { x: 252, y: 961 }]),
      edge('edge-tms-bms', 'tms', 'bms', [{ x: 1323, y: 1199 }, { x: 1323, y: 1295 }, { x: 973, y: 1295 }, { x: 973, y: 1377 }]),
      edge('edge-tms-carrier', 'tms', 'carrier-portal', [{ x: 1227, y: 961 }, { x: 1227, y: 939 }, { x: 1311, y: 939 }, { x: 1311, y: 865 }, { x: 1769, y: 865 }, { x: 1769, y: 278 }]),
      edge('edge-tms-downstream', 'tms', 'downstream', [{ x: 1323, y: 962 }, { x: 1323, y: 873 }, { x: 2274, y: 873 }, { x: 2274, y: 239 }]),
      edge('edge-tms-visibility', 'tms', 'visibility', [{ x: 1323, y: 1199 }, { x: 1323, y: 1729 }, { x: 1790, y: 1729 }, { x: 1790, y: 1921 }]),
      edge('edge-tms-yms', 'tms', 'yms', [{ x: 1323, y: 1199 }, { x: 1323, y: 1295 }, { x: 1665, y: 1295 }, { x: 1665, y: 1377 }]),
      edge('edge-upstream-loms', 'upstream', 'l-oms', [{ x: 1137, y: 239 }, { x: 1137, y: 328 }, { x: 1323, y: 328 }, { x: 1323, y: 604 }]),
      edge('edge-visibility-downstream', 'visibility', 'downstream', [{ x: 1916, y: 1921 }, { x: 1916, y: 1825 }, { x: 2354, y: 1825 }, { x: 2354, y: 872 }, { x: 2370, y: 872 }, { x: 2370, y: 239 }]),
      edge('edge-wms-bms', 'wms', 'bms', [{ x: 252, y: 1199 }, { x: 252, y: 1295 }, { x: 898, y: 1295 }, { x: 898, y: 1211 }, { x: 973, y: 1211 }, { x: 973, y: 1377 }]),
      edge('edge-wms-visibility', 'wms', 'visibility', [{ x: 252, y: 1199 }, { x: 252, y: 1295 }, { x: 537, y: 1295 }, { x: 537, y: 1825 }, { x: 1790, y: 1825 }, { x: 1790, y: 1921 }]),
      edge('edge-wms-wcs', 'wms', 'wcs', [{ x: 252, y: 1199 }, { x: 252, y: 1295 }, { x: 242, y: 1295 }, { x: 242, y: 1357 }]),
    ];

    const baselineQuality = calculateEdgePathQualityScore(edges);
    const repaired = repairDisplaySoftQualityRisks(edges, nodes, 'TB', { maxEdges: 8 });
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const visibilityPath = pathFor(repaired, 'edge-loms-visibility');

    expect(pathLength(visibilityPath) / manhattanEndpointDistance(visibilityPath)).toBeLessThanOrEqual(1.85);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(baselineQuality.nonOrthogonalSegments);
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
    expect(repairedQuality.reverseOverlap).toBeLessThanOrEqual(baselineQuality.reverseOverlap);
    expect(repairedQuality.unrelatedOverlap).toBeLessThanOrEqual(baselineQuality.unrelatedOverlap);
    expect(repairedQuality.unexplainedRelatedOverlap).toBeLessThanOrEqual(baselineQuality.unexplainedRelatedOverlap);
    expect(repairedQuality.shortEndpointStubs).toBeLessThanOrEqual(baselineQuality.shortEndpointStubs);
    expect(repairedQuality.tinyInteriorDoglegs).toBeLessThanOrEqual(baselineQuality.tinyInteriorDoglegs);
    expect(repairedQuality.hairpins).toBeLessThanOrEqual(baselineQuality.hairpins);
    expect(repairedQuality.detourPenalty).toBeLessThan(baselineQuality.detourPenalty);
  });

  it('respects a zero quality-evaluation budget', () => {
    const nodes: Node[] = [
      node('l-oms', 1120.25, 605, 406, 197),
      node('visibility', 1579.69, 1922, 420, 236),
    ];
    const edges = [
      edge('edge-loms-visibility', 'l-oms', 'visibility', [
        { x: 1323, y: 803 },
        { x: 1323, y: 887 },
        { x: -6, y: 887 },
        { x: -6, y: 1849 },
        { x: 1790, y: 1849 },
        { x: 1790, y: 1921 },
      ]),
    ];

    const repaired = repairDisplaySoftQualityRisks(edges, nodes, 'TB', { maxQualityEvaluations: 0 });

    expect(pathFor(repaired, 'edge-loms-visibility')).toEqual(pathFor(edges, 'edge-loms-visibility'));
  });

  it('honors the caller candidate cap for obstacle routes while preserving an explicit repair budget', () => {
    const nodes: Node[] = [
      node('source', 0, 0, 80, 60),
      node('obstacle', 190, 10, 80, 40),
      node('target', 400, 0, 80, 60),
    ];
    const edges = [
      edge('edge-obstacle', 'source', 'target', [
        { x: 80, y: 30 },
        { x: 400, y: 30 },
      ]),
    ];
    edges[0].data = {
      ...edges[0].data,
      treeRouting: { points: (edges[0].data as { computedPath: unknown }).computedPath, mode: 'tree' },
    };

    const capped = repairDisplaySoftQualityRisks(edges, nodes, 'LR', {
      maxCandidatesPerEdge: 1,
      maxQualityEvaluations: 32,
    });
    const repaired = repairDisplaySoftQualityRisks(edges, nodes, 'LR', {
      maxCandidatesPerEdge: 64,
      maxQualityEvaluations: 64,
    });

    expect(pathFor(capped, 'edge-obstacle')).toEqual(pathFor(edges, 'edge-obstacle'));
    expect(pathFor(repaired, 'edge-obstacle')).not.toEqual(pathFor(edges, 'edge-obstacle'));
    const repairedPath = pathFor(repaired, 'edge-obstacle');
    expect(
      pathHitsRect(repairedPath, { x: 190, y: 10, width: 80, height: 40 }),
      JSON.stringify(repairedPath),
    ).toBe(false);
    expect((repaired[0].data as { treeRouting: { points: unknown } }).treeRouting.points).toEqual(repairedPath);
  });

  it('bounds invalid repair budgets without bypassing the default quality gate', () => {
    const nodes: Node[] = [
      node('source', 0, 0, 80, 60),
      node('obstacle', 190, 10, 80, 40),
      node('target', 400, 0, 80, 60),
    ];
    const edges = [edge('edge-obstacle', 'source', 'target', [
      { x: 80, y: 30 },
      { x: 400, y: 30 },
    ])];

    const repaired = repairDisplaySoftQualityRisks(edges, nodes, 'LR', {
      maxEdges: Number.NaN,
      maxCandidatesPerEdge: Number.POSITIVE_INFINITY,
      maxQualityEvaluations: Number.NaN,
    });
    const disabled = repairDisplaySoftQualityRisks(edges, nodes, 'LR', { maxEdges: -1 });

    expect(pathFor(repaired, 'edge-obstacle')).not.toEqual(pathFor(edges, 'edge-obstacle'));
    expect(pathFor(disabled, 'edge-obstacle')).toEqual(pathFor(edges, 'edge-obstacle'));
  });
});

function node(id: string, x: number, y: number, width: number, height: number): Node {
  return { id, position: { x, y }, data: {}, measured: { width, height } };
}

function edge(id: string, source: string, target: string, computedPath: Array<{ x: number; y: number }>): Edge {
  return {
    id,
    source,
    target,
    type: 'advanced-smart-step',
    data: { computedPath, layoutPathLocked: true, layoutDirection: 'TB' },
  };
}

function pathFor(edges: Edge[], edgeId: string): Array<{ x: number; y: number }> {
  return ((edges.find(edgeItem => edgeItem.id === edgeId)?.data as any)?.computedPath || []) as Array<{ x: number; y: number }>;
}

function pathLength(path: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    total += Math.abs(path[index + 1].x - path[index].x) + Math.abs(path[index + 1].y - path[index].y);
  }
  return total;
}

function manhattanEndpointDistance(path: Array<{ x: number; y: number }>): number {
  if (path.length < 2) return 0;
  return Math.abs(path[path.length - 1].x - path[0].x) + Math.abs(path[path.length - 1].y - path[0].y);
}

function pathHitsRect(
  path: Array<{ x: number; y: number }>,
  rect: { x: number; y: number; width: number; height: number },
): boolean {
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    if (Math.abs(start.x - end.x) < 0.5) {
      if (
        start.x > rect.x
        && start.x < rect.x + rect.width
        && Math.max(Math.min(start.y, end.y), rect.y) < Math.min(Math.max(start.y, end.y), rect.y + rect.height)
      ) return true;
    } else if (
      Math.abs(start.y - end.y) < 0.5
      && start.y > rect.y
      && start.y < rect.y + rect.height
      && Math.max(Math.min(start.x, end.x), rect.x) < Math.min(Math.max(start.x, end.x), rect.x + rect.width)
    ) return true;
  }
  return false;
}
