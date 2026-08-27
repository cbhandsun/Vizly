import {
  createDisplayRoutingRenderAuthority,
  type DisplayRoutingAuthorizedEdgeGeometry,
  type DisplayRoutingRenderAuthority,
} from '../displayRoutingRenderAuthority';
import { createDisplayRoutingIdentity } from '../routingSessionIdentity';
import type { RoutingHardReport } from '../routingHardReport';

export const TEST_ROUTING_HARD_REPORT: RoutingHardReport = {
  candidate: 'polished',
  hardClean: true,
  obstacleHits: 0,
  terminalsAttached: true,
  terminalsAnchored: true,
  minimumClearanceViolations: 0,
  minimumClearanceViolationEdgeIds: [],
  commercialClearanceViolations: 0,
  quality: {
    nonOrthogonalSegments: 0,
    strictCrossings: 0,
    reverseOverlap: 0,
    unrelatedOverlap: 0,
    relatedOverlap: 0,
    unexplainedRelatedOverlap: 0,
    shortEndpointStubs: 0,
    tinyInteriorDoglegs: 0,
    hairpins: 0,
    backtrackPenalty: 0,
    detourPenalty: 0,
    bends: 0,
    totalLength: 100,
  },
};

export const createTestDisplayRoutingRenderAuthority = ({
  inputSignature = '1234',
  inputGeometryDigest = `geometry-v1:${'a'.repeat(32)}`,
  outputRouteSignature = 'route-v2:1:2:0123456789abcdef',
  hardReport = TEST_ROUTING_HARD_REPORT,
  authorizedEdges,
  sessionId = 'display-session-v1:1',
}: {
  inputSignature?: string;
  inputGeometryDigest?: string;
  outputRouteSignature?: string;
  hardReport?: RoutingHardReport;
  authorizedEdges: Iterable<Readonly<{
    edgeId: string;
    computedPath: object;
  }> & Partial<Omit<DisplayRoutingAuthorizedEdgeGeometry, 'edgeId' | 'computedPath'>>>;
  sessionId?: string;
}): DisplayRoutingRenderAuthority | null => {
  const identity = createDisplayRoutingIdentity(inputSignature, inputGeometryDigest);
  return createDisplayRoutingRenderAuthority({
    inputSignature,
    inputGeometryDigest,
    outputRouteSignature,
    hardReport,
    authorizedEdges: [...authorizedEdges].map(edge => ({
      source: 'source',
      target: 'target',
      sourceHandle: null,
      targetHandle: null,
      rendererType: 'stablePath',
      ...edge,
    })),
    workerSessionRef: { sessionId, identity, outputRouteSignature },
  });
};
