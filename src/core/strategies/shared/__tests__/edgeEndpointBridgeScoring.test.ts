import { describe, expect, it } from 'vitest';

import {
  createEndpointBridgeScoringContext,
  createEndpointBridgeScoringDiagnostics,
  endpointBridgeNearParallelOverlap,
  endpointBridgeSegmentsStrictlyCross,
  type EndpointBridgePeerPath,
  type EndpointBridgeScoreSubject,
  type EndpointBridgeSegment,
} from '../edgeEndpointBridgeScoring';

const horizontal = (x1: number, x2: number, y: number): EndpointBridgeSegment => ({
  a: { x: x1, y },
  b: { x: x2, y },
  axis: 'h',
});

const vertical = (x: number, y1: number, y2: number): EndpointBridgeSegment => ({
  a: { x, y: y1 },
  b: { x, y: y2 },
  axis: 'v',
});

const legacyScore = (
  subject: EndpointBridgeScoreSubject,
  candidates: readonly EndpointBridgeSegment[],
  peers: readonly EndpointBridgePeerPath[],
): number => {
  let score = 0;
  for (const peer of peers) {
    if (peer.edgeKey === subject.edgeKey) continue;
    if (subject.endpoint === 'source' && peer.source === subject.source) continue;
    if (subject.endpoint === 'target' && peer.target === subject.target) continue;
    for (const candidate of candidates) {
      for (const existing of peer.segments) {
        if (endpointBridgeSegmentsStrictlyCross(candidate, existing)) score += 10000;
        const overlap = endpointBridgeNearParallelOverlap(candidate, existing);
        if (overlap > 12) score += overlap * 2;
      }
    }
  }
  return score;
};

const subject = (endpoint: 'source' | 'target' = 'source'): EndpointBridgeScoreSubject => ({
  edgeKey: 'candidate',
  endpoint,
  source: 'candidate-source',
  target: 'candidate-target',
});

describe('endpoint bridge scoring predicates', () => {
  it('preserves strict EPS endpoint boundaries', () => {
    const candidate = horizontal(0, 100, 0);

    expect(endpointBridgeSegmentsStrictlyCross(candidate, vertical(0.5, -10, 10))).toBe(false);
    expect(endpointBridgeSegmentsStrictlyCross(candidate, vertical(0.500000001, -10, 10))).toBe(true);
    expect(endpointBridgeSegmentsStrictlyCross(candidate, vertical(99.5, -10, 10))).toBe(false);
    expect(endpointBridgeSegmentsStrictlyCross(candidate, vertical(99.499999999, -10, 10))).toBe(true);
    expect(endpointBridgeSegmentsStrictlyCross(candidate, vertical(50, -10, 0.5))).toBe(false);
    expect(endpointBridgeSegmentsStrictlyCross(candidate, vertical(50, -10, 0.500000001))).toBe(true);
  });

  it('preserves weighted parallel distance and overlap thresholds', () => {
    const candidate = horizontal(0, 100, 0);

    expect(endpointBridgeNearParallelOverlap(candidate, horizontal(0, 100, 10))).toBe(0);
    expect(endpointBridgeNearParallelOverlap(candidate, horizontal(0, 100, 10.000000001))).toBe(0);
    expect(endpointBridgeNearParallelOverlap(candidate, horizontal(0, 100, 8.8)))
      .toBeCloseTo(12, 10);
    expect(endpointBridgeNearParallelOverlap(candidate, horizontal(0, 100, 8.799999999)))
      .toBeGreaterThan(12);
    expect(endpointBridgeNearParallelOverlap(candidate, horizontal(20, 32, 0))).toBe(12);
    expect(endpointBridgeNearParallelOverlap(candidate, horizontal(20, 32.000000001, 0)))
      .toBeGreaterThan(12);
  });
});

describe('createEndpointBridgeScoringContext', () => {
  it('preserves edge, source, and target exclusion semantics', () => {
    const candidates = [horizontal(0, 100, 0)];
    const peers: EndpointBridgePeerPath[] = [
      { edgeKey: 'candidate', source: 'other-a', target: 'other-b', segments: [vertical(10, -10, 10)] },
      {
        edgeKey: 'same-source',
        source: 'candidate-source',
        target: 'other-c',
        segments: [vertical(20, -10, 10)],
      },
      {
        edgeKey: 'same-target',
        source: 'other-d',
        target: 'candidate-target',
        segments: [vertical(30, -10, 10)],
      },
      { edgeKey: 'unrelated', source: 'other-e', target: 'other-f', segments: [vertical(40, -10, 10)] },
    ];
    const context = createEndpointBridgeScoringContext(peers);

    expect(context.score(subject('source'), candidates)).toBe(20000);
    expect(context.score(subject('target'), candidates)).toBe(20000);
    expect(context.hasPenalty(subject('source'), candidates)).toBe(true);
    expect(context.hasPenalty(subject('target'), candidates)).toBe(true);
  });

  it('matches legacy scores exactly in original floating-point accumulation order', () => {
    const candidates = [
      horizontal(-50.25, 180.75, 10.125),
      vertical(42.375, -90.5, 160.875),
    ];
    const peers: EndpointBridgePeerPath[] = [
      {
        edgeKey: 'first',
        source: 'first-source',
        target: 'first-target',
        segments: [
          vertical(3.125, -30.75, 40.625),
          horizontal(-20.2, 150.6, 12.225),
          vertical(44.475, -80.4, 140.3),
        ],
      },
      {
        edgeKey: 'second',
        source: 'second-source',
        target: 'second-target',
        segments: [
          horizontal(-45.1, 175.2, 17.925),
          vertical(120.625, -70.2, 150.4),
          horizontal(40.275, 44.875, -20),
        ],
      },
    ];
    const expected = legacyScore(subject(), candidates, peers);

    expect(createEndpointBridgeScoringContext(peers).score(subject(), candidates)).toBe(expected);
  });

  it('matches legacy full scans across deterministic mixed geometry', () => {
    let state = 0x5eed1234;
    const random = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const peers: EndpointBridgePeerPath[] = Array.from({ length: 96 }, (_, edgeIndex) => {
      const segments = Array.from({ length: 5 }, (_, segmentIndex): EndpointBridgeSegment => {
        const axis = (edgeIndex + segmentIndex) % 3;
        const line = random() * 600 - 300;
        const from = random() * 600 - 300;
        const to = from + random() * 240 + 0.75;
        if (axis === 0) return horizontal(from, to, line);
        if (axis === 1) return vertical(line, from, to);
        return { a: { x: from, y: line }, b: { x: to, y: line + 25 }, axis: 'other' };
      });
      return {
        edgeKey: `peer-${edgeIndex}`,
        source: edgeIndex % 13 === 0 ? 'candidate-source' : `source-${edgeIndex}`,
        target: edgeIndex % 17 === 0 ? 'candidate-target' : `target-${edgeIndex}`,
        segments,
      };
    });
    const context = createEndpointBridgeScoringContext(peers);

    for (let evaluation = 0; evaluation < 256; evaluation += 1) {
      const x = random() * 400 - 200;
      const y = random() * 400 - 200;
      const length = 18 + (evaluation % 32) * 4;
      const candidates = evaluation % 2 === 0
        ? [horizontal(x, x + length * 3.25, y), vertical(x + length, y - 80, y + 120)]
        : [vertical(x, y, y + length * 2.75), horizontal(x - 90, x + 140, y + length)];
      const candidateSubject = subject(evaluation % 3 === 0 ? 'target' : 'source');
      const expected = legacyScore(candidateSubject, candidates, peers);

      expect(context.score(candidateSubject, candidates)).toBe(expected);
      expect(context.hasPenalty(candidateSubject, candidates)).toBe(expected > 0);
    }
  });

  it('reports aggregate candidate-pair reduction without retaining geometry', () => {
    const diagnostics = createEndpointBridgeScoringDiagnostics();
    const peers: EndpointBridgePeerPath[] = Array.from({ length: 44 }, (_, index) => ({
      edgeKey: `peer-${index}`,
      source: `source-${index}`,
      target: `target-${index}`,
      segments: [
        vertical(index === 0 ? 20 : 1000 + index * 10, -20, 20),
        horizontal(1000, 1200, index === 1 ? 4 : 300 + index * 20),
      ],
    }));
    const candidates = [horizontal(0, 40, 0), vertical(10, -30, 30)];
    const context = createEndpointBridgeScoringContext(peers, diagnostics);

    expect(context.score(subject(), candidates)).toBe(10000);
    expect(context.hasPenalty(subject(), candidates)).toBe(true);
    expect(diagnostics).toEqual(expect.objectContaining({
      evaluationCount: 2,
      probeEvaluationCount: 1,
      fullScanCandidatePairCount: 352,
    }));
    expect(diagnostics.indexedCandidatePairCount).toBeLessThan(
      diagnostics.fullScanCandidatePairCount / 10,
    );
    expect(Object.keys(diagnostics).sort()).toEqual([
      'contributionCount',
      'coordinateScanCount',
      'evaluationCount',
      'fullScanCandidatePairCount',
      'indexedCandidatePairCount',
      'probeEvaluationCount',
    ]);
  });
});
