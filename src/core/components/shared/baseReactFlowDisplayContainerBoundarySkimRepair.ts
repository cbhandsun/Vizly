import type { Edge, Node } from '@xyflow/react';

import {
  auditDisplayContainerBoundarySkims,
  DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE,
  DISPLAY_CONTAINER_BOUNDARY_SKIM_TOLERANCE,
  hasRepairableDisplayContainerBoundarySkim,
  type DisplayContainerBoundarySkimIssue,
} from './baseReactFlowDisplayContainerBoundarySkim';
import {
  getDisplayComputedPath,
  segmentDisplayLength,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import { MIN_RENDER_SAFE_ENDPOINT_STUB } from './baseReactFlowDisplayEndpointStubMetrics';

export type DisplayContainerBoundarySkimRepairOptions = Readonly<{
  eligibleEdgeIds?: ReadonlySet<string>;
  maxPasses?: number;
  validateCandidate?: (context: Readonly<{
    baselineEdges: readonly Edge[];
    candidateEdges: readonly Edge[];
    changedEdgeIndex: number;
    baselineSkimLength: number;
    candidateSkimLength: number;
  }>) => boolean;
}>;

const clonePath = (path: readonly DisplayPoint[]): DisplayPoint[] => (
  path.map(point => ({ x: point.x, y: point.y }))
);

const interiorCoordinate = (
  path: readonly DisplayPoint[],
  issue: DisplayContainerBoundarySkimIssue,
): number => {
  const before = path[issue.segmentIndex - 1];
  const after = path[issue.segmentIndex + 2];
  if (!before || !after) return issue.safeCoordinate;
  const sign = issue.boundary === 'top' || issue.boundary === 'left' ? 1 : -1;
  const boundaryCoordinate = issue.safeCoordinate - (DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE * sign);
  const firstInterior = issue.axis === 'h' ? before.y : before.x;
  const secondInterior = issue.axis === 'h' ? after.y : after.x;
  if (!Number.isFinite(firstInterior) || !Number.isFinite(secondInterior)) return issue.safeCoordinate;
  if ((firstInterior - boundaryCoordinate) * sign <= DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE
    || (secondInterior - boundaryCoordinate) * sign <= DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE) {
    return issue.safeCoordinate;
  }
  const available = Math.min(
    Math.abs(firstInterior - boundaryCoordinate),
    Math.abs(secondInterior - boundaryCoordinate),
  );
  const offset = Math.max(DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE, Math.min(64, available / 2));
  return boundaryCoordinate + (offset * sign);
};

const candidateCoordinates = (
  path: readonly DisplayPoint[],
  issue: DisplayContainerBoundarySkimIssue,
): number[] => {
  const sign = issue.boundary === 'top' || issue.boundary === 'left' ? 1 : -1;
  const boundaryCoordinate = issue.safeCoordinate - (DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE * sign);
  const nearBoundary = boundaryCoordinate + ((DISPLAY_CONTAINER_BOUNDARY_SKIM_TOLERANCE + 2) * sign);
  const outsideBoundary = boundaryCoordinate - (DISPLAY_CONTAINER_BOUNDARY_SKIM_CLEARANCE * sign);
  const before = path[issue.segmentIndex - 1];
  const first = path[issue.segmentIndex];
  const second = path[issue.segmentIndex + 1];
  const after = path[issue.segmentIndex + 2];
  const safeEndpointStub = before && first && second && after ? Math.min(
    segmentDisplayLength(before, { ...first, [issue.axis === 'h' ? 'y' : 'x']: issue.safeCoordinate }),
    segmentDisplayLength(after, { ...second, [issue.axis === 'h' ? 'y' : 'x']: issue.safeCoordinate }),
  ) : MIN_RENDER_SAFE_ENDPOINT_STUB;
  const preferred = safeEndpointStub < MIN_RENDER_SAFE_ENDPOINT_STUB ? [outsideBoundary] : [];
  return [...new Set([...preferred, issue.safeCoordinate, nearBoundary, interiorCoordinate(path, issue)])];
};

const moveInteriorSegment = (
  edge: Edge,
  issue: DisplayContainerBoundarySkimIssue,
  coordinate: number,
): Edge | null => {
  const path = getDisplayComputedPath(edge);
  if (!hasRepairableDisplayContainerBoundarySkim(issue, edge)) return null;
  const nextPath = clonePath(path);
  const first = nextPath[issue.segmentIndex];
  const second = nextPath[issue.segmentIndex + 1];
  if (!first || !second) return null;
  if (issue.axis === 'v') {
    first.x = coordinate;
    second.x = coordinate;
  } else {
    first.y = coordinate;
    second.y = coordinate;
  }
  return withDisplayComputedPath(edge, nextPath);
};

const repairOneBoundarySkim = <T extends Edge[]>(
  edges: T,
  nodes: readonly Node[],
  options: DisplayContainerBoundarySkimRepairOptions,
): T => {
  const baselineAudit = auditDisplayContainerBoundarySkims(edges, nodes);
  if (baselineAudit.totalLength <= 0) return edges;
  const rankedIssues = [...baselineAudit.issues]
    .sort((first, second) => second.length - first.length || first.edgeIndex - second.edgeIndex);
  for (const issue of rankedIssues) {
    const edge = edges[issue.edgeIndex];
    if (!edge) continue;
    if (options.eligibleEdgeIds && !options.eligibleEdgeIds.has(edge.id)) continue;
    for (const coordinate of candidateCoordinates(getDisplayComputedPath(edge), issue)) {
      const candidateEdge = moveInteriorSegment(edge, issue, coordinate);
      if (!candidateEdge) continue;
      const candidate = edges.map((current, index) => (
        index === issue.edgeIndex ? candidateEdge : current
      )) as T;
      const candidateAudit = auditDisplayContainerBoundarySkims(candidate, nodes);
      if (candidateAudit.totalLength >= baselineAudit.totalLength) continue;
      if (options.validateCandidate && !options.validateCandidate({
        baselineEdges: edges,
        candidateEdges: candidate,
        changedEdgeIndex: issue.edgeIndex,
        baselineSkimLength: baselineAudit.totalLength,
        candidateSkimLength: candidateAudit.totalLength,
      })) continue;
      return candidate;
    }
  }
  return edges;
};

export const repairDisplayContainerBoundarySkims = <T extends Edge[]>(
  edges: T,
  nodes: readonly Node[],
  options: DisplayContainerBoundarySkimRepairOptions = {},
): T => {
  const maxPasses = Number.isSafeInteger(options.maxPasses)
    ? Math.max(1, Math.min(8, options.maxPasses ?? 1))
    : 3;
  let current = edges;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const next = repairOneBoundarySkim(current, nodes, options);
    if (next === current || next.every((edge, index) => edge === current[index])) return current;
    current = next;
  }
  return current;
};
