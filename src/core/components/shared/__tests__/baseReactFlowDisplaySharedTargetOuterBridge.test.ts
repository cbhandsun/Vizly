import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { countDisplayObstacleHits } from '../baseReactFlowDisplayEvaluation';
import { findDisplayGeometricCrossingHits } from '../baseReactFlowDisplayGeometry';
import { buildSharedTargetOuterBridgeCandidates } from '../baseReactFlowDisplaySharedTargetOuterBridge';
import { findDisplayDualTrunkJunctionConflicts, repairDisplayDualTrunkJunctions } from '../baseReactFlowDisplayDualTrunkJunctionRepair';
import { getExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';
import { applySharedTrunkPaintPlan, readSharedTrunkPaintPlan, createSharedTrunkPaintFragments, createSharedTrunkBackboneFragments } from '../../../rendering/sharedTrunkPaint';
import { collectLineJumpIntersections, injectLineJumps } from '../../../services/LineJumpEngine';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';
import enterpriseJunction from './fixtures/enterpriseDualTrunkJunction.json';

const node = (id: string, x: number, y: number, width: number, height: number): Node => ({
  id,
  type: 'process',
  position: { x, y },
  width,
  height,
  measured: { width, height },
  data: {},
});

describe('shared-target outer bridge candidates', () => {
  it('reserves a joint channel without moving ports, losing trunks or crossing the adjacent node', () => {
    const edges: Edge[] = enterpriseJunction.edges;
    const nodes: Node[] = enterpriseJunction.nodes;
    const before = structuredClone(edges);
    expect(findDisplayDualTrunkJunctionConflicts(edges)).toHaveLength(1);
    const result = repairDisplayDualTrunkJunctions(edges, nodes);
    expect(findDisplayDualTrunkJunctionConflicts(result)).toEqual([]);
    expect(getExactDisplayHardReport(result, nodes).hardClean).toBe(true);
    expect(result.filter((e, i) => e !== edges[i]).map(e => e.id)).toEqual(['edge-dep-back-3', 'edge-infra-3']);
    expect(result.map(e => [e.sourceHandle, e.targetHandle, getDisplayComputedPath(e)[0], getDisplayComputedPath(e).at(-1)]))
      .toEqual(edges.map(e => [e.sourceHandle, e.targetHandle, getDisplayComputedPath(e)[0], getDisplayComputedPath(e).at(-1)]));
    expect(repairDisplayDualTrunkJunctions(edges, nodes, new Set(['edge-dep-back-3']))).toBe(edges);
    expect(repairDisplayDualTrunkJunctions(result, nodes)).toBe(result);
    expect(edges).toEqual(before);
    expect(repairDisplayDualTrunkJunctions([], nodes)).toEqual([]);
    expect(findDisplayDualTrunkJunctionConflicts([{ ...edges[0], data: { computedPath: [{ x: NaN, y: 0 }] } }])).toEqual([]);
  });

  it.each([0, 1, 2, 3])('separates a dual-trunk fork/merge so the actual bridge survives painting, rotation %i', turn => {
    const rotate = (point: { x: number; y: number }) => {
      let p = point;
      for (let i = 0; i < turn; i++) p = { x: -p.y, y: p.x };
      return p;
    };
    const nodes = [node('s', -50, -220, 100, 100), node('t', 70, 80, 100, 100),
      node('other-s', -250, -220, 100, 100), node('other-t', 190, 320, 100, 100)].map(n => {
      const corners = [n.position, { x: n.position.x + 100, y: n.position.y + 100 }].map(rotate);
      return { ...n, position: { x: Math.min(...corners.map(p => p.x)), y: Math.min(...corners.map(p => p.y)) } };
    });
    const sourceHandle = ['bottom', 'left', 'top', 'right'][turn];
    const targetHandle = ['top', 'right', 'bottom', 'left'][turn];
    const edges: Edge[] = [
      { id: 'dual', source: 's', target: 't', sourceHandle, targetHandle, data: { computedPath: [
        { x: 0, y: -120 }, { x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 },
      ].map(rotate) } },
      { id: 'source-peer', source: 's', target: 'other-t', sourceHandle, targetHandle, data: { computedPath: [
        { x: 0, y: -120 }, { x: 0, y: 240 }, { x: 240, y: 240 }, { x: 240, y: 320 },
      ].map(rotate) } },
      { id: 'target-peer', source: 'other-s', target: 't', sourceHandle, targetHandle, data: { computedPath: [
        { x: -200, y: -120 }, { x: -200, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 80 },
      ].map(rotate) } },
    ];
    for (const reverse of [false, true]) {
      const input = reverse ? edges.map(e => ({ ...e, source: e.target, target: e.source,
        sourceHandle: e.targetHandle, targetHandle: e.sourceHandle,
        data: { computedPath: [...getDisplayComputedPath(e)].reverse() } })) : edges;
      const paint = (items: Edge[]) => {
        const jumps = collectLineJumpIntersections(items.map(e => ({ edgeId: e.id, points: getDisplayComputedPath(e), endpointInfo: e })));
        return applySharedTrunkPaintPlan(items).flatMap(e => {
          const path = getDisplayComputedPath(e);
          const plan = readSharedTrunkPaintPlan(e.data);
          return [...createSharedTrunkPaintFragments(path, plan), ...createSharedTrunkBackboneFragments(path, plan)]
            .map(f => injectLineJumps([...f.points], jumps.filter(j => j.horizontalEdgeId === e.id), 6, 0));
        }).join(' ');
      };
      expect(getExactDisplayHardReport(input, nodes).hardClean).toBe(true);
      expect(findDisplayDualTrunkJunctionConflicts(input)).toHaveLength(1);
      expect(paint(input)).not.toContain(' A ');
      const result = repairDisplayDualTrunkJunctions(input, nodes);
      expect(findDisplayDualTrunkJunctionConflicts(result)).toEqual([]);
      expect(getExactDisplayHardReport(result, nodes).hardClean).toBe(true);
      expect(paint(result)).toContain(' A 6 6 ');
      expect(result[1]).toBe(input[1]);
      expect(result[2]).toBe(input[2]);
      expect(repairDisplayDualTrunkJunctions(input, nodes, new Set(['source-peer']))).toBe(input);
    }
  });

  it('preserves the source trunk and merges into an existing target trunk', () => {
    const edges: Edge[] = [
      {
        id: 'incoming', source: 'loms', target: 'visibility',
        sourceHandle: 'right', targetHandle: 'top',
        data: { computedPath: [
          { x: 1005.5, y: 593 }, { x: 1061.5, y: 593 },
          { x: 1061.5, y: 58.5 }, { x: 1843, y: 58.5 },
          { x: 1843, y: 1360 }, { x: 1216, y: 1360 }, { x: 1216, y: 1539 },
        ] },
      },
      {
        id: 'outgoing', source: 'visibility', target: 'downstream',
        sourceHandle: 'top', targetHandle: 'bottom',
        data: { computedPath: [
          { x: 1312, y: 1539 }, { x: 1312, y: 1483 },
          { x: 1711, y: 1483 }, { x: 1711, y: 179.5 },
        ] },
      },
      {
        id: 'sibling', source: 'wms', target: 'visibility',
        sourceHandle: 'bottom', targetHandle: 'top',
        data: { computedPath: [
          { x: 149, y: 931 }, { x: 149, y: 1020 }, { x: 286, y: 1020 },
          { x: 286, y: 1483 }, { x: 1216, y: 1483 }, { x: 1216, y: 1539 },
        ] },
      },
      {
        id: 'source-sibling', source: 'loms', target: 'customs',
        sourceHandle: 'right', targetHandle: 'top',
        data: { computedPath: [
          { x: 1005.5, y: 593 }, { x: 1061.5, y: 593 },
          { x: 1061.5, y: 72 }, { x: 1531, y: 72 },
          { x: 1531, y: 742 }, { x: 1428, y: 742 }, { x: 1428, y: 822 },
        ] },
      },
    ];
    const nodes = [
      node('graph-left', 0, 300, 80, 80),
      node('loms', 826, 533, 179.5, 120),
      node('visibility', 1126.2, 1539, 371.6, 119),
      node('downstream', 1631, 60.5, 160, 119),
      node('wms', 59, 811, 180, 120),
      node('customs', 1338, 822, 180, 119),
    ];
    const crossing = findDisplayGeometricCrossingHits(edges)[0];
    expect(crossing).toBeDefined();
    if (!crossing) return;

    const candidates = [
      ...buildSharedTargetOuterBridgeCandidates(edges, crossing.a, crossing.b, nodes),
      ...buildSharedTargetOuterBridgeCandidates(edges, crossing.b, crossing.a, nodes),
    ];
    const clean = candidates.find(candidate => (
      calculateEdgePathQualityScore(candidate).strictCrossings === 0
      && countDisplayObstacleHits(candidate, nodes) === 0
    ));
    expect(clean).toBeDefined();
    if (!clean) return;
    const path = (clean[0].data as { computedPath: Array<{ x: number; y: number }> }).computedPath;

    expect(path.slice(0, 3)).toEqual(
      (edges[0].data as { computedPath: Array<{ x: number; y: number }> }).computedPath.slice(0, 3),
    );
    const siblingSuffix = (edges[2].data as {
      computedPath: Array<{ x: number; y: number }>;
    }).computedPath.slice(-3);
    expect(path.slice(-2)).toEqual(siblingSuffix.slice(-2));
    expect(path[path.length - 3].y).toBe(siblingSuffix[0].y);
    expect(path[path.length - 3].x).toBeLessThanOrEqual(siblingSuffix[0].x);
    expect(clean[0].sourceHandle).toBe('right');
    expect(clean[0].targetHandle).toBe('top');
  });
});
