import type { Node } from '@xyflow/react';
import {
  cloneLayoutGeometryConstraints,
  evaluateLayoutGeometry,
  type LayoutGeometryConstraints,
  type LayoutGeometryReport,
} from './layoutGeometryConstraints';

export type LayoutRouteProof = Readonly<{ outputRouteSignature: string; hardReportDigest: string }>;
export type LayoutCandidateAcceptance = Readonly<{
  version: 1;
  constraints: LayoutGeometryConstraints;
  geometry: LayoutGeometryReport;
  route: LayoutRouteProof | null;
}>;
const issued = new WeakSet<object>();
const validProof = (proof: LayoutRouteProof | null): boolean => proof === null
  || (/^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(proof.outputRouteSignature)
    && /^hard-report-v1:[0-9a-f]{16}$/.test(proof.hardReportDigest));

/** An operation-scoped envelope preserves the Worker receipt unchanged while
 * binding its result to the exact geometry AND requested layout constraints. */
export const createLayoutCandidateAcceptance = (
  nodes: readonly Node[],
  constraints: LayoutGeometryConstraints | undefined,
  route: LayoutRouteProof | null,
): LayoutCandidateAcceptance | null => {
  const safeConstraints = cloneLayoutGeometryConstraints(constraints);
  if (!safeConstraints || !validProof(route)) return null;
  const geometry = evaluateLayoutGeometry(nodes, safeConstraints);
  if (!geometry.clean) return null;
  const acceptance: LayoutCandidateAcceptance = Object.freeze({
    version: 1, constraints: safeConstraints, geometry,
    route: route ? Object.freeze({ ...route }) : null,
  });
  issued.add(acceptance);
  return acceptance;
};

/** Rechecks immediately before the atomic write, including no-edge layouts.
 * A caller cannot reuse a good result after asynchronous geometry mutation. */
export const layoutCandidateAcceptanceMatches = (
  acceptance: LayoutCandidateAcceptance,
  nodes: readonly Node[],
  route: LayoutRouteProof | null,
): boolean => {
  if (!issued.has(acceptance) || !validProof(route)
    || acceptance.route?.outputRouteSignature !== route?.outputRouteSignature
    || acceptance.route?.hardReportDigest !== route?.hardReportDigest) return false;
  const next = evaluateLayoutGeometry(nodes, acceptance.constraints);
  return next.clean && next.geometryDigest === acceptance.geometry.geometryDigest;
};
