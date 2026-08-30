import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { repairBusinessNodeClearanceRisks } from '../edgeBusinessNodeClearanceRepair';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import { scoreNodeClearanceRisk } from '../edgeWaypointCandidateRepair';

type Point = { x: number; y: number };

const withPath = (id: string, source: string, target: string, computedPath: Point[]): Edge => ({
  id,
  source,
  target,
  data: { computedPath },
});

const pathFor = (edge: Edge): Point[] => (
  (edge.data as { computedPath?: Point[] } | undefined)?.computedPath ?? []
);

describe('business-node terminal corridor repair', () => {
  it('resolves the domain ELK bottom-to-top clearance stair without adding quality defects', () => {
    const nodes: Node[] = [
      { id: 'operation', position: { x: 1643, y: 1518 }, data: {}, measured: { width: 319, height: 73 } },
      { id: 'labor-kpi', position: { x: 1413, y: 1109 }, data: {}, measured: { width: 215, height: 96 } },
      { id: 'exception-alert', position: { x: 1426, y: 1325 }, data: {}, measured: { width: 190, height: 73 } },
      { id: 'labor-schedule-feedback', position: { x: 1608, y: 911 }, data: {}, measured: { width: 202, height: 60 } },
      { id: 'task-group', position: { x: 2654, y: 245 }, data: {}, measured: { width: 206, height: 96 } },
      { id: 'allocation', position: { x: 1606, y: 677 }, data: {}, measured: { width: 206, height: 96 } },
      { id: 'wave-planning', position: { x: 2543, y: 484 }, data: {}, measured: { width: 206, height: 73 } },
    ];
    const edges: Edge[] = [
      withPath('e-op-alert', 'operation', 'exception-alert', [
        { x: 1802.5, y: 1518 }, { x: 1802.5, y: 1458 },
        { x: 1521, y: 1458 }, { x: 1521, y: 1398 },
      ]),
      withPath('e-operation-labor', 'operation', 'labor-kpi', [
        { x: 1803, y: 1518 }, { x: 1803, y: 1434 },
        { x: 1521, y: 1434 }, { x: 1521, y: 1407 },
        { x: 1417, y: 1407 }, { x: 1417, y: 1316 },
        { x: 1521, y: 1316 }, { x: 1521, y: 1205 },
      ]),
      withPath('e-labor-group-fb', 'labor-schedule-feedback', 'task-group', [
        { x: 1709, y: 911 }, { x: 1709, y: 863 },
        { x: 1757, y: 863 }, { x: 1757, y: 782 },
        { x: 2757, y: 782 }, { x: 2757, y: 341 },
      ]),
    ];

    const beforeQuality = calculateEdgePathQualityScore(edges);
    expect(beforeQuality.unexplainedRelatedOverlap).toBeGreaterThan(0);
    expect(beforeQuality.hairpins).toBeGreaterThan(0);
    expect(edges.slice(1).every(edge => scoreNodeClearanceRisk(
      pathFor(edge),
      nodes,
      edge,
      16,
    ) > 0)).toBe(true);

    const repaired = repairBusinessNodeClearanceRisks(edges, nodes, { minimumClearance: 16 });
    const afterQuality = calculateEdgePathQualityScore(repaired);

    expect(repaired.slice(1).every(edge => scoreNodeClearanceRisk(
      pathFor(edge),
      nodes,
      edge,
      16,
    ) === 0)).toBe(true);
    expect(afterQuality.strictCrossings).toBe(0);
    expect(afterQuality.unexplainedRelatedOverlap).toBe(0);
    expect(afterQuality.hairpins).toBe(0);
  });
});
