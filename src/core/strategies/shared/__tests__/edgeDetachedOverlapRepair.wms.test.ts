// @vitest-environment jsdom

import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: () => ({
      font: '',
      measureText: (text: string) => ({ width: String(text || '').length * 8 }),
    }),
  });
});

import wmsStandardData from '../../../../data/standardized/WmsStandardData.json';
import { standardDataToCanvas } from '../../../components/diagrams/designerUtils';
import { withDisplayAbsolutePositions } from '../../../components/shared/baseReactFlowDisplayEdgeCore';
import {
  getEdgePath,
  getRoutingObstacles,
  segmentIntersectsRect,
} from '../edgeDetachedOverlapCandidates';
import { separateDetachedParallelOverlaps } from '../edgeDetachedOverlapRepair';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { countRoutingObstacleHits } from '../edgeWaypointCandidateRepair';

const finalWmsOverlapEdges = (): Edge[] => [
  {
    id: 'inventory-reporting',
    source: 'inventory-view',
    target: 'bi-reporting',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: { computedPath: [
      { x: 2385, y: 191 }, { x: 2669, y: 191 }, { x: 2669, y: 111 },
      { x: 4822, y: 111 }, { x: 4822, y: 496 }, { x: 4912, y: 496 },
    ] },
  },
  {
    id: 'master-data-asn',
    source: 'master-data',
    target: 'asn',
    sourceHandle: 'left',
    targetHandle: 'right',
    data: { computedPath: [
      { x: 4352, y: 496 }, { x: 4256, y: 496 }, { x: 4256, y: 111 },
      { x: 1401, y: 111 }, { x: 1401, y: 338 }, { x: 865, y: 338 },
      { x: 865, y: 486 }, { x: 775, y: 486 },
    ] },
  },
  {
    id: 'receipt-reporting',
    source: 'receipt',
    target: 'bi-reporting',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: { computedPath: [
      { x: 1326, y: 506 }, { x: 1426, y: 506 }, { x: 1426, y: 110 },
      { x: 1450, y: 110 }, { x: 1450, y: 62 }, { x: 4596, y: 62 },
      { x: 4596, y: 110 }, { x: 4638, y: 110 }, { x: 4638, y: 496 },
      { x: 4912, y: 496 },
    ] },
  },
];

describe('separateDetachedParallelOverlaps WMS regressions', () => {
  it('separates long unrelated reverse lanes without crossing WMS nodes', async () => {
    const canvas = await standardDataToCanvas(wmsStandardData as any);
    const nodes = withDisplayAbsolutePositions(
      canvas.nodes,
      new Map(canvas.nodes.map(node => [node.id, node] as const)),
    );
    const obstacles = getRoutingObstacles(nodes);
    const edges = finalWmsOverlapEdges();
    const baseline = calculateEdgePathQualityScore(edges);
    const repaired = separateDetachedParallelOverlaps(edges, nodes, 16);
    const quality = calculateEdgePathQualityScore(repaired);
    const obstacleHits = repaired.reduce((total, edge) => (
      total + countRoutingObstacleHits(getEdgePath(edge), edge, obstacles)
    ), 0);
    const obstacleDetails = repaired.flatMap(edge => {
      const path = getEdgePath(edge);
      return path.slice(0, -1).flatMap((point, index) => {
        const next = path[index + 1];
        const axis = point.x === next.x ? 'v' : point.y === next.y ? 'h' : null;
        if (!axis) return [];
        return [...obstacles.entries()]
          .filter(([nodeId, rect]) => (
            nodeId !== edge.source
            && nodeId !== edge.target
            && segmentIntersectsRect({ a: point, b: next, axis }, rect, 12)
          ))
          .map(([nodeId]) => ({ edge: edge.id, segment: [point, next], nodeId }));
      });
    });

    expect(baseline.reverseOverlap).toBe(1587);
    expect(baseline.unrelatedOverlap).toBe(1587);
    expect(
      {
        quality,
        obstacleHits,
        obstacleDetails,
        paths: repaired.map(edge => ({ id: edge.id, path: getEdgePath(edge) })),
      },
    ).toMatchObject({
      quality: {
        nonOrthogonalSegments: 0,
        strictCrossings: 0,
        reverseOverlap: 0,
        unrelatedOverlap: 0,
        shortEndpointStubs: 0,
        tinyInteriorDoglegs: 0,
        hairpins: 0,
      },
      obstacleHits: 0,
      obstacleDetails: [],
    });
    repaired.forEach((edge, index) => {
      const before = getEdgePath(edges[index]);
      const after = getEdgePath(edge);
      expect(after[0]).toEqual(before[0]);
      expect(after.at(-1)).toEqual(before.at(-1));
    });
  }, 30_000);
});
