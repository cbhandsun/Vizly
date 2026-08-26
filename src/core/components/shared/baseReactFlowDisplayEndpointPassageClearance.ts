import type { Edge, Node } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  MINIMUM_BUSINESS_NODE_CLEARANCE,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { createNodeClearanceGraphEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { createAtomicRouteTransactionEvaluation } from './baseReactFlowDisplayAtomicTransactionEvaluation';
import { createDisplayDeclaredAxisMismatchCounter } from './baseReactFlowDisplayDeclaredAxisTransaction';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';

const EPSILON = 0.5;
const MAX_EDGES = 256;
const MAX_NODES = 256;
const MAX_PATH_POINTS = 128;
const MAX_RISK_EDGES = 8;
const MAX_SHIFT_CANDIDATES = 64;

export type DisplayEndpointPassageClearanceOptions = Readonly<{
  diagnostics?: DisplayEndpointPassageClearanceDiagnostics;
  eligibleEdgeIds?: ReadonlySet<string>;
}>;

export type DisplayEndpointPassageClearanceDiagnostics = {
  acceptedCandidateCount: number;
  commercialImprovementCount: number;
  generatedShiftCandidateCount: number;
  ladderCandidateCount: number;
  maximumShiftedCrossingCount: number;
  sharedEndpointCandidateCount: number;
  singlePeerCrossingCandidateCount: number;
};

const resetDiagnostics = (
  diagnostics: DisplayEndpointPassageClearanceDiagnostics | undefined,
): void => {
  if (!diagnostics) return;
  diagnostics.acceptedCandidateCount = 0;
  diagnostics.commercialImprovementCount = 0;
  diagnostics.generatedShiftCandidateCount = 0;
  diagnostics.ladderCandidateCount = 0;
  diagnostics.maximumShiftedCrossingCount = 0;
  diagnostics.sharedEndpointCandidateCount = 0;
  diagnostics.singlePeerCrossingCandidateCount = 0;
};

const pathIsBounded = (path: readonly DisplayPoint[]): boolean => path.length >= 2
  && path.length <= MAX_PATH_POINTS
  && path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));

const rangesOverlap = (firstA: number, firstB: number, secondA: number, secondB: number): boolean => (
  Math.max(Math.min(firstA, firstB), Math.min(secondA, secondB))
    < Math.min(Math.max(firstA, firstB), Math.max(secondA, secondB)) - EPSILON
);

const shiftedLaneForRect = (
  first: DisplayPoint,
  second: DisplayPoint,
  rect: DisplayRect,
): Readonly<{ axis: 'h' | 'v'; lane: number }> | null => {
  const axis = displayAxisOf(first, second);
  if (axis === 'h' && rangesOverlap(first.x, second.x, rect.x, rect.x + rect.width)) {
    const bottom = rect.y + rect.height;
    if (first.y < rect.y - EPSILON
      && rect.y - first.y < COMMERCIAL_BUSINESS_NODE_CLEARANCE - EPSILON) {
      return { axis, lane: rect.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE };
    }
    if (first.y > bottom + EPSILON
      && first.y - bottom < COMMERCIAL_BUSINESS_NODE_CLEARANCE - EPSILON) {
      return { axis, lane: bottom + COMMERCIAL_BUSINESS_NODE_CLEARANCE };
    }
  }
  if (axis === 'v' && rangesOverlap(first.y, second.y, rect.y, rect.y + rect.height)) {
    const right = rect.x + rect.width;
    if (first.x < rect.x - EPSILON
      && rect.x - first.x < COMMERCIAL_BUSINESS_NODE_CLEARANCE - EPSILON) {
      return { axis, lane: rect.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE };
    }
    if (first.x > right + EPSILON
      && first.x - right < COMMERCIAL_BUSINESS_NODE_CLEARANCE - EPSILON) {
      return { axis, lane: right + COMMERCIAL_BUSINESS_NODE_CLEARANCE };
    }
  }
  return null;
};

const shiftSegmentToLane = (
  edge: Edge,
  segmentIndex: number,
  axis: 'h' | 'v',
  lane: number,
): Edge | null => {
  const path = getDisplayComputedPath(edge);
  if (!pathIsBounded(path) || segmentIndex < 1 || segmentIndex > path.length - 3) return null;
  const shifted = path.map(point => ({ ...point }));
  if (axis === 'h') {
    shifted[segmentIndex].y = lane;
    shifted[segmentIndex + 1].y = lane;
  } else {
    shifted[segmentIndex].x = lane;
    shifted[segmentIndex + 1].x = lane;
  }
  return withDisplayComputedPath(edge, shifted);
};

const sharedEndpointRole = (
  first: Edge,
  second: Edge,
): 'source' | 'target' | null => {
  if (first.source === second.source) return 'source';
  if (first.target === second.target) return 'target';
  return null;
};

/**
 * Collapses a five-segment endpoint ladder onto its already-safe outer lane.
 * The crossing segment must be the second normal leg from the shared endpoint;
 * this intentionally excludes arbitrary interior zigzags.
 */
const collapseCrossedEndpointLadder = (
  edge: Edge,
  role: 'source' | 'target',
  crossingSegmentIndex: number,
): Edge | null => {
  const path = getDisplayComputedPath(edge);
  if (!pathIsBounded(path) || path.length < 6) return null;
  const oriented = role === 'source' ? path : [...path].reverse();
  const orientedCrossingIndex = role === 'source'
    ? crossingSegmentIndex
    : path.length - 2 - crossingSegmentIndex;
  if (orientedCrossingIndex !== 3) return null;
  const axes = Array.from({ length: 5 }, (_, index) => (
    displayAxisOf(oriented[index], oriented[index + 1])
  ));
  if (
    !axes.every(Boolean)
    || axes[0] !== axes[2]
    || axes[0] !== axes[4]
    || axes[1] !== axes[3]
    || axes[0] === axes[1]
  ) return null;
  const bridge = axes[0] === 'h'
    ? { x: oriented[1].x, y: oriented[5].y }
    : { x: oriented[5].x, y: oriented[1].y };
  const collapsed = [oriented[0], oriented[1], bridge, ...oriented.slice(5)]
    .map(point => ({ ...point }));
  return withDisplayComputedPath(edge, role === 'source' ? collapsed : collapsed.reverse());
};

const totalClearanceRisk = (
  edges: readonly Edge[],
  score: ReturnType<typeof createNodeClearanceGraphEvaluationContext>,
  clearance: number,
): number => edges.reduce((total, edge) => (
  total + score.score(getDisplayComputedPath(edge), edge, clearance)
), 0);

/**
 * Builds bounded two-edge transactions for the case where clearing a business
 * node moves a corridor across a sibling endpoint ladder. The risky corridor
 * and sibling bridge are committed together; neither transient geometry is
 * observable outside this function.
 */
export const buildBaseReactFlowDisplayEndpointPassageClearanceCandidates = <
  T extends Edge[],
>(
  edges: T,
  nodes: Node[],
  options: DisplayEndpointPassageClearanceOptions = {},
): T[] => {
  resetDiagnostics(options.diagnostics);
  if (
    edges.length === 0
    || nodes.length === 0
    || edges.length > MAX_EDGES
    || nodes.length > MAX_NODES
    || options.eligibleEdgeIds?.size === 0
  ) return [];
  const paths = edges.map(getDisplayComputedPath);
  if (paths.some(path => !pathIsBounded(path))) return [];
  if (!getDisplayHardQualityGateReport(edges, nodes, 'polished').hardClean) return [];

  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  const baselineCommercial = totalClearanceRisk(
    edges,
    clearance,
    COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  );
  if (baselineCommercial <= EPSILON) return [];
  const baselineMinimum = totalClearanceRisk(
    edges,
    clearance,
    MINIMUM_BUSINESS_NODE_CLEARANCE,
  );
  const baselineCrossings = findDisplayStrictCrossingHits(edges);
  if (baselineCrossings.length !== 0) return [];
  const obstacleRects = buildDisplayRoutingObstacles(nodes);
  const countAxisMismatches = createDisplayDeclaredAxisMismatchCounter(nodes);
  const baselineAxis = edges.map(countAxisMismatches);
  const atomic = createAtomicRouteTransactionEvaluation(edges, nodes);
  const riskyIndexes = edges.flatMap((edge, index) => (
    (!options.eligibleEdgeIds || options.eligibleEdgeIds.has(edge.id))
      && clearance.score(
        paths[index],
        edge,
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ) > EPSILON
      ? [index]
      : []
  )).slice(0, MAX_RISK_EDGES);
  const accepted: T[] = [];
  let generated = 0;

  for (const riskIndex of riskyIndexes) {
    const riskEdge = edges[riskIndex];
    const path = paths[riskIndex];
    for (let segmentIndex = 1; segmentIndex < path.length - 2; segmentIndex += 1) {
      for (const [nodeId, rect] of obstacleRects) {
        if (nodeId === riskEdge.source || nodeId === riskEdge.target) continue;
        const shift = shiftedLaneForRect(path[segmentIndex], path[segmentIndex + 1], rect);
        if (!shift || generated >= MAX_SHIFT_CANDIDATES) continue;
        generated += 1;
        if (options.diagnostics) options.diagnostics.generatedShiftCandidateCount += 1;
        const shiftedEdge = shiftSegmentToLane(
          riskEdge,
          segmentIndex,
          shift.axis,
          shift.lane,
        );
        if (!shiftedEdge) continue;
        const shifted = edges.slice() as T;
        shifted[riskIndex] = shiftedEdge;
        if (totalClearanceRisk(
          shifted,
          clearance,
          COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        ) >= baselineCommercial - EPSILON) continue;
        if (options.diagnostics) options.diagnostics.commercialImprovementCount += 1;
        const crossings = findDisplayStrictCrossingHits(shifted);
        if (options.diagnostics) {
          options.diagnostics.maximumShiftedCrossingCount = Math.max(
            options.diagnostics.maximumShiftedCrossingCount,
            crossings.length,
          );
        }
        if (crossings.length === 0 || crossings.length > 2) continue;
        const peerSegments = crossings.flatMap(crossing => {
          if (crossing.a.edgeIndex === riskIndex && crossing.b.edgeIndex !== riskIndex) {
            return [crossing.b];
          }
          if (crossing.b.edgeIndex === riskIndex && crossing.a.edgeIndex !== riskIndex) {
            return [crossing.a];
          }
          return [];
        });
        const peerIndex = peerSegments[0]?.edgeIndex;
        if (
          peerIndex === undefined
          || peerSegments.length !== crossings.length
          || peerSegments.some(segment => segment.edgeIndex !== peerIndex)
        ) continue;
        if (options.diagnostics) options.diagnostics.singlePeerCrossingCandidateCount += 1;
        const peerEdge = edges[peerIndex];
        const role = sharedEndpointRole(riskEdge, peerEdge);
        if (!role) continue;
        if (options.diagnostics) options.diagnostics.sharedEndpointCandidateCount += 1;
        const bridgedPeer = peerSegments.reduce<Edge | null>((acceptedBridge, peerSegment) => (
          acceptedBridge ?? collapseCrossedEndpointLadder(
            peerEdge,
            role,
            peerSegment.segmentIndex,
          )
        ), null);
        if (!bridgedPeer) continue;
        if (options.diagnostics) options.diagnostics.ladderCandidateCount += 1;
        const candidate = shifted.slice() as T;
        candidate[peerIndex] = bridgedPeer;
        const changedIndexes = [riskIndex, peerIndex].sort((first, second) => first - second);
        const candidateCommercial = totalClearanceRisk(
          candidate,
          clearance,
          COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        );
        const candidateMinimum = totalClearanceRisk(
          candidate,
          clearance,
          MINIMUM_BUSINESS_NODE_CLEARANCE,
        );
        if (
          candidateCommercial >= baselineCommercial - EPSILON
          || candidateMinimum > baselineMinimum + EPSILON
          || changedIndexes.some(index => (
            countAxisMismatches(candidate[index]) > baselineAxis[index]
          ))
        ) continue;
        const evaluation = atomic.evaluate(candidate, changedIndexes);
        if (
          !evaluation.hardQualityDoesNotRegress
          || !evaluation.obstacleHitsDoNotRegress
          || !evaluation.terminalsAnchored
          || !evaluation.trunksPreserved
          || !getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean
        ) continue;
        accepted.push(candidate);
        if (options.diagnostics) options.diagnostics.acceptedCandidateCount += 1;
      }
    }
  }
  return accepted;
};

export const repairBaseReactFlowDisplayEndpointPassageClearance = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: DisplayEndpointPassageClearanceOptions = {},
): T => buildBaseReactFlowDisplayEndpointPassageClearanceCandidates(edges, nodes, options)[0]
  ?? edges;
