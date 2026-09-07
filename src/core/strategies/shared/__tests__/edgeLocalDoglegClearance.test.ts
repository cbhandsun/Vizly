import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { repairLocalDoglegArtifacts } from '../edgeLocalDoglegRepair';
import { getEdgePath, pathLength } from '../edgeLocalDoglegGeometry';
import { calculateEdgePathQualityScore } from '../edgeStrictCrossingGuard';
import {
  BUSINESS_NODE_CLEARANCE,
  createNodeClearanceGraphEvaluationContext,
  HARD_MINIMUM_BUSINESS_NODE_CLEARANCE,
} from '../edgeWaypointCandidateRepair';

type Point = { x: number; y: number };

function outerLaneFixture(turns: number, translation: number): { edges: Edge[]; nodes: Node[] } {
  const point = (x: number, y: number): Point => {
    for (let turn = 0; turn < turns; turn += 1) [x, y] = [-y, x];
    return { x: x + translation, y: y - translation };
  };
  const node = (id: string, x: number, y: number, width: number, height: number): Node => {
    const a = point(x, y), b = point(x + width, y + height);
    return { id, data: {}, position: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
      width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
  };
  return {
    nodes: [node('source', 1000, 700, 120, 96), node('target', 0, 100, 120, 96),
      node('obstacle', 400, 100, 120, 96)],
    edges: [{ id: 'transfer', source: 'source', target: 'target', data: {
      computedPath: [[1000, 748], [900, 748], [900, -300], [200, -300], [200, 148], [120, 148]]
        .map(([x, y]) => point(x, y)),
    } }],
  };
}

describe('local dogleg node clearance contract', () => {
  it.each([0, 1, 2, 3].flatMap(turns => [0, 317.175].map(translation => ({ turns, translation }))))(
    'shortens an outer lane without consuming safe node clearance ($turns, $translation)',
    ({ turns, translation }) => {
      const { edges, nodes } = outerLaneFixture(turns, translation);
      const clearance = createNodeClearanceGraphEvaluationContext(nodes);
      const before = getEdgePath(edges[0]);
      const [repaired] = repairLocalDoglegArtifacts(edges, nodes);
      const path = getEdgePath(repaired);
      expect(clearance.score(before, edges[0], BUSINESS_NODE_CLEARANCE)).toBe(0);
      expect(clearance.score(path, repaired, HARD_MINIMUM_BUSINESS_NODE_CLEARANCE)).toBe(0);
      expect(clearance.score(path, repaired, BUSINESS_NODE_CLEARANCE)).toBe(0);
      expect(pathLength(path)).toBeLessThan(pathLength(before) - 400);
      expect(calculateEdgePathQualityScore([repaired]).nonOrthogonalSegments).toBe(0);
      expect(getEdgePath(repairLocalDoglegArtifacts([repaired], nodes)[0])).toEqual(path);
    },
  );
});
