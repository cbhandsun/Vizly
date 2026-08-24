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
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

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
  const routingPatches: Edge[] = [{
    id: 'source-target',
    source: 'source',
    target: 'target',
    type: 'stablePath',
    data: {
      computedPath: [{ x: 100, y: 30 }, { x: 240, y: 30 }],
    },
  }];
  return {
    edges: [{
      ...projected.edges[0],
      type: 'stablePath',
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 240, y: 30 }],
      },
    }],
    routingPatches,
    projectedEdges: projected.edges,
    hardClean,
    hardReport: createTestDisplayHardReport(hardClean, 140),
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

  it('negotiates an automatic same-row ELK U route to facing terminals before Worker routing', () => {
    const elkPath = [
      { x: 50, y: 60 },
      { x: 50, y: 130 },
      { x: 290, y: 130 },
      { x: 290, y: 60 },
    ];
    const [seed] = seedBaseReactFlowStagedLayoutEdges({
      sourceNodes: nodes,
      sourceEdges: [{
        ...sourceEdges[0],
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        data: { elkPath, useElkRouting: true, layoutRoutingCandidate: true },
      }],
    });

    expect(seed).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        computedPath: [{ x: 100, y: 30 }, { x: 240, y: 30 }],
        terminalPortBridgeRepaired: true,
      },
    });
  });

  it('preserves source-authored terminal sides while seeding an ELK U route', () => {
    const elkPath = [
      { x: 50, y: 60 },
      { x: 50, y: 130 },
      { x: 290, y: 130 },
      { x: 290, y: 60 },
    ];
    const [seed] = seedBaseReactFlowStagedLayoutEdges({
      sourceNodes: nodes,
      sourceEdges: [{
        ...sourceEdges[0],
        sourceHandle: 'bottom',
        targetHandle: 'bottom',
        data: {
          elkPath,
          useElkRouting: true,
          layoutRoutingCandidate: true,
          manualHandleSides: ['source', 'target'],
        },
      }],
    });

    expect(seed).toMatchObject({
      sourceHandle: 'bottom',
      targetHandle: 'bottom',
      data: { computedPath: elkPath },
    });
  });

  it('negotiates the production mixed-side Pool A detour after geometry normalization', () => {
    const productionNodes: Node[] = [
      {
        id: 'check-limit', position: { x: 2232, y: 479 },
        measured: { width: 249, height: 96 }, data: {},
      },
      {
        id: 'pool-a-entry', position: { x: 2601, y: 695 },
        measured: { width: 217, height: 96 }, data: {},
      },
    ];
    const elkPath = [
      { x: 2232, y: 527 }, { x: 2184, y: 527 },
      { x: 2184, y: 839 }, { x: 2709.5, y: 839 },
      { x: 2709.5, y: 791 },
    ];
    const [seed] = seedBaseReactFlowStagedLayoutEdges({
      sourceNodes: productionNodes,
      sourceEdges: [{
        id: 'e5', source: 'check-limit', target: 'pool-a-entry',
        sourceHandle: 'left', targetHandle: 'bottom',
        data: { elkPath, layoutRoutingCandidate: true },
      }],
    });

    expect(seed).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { computedPath: [
        { x: 2481, y: 527 }, { x: 2541, y: 527 },
        { x: 2541, y: 743 }, { x: 2601, y: 743 },
      ] },
    });
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

  it('fails closed when a Worker result omits its routing-only patch transaction', () => {
    expect(commitBaseReactFlowStagedLayoutRoutingResult({
      sourceEdges,
      sourceNodes: projectedNodes,
      workerResult: {
        ...createWorkerResult(true),
        routingPatches: undefined as never,
      },
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
        routingPatches: [{
          id: 'nested-edge',
          source: 'nested-source',
          target: 'nested-target',
          type: 'stablePath',
          data: {
            computedPath: [{ x: 540, y: 390 }, { x: 660, y: 390 }],
          },
        }],
        hardClean: true,
        hardReport: createTestDisplayHardReport(true, 120),
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
