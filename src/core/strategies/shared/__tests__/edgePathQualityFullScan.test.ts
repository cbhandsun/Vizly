import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  calculateEdgePathQualityDecomposition,
  calculateEdgePathQualityScoreExact,
  calculateMemoizedEdgePathQualityDecomposition,
} from '../edgePathQualityFullScan';
import {
  buildQualityEdgeInputSnapshot,
  buildQualityInputSnapshot,
} from '../edgePathQualityInputSnapshot';
import { edgeRoutingExactQualityIntentToken } from '../edgeRoutingQualityIntent';

const edge = (
  id: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath },
});

describe('edgePathQualityFullScan', () => {
  it('scans every edge pair and reports strict crossings', () => {
    const edges = [
      edge('horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
      edge('separate', [{ x: 0, y: 150 }, { x: 100, y: 150 }]),
    ];
    const metrics = { scannedEdgePairCount: 0 };

    const score = calculateEdgePathQualityScoreExact(edges, metrics);

    expect(score.strictCrossings).toBe(1);
    expect(metrics.scannedEdgePairCount).toBe(3);
  });

  it('handles an empty graph without scanning', () => {
    const metrics = { scannedEdgePairCount: 0 };

    expect(calculateEdgePathQualityScoreExact([], metrics).strictCrossings).toBe(0);
    expect(metrics.scannedEdgePairCount).toBe(0);
  });

  it('reuses stable peer pairs while preserving the exact full decomposition', () => {
    const baseline = Array.from({ length: 45 }, (_, index) => edge(
      `memo-${index}`,
      [{ x: 0, y: index * 10 }, { x: 400, y: index * 10 }],
    ));
    const warmMetrics = { scannedEdgePairCount: 0, pairCacheHitCount: 0 };
    calculateMemoizedEdgePathQualityDecomposition(
      baseline,
      buildQualityInputSnapshot(baseline),
      warmMetrics,
    );
    const candidate = baseline.map((item, index) => index === 0
      ? edge('memo-0', [{ x: 0, y: 455 }, { x: 400, y: 455 }])
      : item);
    const candidateSnapshot = buildQualityInputSnapshot(candidate);
    const memoMetrics = { scannedEdgePairCount: 0, pairCacheHitCount: 0 };
    const memoized = calculateMemoizedEdgePathQualityDecomposition(
      candidate,
      candidateSnapshot,
      memoMetrics,
    );
    const direct = calculateEdgePathQualityDecomposition(candidate, candidateSnapshot);

    expect(memoized.score).toEqual(direct.score);
    expect(memoized.pairScores).toEqual(direct.pairScores);
    expect(memoMetrics).toEqual({
      scannedEdgePairCount: 44,
      pairCacheHitCount: 946,
    });
  });

  it('keeps exact scorer authoritative after warming the shared pair memo', () => {
    const edges = [
      edge('exact-horizontal', [{ x: 0, y: 50 }, { x: 100, y: 50 }]),
      edge('exact-vertical', [{ x: 50, y: 0 }, { x: 50, y: 100 }]),
      edge('exact-separate', [{ x: 0, y: 150 }, { x: 100, y: 150 }]),
    ];
    calculateMemoizedEdgePathQualityDecomposition(edges, buildQualityInputSnapshot(edges));
    const metrics = { scannedEdgePairCount: 0 };

    expect(calculateEdgePathQualityScoreExact(edges, metrics).strictCrossings).toBe(1);
    expect(metrics.scannedEdgePairCount).toBe(3);
  });

  it('does not alias delimiter-bearing identities or oversized line-hop intent', () => {
    const basePath = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    const delimiterFirst = {
      ...edge('delimiter-first', basePath),
      source: 'a',
      target: 'b\u001fc',
    };
    const delimiterSecond = {
      ...edge('delimiter-second', basePath),
      source: 'a\u001fb',
      target: 'c',
    };
    expect(buildQualityEdgeInputSnapshot(delimiterFirst).signature)
      .not.toBe(buildQualityEdgeInputSnapshot(delimiterSecond).signature);

    const horizontal = edge('long-hop-horizontal', basePath);
    const vertical = edge(
      'long-hop-vertical',
      [{ x: 50, y: 0 }, { x: 50, y: 100 }],
    );
    const prefix = 'x'.repeat(128);
    const withoutCrossingHop = [
      { ...horizontal, data: { ...horizontal.data, h: `${prefix};20,20;` } },
      vertical,
    ];
    const withCrossingHop = [
      { ...horizontal, data: { ...horizontal.data, h: `${prefix};50,50;` } },
      vertical,
    ];
    const withoutHopScore = calculateMemoizedEdgePathQualityDecomposition(
      withoutCrossingHop,
      buildQualityInputSnapshot(withoutCrossingHop),
    ).score;
    const withHopScore = calculateMemoizedEdgePathQualityDecomposition(
      withCrossingHop,
      buildQualityInputSnapshot(withCrossingHop),
    ).score;

    expect(withoutHopScore.strictCrossings).toBe(1);
    expect(withHopScore.strictCrossings).toBe(0);
    expect(withHopScore).toEqual(calculateEdgePathQualityScoreExact(withCrossingHop));
  });

  it('keeps the allocation-light edge signature byte-compatible', () => {
    const candidate = {
      ...edge('signature', [{ x: -12.5, y: 0 }, { x: 4, y: 98.25 }]),
      sourceHandle: 'source:right:1',
      targetHandle: null,
    };
    const snapshot = buildQualityEdgeInputSnapshot(candidate);
    const encode = (value: string): string => `${value.length}:${value}`;
    const pathSignature = snapshot.path
      .map(point => encode(`${point.x},${point.y}`))
      .join('');
    const expectedSignature = [
      candidate.source,
      candidate.target,
      candidate.sourceHandle ?? '',
      candidate.targetHandle ?? '',
      edgeRoutingExactQualityIntentToken(candidate),
      pathSignature,
    ].map(value => encode(String(value))).join('');

    expect(snapshot.signature).toBe(expectedSignature);
  });
});
