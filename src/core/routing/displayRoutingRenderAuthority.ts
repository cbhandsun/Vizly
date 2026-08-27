import {
  EDGE_ROUTING_CACHE_VERSION,
  EDGE_ROUTING_VISUAL_VERSION,
} from './routingVersion';
import { ROUTING_IDENTIFIER_MAX_LENGTH } from './routingBoundaryLimits';
import {
  cloneDisplayRoutingWorkerSessionRef,
  createDisplayRoutingIdentity,
  displayRoutingIdentitiesMatch,
  isDisplayRoutingWorkerSessionRef,
  type RoutingIdentity,
  type RoutingWorkerSessionRef,
} from './routingSessionIdentity';

const MAX_AUTHORIZED_EDGE_IDS = 300;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;
const GEOMETRY_DIGEST_PATTERN = /^geometry-v1:[0-9a-f]{32}$/;
const OUTPUT_SIGNATURE_PATTERN = /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/;
const HARD_REPORT_DIGEST_PATTERN = /^hard-report-v1:[0-9a-f]{16}$/;

export type DisplayRoutingRenderAuthority = Readonly<{
  routingVersion: typeof EDGE_ROUTING_CACHE_VERSION;
  visualVersion: typeof EDGE_ROUTING_VISUAL_VERSION;
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  hardReportDigest: string;
  authorizedEdgeIds: ReadonlySet<string>;
  session: DisplayRoutingRenderSessionContract;
}>;

export type DisplayRoutingRenderSessionContract = Readonly<{
  schema: 'vizly-routing-session-render-v1';
  identity: RoutingIdentity;
  outputRouteSignature: string;
  hardReportDigest: string;
  workerSessionRef?: RoutingWorkerSessionRef;
}>;

export type DisplayRoutingAuthorizedEdgeGeometry = Readonly<{
  edgeId: string;
  computedPath: object;
}>;

const issuedAuthorities = new WeakMap<object, Readonly<{
  authorizedEdgeGeometry: ReadonlyMap<string, object>;
  session: DisplayRoutingRenderSessionContract;
}>>();

const isBoundedEdgeId = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= ROUTING_IDENTIFIER_MAX_LENGTH
);

/**
 * Issues a realm-local rendering capability for one exact committed route.
 * The object is intentionally not serializable or reconstructible from an
 * external document/Worker message.
 */
export const createDisplayRoutingRenderAuthority = ({
  inputSignature,
  inputGeometryDigest,
  outputRouteSignature,
  hardReportDigest,
  authorizedEdges,
  workerSessionRef,
}: {
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  hardReportDigest: string;
  authorizedEdges: Iterable<DisplayRoutingAuthorizedEdgeGeometry>;
  workerSessionRef?: RoutingWorkerSessionRef;
}): DisplayRoutingRenderAuthority | null => {
  if (
    !INPUT_SIGNATURE_PATTERN.test(inputSignature)
    || !GEOMETRY_DIGEST_PATTERN.test(inputGeometryDigest)
    || !OUTPUT_SIGNATURE_PATTERN.test(outputRouteSignature)
    || !HARD_REPORT_DIGEST_PATTERN.test(hardReportDigest)
  ) return null;
  const identity = createDisplayRoutingIdentity(inputSignature, inputGeometryDigest);
  const safeWorkerSessionRef = typeof workerSessionRef === 'undefined'
    ? undefined
    : isDisplayRoutingWorkerSessionRef(workerSessionRef)
      && displayRoutingIdentitiesMatch(workerSessionRef.identity, identity)
      && workerSessionRef.outputRouteSignature === outputRouteSignature
      ? workerSessionRef
      : null;
  if (safeWorkerSessionRef === null) return null;
  const edgeGeometry = new Map<string, object>();
  for (const { edgeId, computedPath } of authorizedEdges) {
    if (!isBoundedEdgeId(edgeId)) return null;
    if (!Array.isArray(computedPath) || computedPath.length < 2) return null;
    edgeGeometry.set(edgeId, computedPath);
    if (edgeGeometry.size > MAX_AUTHORIZED_EDGE_IDS) return null;
  }
  if (edgeGeometry.size === 0) return null;
  const session: DisplayRoutingRenderSessionContract = Object.freeze({
    schema: 'vizly-routing-session-render-v1',
    identity,
    outputRouteSignature,
    hardReportDigest,
    ...(safeWorkerSessionRef
      ? { workerSessionRef: cloneDisplayRoutingWorkerSessionRef(safeWorkerSessionRef) }
      : {}),
  });
  const authority: DisplayRoutingRenderAuthority = Object.freeze({
    routingVersion: EDGE_ROUTING_CACHE_VERSION,
    visualVersion: EDGE_ROUTING_VISUAL_VERSION,
    inputSignature,
    inputGeometryDigest,
    outputRouteSignature,
    hardReportDigest,
    authorizedEdgeIds: new Set(edgeGeometry.keys()),
    session,
  });
  issuedAuthorities.set(authority, {
    authorizedEdgeGeometry: new Map(edgeGeometry),
    session,
  });
  return authority;
};

export const readDisplayRoutingRenderSessionContract = (
  authority: unknown,
): DisplayRoutingRenderSessionContract | null => (
  authority && typeof authority === 'object'
    ? issuedAuthorities.get(authority as object)?.session ?? null
    : null
);

export const displayRoutingRenderAuthorityAllowsEdge = (
  authority: unknown,
  edgeId: unknown,
  computedPath: unknown,
): boolean => (
  Boolean(authority && typeof authority === 'object')
  && isBoundedEdgeId(edgeId)
  && typeof computedPath === 'object'
  && computedPath !== null
  && issuedAuthorities.get(authority as object)?.authorizedEdgeGeometry.get(edgeId)
    === computedPath
);
