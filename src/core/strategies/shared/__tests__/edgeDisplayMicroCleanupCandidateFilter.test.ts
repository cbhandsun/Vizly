import { describe, expect, it } from 'vitest';

import {
  compoundShiftCanMeetLocalQualityBounds,
  createDisplayMicroCleanupDiagnostics,
  displayMicroCleanupNeedsRepair,
  localMicroCandidateCanImproveQuality,
  repairDisplayMicroArtifacts,
} from '../edgeDisplayMicroCleanup';

describe('localMicroCandidateCanImproveQuality', () => {
  it('identifies the exact no-op boundary used by defect-driven polish', () => {
    const route = (computedPath: Array<{ x: number; y: number }>) => [{
      id: 'needs-repair-edge',
      source: 'source',
      target: 'target',
      data: { computedPath },
    }];

    expect(displayMicroCleanupNeedsRepair(route([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]))).toBe(false);
    expect(displayMicroCleanupNeedsRepair(route([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 32, y: 100 },
      { x: 32, y: 200 },
    ]))).toBe(true);
  });

  it('rejects routing-equivalent and lane-only candidates', () => {
    const baseline = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
    ];

    expect(localMicroCandidateCanImproveQuality(baseline, baseline)).toBe(false);
    expect(localMicroCandidateCanImproveQuality(baseline, [
      { x: 0, y: 0 },
      { x: 0, y: 120 },
      { x: 100, y: 120 },
      { x: 100, y: 200 },
    ])).toBe(false);
  });

  it('retains candidates that improve a micro defect, bends, or detour', () => {
    expect(localMicroCandidateCanImproveQuality([
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 100 },
      { x: 100, y: 100 },
    ], [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 100 },
      { x: 100, y: 100 },
    ])).toBe(true);

    expect(localMicroCandidateCanImproveQuality([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 200 },
    ], [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ])).toBe(true);

    expect(localMicroCandidateCanImproveQuality([
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 100, y: 300 },
      { x: 100, y: 0 },
    ], [
      { x: 0, y: 0 },
      { x: 0, y: 200 },
      { x: 100, y: 200 },
      { x: 100, y: 0 },
    ])).toBe(true);
  });

  it('fails closed for a newly non-orthogonal candidate', () => {
    expect(localMicroCandidateCanImproveQuality([
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ], [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ])).toBe(false);
  });

  it('rejects compound shifts whose single-edge defects already exceed the baseline', () => {
    const clean = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const tinyShift = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 100 },
      { x: 100, y: 100 },
    ];
    const baseline = {
      nonOrthogonalSegments: 0,
      strictCrossings: 1,
      reverseOverlap: 0,
      unrelatedOverlap: 0,
      relatedOverlap: 0,
      unexplainedRelatedOverlap: 0,
      shortEndpointStubs: 0,
      tinyInteriorDoglegs: 0,
      hairpins: 0,
      backtrackPenalty: 0,
      detourPenalty: 0,
      bends: 1,
      totalLength: 200,
    };

    expect(compoundShiftCanMeetLocalQualityBounds(baseline, baseline, clean, tinyShift))
      .toBe(false);
    expect(compoundShiftCanMeetLocalQualityBounds(baseline, baseline, clean, clean))
      .toBe(true);
  });

  it('reports aggregate-only candidate and cache diagnostics', () => {
    const edges = [{
      id: 'diagnostics-cache-edge',
      source: 'diagnostics-source',
      target: 'diagnostics-target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
    }];
    const first = createDisplayMicroCleanupDiagnostics();
    const second = createDisplayMicroCleanupDiagnostics();

    expect(repairDisplayMicroArtifacts(edges, undefined, first)).toBe(edges);
    const freshIdentity = edges.map(edge => ({ ...edge, data: { ...edge.data } }));
    expect(repairDisplayMicroArtifacts(freshIdentity, undefined, second)).toBe(freshIdentity);
    expect(first).toMatchObject({ cacheHitCount: 0, evaluatedCandidateCount: 0 });
    expect(second).toMatchObject({ cacheHitCount: 1, evaluatedCandidateCount: 0 });
  });

  it('limits derivative cleanup to the changed edge set', () => {
    const tinyStair = (id: string, offset: number) => ({
      id,
      source: `${id}-source`,
      target: `${id}-target`,
      data: {
        computedPath: [
          { x: offset, y: 0 },
          { x: offset + 96, y: 0 },
          { x: offset + 96, y: 190 },
          { x: offset + 84, y: 190 },
          { x: offset + 84, y: 202 },
          { x: offset, y: 202 },
        ],
      },
    });
    const edges = [tinyStair('selected-edge', 0), tinyStair('frozen-edge', 1000)];
    const frozenPath = edges[1].data.computedPath;
    const diagnostics = createDisplayMicroCleanupDiagnostics();

    const repaired = repairDisplayMicroArtifacts(
      edges,
      undefined,
      diagnostics,
      { candidateEdgeIndexes: [0, 0, -1, 99] },
    );

    expect(repaired[0]).not.toBe(edges[0]);
    expect(repaired[1]).toBe(edges[1]);
    expect(repaired[1].data?.computedPath).toBe(frozenPath);
    expect(diagnostics.generatedCandidateCount).toBeGreaterThan(0);
  });

  it('treats an empty derivative change set as an exact no-op', () => {
    const edges = [{
      id: 'unchanged-derivative',
      source: 'unchanged-source',
      target: 'unchanged-target',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 12, y: 0 },
          { x: 12, y: 100 },
          { x: 100, y: 100 },
        ],
      },
    }];
    const diagnostics = createDisplayMicroCleanupDiagnostics();

    expect(repairDisplayMicroArtifacts(
      edges,
      undefined,
      diagnostics,
      { candidateEdgeIndexes: [] },
    )).toBe(edges);
    expect(diagnostics).toMatchObject({
      generatedCandidateCount: 0,
      evaluatedCandidateCount: 0,
      cacheHitCount: 0,
    });
  });

  it('reuses an unconstrained no-op under stricter safety constraints', () => {
    const edges = [{
      id: 'safety-noop-cache-edge',
      source: 'safety-noop-source',
      target: 'safety-noop-target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 120, y: 0 }] },
    }];
    const warmup = createDisplayMicroCleanupDiagnostics();
    const constrained = createDisplayMicroCleanupDiagnostics();
    const safetyScore = { obstacleHits: 0, attachedTerminals: 1, anchoredTerminals: 1 };

    expect(repairDisplayMicroArtifacts(edges, undefined, warmup)).toBe(edges);
    const freshIdentity = edges.map(edge => ({ ...edge, data: { ...edge.data } }));
    expect(repairDisplayMicroArtifacts(freshIdentity, {
      baseline: safetyScore,
      evaluate: () => {
        throw new Error('cache hit must not invoke the safety evaluator');
      },
    }, constrained)).toBe(freshIdentity);
    expect(constrained).toMatchObject({ cacheHitCount: 1, evaluatedCandidateCount: 0 });
  });

  it('remembers a proven repaired fixed point for later routing phases', () => {
    const edges = [{
      id: 'fixed-point-output-edge',
      source: 'fixed-point-source',
      target: 'fixed-point-target',
      data: {
        computedPath: [
          { x: 4351, y: 496 },
          { x: 4255, y: 496 },
          { x: 4255, y: 686 },
          { x: 4243, y: 686 },
          { x: 4243, y: 698 },
          { x: 347, y: 698 },
          { x: 347, y: 638 },
          { x: 291, y: 638 },
        ],
      },
    }];
    const first = createDisplayMicroCleanupDiagnostics();
    const second = createDisplayMicroCleanupDiagnostics();

    const repaired = repairDisplayMicroArtifacts(edges, undefined, first);
    const freshFixedPoint = repaired.map(edge => ({
      ...edge,
      data: { ...edge.data },
    }));
    const repeated = repairDisplayMicroArtifacts(freshFixedPoint, undefined, second);

    expect(repaired).not.toBe(edges);
    expect(repeated).toBe(freshFixedPoint);
    expect(first.cacheHitCount).toBe(0);
    expect(second).toMatchObject({ cacheHitCount: 1, evaluatedCandidateCount: 0 });
  });
});
