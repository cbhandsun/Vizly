import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { repairBusinessNodeClearanceRisks } from '../edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../edgeWaypointCandidateRepair';
import { getEdgePath } from '../edgeRoutingPathGeometry';

describe('terminal segment clearance', () => {
  it.each([false, true])('detours a terminal run beside an obstacle (transpose=%s)', transpose => {
    const point = (x: number, y: number) => transpose ? { x: y, y: x } : { x, y };
    const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
      id, position: point(x, y), data: {},
      width: transpose ? height : width, height: transpose ? width : height,
    });
    const nodes = [
      node('source', 2936, 4285.5, 200, 120),
      node('blocker', 3540, 4261, 128, 73),
      node('target', 3659, 4444, 128, 80),
    ];
    const path = [point(3136, 4345.5), point(3603, 4345.5), point(3603, 4484), point(3659, 4484)];
    const edge: Edge = {
      id: 'branch', source: 'source', target: 'target',
      sourceHandle: transpose ? 'bottom' : 'right', targetHandle: transpose ? 'top' : 'left',
      data: { computedPath: path },
    };
    expect(scoreNodeClearanceRisk(path, nodes, edge, 48)).toBeGreaterThan(0);
    const result = repairBusinessNodeClearanceRisks([edge], nodes, { minimumClearance: 48 });
    const repaired = getEdgePath(result[0]);
    expect(scoreNodeClearanceRisk(repaired, nodes, result[0], 48)).toBe(0);
    expect(repaired[0]).toEqual(path[0]);
    expect(repaired.at(-1)).toEqual(path.at(-1));
    expect(edge.data?.computedPath).toEqual(path);
  });
});
