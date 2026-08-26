import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createBaseReactFlowRoutingChangeSet,
  type BaseReactFlowRoutingChangeSet,
} from '../baseReactFlowDisplayRoutingChangeSet';
import {
  createBaseReactFlowTopologyIncrementalProjection,
  MAX_BASE_REACT_FLOW_TOPOLOGY_INCREMENTAL_CHANGES,
} from '../baseReactFlowDisplayTopologyIncremental';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { displayIncrementalCandidateRequiresTopologyCommitGate } from '../baseReactFlowDisplayIncrementalWorkerFinalizer';
import { displayWorkerOperationPublishesBoundedCandidates } from '../baseReactFlowDisplayWorkerTransport';

const nodes: Node[] = [
  { id: 'source', position: { x: 0, y: 0 }, data: {} },
  { id: 'hub', position: { x: 200, y: 0 }, data: {} },
  { id: 'target', position: { x: 400, y: 0 }, data: {} },
  { id: 'auxiliary', position: { x: 200, y: 200 }, data: {} },
];

const baselineSourceEdges: Edge[] = [
  {
    id: 'edge-alpha',
    source: 'source',
    target: 'hub',
    type: 'advanced-smart-step',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: { businessRole: 'primary' },
  },
  {
    id: 'edge-beta',
    source: 'hub',
    target: 'target',
    type: 'advanced-smart-step',
    sourceHandle: 'right',
    targetHandle: 'left',
    data: { businessRole: 'primary' },
  },
  {
    id: 'edge-gamma',
    source: 'hub',
    target: 'auxiliary',
    type: 'advanced-smart-step',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data: { businessRole: 'support' },
  },
];

const baselineEdges: Edge[] = baselineSourceEdges.map((edge, index) => ({
  ...edge,
  type: 'stablePath',
  data: {
    ...edge.data,
    computedPath: [
      { x: index * 20, y: index * 20 },
      { x: 100 + index * 20, y: index * 20 },
    ],
    layoutPathLocked: true,
    runtimeHandleLock: { source: true, target: true },
    sharedTrunkAware: true,
  },
}));

const baselinePatches = createBaseReactFlowDisplayEdgePatches(
  baselineSourceEdges,
  baselineEdges,
);
if (!baselinePatches) throw new Error('expected the baseline routing patches to be valid');

const createChangeSet = (
  nextEdges: Edge[],
  nextNodes: readonly Node[] = nodes,
): BaseReactFlowRoutingChangeSet => createBaseReactFlowRoutingChangeSet({
  previousNodes: nodes,
  previousEdges: baselineSourceEdges,
  nextNodes,
  nextEdges,
});

const project = ({
  nextEdges,
  nextNodes = nodes,
  changeSet = createChangeSet(nextEdges, nextNodes),
}: {
  nextEdges: Edge[];
  nextNodes?: readonly Node[];
  changeSet?: BaseReactFlowRoutingChangeSet;
}) => createBaseReactFlowTopologyIncrementalProjection({
  baselineNodes: nodes,
  baselineSourceEdges,
  baselineEdges,
  baselinePatches,
  nextNodes,
  nextEdges,
  changeSet,
});

describe('base React Flow topology incremental projection', () => {
  it('keeps incremental candidate diagnostics inside the single final Worker response', () => {
    expect(displayWorkerOperationPublishesBoundedCandidates('incremental-route')).toBe(false);
    expect(displayWorkerOperationPublishesBoundedCandidates('route')).toBe(true);
    expect(displayWorkerOperationPublishesBoundedCandidates('repair')).toBe(true);
  });

  it('does not apply the topology-only commit gate to established geometry increments', () => {
    expect(displayIncrementalCandidateRequiresTopologyCommitGate('topology')).toBe(true);
    expect(displayIncrementalCandidateRequiresTopologyCommitGate('geometry')).toBe(false);
    expect(displayIncrementalCandidateRequiresTopologyCommitGate('style-only')).toBe(false);
  });

  it('projects an edge removal by id while retaining every surviving routed edge reference', () => {
    const nextEdges = [baselineSourceEdges[2], baselineSourceEdges[0]];
    const result = project({ nextEdges });

    expect(result).toMatchObject({
      kind: 'edge-remove',
      changedPresentEdgeIds: [],
      removedEdgeIds: ['edge-beta'],
      incidentContextEdgeIds: ['edge-alpha', 'edge-gamma'],
    });
    expect(result?.edges).toHaveLength(2);
    expect(result?.edges[0]).toBe(baselineEdges[2]);
    expect(result?.edges[1]).toBe(baselineEdges[0]);
  });

  it('creates a fresh edge-add seed without carrying trusted or source routing state', () => {
    const added: Edge = {
      id: 'edge-added',
      source: 'auxiliary',
      target: 'target',
      type: 'stablePath',
      sourceHandle: 'right-new',
      targetHandle: 'left-new',
      data: {
        originalType: 'bezier',
        businessRole: 'new-route',
        sourcePortPolicy: 'automatic',
        computedPath: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        elkPath: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        layoutPathLocked: true,
        runtimeHandleLock: { source: true },
        sharedTrunkAware: true,
        __baseDisplayFinalizedSignature: 'stale',
      },
    };
    const result = project({ nextEdges: [...baselineSourceEdges, added] });
    const addedSeed = result?.edges.at(-1);

    expect(result).toMatchObject({
      kind: 'edge-add',
      changedPresentEdgeIds: ['edge-added'],
      removedEdgeIds: [],
      incidentContextEdgeIds: ['edge-beta', 'edge-gamma'],
    });
    baselineEdges.forEach((edge, index) => expect(result?.edges[index]).toBe(edge));
    expect(addedSeed).not.toBe(added);
    expect(addedSeed).toMatchObject({
      id: 'edge-added',
      type: 'bezier',
      sourceHandle: 'right-new',
      targetHandle: 'left-new',
      data: {
        originalType: 'bezier',
        businessRole: 'new-route',
        sourcePortPolicy: 'automatic',
      },
    });
    for (const key of [
      'computedPath',
      'elkPath',
      'layoutPathLocked',
      'runtimeHandleLock',
      'sharedTrunkAware',
      '__baseDisplayFinalizedSignature',
    ]) {
      expect(addedSeed?.data).not.toHaveProperty(key);
    }
    expect(added.data).toHaveProperty('computedPath');
  });

  it('freshens a port-policy edge while preserving its new handles and authored policy', () => {
    const changedAlpha: Edge = {
      ...baselineSourceEdges[0],
      type: 'stablePath',
      sourceHandle: 'bottom-new',
      targetHandle: 'top-new',
      data: {
        ...baselineSourceEdges[0].data,
        originalType: 'smoothstep',
        sourcePortPolicy: 'fixed',
        targetPortConstraint: 'top',
        manualHandleSides: ['source', 'target'],
        computedPath: [{ x: 10, y: 10 }, { x: 10, y: 100 }],
        layoutPathLocked: true,
        runtimeHandleLock: { source: true, target: true },
      },
    };
    const nextEdges = [changedAlpha, baselineSourceEdges[1], baselineSourceEdges[2]];
    const result = project({ nextEdges });
    const alphaSeed = result?.edges[0];

    expect(result).toMatchObject({
      kind: 'port-policy',
      changedPresentEdgeIds: ['edge-alpha'],
      removedEdgeIds: [],
      incidentContextEdgeIds: ['edge-beta', 'edge-gamma'],
    });
    expect(alphaSeed).not.toBe(changedAlpha);
    expect(alphaSeed).toMatchObject({
      id: 'edge-alpha',
      type: 'smoothstep',
      sourceHandle: 'bottom-new',
      targetHandle: 'top-new',
      data: {
        originalType: 'smoothstep',
        sourcePortPolicy: 'fixed',
        targetPortConstraint: 'top',
        manualHandleSides: ['source', 'target'],
        businessRole: 'primary',
      },
    });
    expect(alphaSeed?.data).not.toHaveProperty('computedPath');
    expect(alphaSeed?.data).not.toHaveProperty('layoutPathLocked');
    expect(alphaSeed?.data).not.toHaveProperty('runtimeHandleLock');
    expect(result?.edges[1]).toBe(baselineEdges[1]);
    expect(result?.edges[2]).toBe(baselineEdges[2]);
  });

  it('fails closed for duplicate identifiers and edges with missing endpoint nodes', () => {
    const added: Edge = {
      id: 'edge-added',
      source: 'source',
      target: 'target',
      data: {},
    };
    const nextEdges = [...baselineSourceEdges, added];
    const validChangeSet = createChangeSet(nextEdges);

    expect(project({
      nextEdges: [...baselineSourceEdges, added, { ...added }],
      changeSet: validChangeSet,
    })).toBeNull();
    expect(project({
      nextEdges,
      nextNodes: [...nodes, { ...nodes[0] }],
      changeSet: validChangeSet,
    })).toBeNull();
    expect(project({
      nextEdges: [
        ...baselineSourceEdges,
        { ...added, id: 'edge-missing-node', target: 'missing' },
      ],
    })).toBeNull();
  });

  it('fails closed when the declared change budget is exceeded or the reason is wrong', () => {
    const addedEdges = Array.from(
      { length: MAX_BASE_REACT_FLOW_TOPOLOGY_INCREMENTAL_CHANGES + 1 },
      (_, index): Edge => ({
        id: `edge-added-${index}`,
        source: 'source',
        target: 'target',
        data: {},
      }),
    );
    const overBudgetNextEdges = [...baselineSourceEdges, ...addedEdges];
    expect(project({ nextEdges: overBudgetNextEdges })).toBeNull();

    const oneAddedNextEdges = [...baselineSourceEdges, addedEdges[0]];
    const changeSet = createChangeSet(oneAddedNextEdges);
    expect(project({
      nextEdges: oneAddedNextEdges,
      changeSet: { ...changeSet, reason: 'edge-remove' },
    })).toBeNull();
  });
});
