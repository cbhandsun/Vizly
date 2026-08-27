import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { EDGE_ROUTING_WORKER_PROTOCOL_VERSION } from '../../../routing/routingVersion';
import { readDisplayRoutingRenderSessionContract } from '../../../routing/displayRoutingRenderAuthority';
import { createDisplayRoutingIdentity } from '../../../routing/routingSessionIdentity';
import { computeBaseReactFlowDisplayOutputRouteSignature } from '../baseReactFlowDisplayCache';
import {
  clearBaseReactFlowDisplayCommittedSnapshots,
  commitBaseReactFlowDisplaySnapshot,
  readBaseReactFlowDisplayCommittedSnapshot,
} from '../baseReactFlowDisplayCommittedSnapshot';
import { computeBaseReactFlowDisplayInputIdentityBundle } from '../baseReactFlowDisplayInputIdentity';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';
import { projectBaseReactFlowDisplayWorkerInput } from '../baseReactFlowDisplayWorkerProjection';
import {
  createBaseReactFlowCommittedRenderAuthority,
  resolveBaseReactFlowActiveRenderAuthority,
} from '../useBaseReactFlowDisplayRenderAuthority';
import { createTestDisplayHardReport } from './baseReactFlowDisplayWorkerTestFixtures';

const nodes: Node[] = [
  {
    id: 'source',
    position: { x: 0, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
  {
    id: 'target',
    position: { x: 240, y: 0 },
    measured: { width: 100, height: 60 },
    data: {},
  },
];
const sourceEdges: Edge[] = [{
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
  type: 'advanced-smart-step',
  data: {},
}];
const routedEdges: Edge[] = [{
  ...sourceEdges[0],
  type: 'stablePath',
  data: {
    computedPath: [{ x: 100, y: 30 }, { x: 240, y: 30 }],
    elkPath: [{ x: 100, y: 30 }, { x: 170, y: 40 }, { x: 240, y: 30 }],
    treeRouting: {
      points: [{ x: 100, y: 30 }, { x: 170, y: 20 }, { x: 240, y: 30 }],
    },
  },
}];

const commitSnapshot = (includeWorkerSession = true) => {
  const projected = projectBaseReactFlowDisplayWorkerInput({ edges: sourceEdges, nodes });
  const inputIdentity = computeBaseReactFlowDisplayInputIdentityBundle({
    nodes: projected.nodes,
    edges: projected.edges,
    enableSmartEdges: true,
    smartEdgePadding: 20,
    isLargeGraph: false,
  });
  const identity = createDisplayRoutingIdentity(
    inputIdentity.cacheSignature,
    inputIdentity.geometryDigest,
  );
  const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges);
  const displayPatches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
  if (!outputRouteSignature || !displayPatches) throw new Error('expected routing identity');
  return commitBaseReactFlowDisplaySnapshot({
    inputSignature: identity.inputSignature,
    inputGeometryDigest: identity.inputGeometryDigest,
    sourceEdges,
    sourceNodes: nodes,
    displayPatches,
    outputRouteSignature,
    hardReport: createTestDisplayHardReport(true, 140),
    ...(includeWorkerSession ? {
      workerSessionRef: {
        sessionId: 'display-session-v1:1',
        identity,
        outputRouteSignature,
      },
    } : {}),
  });
};

describe('BaseReactFlow committed render authority', () => {
  beforeEach(() => clearBaseReactFlowDisplayCommittedSnapshots());

  it('issues the same protocol, identity, hard-report and Worker session proof', () => {
    const baseline = commitSnapshot();
    if (!baseline) throw new Error('expected committed snapshot');
    const authority = createBaseReactFlowCommittedRenderAuthority(baseline, routedEdges);
    const session = readDisplayRoutingRenderSessionContract(authority);

    expect(authority?.protocolVersion).toBe(EDGE_ROUTING_WORKER_PROTOCOL_VERSION);
    expect(session).toMatchObject({
      protocolVersion: EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
      identity: baseline.identity,
      outputRouteSignature: baseline.outputRouteSignature,
      hardReportDigest: baseline.hardReportDigest,
      workerSessionRef: baseline.workerSessionRef,
    });
  });

  it('rejects reconstructed baselines and snapshots without Worker session proof', () => {
    const baseline = commitSnapshot();
    const digestOnlyBaseline = commitSnapshot(false);
    if (!baseline || !digestOnlyBaseline) throw new Error('expected committed snapshots');

    expect(createBaseReactFlowCommittedRenderAuthority({ ...baseline }, routedEdges)).toBeNull();
    expect(createBaseReactFlowCommittedRenderAuthority(
      digestOnlyBaseline,
      routedEdges,
    )).toBeNull();
  });

  it('trusts a store replay but rejects any routing geometry mutation', () => {
    const baseline = commitSnapshot();
    if (!baseline) throw new Error('expected committed snapshot');
    const replay = readBaseReactFlowDisplayCommittedSnapshot({
      inputSignature: baseline.inputSignature,
      inputGeometryDigest: baseline.inputGeometryDigest,
      sourceEdges,
    });
    if (!replay) throw new Error('expected committed snapshot replay');

    expect(createBaseReactFlowCommittedRenderAuthority(replay.baseline, replay.edges)).not.toBeNull();
    expect(createBaseReactFlowCommittedRenderAuthority(replay.baseline, replay.edges.map(edge => ({
      ...edge,
      targetHandle: 'right',
    })))).toBeNull();
    expect(createBaseReactFlowCommittedRenderAuthority(replay.baseline, replay.edges.map(edge => ({
      ...edge,
      style: { stroke: '#123456' },
      markerStart: { type: 'arrowclosed' },
      markerEnd: { type: 'arrow' },
      label: 'latest business label',
      selected: true,
    })))).not.toBeNull();
  });

  it('reports the exact boundary that rejects an active render authority', () => {
    const baseline = commitSnapshot();
    if (!baseline) throw new Error('expected committed snapshot');
    const committedRenderAuthority = createBaseReactFlowCommittedRenderAuthority(
      baseline,
      routedEdges,
    );
    if (!committedRenderAuthority) throw new Error('expected committed render authority');
    const resolve = (override: Partial<Parameters<
      typeof resolveBaseReactFlowActiveRenderAuthority
    >[0]> = {}) => resolveBaseReactFlowActiveRenderAuthority({
      committedRenderAuthority,
      inputSignature: baseline.inputSignature,
      inputGeometryDigest: baseline.inputGeometryDigest,
      displayedEdges: routedEdges,
      ...override,
    });

    expect(resolve()).toEqual({ authority: committedRenderAuthority, status: 'accepted' });
    expect(resolve({ committedRenderAuthority: null }).status).toBe('missing-commit');
    expect(resolve({ inputSignature: '9999' }).status).toBe('input-signature-mismatch');
    expect(resolve({
      inputGeometryDigest: `geometry-v1:${'b'.repeat(32)}`,
    }).status).toBe('input-geometry-mismatch');
    expect(resolve({
      displayedEdges: routedEdges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          computedPath: [{ x: 100, y: 30 }, { x: 260, y: 30 }],
        },
      })),
    }).status).toBe('output-signature-mismatch');
  });
});
