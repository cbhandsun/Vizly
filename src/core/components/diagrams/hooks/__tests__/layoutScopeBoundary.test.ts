import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { mergeScopedLayoutResult, resolveLayoutScope } from '../layoutScopeBoundary';

const nodes: Node[] = [
  { id: 'group-a', type: 'titleGroup', position: { x: 0, y: 0 }, width: 220, height: 120, data: {}, draggable: false },
  { id: 'a', parentId: 'group-a', position: { x: 10, y: 10 }, width: 60, height: 40, data: {} },
  { id: 'b', parentId: 'group-a', position: { x: 120, y: 10 }, width: 60, height: 40, data: {} },
  { id: 'c', position: { x: 240, y: 10 }, width: 60, height: 40, data: { locked: true } },
  { id: 'd', position: { x: 360, y: 10 }, width: 60, height: 40, data: {} },
  { id: 'note', type: 'sticky-note', position: { x: 0, y: 160 }, width: 120, height: 80, data: {} },
];

const edges: Edge[] = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
  { id: 'cd', source: 'c', target: 'd' },
];

const ids = (items: readonly { id: string }[]) => items.map(item => item.id);
const setValues = (values: ReadonlySet<string>) => [...values].sort();

describe('resolveLayoutScope', () => {
  it('returns the whole graph by default while classifying generated and locked nodes', () => {
    const scope = resolveLayoutScope(nodes, edges, undefined);

    expect(scope.status).toBe('all');
    expect(ids(scope.nodes)).toEqual(ids(nodes));
    expect(ids(scope.edges)).toEqual(ids(edges));
    expect(setValues(scope.mutableNodeIds)).toEqual(['a', 'b', 'd', 'note']);
    expect(setValues(scope.fixedNodeIds)).toEqual(['c', 'group-a']);
    expect(setValues(scope.contextNodeIds)).toEqual(['group-a']);
  });

  it('falls back to whole-graph scope for type-confused runtime scope modes', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'viewport' as never,
      selectedNodeIds: ['b'],
    });

    expect(scope.mode).toBe('all');
    expect(scope.status).toBe('all');
    expect(ids(scope.nodes)).toEqual(ids(nodes));
  });

  it('resolves explicit selection with ancestor context but only mutable business nodes', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection',
      selectedNodeIds: ['b', 'missing'],
    });

    expect(scope.status).toBe('scoped');
    expect(ids(scope.nodes)).toEqual(['group-a', 'b']);
    expect(ids(scope.edges)).toEqual([]);
    expect(setValues(scope.seedNodeIds)).toEqual(['b']);
    expect(setValues(scope.mutableNodeIds)).toEqual(['b']);
    expect(setValues(scope.contextNodeIds)).toEqual(['group-a']);
  });

  it('expands a selected node to its neighborhood and keeps locked neighbors fixed', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection-neighborhood',
      selectedNodeIds: ['b'],
      neighborhoodDepth: 1,
    });

    expect(ids(scope.nodes)).toEqual(['group-a', 'a', 'b', 'c']);
    expect(ids(scope.edges)).toEqual(['ab', 'bc']);
    expect(setValues(scope.mutableNodeIds)).toEqual(['a', 'b']);
    expect(setValues(scope.fixedNodeIds)).toEqual(['c']);
    expect(setValues(scope.contextNodeIds)).toEqual(['group-a']);
  });

  it('uses selected edges as seeds and clamps unsafe depth', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection-neighborhood',
      selectedEdgeIds: ['bc'],
      neighborhoodDepth: 99,
    });

    expect(ids(scope.nodes)).toEqual(['group-a', 'a', 'b', 'c', 'd']);
    expect(ids(scope.edges)).toEqual(['ab', 'bc', 'cd']);
    expect(setValues(scope.seedNodeIds)).toEqual(['b', 'c']);
    expect(setValues(scope.fixedNodeIds)).toEqual(['c']);
    expect(setValues(scope.mutableNodeIds)).toEqual(['a', 'b', 'd']);
  });

  it('treats a selected generated container as context and includes descendants', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection',
      selectedNodeIds: ['group-a'],
    });

    expect(ids(scope.nodes)).toEqual(['group-a', 'a', 'b']);
    expect(ids(scope.edges)).toEqual(['ab']);
    expect(setValues(scope.mutableNodeIds)).toEqual(['a', 'b']);
    expect(setValues(scope.fixedNodeIds)).toEqual(['group-a']);
    expect(setValues(scope.contextNodeIds)).toEqual(['group-a']);
  });

  it('returns an empty scoped result for empty or unsafe selections', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection',
      selectedNodeIds: ['', 'bad\u0001id', 'missing'],
    });

    expect(scope.status).toBe('empty-selection');
    expect(scope.nodes).toEqual([]);
    expect(scope.edges).toEqual([]);
    expect(setValues(scope.mutableNodeIds)).toEqual([]);
  });
});

describe('mergeScopedLayoutResult', () => {
  it('writes back only mutable scoped node positions and scoped candidate edges', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection-neighborhood',
      selectedNodeIds: ['b'],
      neighborhoodDepth: 1,
    });
    const candidateNodes: Node[] = [
      { id: 'a', position: { x: 20, y: 20 }, data: {} },
      { id: 'b', position: { x: 130, y: 20 }, data: {} },
      { id: 'c', position: { x: 240, y: 10 }, data: { locked: true } },
    ];
    const candidateEdges: Edge[] = [
      { id: 'ab', source: 'a', target: 'b', data: { computedPath: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } },
      { id: 'bc', source: 'b', target: 'c', data: { computedPath: [{ x: 3, y: 3 }, { x: 4, y: 4 }] } },
    ];

    const merged = mergeScopedLayoutResult({
      allNodes: nodes,
      allEdges: edges,
      scope,
      candidateNodes,
      candidateEdges,
    });

    expect(merged.nodes.find(node => node.id === 'a')?.position).toEqual({ x: 20, y: 20 });
    expect(merged.nodes.find(node => node.id === 'b')?.position).toEqual({ x: 130, y: 20 });
    expect(merged.nodes.find(node => node.id === 'c')?.position).toEqual({ x: 240, y: 10 });
    expect(merged.nodes.find(node => node.id === 'd')?.position).toEqual({ x: 360, y: 10 });
    expect(merged.edges.find(edge => edge.id === 'ab')?.data).toEqual(candidateEdges[0].data);
    expect(merged.edges.find(edge => edge.id === 'bc')?.data).toEqual(candidateEdges[1].data);
    expect(merged.edges.find(edge => edge.id === 'cd')).toBe(edges[2]);
  });

  it('converts scoped child absolute layout positions back into original parent coordinates', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection',
      selectedNodeIds: ['b'],
    });
    const merged = mergeScopedLayoutResult({
      allNodes: nodes,
      allEdges: edges,
      scope,
      candidateNodes: [{ id: 'b', position: { x: 150, y: 60 }, data: {} }],
      candidateEdges: [],
    });

    expect(merged.nodes.find(node => node.id === 'b')?.position).toEqual({ x: 150, y: 60 });
    expect(merged.nodes.find(node => node.id === 'group-a')).toBe(nodes[0]);
  });

  it('returns a full candidate unchanged for all-graph scope', () => {
    const scope = resolveLayoutScope(nodes, edges, undefined);
    const candidateNodes = nodes.map(node => ({
      ...node,
      position: { x: node.position.x + 1, y: node.position.y + 1 },
    }));
    const candidateEdges = edges.map(edge => ({ ...edge, data: { routed: true } }));

    expect(mergeScopedLayoutResult({
      allNodes: nodes,
      allEdges: edges,
      scope,
      candidateNodes,
      candidateEdges,
    })).toEqual({ nodes: candidateNodes, edges: candidateEdges });
  });

  it('falls back to the original graph when a scoped merge would dirty clean full-graph geometry', () => {
    const scope = resolveLayoutScope(nodes, edges, {
      mode: 'selection-neighborhood',
      selectedNodeIds: ['b'],
      neighborhoodDepth: 1,
    });
    const merged = mergeScopedLayoutResult({
      allNodes: nodes,
      allEdges: edges,
      scope,
      candidateNodes: [
        { id: 'a', position: { x: 20, y: 20 }, width: 60, height: 40, data: {} },
        { id: 'b', position: { x: 20, y: 20 }, width: 60, height: 40, data: {} },
      ],
      candidateEdges: [],
    });

    expect(merged.nodes).toEqual(nodes);
    expect(merged.edges).toEqual(edges);
  });
});
