import {
  EDGE_ROUTING_CACHE_VERSION,
  EDGE_ROUTING_VISUAL_VERSION,
} from './routingVersion';
import { ROUTING_IDENTIFIER_MAX_LENGTH } from './routingBoundaryLimits';

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
}>;

const issuedAuthorities = new WeakSet<object>();

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
  authorizedEdgeIds,
}: {
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  hardReportDigest: string;
  authorizedEdgeIds: Iterable<string>;
}): DisplayRoutingRenderAuthority | null => {
  if (
    !INPUT_SIGNATURE_PATTERN.test(inputSignature)
    || !GEOMETRY_DIGEST_PATTERN.test(inputGeometryDigest)
    || !OUTPUT_SIGNATURE_PATTERN.test(outputRouteSignature)
    || !HARD_REPORT_DIGEST_PATTERN.test(hardReportDigest)
  ) return null;
  const edgeIds = new Set<string>();
  for (const edgeId of authorizedEdgeIds) {
    if (!isBoundedEdgeId(edgeId)) return null;
    edgeIds.add(edgeId);
    if (edgeIds.size > MAX_AUTHORIZED_EDGE_IDS) return null;
  }
  if (edgeIds.size === 0) return null;
  const authority: DisplayRoutingRenderAuthority = Object.freeze({
    routingVersion: EDGE_ROUTING_CACHE_VERSION,
    visualVersion: EDGE_ROUTING_VISUAL_VERSION,
    inputSignature,
    inputGeometryDigest,
    outputRouteSignature,
    hardReportDigest,
    authorizedEdgeIds: edgeIds,
  });
  issuedAuthorities.add(authority);
  return authority;
};

export const displayRoutingRenderAuthorityAllowsEdge = (
  authority: unknown,
  edgeId: unknown,
): boolean => (
  Boolean(authority && typeof authority === 'object')
  && issuedAuthorities.has(authority as object)
  && isBoundedEdgeId(edgeId)
  && (authority as DisplayRoutingRenderAuthority).authorizedEdgeIds.has(edgeId)
);
