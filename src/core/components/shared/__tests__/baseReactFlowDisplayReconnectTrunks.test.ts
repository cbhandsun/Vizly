import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createBaseReactFlowMovedNodeReconnectCandidates } from '../baseReactFlowDisplayLocalReconnect';
import { createBaseReactFlowFinalEndpointEvaluation } from '../baseReactFlowDisplayFinalEndpointEvaluation';
import { restoreBaseReactFlowReconnectTrunks } from '../baseReactFlowDisplayReconnectTrunks';
import { getDisplayComputedPath } from '../baseReactFlowDisplayGeometry';

const fixture = () => {
  const baselineNodes: Node[] = [
    { id: 'hub', position: { x: 923.75, y: 812 }, width: 282, height: 118, data: {} },
    { id: 'left', position: { x: 650, y: 1090 }, width: 243, height: 118, data: {} },
    { id: 'near', position: { x: 1213, y: 1090 }, width: 250, height: 118, data: {} },
    { id: 'far', position: { x: 1286.3375, y: 1540 }, width: 296, height: 118, data: {} },
  ];
  const baselineEdges: Edge[] = [
    { id: 'a', source: 'hub', target: 'left', sourceHandle: 'bottom', targetHandle: 'top',
      data: { computedPath: [{ x: 1054, y: 930 }, { x: 1054, y: 1000 }, { x: 812, y: 1000 }, { x: 812, y: 1090 }] } },
    { id: 'b', source: 'hub', target: 'far', sourceHandle: 'bottom', targetHandle: 'top',
      data: { computedPath: [{ x: 1054, y: 930 }, { x: 1054, y: 1400 }, { x: 1434, y: 1400 }, { x: 1434, y: 1540 }] } },
    { id: 'c', source: 'hub', target: 'near', sourceHandle: 'bottom', targetHandle: 'left',
      data: { computedPath: [{ x: 1054, y: 930 }, { x: 1054, y: 1149 }, { x: 1213, y: 1149 }] } },
  ];
  const nodes = baselineNodes.map(node => node.id === 'hub'
    ? { ...node, position: { x: node.position.x + 48.25, y: node.position.y + 16 } } : node);
  const edges: Edge[] = baselineEdges.map((edge, index) => {
    const path = getDisplayComputedPath(edge).map(point => ({ ...point }));
    path[0].x = [972, 1030, 1113][index];
    path[0].y = 946;
    path[1].x = path[0].x;
    if (index === 0) path[1].y = path[2].y = 1002;
    return { ...edge, data: { computedPath: path } };
  });
  return { baselineNodes, baselineEdges, nodes, edges, changedNodeIds: ['hub'], mutableEdgeIds: ['a', 'b', 'c'] };
};

describe('committed shared trunks during endpoint reconnect', () => {
  it.each([false, true].flatMap(target => [false, true].flatMap(transpose =>
    [false, true].map(mirror => ({ target, transpose, mirror })),
  )))('restores the group across role/axis/reflection $target/$transpose/$mirror', ({ target, transpose, mirror }) => {
    const input = fixture();
    const point = (p: { x: number; y: number }) => {
      const next = { x: mirror ? 10000 - p.x : p.x, y: mirror ? 10000 - p.y : p.y };
      return transpose ? { x: next.y, y: next.x } : next;
    };
    const handles: Record<string, string> = mirror
      ? { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
      : { top: 'top', bottom: 'bottom', left: 'left', right: 'right' };
    const axes: Record<string, string> = { top: 'left', bottom: 'right', left: 'top', right: 'bottom' };
    const handle = (side: string | null | undefined) => {
      const reflected = typeof side === 'string' ? handles[side] : undefined;
      return transpose && reflected ? axes[reflected] : reflected;
    };
    const transformNode = (node: Node): Node => {
      const width = node.width ?? 0;
      const height = node.height ?? 0;
      const position = point(mirror ? { x: node.position.x + width, y: node.position.y + height } : node.position);
      return { ...node, position, width: transpose ? height : width, height: transpose ? width : height };
    };
    const transformEdge = (edge: Edge): Edge => {
      const path = getDisplayComputedPath(edge).map(point);
      return { ...edge, source: target ? edge.target : edge.source, target: target ? edge.source : edge.target,
        sourceHandle: handle(target ? edge.targetHandle : edge.sourceHandle),
        targetHandle: handle(target ? edge.sourceHandle : edge.targetHandle),
        data: { computedPath: target ? path.reverse() : path } };
    };
    input.nodes = input.nodes.map(transformNode);
    input.baselineNodes = input.baselineNodes.map(transformNode);
    input.edges = input.edges.map(transformEdge);
    input.baselineEdges = input.baselineEdges.map(transformEdge);
    const original = structuredClone(input);
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(input.nodes);
    expect(evaluation.endpointOrder(input.edges).inversions).toBe(1);
    const restored = restoreBaseReactFlowReconnectTrunks(input);
    expect(evaluation.hardReport(restored).hardClean).toBe(true);
    expect(evaluation.endpointOrder(restored).inversions).toBe(0);
    expect(evaluation.passageOrder(restored).passageDefects).toBe(0);
    expect(evaluation.endpointOrder(restored).legalSharedTrunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'hub', role: target ? 'target' : 'source', edgeIds: ['a', 'b', 'c'] }),
    ]));
    expect(input).toEqual(original);
    expect(restoreBaseReactFlowReconnectTrunks({ ...input, edges: restored })).toBe(restored);
  });

  it('preserves the committed bundle through the public moved-node reconnect search', () => {
    const input = fixture();
    const candidates = createBaseReactFlowMovedNodeReconnectCandidates({ ...input, beamWidth: 1 });
    expect(candidates).toHaveLength(1);
    const evaluation = createBaseReactFlowFinalEndpointEvaluation(input.nodes);
    expect(evaluation.hardReport(candidates[0]).hardClean).toBe(true);
    expect(evaluation.endpointOrder(candidates[0]).inversions).toBe(0);
    expect(evaluation.passageOrder(candidates[0]).passageDefects).toBe(0);
  });

  it.each(['empty', 'missing-member', 'frozen-member', 'fixed-port', 'remote-move', 'invalid-size', 'invalid-path', 'obstacle'])(
    'does not commit an unsafe or incomplete group: %s', kind => {
      const input = fixture();
      if (kind === 'empty') input.changedNodeIds = [];
      if (kind === 'missing-member') input.edges = input.edges.slice(0, 2);
      if (kind === 'frozen-member') input.mutableEdgeIds = ['a'];
      if (kind === 'fixed-port') input.edges = input.edges.map(edge => ({ ...edge, data: { ...edge.data, sourcePortPolicy: 'fixed-pos' } }));
      if (kind === 'remote-move') input.changedNodeIds.push('left', 'near', 'far');
      if (kind === 'invalid-size') input.nodes = input.nodes.map(node => node.id === 'hub' ? { ...node, width: Infinity } : node);
      if (kind === 'invalid-path') input.baselineEdges = input.baselineEdges.map(edge => ({ ...edge, data: { computedPath: [{ x: NaN, y: 0 }] } }));
      if (kind === 'obstacle') input.nodes.push({ id: 'blocker', position: { x: 1048, y: 1010 }, width: 12, height: 35, data: {} });
      expect(restoreBaseReactFlowReconnectTrunks(input)).toBe(input.edges);
    },
  );
});
