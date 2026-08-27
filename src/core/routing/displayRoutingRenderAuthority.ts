import {
  EDGE_ROUTING_CACHE_VERSION,
  EDGE_ROUTING_VISUAL_VERSION,
  EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
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
import {
  cloneRoutingHardReport,
  computeDisplayRoutingHardReportDigest,
  type RoutingHardReport,
} from './routingHardReport';

const MAX_AUTHORIZED_EDGE_IDS = 300;
const MAX_AUTHORIZED_PATH_POINTS = 512;
const MAX_AUTHORIZED_ABS_COORDINATE = 1_000_000_000;
const INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;
const GEOMETRY_DIGEST_PATTERN = /^geometry-v1:[0-9a-f]{32}$/;
const OUTPUT_SIGNATURE_PATTERN = /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/;

export type DisplayRoutingRenderAuthority = Readonly<{
  protocolVersion: typeof EDGE_ROUTING_WORKER_PROTOCOL_VERSION;
  routingVersion: typeof EDGE_ROUTING_CACHE_VERSION;
  visualVersion: typeof EDGE_ROUTING_VISUAL_VERSION;
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  hardReportDigest: string;
  hardReport: RoutingHardReport;
  authorizedEdgeIds: ReadonlySet<string>;
  session: DisplayRoutingRenderSessionContract;
}>;

export type DisplayRoutingRenderSessionContract = Readonly<{
  schema: 'vizly-routing-session-render-v1';
  protocolVersion: typeof EDGE_ROUTING_WORKER_PROTOCOL_VERSION;
  identity: RoutingIdentity;
  outputRouteSignature: string;
  hardReportDigest: string;
  hardReport: RoutingHardReport;
  workerSessionRef: RoutingWorkerSessionRef;
}>;

export type DisplayRoutingAuthorizedEdgeGeometry = Readonly<{
  edgeId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  rendererType: string | null;
  computedPath: readonly DisplayRoutingRenderPoint[];
}>;

export type DisplayRoutingRenderPoint = Readonly<{ x: number; y: number }>;

export type DisplayRoutingRenderEdgeClaim = Readonly<{
  edgeId: unknown;
  source: unknown;
  target: unknown;
  sourceHandle: unknown;
  targetHandle: unknown;
  rendererType: unknown;
  computedPath: unknown;
}>;

const issuedAuthorities = new WeakMap<object, Readonly<{
  authorizedEdgeGeometry: ReadonlyMap<string, DisplayRoutingAuthorizedEdgeGeometry>;
  session: DisplayRoutingRenderSessionContract;
}>>();

const isBoundedEdgeId = (value: unknown): value is string => (
  typeof value === 'string'
  && value.length > 0
  && value.length <= ROUTING_IDENTIFIER_MAX_LENGTH
);
const isBoundedOptionalToken = (value: unknown): value is string | null => (
  value === null || isBoundedEdgeId(value)
);

const isDisplayRoutingRenderPoint = (value: unknown): value is DisplayRoutingRenderPoint => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return typeof point.x === 'number'
    && Number.isFinite(point.x)
    && Math.abs(point.x) <= MAX_AUTHORIZED_ABS_COORDINATE
    && typeof point.y === 'number'
    && Number.isFinite(point.y)
    && Math.abs(point.y) <= MAX_AUTHORIZED_ABS_COORDINATE;
};

const cloneDisplayRoutingRenderPath = (
  value: unknown,
): readonly DisplayRoutingRenderPoint[] | null => {
  if (
    !Array.isArray(value)
    || value.length < 2
    || value.length > MAX_AUTHORIZED_PATH_POINTS
    || !value.every(isDisplayRoutingRenderPoint)
  ) return null;
  return Object.freeze(value.map(point => Object.freeze({ x: point.x, y: point.y })));
};

const displayRoutingRenderPathsMatch = (
  expected: readonly DisplayRoutingRenderPoint[],
  actual: unknown,
): boolean => (
  Array.isArray(actual)
  && actual.length === expected.length
  && actual.length >= 2
  && actual.length <= MAX_AUTHORIZED_PATH_POINTS
  && actual.every((point, index) => (
    isDisplayRoutingRenderPoint(point)
    && point.x === expected[index]?.x
    && point.y === expected[index]?.y
  ))
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
  hardReport,
  authorizedEdges,
  workerSessionRef,
}: {
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  hardReport: RoutingHardReport;
  authorizedEdges: Iterable<DisplayRoutingAuthorizedEdgeGeometry>;
  workerSessionRef: RoutingWorkerSessionRef;
}): DisplayRoutingRenderAuthority | null => {
  if (
    !INPUT_SIGNATURE_PATTERN.test(inputSignature)
    || !GEOMETRY_DIGEST_PATTERN.test(inputGeometryDigest)
    || !OUTPUT_SIGNATURE_PATTERN.test(outputRouteSignature)
  ) return null;
  const safeHardReport = cloneRoutingHardReport(hardReport);
  if (!safeHardReport || !safeHardReport.hardClean) return null;
  const hardReportDigest = computeDisplayRoutingHardReportDigest(safeHardReport);
  const identity = createDisplayRoutingIdentity(inputSignature, inputGeometryDigest);
  const safeWorkerSessionRef = isDisplayRoutingWorkerSessionRef(workerSessionRef)
    && displayRoutingIdentitiesMatch(workerSessionRef.identity, identity)
    && workerSessionRef.outputRouteSignature === outputRouteSignature
    ? workerSessionRef
    : null;
  if (!safeWorkerSessionRef) return null;
  const edgeGeometry = new Map<string, DisplayRoutingAuthorizedEdgeGeometry>();
  for (const edge of authorizedEdges) {
    const { edgeId, source, target, sourceHandle, targetHandle, rendererType, computedPath } = edge;
    if (
      !isBoundedEdgeId(edgeId)
      || !isBoundedEdgeId(source)
      || !isBoundedEdgeId(target)
      || !isBoundedOptionalToken(sourceHandle)
      || !isBoundedOptionalToken(targetHandle)
      || !isBoundedOptionalToken(rendererType)
    ) return null;
    const safeComputedPath = cloneDisplayRoutingRenderPath(computedPath);
    if (!safeComputedPath) return null;
    edgeGeometry.set(edgeId, Object.freeze({
      edgeId,
      source,
      target,
      sourceHandle,
      targetHandle,
      rendererType,
      computedPath: safeComputedPath,
    }));
    if (edgeGeometry.size > MAX_AUTHORIZED_EDGE_IDS) return null;
  }
  if (edgeGeometry.size === 0) return null;
  const session: DisplayRoutingRenderSessionContract = Object.freeze({
    schema: 'vizly-routing-session-render-v1',
    protocolVersion: EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
    identity,
    outputRouteSignature,
    hardReportDigest,
    hardReport: safeHardReport,
    workerSessionRef: cloneDisplayRoutingWorkerSessionRef(safeWorkerSessionRef),
  });
  const authority: DisplayRoutingRenderAuthority = Object.freeze({
    protocolVersion: EDGE_ROUTING_WORKER_PROTOCOL_VERSION,
    routingVersion: EDGE_ROUTING_CACHE_VERSION,
    visualVersion: EDGE_ROUTING_VISUAL_VERSION,
    inputSignature,
    inputGeometryDigest,
    outputRouteSignature,
    hardReportDigest,
    hardReport: safeHardReport,
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
  claim: DisplayRoutingRenderEdgeClaim,
): boolean => {
  if (!authority || typeof authority !== 'object' || !isBoundedEdgeId(claim.edgeId)) {
    return false;
  }
  const expected = issuedAuthorities.get(authority)
    ?.authorizedEdgeGeometry.get(claim.edgeId);
  return Boolean(
    expected
    && expected.source === claim.source
    && expected.target === claim.target
    && expected.sourceHandle === claim.sourceHandle
    && expected.targetHandle === claim.targetHandle
    && expected.rendererType === claim.rendererType
    && displayRoutingRenderPathsMatch(expected.computedPath, claim.computedPath)
  );
};
