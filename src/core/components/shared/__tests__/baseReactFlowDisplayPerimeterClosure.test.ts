// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';
import { repairBaseReactFlowDisplayPerimeterClosure } from '../baseReactFlowDisplayPerimeterClosure';
import { getExactDisplayHardReport, withExactDisplayHardReport } from '../baseReactFlowDisplayWorkerResponse';
import { finalizeBaseReactFlowExactCommercialClearance } from '../baseReactFlowDisplayFinalCommercialClearanceTransaction';
import { getEdgePath } from '../../../strategies/shared/edgeRoutingPathGeometry';
import { segmentIntersectsClearanceRect } from '../../../strategies/shared/edgeNodeClearanceGeometry';
import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';

const node = (id: string, x: number, y: number): Node => ({ id, position: { x, y }, data: {}, width: 80, height: 60 });
const nodes = [node('source', 0, 0), node('obstacle', 140, 68), node('target', 300, 0)];
const edges: Edge[] = [{ id: 'edge', source: 'source', target: 'target', sourceHandle: 'right', targetHandle: 'left',
  data: { computedPath: [{ x: 80, y: 30 }, { x: 300, y: 30 }] } }];

describe('bounded Worker perimeter closure', () => {
  it('closes a trapped corridor without mutating input or traversing endpoint interiors', () => {
    const before = structuredClone({ nodes, edges });
    const repaired = repairBaseReactFlowDisplayPerimeterClosure(edges, nodes);
    expect(repaired).not.toBe(edges);
    expect(getExactDisplayHardReport(repaired, nodes).hardClean).toBe(true);
    const path = getEdgePath(repaired[0]);
    for (const endpoint of [nodes[0], nodes[2]]) {
      expect(path.slice(0, -1).some((a, i) => segmentIntersectsClearanceRect({ a, b: path[i + 1] },
        { ...endpoint.position, width: 80, height: 60 }, 0))).toBe(false);
    }
    expect({ nodes, edges }).toEqual(before);
    expect(repairBaseReactFlowDisplayPerimeterClosure(repaired, nodes)).toBe(repaired);
  });

  it.each(['fixed-pos', 'forbidden', 'fixed-side'])('preserves %s source declarations', sourcePortPolicy => {
    const fixed = edges.map(edge => ({ ...edge, data: { ...edge.data, sourcePortPolicy, targetPortPolicy: sourcePortPolicy } }));
    expect(repairBaseReactFlowDisplayPerimeterClosure(fixed, nodes)).toBe(fixed);
  });

  it('uses measured absolute geometry instead of nested local coordinates', () => {
    const nested = [node('parent', -1000, -1000), ...nodes.map(value => ({
      ...value, parentId: 'parent', position: { x: value.position.x + 1000, y: value.position.y + 1000 },
      positionAbsolute: value.position,
    }))];
    nested[0].type = 'titleGroup';
    const repaired = repairBaseReactFlowDisplayPerimeterClosure(edges, nested);
    expect(getExactDisplayHardReport(repaired, nested).hardClean).toBe(true);
    expect(getEdgePath(repaired[0])).toEqual(getEdgePath(repairBaseReactFlowDisplayPerimeterClosure(edges, nodes)[0]));
  });

  it('uses measured dimensions even when stale layout widths disagree', () => {
    const measured = nodes.map(value => ({ ...value, width: 400, height: 300,
      measured: { width: 80, height: 60 }, style: { width: 500, height: 400 } }));
    const before = structuredClone(measured);
    const repaired = repairBaseReactFlowDisplayPerimeterClosure(edges, measured);
    expect(repaired).not.toBe(edges);
    expect(getExactDisplayHardReport(repaired, measured).hardClean).toBe(true);
    expect(getEdgePath(repaired[0])).toEqual(getEdgePath(repairBaseReactFlowDisplayPerimeterClosure(edges, nodes)[0]));
    expect(measured).toEqual(before);
  });

  it.each([
    [false, false, false], [false, true, false], [true, true, false],
    [false, false, true], [false, true, true], [true, true, true],
  ])('moves shared stems atomically (fixedTarget=%s, fixedSource=%s, reverse=%s)', (fixedTarget, fixedSource, reverse) => {
    const sharedNodes = [node('s', 340, 0), node('obstacle', 140, 0), node('a', 200, 220), node('b', 0, 150)];
    const sharedEdges: Edge[] = [
      { id: 'sa', source: 's', target: 'a', sourceHandle: 'left', targetHandle: 'top',
        data: { manualHandles: { source: fixedSource, target: fixedTarget }, computedPath: [{ x: 340, y: 30 }, { x: 244, y: 30 }, { x: 244, y: 220 }] } },
      { id: 'sb', source: 's', target: 'b', sourceHandle: 'left', targetHandle: 'right',
        data: { manualHandles: { source: fixedSource }, computedPath: [{ x: 340, y: 30 }, { x: 244, y: 30 }, { x: 244, y: 108 }, { x: 128, y: 108 }, { x: 128, y: 180 }, { x: 80, y: 180 }] } },
    ];
    if (reverse) {
      for (const edge of sharedEdges) {
        const reversedPath = getEdgePath(edge).toReversed();
        [edge.source, edge.target] = [edge.target, edge.source];
        [edge.sourceHandle, edge.targetHandle] = [edge.targetHandle, edge.sourceHandle];
        edge.data = { ...edge.data, computedPath: reversedPath,
          manualHandles: { source: edge.id === 'sa' && fixedTarget, target: fixedSource } };
      }
    }
    const before = structuredClone(sharedEdges);
    expect(getExactDisplayHardReport(sharedEdges, sharedNodes).hardClean).toBe(false);
    const repaired = repairBaseReactFlowDisplayPerimeterClosure(sharedEdges, sharedNodes);
    expect(auditFinalSameSideEndpointOrder(repaired, sharedNodes).legalSharedTrunks.map(trunk => trunk.id))
      .toEqual(auditFinalSameSideEndpointOrder(sharedEdges, sharedNodes).legalSharedTrunks.map(trunk => trunk.id));
    if (fixedTarget) {
      expect(repaired).toBe(sharedEdges);
    } else {
      expect(getExactDisplayHardReport(repaired, sharedNodes).hardClean).toBe(true);
      const oriented = repaired.map(edge => reverse ? getEdgePath(edge).toReversed() : getEdgePath(edge));
      expect(oriented[0][1].x).toBe(oriented[1][1].x);
      expect(oriented[0][0]).toEqual({ x: 340, y: 30 });
    }
    expect(sharedEdges).toEqual(before);
  });

  it('does not change incremental frozen boundaries or accept a failed final audit', () => {
    const baseline = withExactDisplayHardReport({ requestId: 'closure', edges, routeResolution: 'full-route' }, nodes);
    const exactReport = () => baseline;
    expect(finalizeBaseReactFlowExactCommercialClearance({ exactBaseline: baseline, repairNodes: nodes, exactReport })).toBe(baseline);
    const incremental = { ...baseline, routeResolution: 'incremental-route' as const };
    expect(finalizeBaseReactFlowExactCommercialClearance({ exactBaseline: incremental, repairNodes: nodes, eligibleEdgeIds: new Set() })).toBe(incremental);
  });

  it('bounds empty, malformed and oversized internal geometry', () => {
    expect(repairBaseReactFlowDisplayPerimeterClosure([], nodes)).toEqual([]);
    expect(repairBaseReactFlowDisplayPerimeterClosure(edges, [])).toBe(edges);
    expect(repairBaseReactFlowDisplayPerimeterClosure(edges, [node('bad', NaN, 0)])).toBe(edges);
    expect(repairBaseReactFlowDisplayPerimeterClosure(edges, [node('bad', Infinity, 0)])).toBe(edges);
    expect(repairBaseReactFlowDisplayPerimeterClosure(edges, [node('bad', 1e7, 0)])).toBe(edges);
    const oversized = Array.from({ length: 49 }, () => edges[0]);
    expect(repairBaseReactFlowDisplayPerimeterClosure(oversized, nodes)).toBe(oversized);
    expect(repairBaseReactFlowDisplayPerimeterClosure(edges, Array.from({ length: 129 }, () => nodes[0]))).toBe(edges);
    const longPath = [{ ...edges[0], data: { computedPath: Array.from({ length: 129 }, (_, x) => ({ x, y: 0 })) } }];
    expect(repairBaseReactFlowDisplayPerimeterClosure(longPath, nodes)).toBe(longPath);
  });
});
