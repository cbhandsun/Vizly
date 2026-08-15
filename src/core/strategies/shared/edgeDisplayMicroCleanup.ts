import type { Edge } from '@xyflow/react';

import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityEvaluationState,
} from './edgeStrictCrossingGuard';

import {
  EPS,
  TINY_INTERIOR_SEGMENT,
  COMPOUND_CLEARANCES,
  RETURN_LOOP_CLEARANCES,
  SHARED_TRUNK_DETOUR_CLEARANCES,
  MAX_HAIRPIN_COLLAPSE_BRIDGE,
  resolveMicroCandidateBudget,
  getEdgePath,
  withComputedPath,
  axisOf,
  segmentLength,
  pathLength,
  pathDetourPenalty,
  segmentDirection,
  pathMicroMetrics,
  microCandidateRank,
  strictCrossingPairsForEdge,
  compactPath,
  hasSameEndpoints,
  samePoint,
  hasCompatibleDisplayEndpoints,
  allSegmentsOrthogonal,
  buildOuterDetourCollapseCandidates,
  buildShiftedSegmentPath,
  buildTerminalStubCandidate,
  buildTinySideStepContinuationCollapseCandidate,
  buildTinyParallelContinuationCollapseCandidate,
  buildTinyBridgeExtensionCandidates,
  buildTinySideStepLaneBypassCandidates,
  buildTinyEndpointBridgeCollapseCandidate,
} from './edgeDisplayMicroCleanupGeometry';

import type {
  Point,
} from './edgeDisplayMicroCleanupGeometry';
import { buildOuterPerimeterMicroCandidates } from './edgeDisplayMicroCleanupPerimeter';

const VISUAL_SMALL_INTERIOR_SEGMENT = 40;

const hasVisualSmallInteriorSegment = (points: Point[]): boolean => {
  for (let index = 1; index < points.length - 2; index += 1) {
    const length = segmentLength(points[index], points[index + 1]);
    if (length >= TINY_INTERIOR_SEGMENT && length < VISUAL_SMALL_INTERIOR_SEGMENT) return true;
  }
  return false;
};

export type DisplayMicroCleanupSafetyScore = Readonly<{
  obstacleHits: number;
  attachedTerminals: number;
  anchoredTerminals: number;
}>;

/**
 * Optional node-aware evaluator supplied by display composition code. The
 * micro-cleanup strategy remains geometry-only when this context is omitted.
 * `changedIndexes` is cumulative relative to the context baseline so the
 * evaluator can reuse per-edge obstacle and terminal snapshots exactly.
 */
export type DisplayMicroCleanupSafetyContext = Readonly<{
  baseline: DisplayMicroCleanupSafetyScore;
  evaluate: (
    candidateEdges: Edge[],
    changedIndexes?: readonly number[],
  ) => DisplayMicroCleanupSafetyScore;
}>;

export const displayMicroCleanupSafetyDoesNotRegress = (
  baseline: DisplayMicroCleanupSafetyScore,
  candidate: DisplayMicroCleanupSafetyScore,
): boolean => (
  Number.isFinite(candidate.obstacleHits)
  && Number.isFinite(candidate.attachedTerminals)
  && Number.isFinite(candidate.anchoredTerminals)
  && candidate.obstacleHits <= baseline.obstacleHits
  && candidate.attachedTerminals >= baseline.attachedTerminals
  && candidate.anchoredTerminals >= baseline.anchoredTerminals
);

import {
  buildTerminalStubSideApproachCandidates,
  buildConsecutiveTinyCornerCollapse,
  buildConsecutiveTinyCornerLaneCandidates,
  buildTrailingTinyStairCollapseCandidate,
  buildTinyInteriorBridgeCollapseCandidate,
  buildTinyInteriorBridgeLaneCandidates,
  buildTinyPreTerminalSideApproachCandidates,
  buildHairpinBridgeCollapseCandidates,
  buildTerminalHairpinEndpointSlideCandidate,
  buildStartHairpinSideLaneCandidate,
  buildSmallReturnBridgeLaneCandidates,
} from './edgeDisplayMicroCleanupCandidates';

function buildNearReturnContinuationCollapseCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  const f = points[index + 5];
  if (!a || !b || !c || !d || !e || !f) return null;

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  const fifthAxis = axisOf(e, f);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis || !fifthAxis) return null;
  if (firstAxis !== thirdAxis || firstAxis !== fifthAxis || secondAxis !== fourthAxis) return null;
  if (firstAxis === secondAxis) return null;

  const firstDirection = segmentDirection(a, b, firstAxis);
  const thirdDirection = segmentDirection(c, d, thirdAxis);
  if (firstDirection === 0 || firstDirection !== -thirdDirection) return null;
  if (segmentLength(b, c) > MAX_HAIRPIN_COLLAPSE_BRIDGE || segmentLength(d, e) > 520) return null;
  if (
    (index === 0 && segmentLength(a, b) < 112)
    || (index + 5 === points.length - 1 && segmentLength(e, f) < 112)
  ) {
    return null;
  }

  const nearReturnOffset = firstAxis === 'h' ? Math.abs(a.x - e.x) : Math.abs(a.y - e.y);
  if (nearReturnOffset > TINY_INTERIOR_SEGMENT) return null;

  const candidate = firstAxis === 'h'
    ? [
      ...points.slice(0, index + 1),
      { x: a.x, y: e.y },
      { x: f.x, y: e.y },
      ...points.slice(index + 6),
    ]
    : [
      ...points.slice(0, index + 1),
      { x: e.x, y: a.y },
      { x: e.x, y: f.y },
      ...points.slice(index + 6),
    ];
  const normalized = compactPath(candidate);
  if (!hasSameEndpoints(points, normalized) || !allSegmentsOrthogonal(normalized)) return null;
  if (pathLength(points) - pathLength(normalized) < 8) return null;
  return normalized;
}

function buildMonotonicStairCollapseCandidate(points: Point[], index: number): Point[] | null {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  if (!a || !b || !c || !d || !e) return null;

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis) return null;
  if (firstAxis !== thirdAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) return null;

  const firstDirection = segmentDirection(a, b, firstAxis);
  const thirdDirection = segmentDirection(c, d, thirdAxis);
  const secondDirection = segmentDirection(b, c, secondAxis);
  const fourthDirection = segmentDirection(d, e, fourthAxis);
  if (firstDirection === 0 || secondDirection === 0) return null;
  if (firstDirection !== thirdDirection || secondDirection !== fourthDirection) return null;

  const candidate = compactPath(firstAxis === 'v'
    ? [
      ...points.slice(0, index + 1),
      { x: a.x, y: e.y },
      e,
      ...points.slice(index + 5),
    ]
    : [
      ...points.slice(0, index + 1),
      { x: e.x, y: a.y },
      e,
      ...points.slice(index + 5),
    ]);
  if (!hasSameEndpoints(points, candidate) || !allSegmentsOrthogonal(candidate)) return null;
  if (candidate.length >= points.length) return null;
  if (pathLength(candidate) > pathLength(points) + EPS) return null;
  return candidate;
}

function buildReturnLoopCollapseCandidates(points: Point[], index: number): Point[][] {
  const a = points[index];
  const b = points[index + 1];
  const c = points[index + 2];
  const d = points[index + 3];
  const e = points[index + 4];
  const f = points[index + 5];
  if (!a || !b || !c || !d || !e || !f) return [];

  const firstAxis = axisOf(a, b);
  const secondAxis = axisOf(b, c);
  const thirdAxis = axisOf(c, d);
  const fourthAxis = axisOf(d, e);
  const fifthAxis = axisOf(e, f);
  if (!firstAxis || !secondAxis || !thirdAxis || !fourthAxis || !fifthAxis) return [];
  if (firstAxis !== thirdAxis || firstAxis !== fifthAxis || secondAxis !== fourthAxis || firstAxis === secondAxis) {
    return [];
  }

  const firstDirection = segmentDirection(a, b, firstAxis);
  const thirdDirection = segmentDirection(c, d, thirdAxis);
  const fifthDirection = segmentDirection(e, f, fifthAxis);
  const secondDirection = segmentDirection(b, c, secondAxis);
  const fourthDirection = segmentDirection(d, e, fourthAxis);
  if (firstDirection === 0 || secondDirection === 0) return [];
  if (firstDirection !== -thirdDirection || thirdDirection !== fifthDirection) return [];
  if (secondDirection !== -fourthDirection) return [];

  const originalSectionLength = segmentLength(a, b)
    + segmentLength(b, c)
    + segmentLength(c, d)
    + segmentLength(d, e);
  const candidates = RETURN_LOOP_CLEARANCES.map((clearance) => {
    const escape = firstAxis === 'v'
      ? { x: a.x, y: a.y + firstDirection * clearance }
      : { x: a.x + firstDirection * clearance, y: a.y };
    return compactPath(firstAxis === 'v'
      ? [
        ...points.slice(0, index + 1),
        escape,
        { x: e.x, y: escape.y },
        e,
        ...points.slice(index + 5),
      ]
      : [
        ...points.slice(0, index + 1),
        escape,
        { x: escape.x, y: e.y },
        e,
        ...points.slice(index + 5),
      ]);
  });

  return candidates.filter(candidate => (
    candidate.length >= 2
    && hasSameEndpoints(points, candidate)
    && allSegmentsOrthogonal(candidate)
    && candidate.length < points.length
    && pathLength(points) - pathLength(candidate) >= Math.min(32, originalSectionLength * 0.1)
  ));
}

function buildSharedSourceTrunkDetourCandidates(edges: Edge[], edgeIndex: number, points: Point[]): Point[][] {
  const edge = edges[edgeIndex];
  if (!edge || points.length < 4) return [];
  const terminalPivot = points[points.length - 2];
  const terminalEnd = points[points.length - 1];
  if (!terminalPivot || !terminalEnd || !axisOf(terminalPivot, terminalEnd)) return [];

  const originalLength = pathLength(points);
  const originalMetrics = pathMicroMetrics(points);
  const candidates: Point[][] = [];
  for (let peerIndex = 0; peerIndex < edges.length; peerIndex += 1) {
    if (peerIndex === edgeIndex) continue;
    const peer = edges[peerIndex];
    if (!peer || peer.source !== edge.source) continue;
    const peerPath = compactPath(getEdgePath(peer));
    if (peerPath.length < 4 || !samePoint(peerPath[0], points[0], 2)) continue;

    for (let trunkIndex = 1; trunkIndex < peerPath.length - 1; trunkIndex += 1) {
      const trunkStart = peerPath[trunkIndex];
      const trunkNext = peerPath[trunkIndex + 1];
      const trunkAxis = axisOf(trunkStart, trunkNext);
      if (!trunkAxis) continue;
      const trunkDirection = segmentDirection(trunkStart, trunkNext, trunkAxis);
      const trunkLength = segmentLength(trunkStart, trunkNext);
      if (trunkDirection === 0 || trunkLength < SHARED_TRUNK_DETOUR_CLEARANCES[0]) continue;

      for (const clearance of SHARED_TRUNK_DETOUR_CLEARANCES) {
        if (clearance > trunkLength + EPS) continue;
        const escape = trunkAxis === 'v'
          ? { x: trunkStart.x, y: trunkStart.y + trunkDirection * clearance }
          : { x: trunkStart.x + trunkDirection * clearance, y: trunkStart.y };
        const candidate = compactPath(trunkAxis === 'v'
          ? [
            ...peerPath.slice(0, trunkIndex + 1),
            escape,
            { x: terminalPivot.x, y: escape.y },
            terminalPivot,
            terminalEnd,
          ]
          : [
            ...peerPath.slice(0, trunkIndex + 1),
            escape,
            { x: escape.x, y: terminalPivot.y },
            terminalPivot,
            terminalEnd,
          ]);
        if (
          candidate.length >= 2
          && hasSameEndpoints(points, candidate)
          && allSegmentsOrthogonal(candidate)
          && pathMicroMetrics(candidate).tinyInteriorDoglegs < originalMetrics.tinyInteriorDoglegs
          && pathLength(candidate) <= originalLength + Math.max(640, originalLength * 0.8)
        ) {
          candidates.push(candidate);
        }
      }
    }
  }
  return candidates;
}

function qualityAllowsMicroCleanup(
  baseline: ReturnType<typeof calculateEdgePathQualityScore>,
  candidate: ReturnType<typeof calculateEdgePathQualityScore>,
): boolean {
  if (candidate.nonOrthogonalSegments > baseline.nonOrthogonalSegments) return false;
  if (candidate.strictCrossings > baseline.strictCrossings) return false;
  if (candidate.reverseOverlap > baseline.reverseOverlap) return false;
  if (candidate.unrelatedOverlap > baseline.unrelatedOverlap) return false;
  if (candidate.unexplainedRelatedOverlap > baseline.unexplainedRelatedOverlap) return false;
  if (candidate.shortEndpointStubs > baseline.shortEndpointStubs) return false;
  if (candidate.tinyInteriorDoglegs > baseline.tinyInteriorDoglegs) return false;
  if (candidate.hairpins > baseline.hairpins) return false;
  return candidate.strictCrossings < baseline.strictCrossings
    || candidate.shortEndpointStubs < baseline.shortEndpointStubs
    || candidate.tinyInteriorDoglegs < baseline.tinyInteriorDoglegs
    || candidate.hairpins < baseline.hairpins
    || (
      candidate.bends < baseline.bends
      && candidate.totalLength <= baseline.totalLength + EPS
      && candidate.detourPenalty <= baseline.detourPenalty
    )
    || (
      candidate.bends <= baseline.bends
      && candidate.detourPenalty < baseline.detourPenalty
      && candidate.totalLength <= baseline.totalLength - 80
    );
}

function qualityAllowsCompoundMicroCleanup(
  baseline: ReturnType<typeof calculateEdgePathQualityScore>,
  candidate: ReturnType<typeof calculateEdgePathQualityScore>,
): boolean {
  if (candidate.nonOrthogonalSegments > baseline.nonOrthogonalSegments) return false;
  if (candidate.strictCrossings > baseline.strictCrossings) return false;
  if (candidate.reverseOverlap > baseline.reverseOverlap) return false;
  if (candidate.unrelatedOverlap > baseline.unrelatedOverlap) return false;
  if (candidate.unexplainedRelatedOverlap > baseline.unexplainedRelatedOverlap) return false;
  if (candidate.shortEndpointStubs > baseline.shortEndpointStubs) return false;
  if (candidate.tinyInteriorDoglegs > baseline.tinyInteriorDoglegs) return false;
  if (candidate.hairpins > baseline.hairpins) return false;
  return candidate.strictCrossings < baseline.strictCrossings
    || candidate.shortEndpointStubs < baseline.shortEndpointStubs
    || candidate.tinyInteriorDoglegs < baseline.tinyInteriorDoglegs
    || candidate.hairpins < baseline.hairpins
    || (
      candidate.bends < baseline.bends
      && candidate.totalLength <= baseline.totalLength + EPS
      && candidate.detourPenalty <= baseline.detourPenalty
    )
    || (
      candidate.bends <= baseline.bends
      && candidate.detourPenalty < baseline.detourPenalty
      && candidate.totalLength <= baseline.totalLength - 80
  );
}

const selectMicroCandidateLaneExtrema = (
  candidates: readonly Point[][],
  budget: number,
): Point[][] => {
  if (budget <= 0 || candidates.length === 0) return [];
  const bounds = new WeakMap<Point[], Readonly<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }>>();
  const getBounds = (path: Point[]) => {
    const cached = bounds.get(path);
    if (cached) return cached;
    const next = {
      minX: Math.min(...path.map(point => point.x)),
      maxX: Math.max(...path.map(point => point.x)),
      minY: Math.min(...path.map(point => point.y)),
      maxY: Math.max(...path.map(point => point.y)),
    };
    bounds.set(path, next);
    return next;
  };
  const orders = [
    (first: Point[], second: Point[]) => getBounds(first).minX - getBounds(second).minX,
    (first: Point[], second: Point[]) => getBounds(second).maxX - getBounds(first).maxX,
    (first: Point[], second: Point[]) => getBounds(first).minY - getBounds(second).minY,
    (first: Point[], second: Point[]) => getBounds(second).maxY - getBounds(first).maxY,
  ];
  const selected: Point[][] = [];
  const seen = new Set<Point[]>();
  for (const compare of orders) {
    for (const candidate of [...candidates].sort(compare).slice(0, 2)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      selected.push(candidate);
      if (selected.length >= budget) return selected;
    }
  }
  return selected;
};

function buildCompoundStrictCrossingCleanup(
  currentEdges: Edge[],
  changedEdgeIndex: number,
  changedEdges: Edge[],
  baselineQuality: ReturnType<typeof calculateEdgePathQualityScore>,
  changedQuality: ReturnType<typeof calculateEdgePathQualityScore>,
  safetyContext?: DisplayMicroCleanupSafetyContext,
  baselineSafety?: DisplayMicroCleanupSafetyScore,
  changedSafety?: DisplayMicroCleanupSafetyScore,
  cumulativeChangedIndexes: readonly number[] = [changedEdgeIndex],
): {
  edges: Edge[];
  quality: ReturnType<typeof calculateEdgePathQualityScore>;
  safety?: DisplayMicroCleanupSafetyScore;
  changedIndexes: readonly number[];
} | null {
  if (
    safetyContext
    && baselineSafety
    && (
      !changedSafety
      || !displayMicroCleanupSafetyDoesNotRegress(baselineSafety, changedSafety)
    )
  ) return null;
  if (qualityAllowsCompoundMicroCleanup(baselineQuality, changedQuality)) {
    return {
      edges: changedEdges,
      quality: changedQuality,
      safety: changedSafety,
      changedIndexes: cumulativeChangedIndexes,
    };
  }
  if (
    changedQuality.shortEndpointStubs >= baselineQuality.shortEndpointStubs
    && changedQuality.tinyInteriorDoglegs >= baselineQuality.tinyInteriorDoglegs
    && changedQuality.hairpins >= baselineQuality.hairpins
  ) return null;

  const qualityContext = createEdgePathQualityEvaluationContext(currentEdges);
  const rootQualityState = qualityContext.createState(currentEdges);
  const changedQualityState = qualityContext.evaluateStateChanged(
    rootQualityState,
    changedEdges,
    [changedEdgeIndex],
  );

  let beam: Array<{
    edges: Edge[];
    quality: ReturnType<typeof calculateEdgePathQualityScore>;
    qualityState: EdgePathQualityEvaluationState;
    safety?: DisplayMicroCleanupSafetyScore;
    changedIndexes: readonly number[];
  }> = [{
    edges: changedEdges,
    quality: changedQuality,
    qualityState: changedQualityState,
    safety: changedSafety,
    changedIndexes: cumulativeChangedIndexes,
  }];

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const nextBeam: typeof beam = [];
    let progressed = false;

    for (const state of beam) {
      const crossings = strictCrossingPairsForEdge(state.edges, changedEdgeIndex).slice(0, 4);
      if (crossings.length === 0) {
        if (qualityAllowsCompoundMicroCleanup(baselineQuality, state.quality)) return state;
        nextBeam.push(state);
        continue;
      }

      const crossing = crossings[0];
      const changedSegment = crossing.changed;
      const otherSegment = crossing.other;
      const otherPath = compactPath(getEdgePath(state.edges[otherSegment.edgeIndex]));
      const lanes = changedSegment.axis === 'h'
        ? COMPOUND_CLEARANCES.flatMap(clearance => [
          Math.min(changedSegment.a.x, changedSegment.b.x) - clearance,
          Math.max(changedSegment.a.x, changedSegment.b.x) + clearance,
        ])
        : COMPOUND_CLEARANCES.flatMap(clearance => [
          Math.min(changedSegment.a.y, changedSegment.b.y) - clearance,
          Math.max(changedSegment.a.y, changedSegment.b.y) + clearance,
        ]);

      for (const lane of lanes) {
        const shiftedPath = buildShiftedSegmentPath(otherPath, otherSegment.segmentIndex, lane);
        if (!shiftedPath || !hasSameEndpoints(otherPath, shiftedPath)) continue;
        const shiftedEdges = state.edges.map((edge, edgeIndex) => (
          edgeIndex === otherSegment.edgeIndex ? withComputedPath(edge, shiftedPath) : edge
        ));
        const shiftedQualityState = qualityContext.evaluateStateChanged(
          state.qualityState,
          shiftedEdges,
          [otherSegment.edgeIndex],
        );
        const shiftedQuality = shiftedQualityState.score;
        if (shiftedQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments) continue;
        if (shiftedQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs) continue;
        if (shiftedQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs) continue;
        if (shiftedQuality.hairpins > baselineQuality.hairpins) continue;
        const shiftedChangedIndexes = state.changedIndexes.includes(otherSegment.edgeIndex)
          ? state.changedIndexes
          : [...state.changedIndexes, otherSegment.edgeIndex];
        const shiftedSafety = safetyContext?.evaluate(
          shiftedEdges,
          shiftedChangedIndexes,
        );
        if (
          safetyContext
          && baselineSafety
          && (
            !shiftedSafety
            || !displayMicroCleanupSafetyDoesNotRegress(baselineSafety, shiftedSafety)
          )
        ) continue;
        nextBeam.push({
          edges: shiftedEdges,
          quality: shiftedQuality,
          qualityState: shiftedQualityState,
          safety: shiftedSafety,
          changedIndexes: shiftedChangedIndexes,
        });
        progressed = true;
      }
    }

    beam = nextBeam
      .sort((first, second) => (
        first.quality.strictCrossings - second.quality.strictCrossings
        || first.quality.shortEndpointStubs - second.quality.shortEndpointStubs
        || first.quality.tinyInteriorDoglegs - second.quality.tinyInteriorDoglegs
        || first.quality.hairpins - second.quality.hairpins
        || first.quality.bends - second.quality.bends
        || first.quality.totalLength - second.quality.totalLength
      ))
      .slice(0, 8);
    const accepted = beam.find(state => qualityAllowsCompoundMicroCleanup(baselineQuality, state.quality));
    if (accepted) return accepted;
    if (!progressed || beam.length === 0) break;
  }

  return null;
}

export function repairDisplayMicroArtifacts(
  edges: Edge[],
  safetyContext?: DisplayMicroCleanupSafetyContext,
): Edge[] {
  const initialQuality = calculateEdgePathQualityScore(edges);
  const hasVisualSmallSegment = edges.some(edge => (
    hasVisualSmallInteriorSegment(compactPath(getEdgePath(edge)))
  ));
  if (
    initialQuality.shortEndpointStubs === 0
    && initialQuality.tinyInteriorDoglegs === 0
    && initialQuality.hairpins === 0
    && initialQuality.detourPenalty === 0
    && !hasVisualSmallSegment
  ) return edges;

  let currentEdges = edges;
  const candidateBudget = resolveMicroCandidateBudget(edges.length);
  let currentSafety = safetyContext?.baseline;
  const cumulativeChangedIndexes = new Set<number>();
  for (let cleanupPass = 0; cleanupPass < 2; cleanupPass += 1) {
    let changedThisPass = false;
    for (let edgeIndex = 0; edgeIndex < currentEdges.length; edgeIndex += 1) {
      const edge = currentEdges[edgeIndex];
      const path = compactPath(getEdgePath(edge));
      if (path.length < 3) continue;
      const pathMetrics = pathMicroMetrics(path);
      const hasVisualSmallSegmentForEdge = hasVisualSmallInteriorSegment(path);
      if (
        pathMetrics.shortEndpointStubs === 0
        && pathMetrics.tinyInteriorDoglegs === 0
        && pathMetrics.hairpins === 0
        && pathDetourPenalty(path) === 0
        && !hasVisualSmallSegmentForEdge
      ) {
        continue;
      }

      const candidates: Point[][] = [
        buildTinyEndpointBridgeCollapseCandidate(path, true),
        buildTinyEndpointBridgeCollapseCandidate(path, false),
        buildTerminalStubCandidate(path, true),
        buildTerminalStubCandidate(path, false),
        ...buildTerminalStubSideApproachCandidates(path, true),
        ...buildTerminalStubSideApproachCandidates(path, false),
        ...buildOuterDetourCollapseCandidates(edge, path, currentEdges),
      ].filter((candidate): candidate is Point[] => candidate !== null);
      const sideStepLaneCandidates: Point[][] = [];
      const sharedTrunkCandidates: Point[][] = [];
      const outerPerimeterCandidates: Point[][] = [];
      for (let index = 0; index + 4 < path.length; index += 1) {
        const collapsed = buildConsecutiveTinyCornerCollapse(path, index);
        if (collapsed) candidates.push(collapsed);
        const sideStepCollapsed = buildTinySideStepContinuationCollapseCandidate(path, index);
        if (sideStepCollapsed) candidates.push(sideStepCollapsed);
        const parallelContinuationCollapsed = buildTinyParallelContinuationCollapseCandidate(path, index);
        if (parallelContinuationCollapsed) candidates.push(parallelContinuationCollapsed);
        candidates.push(...buildTinyBridgeExtensionCandidates(path, index));
        const sideStepCandidates = buildTinySideStepLaneBypassCandidates(path, index);
        candidates.push(...sideStepCandidates);
        sideStepLaneCandidates.push(...sideStepCandidates);
        const trailingTinyStair = buildTrailingTinyStairCollapseCandidate(path, index);
        if (trailingTinyStair) candidates.push(trailingTinyStair);
        const tinyBridgeCollapsed = buildTinyInteriorBridgeCollapseCandidate(path, index);
        if (tinyBridgeCollapsed) candidates.push(tinyBridgeCollapsed);
        candidates.push(...buildTinyInteriorBridgeLaneCandidates(path, index));
        candidates.push(...buildTinyPreTerminalSideApproachCandidates(path, index));
        candidates.push(...buildConsecutiveTinyCornerLaneCandidates(path, index));
      }
      for (let index = 0; index + 3 < path.length; index += 1) {
        candidates.push(...buildHairpinBridgeCollapseCandidates(path, index));
        const terminalEndpointSlide = buildTerminalHairpinEndpointSlideCandidate(path, index);
        if (terminalEndpointSlide) candidates.push(terminalEndpointSlide);
        const startHairpinSideLane = buildStartHairpinSideLaneCandidate(path, index);
        if (startHairpinSideLane) candidates.push(startHairpinSideLane);
        candidates.push(...buildSmallReturnBridgeLaneCandidates(path, index));
      }
      for (let index = 0; index + 5 < path.length; index += 1) {
        const collapsed = buildNearReturnContinuationCollapseCandidate(path, index);
        if (collapsed) candidates.push(collapsed);
        candidates.push(...buildReturnLoopCollapseCandidates(path, index));
      }
      for (let index = 0; index + 4 < path.length; index += 1) {
        const collapsed = buildMonotonicStairCollapseCandidate(path, index);
        if (collapsed) candidates.push(collapsed);
      }
      if (pathMetrics.tinyInteriorDoglegs > 0) {
        const sharedSourceCandidates = buildSharedSourceTrunkDetourCandidates(
          currentEdges,
          edgeIndex,
          path,
        );
        candidates.push(...sharedSourceCandidates);
        sharedTrunkCandidates.push(...sharedSourceCandidates);
        if (safetyContext) {
          const perimeterCandidates = buildOuterPerimeterMicroCandidates(currentEdges, path);
          candidates.push(...perimeterCandidates);
          outerPerimeterCandidates.push(...perimeterCandidates);
        }
      }

      let bestPath = path;
      const qualityContext = createEdgePathQualityEvaluationContext(currentEdges);
      let bestQuality = qualityContext.evaluate(currentEdges);
      let bestEdges: Edge[] | null = null;
      let bestSafety = currentSafety;
      let bestChangedIndexes: readonly number[] = [...cumulativeChangedIndexes];
      const seenCandidates = new Set<string>();
      const normalizedCandidates = candidates
        .map(candidate => compactPath(candidate))
        .filter((normalized) => {
          if (normalized.length < 2 || !hasCompatibleDisplayEndpoints(path, normalized)) return false;
          const key = normalized.map(point => `${point.x}:${point.y}`).join('|');
          if (seenCandidates.has(key)) return false;
          seenCandidates.add(key);
          return true;
        });
      const laneDiversityBudget = Math.min(8, candidateBudget);
      const priorityCandidateKeys = new Set([
        ...selectMicroCandidateLaneExtrema(
          sideStepLaneCandidates.map(candidate => compactPath(candidate)),
          laneDiversityBudget,
        ),
        ...selectMicroCandidateLaneExtrema(
          outerPerimeterCandidates.map(candidate => compactPath(candidate)),
          laneDiversityBudget,
        ),
        ...sharedTrunkCandidates
          .map(candidate => compactPath(candidate))
          .sort((first, second) => microCandidateRank(first) - microCandidateRank(second))
          .slice(0, laneDiversityBudget),
      ].map(candidate => candidate.map(point => `${point.x}:${point.y}`).join('|')));
      const priorityCandidates = normalizedCandidates.filter(candidate => (
        priorityCandidateKeys.has(candidate.map(point => `${point.x}:${point.y}`).join('|'))
      ));
      const reservedPriorityCandidateCount = Math.min(
        priorityCandidates.length,
        laneDiversityBudget * 2,
      );
      const rankedCandidates = [
        ...[...normalizedCandidates]
          .sort((first, second) => microCandidateRank(first) - microCandidateRank(second))
          .slice(0, candidateBudget - reservedPriorityCandidateCount),
        ...priorityCandidates,
      ].filter((candidate, index, selected) => selected.indexOf(candidate) === index)
        .slice(0, candidateBudget);

      for (const normalized of rankedCandidates) {
        const candidatePathMetrics = pathMicroMetrics(normalized);
        if (candidatePathMetrics.shortEndpointStubs > pathMetrics.shortEndpointStubs) continue;
        if (candidatePathMetrics.tinyInteriorDoglegs > pathMetrics.tinyInteriorDoglegs) continue;
        if (candidatePathMetrics.hairpins > pathMetrics.hairpins) continue;
        const candidateEdges = currentEdges.map((candidateEdge, candidateIndex) => (
          candidateIndex === edgeIndex ? withComputedPath(candidateEdge, normalized) : candidateEdge
        ));
        const candidateChangedIndexes = cumulativeChangedIndexes.has(edgeIndex)
          ? [...cumulativeChangedIndexes]
          : [...cumulativeChangedIndexes, edgeIndex];
        const candidateSafety = safetyContext?.evaluate(
          candidateEdges,
          candidateChangedIndexes,
        );
        if (
          safetyContext
          && currentSafety
          && (
            !candidateSafety
            || !displayMicroCleanupSafetyDoesNotRegress(currentSafety, candidateSafety)
          )
        ) continue;
        const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [edgeIndex]);
        if (!qualityAllowsMicroCleanup(bestQuality, candidateQuality)) {
          const compound = buildCompoundStrictCrossingCleanup(
            currentEdges,
            edgeIndex,
            candidateEdges,
            bestQuality,
            candidateQuality,
            safetyContext,
            currentSafety,
            candidateSafety,
            candidateChangedIndexes,
          );
          if (!compound) continue;
          bestPath = normalized;
          bestQuality = compound.quality;
          bestEdges = compound.edges;
          bestSafety = compound.safety;
          bestChangedIndexes = compound.changedIndexes;
          continue;
        }
        bestPath = normalized;
        bestQuality = candidateQuality;
        bestEdges = candidateEdges;
        bestSafety = candidateSafety;
        bestChangedIndexes = candidateChangedIndexes;
      }

      if (!hasCompatibleDisplayEndpoints(path, bestPath) || bestPath.length === path.length && bestPath.every((point, index) => (
        Math.abs(point.x - path[index]?.x) <= EPS && Math.abs(point.y - path[index]?.y) <= EPS
      ))) continue;

      currentEdges = bestEdges ?? currentEdges.map((candidateEdge, candidateIndex) => (
        candidateIndex === edgeIndex ? withComputedPath(candidateEdge, bestPath) : candidateEdge
      ));
      currentSafety = bestSafety;
      cumulativeChangedIndexes.clear();
      bestChangedIndexes.forEach(index => cumulativeChangedIndexes.add(index));
      changedThisPass = true;
    }

    const passQuality = calculateEdgePathQualityScore(currentEdges);
    if (
      !changedThisPass
      || (
        passQuality.shortEndpointStubs === 0
        && passQuality.tinyInteriorDoglegs === 0
        && passQuality.hairpins === 0
        && passQuality.detourPenalty === 0
      )
    ) {
      break;
    }
  }
  return currentEdges;
}
