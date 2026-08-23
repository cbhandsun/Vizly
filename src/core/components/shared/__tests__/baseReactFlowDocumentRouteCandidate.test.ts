import type { Edge } from '@xyflow/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createPersistedRoutingCandidate,
  createRoutingOnlyDocumentSnapshot,
} from '../../../routing/persistedRoutingCandidate';
import {
  clearRoutingOnlyDocumentCandidates,
  registerRoutingOnlyDocumentCandidate,
} from '../../../routing/routingDocumentCandidateRegistry';
import { EDGE_ROUTING_CACHE_VERSION } from '../../../routing/routingVersion';
import {
  computeBaseReactFlowDisplayOutputRouteSignature,
} from '../baseReactFlowDisplayCache';
import { loadBaseReactFlowDocumentRouteCandidate } from '../baseReactFlowDocumentRouteCandidate';
import { createBaseReactFlowDisplayEdgePatches } from '../baseReactFlowDisplayRoutingTransaction';

afterEach(() => clearRoutingOnlyDocumentCandidates());

describe('baseReactFlowDocumentRouteCandidate', () => {
  it('replays only routing-owned geometry onto current business presentation', () => {
    const sourceEdges: Edge[] = [{
      id: 'edge-1',
      source: 'source',
      target: 'target',
      label: 'current label',
      markerEnd: 'current marker',
      data: { owner: 'current owner' },
    }];
    const routedEdges: Edge[] = [{
      ...sourceEdges[0],
      type: 'stablePath',
      data: {
        ...sourceEdges[0].data,
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
    }];
    const patches = createBaseReactFlowDisplayEdgePatches(sourceEdges, routedEdges);
    const outputRouteSignature = computeBaseReactFlowDisplayOutputRouteSignature(routedEdges);
    if (!patches || !outputRouteSignature) throw new Error('expected a valid route fixture');
    const candidate = createPersistedRoutingCandidate({
      routingVersion: EDGE_ROUTING_CACHE_VERSION,
      inputSignature: '1122',
      inputGeometryDigest: `geometry-v1:${'2'.repeat(32)}`,
      outputRouteSignature,
      writtenAt: 42,
      patches,
    });
    if (!candidate) throw new Error('expected a valid persisted candidate fixture');
    const snapshot = createRoutingOnlyDocumentSnapshot(candidate);
    expect(registerRoutingOnlyDocumentCandidate(snapshot)).toBe(true);

    const merged = loadBaseReactFlowDocumentRouteCandidate({
      inputSignature: candidate.inputSignature,
      inputGeometryDigest: candidate.inputGeometryDigest,
      sourceEdges,
    });

    expect(merged?.[0]).toMatchObject({
      label: 'current label',
      markerEnd: 'current marker',
      type: 'stablePath',
      data: {
        owner: 'current owner',
        computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
    });
    expect(loadBaseReactFlowDocumentRouteCandidate({
      inputSignature: '1123',
      inputGeometryDigest: candidate.inputGeometryDigest,
      sourceEdges,
    })).toBeNull();
  });
});
