export type EndpointBridgePoint = Readonly<{ x: number; y: number }>;

export type EndpointBridgeSegment = Readonly<{
  a: EndpointBridgePoint;
  b: EndpointBridgePoint;
  axis: 'h' | 'v' | 'other';
}>;

export type EndpointBridgePeerPath = Readonly<{
  edgeKey: string;
  source: string;
  target: string;
  segments: readonly EndpointBridgeSegment[];
}>;

export type EndpointBridgeScoreSubject = Readonly<{
  edgeKey: string;
  endpoint: 'source' | 'target';
  source: string;
  target: string;
}>;

/** Aggregate-only counters. They never retain edge ids, paths, nodes, or user content. */
export type EndpointBridgeScoringDiagnostics = {
  evaluationCount: number;
  probeEvaluationCount: number;
  fullScanCandidatePairCount: number;
  indexedCandidatePairCount: number;
  coordinateScanCount: number;
  contributionCount: number;
};

export const createEndpointBridgeScoringDiagnostics = (): EndpointBridgeScoringDiagnostics => ({
  evaluationCount: 0,
  probeEvaluationCount: 0,
  fullScanCandidatePairCount: 0,
  indexedCandidatePairCount: 0,
  coordinateScanCount: 0,
  contributionCount: 0,
});

export type EndpointBridgeScoringContext = Readonly<{
  hasPenalty: (
    subject: EndpointBridgeScoreSubject,
    candidates: readonly EndpointBridgeSegment[],
  ) => boolean;
  score: (
    subject: EndpointBridgeScoreSubject,
    candidates: readonly EndpointBridgeSegment[],
  ) => number;
}>;

type PreparedSegment = Readonly<{
  edgeKey: string;
  edgeOrder: number;
  line: number;
  rangeMax: number;
  rangeMin: number;
  segment: EndpointBridgeSegment;
  segmentOrder: number;
  source: string;
  target: string;
}>;

type ScoreContribution = Readonly<{
  candidateOrder: number;
  edgeOrder: number;
  operationOrder: number;
  segmentOrder: number;
  value: number;
}>;

const EPS = 0.5;
const MAX_PARALLEL_DISTANCE = 10;
const MIN_PENALIZED_OVERLAP = 12;

const finiteSegment = (segment: EndpointBridgeSegment): boolean => [
  segment.a.x,
  segment.a.y,
  segment.b.x,
  segment.b.y,
].every(Number.isFinite);

const segmentRange = (
  segment: EndpointBridgeSegment,
): Readonly<{ line: number; rangeMax: number; rangeMin: number }> => (
  segment.axis === 'h'
    ? {
        line: segment.a.y,
        rangeMax: Math.max(segment.a.x, segment.b.x),
        rangeMin: Math.min(segment.a.x, segment.b.x),
      }
    : {
        line: segment.a.x,
        rangeMax: Math.max(segment.a.y, segment.b.y),
        rangeMin: Math.min(segment.a.y, segment.b.y),
      }
);

const rangeOverlap = (
  firstMin: number,
  firstMax: number,
  secondMin: number,
  secondMax: number,
): number => Math.max(0, Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin));

const lowerBoundLine = (entries: readonly PreparedSegment[], line: number): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].line < line) low = middle + 1;
    else high = middle;
  }
  return low;
};

const upperBoundLine = (entries: readonly PreparedSegment[], line: number): number => {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (entries[middle].line <= line) low = middle + 1;
    else high = middle;
  }
  return low;
};

export function endpointBridgeSegmentsStrictlyCross(
  first: EndpointBridgeSegment,
  second: EndpointBridgeSegment,
): boolean {
  if (first.axis === second.axis || first.axis === 'other' || second.axis === 'other') return false;
  const horizontal = first.axis === 'h' ? first : second;
  const vertical = first.axis === 'v' ? first : second;
  const hx1 = Math.min(horizontal.a.x, horizontal.b.x);
  const hx2 = Math.max(horizontal.a.x, horizontal.b.x);
  const vy1 = Math.min(vertical.a.y, vertical.b.y);
  const vy2 = Math.max(vertical.a.y, vertical.b.y);
  const x = vertical.a.x;
  const y = horizontal.a.y;
  return x > hx1 + EPS && x < hx2 - EPS && y > vy1 + EPS && y < vy2 - EPS;
}

export function endpointBridgeNearParallelOverlap(
  first: EndpointBridgeSegment,
  second: EndpointBridgeSegment,
): number {
  if (first.axis !== second.axis || first.axis === 'other') return 0;
  if (first.axis === 'h') {
    const distance = Math.abs(first.a.y - second.a.y);
    if (distance > MAX_PARALLEL_DISTANCE) return 0;
    const weight = (MAX_PARALLEL_DISTANCE - distance) / MAX_PARALLEL_DISTANCE;
    return rangeOverlap(
      Math.min(first.a.x, first.b.x),
      Math.max(first.a.x, first.b.x),
      Math.min(second.a.x, second.b.x),
      Math.max(second.a.x, second.b.x),
    ) * weight;
  }
  const distance = Math.abs(first.a.x - second.a.x);
  if (distance > MAX_PARALLEL_DISTANCE) return 0;
  const weight = (MAX_PARALLEL_DISTANCE - distance) / MAX_PARALLEL_DISTANCE;
  return rangeOverlap(
    Math.min(first.a.y, first.b.y),
    Math.max(first.a.y, first.b.y),
    Math.min(second.a.y, second.b.y),
    Math.max(second.a.y, second.b.y),
  ) * weight;
}

const excludedFromSubject = (
  subject: EndpointBridgeScoreSubject,
  prepared: PreparedSegment,
): boolean => prepared.edgeKey === subject.edgeKey
  || (subject.endpoint === 'source' && prepared.source === subject.source)
  || (subject.endpoint === 'target' && prepared.target === subject.target);

const fullScanCandidatePairs = (
  subject: EndpointBridgeScoreSubject,
  candidates: readonly EndpointBridgeSegment[],
  peers: readonly EndpointBridgePeerPath[],
): number => {
  let eligibleSegmentCount = 0;
  for (const peer of peers) {
    if (
      peer.edgeKey === subject.edgeKey
      || (subject.endpoint === 'source' && peer.source === subject.source)
      || (subject.endpoint === 'target' && peer.target === subject.target)
    ) continue;
    eligibleSegmentCount += peer.segments.length;
  }
  return eligibleSegmentCount * candidates.length;
};

export const createEndpointBridgeScoringContext = (
  peers: readonly EndpointBridgePeerPath[],
  diagnostics?: EndpointBridgeScoringDiagnostics,
): EndpointBridgeScoringContext => {
  const horizontal: PreparedSegment[] = [];
  const vertical: PreparedSegment[] = [];
  peers.forEach((peer, edgeOrder) => {
    peer.segments.forEach((segment, segmentOrder) => {
      if (segment.axis === 'other' || !finiteSegment(segment)) return;
      const prepared = {
        edgeKey: peer.edgeKey,
        edgeOrder,
        segment,
        segmentOrder,
        source: peer.source,
        target: peer.target,
        ...segmentRange(segment),
      };
      (segment.axis === 'h' ? horizontal : vertical).push(prepared);
    });
  });
  horizontal.sort((first, second) => first.line - second.line);
  vertical.sort((first, second) => first.line - second.line);

  const visitPotentialPairs = (
    candidate: EndpointBridgeSegment,
    visit: (prepared: PreparedSegment) => boolean,
  ): boolean => {
    if (candidate.axis === 'other' || !finiteSegment(candidate)) return false;
    const { line, rangeMin, rangeMax } = segmentRange(candidate);
    const parallel = candidate.axis === 'h' ? horizontal : vertical;
    const parallelStart = lowerBoundLine(parallel, line - MAX_PARALLEL_DISTANCE);
    const parallelEnd = upperBoundLine(parallel, line + MAX_PARALLEL_DISTANCE);
    for (let index = parallelStart; index < parallelEnd; index += 1) {
      const prepared = parallel[index];
      if (diagnostics) diagnostics.coordinateScanCount += 1;
      if (
        rangeOverlap(rangeMin, rangeMax, prepared.rangeMin, prepared.rangeMax)
          <= MIN_PENALIZED_OVERLAP
      ) continue;
      if (visit(prepared)) return true;
    }

    const crossing = candidate.axis === 'h' ? vertical : horizontal;
    const crossingMinimum = rangeMin + EPS;
    const crossingMaximum = rangeMax - EPS;
    if (crossingMinimum > crossingMaximum) return false;
    const crossingStart = lowerBoundLine(crossing, crossingMinimum);
    const crossingEnd = upperBoundLine(crossing, crossingMaximum);
    for (let index = crossingStart; index < crossingEnd; index += 1) {
      const prepared = crossing[index];
      if (diagnostics) diagnostics.coordinateScanCount += 1;
      if (line < prepared.rangeMin + EPS || line > prepared.rangeMax - EPS) continue;
      if (visit(prepared)) return true;
    }
    return false;
  };

  const recordEvaluation = (
    subject: EndpointBridgeScoreSubject,
    candidates: readonly EndpointBridgeSegment[],
    probe: boolean,
  ): void => {
    if (!diagnostics) return;
    diagnostics.evaluationCount += 1;
    if (probe) diagnostics.probeEvaluationCount += 1;
    diagnostics.fullScanCandidatePairCount += fullScanCandidatePairs(subject, candidates, peers);
  };

  return {
    hasPenalty(subject, candidates) {
      recordEvaluation(subject, candidates, true);
      for (const candidate of candidates) {
        if (visitPotentialPairs(candidate, prepared => {
          if (excludedFromSubject(subject, prepared)) return false;
          if (diagnostics) diagnostics.indexedCandidatePairCount += 1;
          if (endpointBridgeSegmentsStrictlyCross(candidate, prepared.segment)) return true;
          return endpointBridgeNearParallelOverlap(candidate, prepared.segment)
            > MIN_PENALIZED_OVERLAP;
        })) return true;
      }
      return false;
    },
    score(subject, candidates) {
      recordEvaluation(subject, candidates, false);
      const contributions: ScoreContribution[] = [];
      candidates.forEach((candidate, candidateOrder) => {
        visitPotentialPairs(candidate, prepared => {
          if (excludedFromSubject(subject, prepared)) return false;
          if (diagnostics) diagnostics.indexedCandidatePairCount += 1;
          if (endpointBridgeSegmentsStrictlyCross(candidate, prepared.segment)) {
            contributions.push({
              candidateOrder,
              edgeOrder: prepared.edgeOrder,
              operationOrder: 0,
              segmentOrder: prepared.segmentOrder,
              value: 10000,
            });
          }
          const overlap = endpointBridgeNearParallelOverlap(candidate, prepared.segment);
          if (overlap > MIN_PENALIZED_OVERLAP) {
            contributions.push({
              candidateOrder,
              edgeOrder: prepared.edgeOrder,
              operationOrder: 1,
              segmentOrder: prepared.segmentOrder,
              value: overlap * 2,
            });
          }
          return false;
        });
      });
      contributions.sort((first, second) => (
        first.edgeOrder - second.edgeOrder
        || first.candidateOrder - second.candidateOrder
        || first.segmentOrder - second.segmentOrder
        || first.operationOrder - second.operationOrder
      ));
      if (diagnostics) diagnostics.contributionCount += contributions.length;
      let score = 0;
      for (const contribution of contributions) score += contribution.value;
      return score;
    },
  };
};
