import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createBaseReactFlowRoutingAffectedClosure,
  createBaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import { hasBaseReactFlowDisplayIncrementalWork } from '../baseReactFlowDisplayIncrementalPlan';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 300, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
];

const edges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {},
}];

const classify = ({
  nextNodes = nodes,
  nextEdges = edges,
  reasonHint,
}: {
  nextNodes?: readonly Node[];
  nextEdges?: readonly Edge[];
  reasonHint?: 'node-drag' | 'layout';
} = {}) => createBaseReactFlowRoutingChangeSet({
  previousNodes: nodes,
  previousEdges: edges,
  nextNodes,
  nextEdges,
  reasonHint,
});

describe('baseReactFlow display routing change set', () => {
  it('distinguishes unchanged and routing-irrelevant object updates', () => {
    expect(classify()).toEqual({
      reason: 'unknown',
      classification: 'none',
      changedNodeIds: [],
      changedEdgeIds: [],
      topologyChanged: false,
      geometryChanged: false,
    });

    expect(classify({
      nextNodes: nodes.map(node => node.id === 'source'
        ? { ...node, style: { color: '#f00' }, data: { businessStatus: 'delayed' } }
        : node),
    })).toMatchObject({
      classification: 'style-only',
      changedNodeIds: [],
      changedEdgeIds: [],
      topologyChanged: false,
      geometryChanged: false,
    });
  });

  it('classifies multi-node movement and explicit layout changes as geometry', () => {
    const movedNodes = nodes.map((node, index) => ({
      ...node,
      position: { x: node.position.x + 20 * (index + 1), y: node.position.y + 10 },
    }));
    expect(classify({ nextNodes: movedNodes, reasonHint: 'node-drag' })).toMatchObject({
      reason: 'node-drag',
      classification: 'geometry',
      changedNodeIds: ['source', 'target'],
      topologyChanged: false,
      geometryChanged: true,
    });
    expect(classify({ nextNodes: movedNodes, reasonHint: 'layout' })).toMatchObject({
      reason: 'layout',
      classification: 'geometry',
    });
  });

  it('treats resize, collapse, reparenting, and visibility as routing changes', () => {
    expect(classify({
      nextNodes: nodes.map(node => node.id === 'source'
        ? { ...node, measured: { width: 140, height: 60 } }
        : node),
    })).toMatchObject({ reason: 'node-resize', classification: 'geometry' });

    for (const changedSource of [
      { ...nodes[0], data: { collapsed: true } },
      { ...nodes[0], hidden: true },
      { ...nodes[0], parentId: 'container' },
    ]) {
      expect(classify({ nextNodes: [changedSource, nodes[1]] })).toMatchObject({
        reason: 'container-change',
        classification: 'topology',
        changedNodeIds: ['source'],
        topologyChanged: true,
      });
    }
  });

  it('classifies handle and data-only port policy changes as topology', () => {
    for (const changedEdge of [
      { ...edges[0], sourceHandle: 'bottom' },
      { ...edges[0], data: { sourcePortPolicy: 'automatic' } },
      { ...edges[0], data: { runtimeHandleLock: { source: true, target: false } } },
    ]) {
      expect(classify({ nextEdges: [changedEdge] })).toMatchObject({
        reason: 'port-policy',
        classification: 'topology',
        changedEdgeIds: ['edge'],
        topologyChanged: true,
      });
    }
  });

  it('keeps add and remove precedence deterministic', () => {
    expect(classify({
      nextNodes: [...nodes, { id: 'added', position: { x: 0, y: 100 }, data: {} }],
    })).toMatchObject({ reason: 'node-add', classification: 'topology' });
    expect(classify({ nextNodes: [nodes[0]] })).toMatchObject({
      reason: 'node-remove',
      classification: 'topology',
    });
    expect(classify({
      nextEdges: [...edges, { id: 'added-edge', source: 'target', target: 'source' }],
    })).toMatchObject({ reason: 'edge-add', classification: 'topology' });
    expect(classify({ nextEdges: [] })).toMatchObject({
      reason: 'edge-remove',
      classification: 'topology',
    });
  });

  it('keeps isolated node additions and removals incremental without mutable edges', () => {
    const isolatedNode: Node = {
      id: 'isolated',
      position: { x: 600, y: 200 },
      measured: { width: 100, height: 60 },
      data: {},
    };
    const removal = createBaseReactFlowRoutingChangeSet({
      previousNodes: [...nodes, isolatedNode],
      previousEdges: edges,
      nextNodes: nodes,
      nextEdges: edges,
      reasonHint: 'unknown',
    });
    const removalClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet: removal,
      previousNodes: [...nodes, isolatedNode],
      nextNodes: nodes,
      baselineEdges: edges,
      nextEdges: edges,
    });
    const addition = createBaseReactFlowRoutingChangeSet({
      previousNodes: nodes,
      previousEdges: edges,
      nextNodes: [...nodes, isolatedNode],
      nextEdges: edges,
      reasonHint: 'unknown',
    });
    const additionClosure = createBaseReactFlowRoutingAffectedClosure({
      changeSet: addition,
      previousNodes: nodes,
      nextNodes: [...nodes, isolatedNode],
      baselineEdges: edges,
      nextEdges: edges,
    });

    expect(removalClosure.mutableEdgeIds).toEqual([]);
    expect(hasBaseReactFlowDisplayIncrementalWork(removal, removalClosure)).toBe(true);
    expect(additionClosure.mutableEdgeIds).toEqual([]);
    expect(hasBaseReactFlowDisplayIncrementalWork(addition, additionClosure)).toBe(true);
  });

  it('promotes descendant incident edges when a parent container moves', () => {
    const nestedNodes: Node[] = [
      {
        id: 'container', position: { x: 0, y: 0 },
        measured: { width: 240, height: 180 }, data: {},
      },
      {
        id: 'child', parentId: 'container', position: { x: 20, y: 30 },
        measured: { width: 80, height: 40 }, data: {},
      },
      {
        id: 'external', position: { x: 400, y: 30 },
        measured: { width: 80, height: 40 }, data: {},
      },
    ];
    const nestedEdges: Edge[] = [{
      id: 'child-external', source: 'child', target: 'external',
      data: { computedPath: [{ x: 100, y: 50 }, { x: 400, y: 50 }] },
    }];
    const nextNodes = nestedNodes.map(node => node.id === 'container'
      ? { ...node, position: { x: 80, y: 60 } }
      : node);
    const changeSet = createBaseReactFlowRoutingChangeSet({
      previousNodes: nestedNodes,
      previousEdges: nestedEdges,
      nextNodes,
      nextEdges: nestedEdges,
      reasonHint: 'node-drag',
    });

    expect(changeSet.changedNodeIds).toEqual(['container']);
    expect(createBaseReactFlowRoutingAffectedClosure({
      changeSet,
      previousNodes: nestedNodes,
      nextNodes,
      baselineEdges: nestedEdges,
      nextEdges: nestedEdges,
    }).mutableEdgeIds).toEqual(['child-external']);
  });
});
