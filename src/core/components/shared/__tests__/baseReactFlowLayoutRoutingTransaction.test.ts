import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearBaseReactFlowDisplayCommittedSnapshots,
  readBaseReactFlowDisplayCommittedSnapshot,
} from '../baseReactFlowDisplayCommittedSnapshot';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import {
  commitBaseReactFlowStagedLayoutRoutingResult,
  seedBaseReactFlowStagedLayoutEdges,
} from '../baseReactFlowLayoutRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    width: 100,
    height: 60,
    measured: { width: 100, height: 60 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 240, y: 0 },
    width: 100,
    height: 60,
    measured: { width: 100, height: 60 },
    data: {},
  },
];

const sourceEdges: Edge[] = [{
  id: 'source-target',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'advanced-smart-step',
  data: {},
}];

const projectedNodes = projectBaseReactFlowDisplayWorkerInput({ edges: [], nodes }).nodes;

const createWorkerResult = (hardClean: boolean) => {
  const projected = projectBaseReactFlowDisplayWorkerInput({ edges: sourceEdges, nodes });
  return {
    edges: [{
      ...projected.edges[0],
      type: 'stablePath',
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 240, y: 30 }],
      },
    }],
    projectedEdges: projected.edges,
    hardClean,
    routeResolution: 'full-route' as const,
    phaseTrace: [],
  };
};

describe('baseReactFlowLayoutRoutingTransaction', () => {
  beforeEach(() => clearBaseReactFlowDisplayCommittedSnapshots());

  it('creates a private anchored orthogonal seed for full-quality refinement', () => {
    const [seed] = seedBaseReactFlowStagedLayoutEdges({ sourceEdges, sourceNodes: nodes });

    expect(seed).toMatchObject({
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 240, y: 30 }],
        layoutPathLocked: true,
        _layoutPathLocked: true,
      },
    });
    expect(sourceEdges[0].data).toEqual({});
  });

  it('does not reuse route ownership produced for pre-layout geometry', () => {
    const stalePath = [
      { x: -1_000, y: -1_000 },
      { x: -900, y: -1_000 },
    ];
    const [seed] = seedBaseReactFlowStagedLayoutEdges({
      sourceNodes: nodes,
      sourceEdges: [{
        ...sourceEdges[0],
        type: 'stablePath',
        data: {
          computedPath: stalePath,
          elkPath: stalePath,
          treeRouting: { points: stalePath },
          layoutPathLocked: true,
          _layoutPathLocked: true,
          __baseDisplayFinalizedSignature: 'stale-layout',
        },
      }],
    });
    const data = seed.data as Record<string, unknown>;

    expect(data.computedPath).not.toEqual(stalePath);
    expect(data.elkPath).toBeUndefined();
    expect(data.treeRouting).toBeUndefined();
    expect(data.__baseDisplayFinalizedSignature).toBeUndefined();
    expect(data.layoutPathLocked).toBe(true);
    expect(data._layoutPathLocked).toBe(true);
  });

  it('reuses a fresh ELK layout path only as a hidden validation candidate', () => {
    const elkPath = [
      { x: 100, y: 30 },
      { x: 170, y: 30 },
      { x: 170, y: 30 },
      { x: 240, y: 30 },
    ];
    const [seed] = seedBaseReactFlowStagedLayoutEdges({
      sourceNodes: nodes,
      sourceEdges: [{
        ...sourceEdges[0],
        data: { elkPath, useElkRouting: true, layoutRoutingCandidate: true },
      }],
    });
    const data = seed.data as Record<string, unknown>;

    expect(seed.type).toBe('stablePath');
    expect(data.computedPath).toEqual(elkPath);
    expect(data.elkPath).toBeUndefined();
    expect(data.algorithm).toBe('elk-layout-candidate');
    expect(sourceEdges[0].data).toEqual({});
  });

  it('does not record a staged layout route that failed the hard gate', () => {
    expect(commitBaseReactFlowStagedLayoutRoutingResult({
      sourceEdges,
      sourceNodes: projectedNodes,
      workerResult: createWorkerResult(false),
    })).toBeNull();

    const projected = projectBaseReactFlowDisplayWorkerInput({ edges: sourceEdges, nodes });
    const identity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: projected.nodes,
      edges: sourceEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    expect(readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: identity.cacheSignature,
      inputGeometryDigest: identity.geometryDigest,
      sourceEdges,
    })).toBeNull();
  });

  it('returns an exact hard-clean route for the hidden layout transaction', () => {
    const committed = commitBaseReactFlowStagedLayoutRoutingResult({
      sourceEdges,
      sourceNodes: projectedNodes,
      workerResult: createWorkerResult(true),
    });

    expect(committed).not.toBeNull();
    expect(committed!.routedEdges[0]).toMatchObject({
      type: 'stablePath',
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 240, y: 30 }],
      },
    });

    const routedProjected = projectBaseReactFlowDisplayWorkerInput({
      edges: committed!.routedEdges,
      nodes,
    });
    const routedIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: routedProjected.nodes,
      edges: committed!.routedEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    expect(readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: routedIdentity.cacheSignature,
      inputGeometryDigest: routedIdentity.geometryDigest,
      sourceEdges: committed!.routedEdges,
    })?.edges).toEqual(committed!.routedEdges);

    const shiftedNodes = nodes.map(node => node.id === 'target'
      ? { ...node, position: { x: 280, y: 0 } }
      : node);
    const shiftedProjected = projectBaseReactFlowDisplayWorkerInput({
      edges: committed!.routedEdges,
      nodes: shiftedNodes,
    });
    const shiftedIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: shiftedProjected.nodes,
      edges: committed!.routedEdges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });
    expect(readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: shiftedIdentity.cacheSignature,
      inputGeometryDigest: shiftedIdentity.geometryDigest,
      sourceEdges: committed!.routedEdges,
    })).toBeNull();
  });

  it('keys nested layout snapshots by the absolute geometry used by display routing', () => {
    const nestedNodes: Node[] = [
      {
        id: 'domain',
        position: { x: 400, y: 300 },
        width: 500,
        height: 300,
        measured: { width: 500, height: 300 },
        data: {},
      },
      {
        id: 'nested-source',
        parentId: 'domain',
        position: { x: 40, y: 60 },
        width: 100,
        height: 60,
        measured: { width: 100, height: 60 },
        data: {},
      },
      {
        id: 'nested-target',
        parentId: 'domain',
        position: { x: 260, y: 60 },
        width: 100,
        height: 60,
        measured: { width: 100, height: 60 },
        data: {},
      },
    ];
    const nestedEdges: Edge[] = [{
      id: 'nested-edge',
      source: 'nested-source',
      target: 'nested-target',
      sourceHandle: 'right',
      targetHandle: 'left',
      type: 'advanced-smart-step',
      data: {},
    }];
    const projected = projectBaseReactFlowDisplayWorkerInput({
      edges: nestedEdges,
      nodes: nestedNodes,
    });
    const committed = commitBaseReactFlowStagedLayoutRoutingResult({
      sourceEdges: nestedEdges,
      sourceNodes: nestedNodes,
      workerResult: {
        projectedEdges: projected.edges,
        edges: [{
          ...projected.edges[0],
          type: 'stablePath',
          data: {
            computedPath: [{ x: 540, y: 390 }, { x: 660, y: 390 }],
          },
        }],
        hardClean: true,
        routeResolution: 'full-route',
        phaseTrace: [],
      },
    });

    expect(committed).not.toBeNull();
    const displayInput = projectBaseReactFlowDisplayWorkerInput({
      edges: committed!.routedEdges,
      nodes: nestedNodes,
    });
    const displayIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
      nodes: displayInput.nodes,
      edges: displayInput.edges,
      enableSmartEdges: true,
      smartEdgePadding: 20,
      isLargeGraph: false,
    });

    expect(readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: displayIdentity.cacheSignature,
      inputGeometryDigest: displayIdentity.geometryDigest,
      sourceEdges: committed!.routedEdges,
    })?.edges).toEqual(committed!.routedEdges);
  });
});
