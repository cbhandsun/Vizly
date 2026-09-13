import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createLocalDoglegRepairDiagnostics,
  repairLocalDoglegArtifacts,
} from '../edgeLocalDoglegRepair';
import {
  createEdgeObstacleInteractionContext,
  createEdgePathInteractionContext,
  type Point,
  toSegments,
} from '../edgeLocalDoglegGeometry';
import {
  OUTER_LANE_CONTRACTION_CANDIDATE_LIMIT,
  buildOuterLaneContractionCandidates,
} from '../edgeLocalDoglegLaneGeometry';

const nodes: Node[] = [
  { id: 'source', position: { x: -80, y: -30 }, data: {}, measured: { width: 60, height: 60 } },
  { id: 'target', position: { x: 220, y: -30 }, data: {}, measured: { width: 60, height: 60 } },
];

describe('local dogleg repair diagnostics', () => {
  it('reports only bounded aggregate work for a risky route', () => {
    const diagnostics = createLocalDoglegRepairDiagnostics();
    const edges: Edge[] = [{
      id: 'dogleg',
      source: 'source',
      target: 'target',
      data: {
        computedPath: [
          { x: 0, y: 0 },
          { x: 0, y: 40 },
          { x: 80, y: 40 },
          { x: 80, y: 68 },
          { x: 120, y: 68 },
          { x: 120, y: 0 },
        ],
      },
    }];

    repairLocalDoglegArtifacts(edges, nodes, diagnostics);

    expect(diagnostics.riskyEdgeCount).toBe(1);
    expect(diagnostics.processedEdgeCount).toBe(1);
    expect(diagnostics.passCount).toBeGreaterThan(0);
    expect(diagnostics.candidateCount).toBeGreaterThan(0);
    expect(diagnostics.qualityEvaluationCount).toBeGreaterThan(0);
    expect(diagnostics.qualityEvaluationCount).toBeLessThan(diagnostics.candidateCount);
    expect(diagnostics.passCount).toBeGreaterThan(1);
    expect(diagnostics.minimumCandidateCount).toBeGreaterThan(0);
    expect(diagnostics.maximumCandidateCount)
      .toBeGreaterThanOrEqual(diagnostics.minimumCandidateCount);
    expect(diagnostics.maximumCandidateCount)
      .toBeLessThanOrEqual(diagnostics.candidateCount);
    expect(diagnostics.cacheHitCount).toBeGreaterThan(0);
    expect(diagnostics.deduplicatedCandidateCount).toBeGreaterThan(0);
    const familyCandidateCount = diagnostics.scalarCandidateCount
      + diagnostics.channelCandidateCount
      + diagnostics.outerLaneCandidateCount
      + diagnostics.tinyLaneCandidateCount
      + diagnostics.obstacleLaneCandidateCount
      + diagnostics.endpointLaneCandidateCount
      + diagnostics.endpointOffsetCandidateCount
      + diagnostics.terminalBridgeCandidateCount
      + diagnostics.returnCandidateCount;
    expect(familyCandidateCount).toBe(diagnostics.candidateCount);
    expect(Object.keys(diagnostics).sort()).toEqual([
      'cacheHitCount',
      'candidateCount',
      'channelCandidateCount',
      'deduplicatedCandidateCount',
      'endpointLaneCandidateCount',
      'endpointOffsetCandidateCount',
      'maximumCandidateCount',
      'minimumCandidateCount',
      'obstacleLaneCandidateCount',
      'outerLaneCandidateCount',
      'passCount',
      'processedEdgeCount',
      'qualityEvaluationCount',
      'returnCandidateCount',
      'riskyEdgeCount',
      'scalarCandidateCount',
      'terminalBridgeCandidateCount',
      'tinyLaneCandidateCount',
    ]);
  });

  it('does not manufacture work for empty or clean routes', () => {
    const emptyDiagnostics = createLocalDoglegRepairDiagnostics();
    expect(repairLocalDoglegArtifacts([], nodes, emptyDiagnostics)).toEqual([]);
    expect(emptyDiagnostics).toEqual(createLocalDoglegRepairDiagnostics());

    const cleanDiagnostics = createLocalDoglegRepairDiagnostics();
    const clean: Edge[] = [{
      id: 'clean',
      source: 'source',
      target: 'target',
      data: { computedPath: [{ x: 0, y: 0 }, { x: 120, y: 0 }] },
    }];
    expect(repairLocalDoglegArtifacts(clean, nodes, cleanDiagnostics)).toBe(clean);
    expect(cleanDiagnostics).toEqual(createLocalDoglegRepairDiagnostics());
  });

  it('keeps lane candidates identical when reusing an immutable segment snapshot', () => {
    const edge: Edge = { id: 'current', source: 'source', target: 'target', data: {} };
    const path = [
      { x: 0, y: 0 },
      { x: -100, y: 0 },
      { x: -100, y: 100 },
      { x: 50, y: 100 },
    ];
    const paths = new Map([
      ['current', path],
      ['peer', [{ x: -80, y: 50 }, { x: 80, y: 50 }]],
    ]);
    const obstacles = new Map([
      ['block', { x: -72, y: 20, width: 24, height: 60 }],
    ]);
    const exhaustive = buildOuterLaneContractionCandidates(
      path, 0, edge, 'current', paths, obstacles,
    );
    const snapshot = createEdgePathInteractionContext('current', paths);

    expect(buildOuterLaneContractionCandidates(
      path,
      0,
      edge,
      'current',
      paths,
      obstacles,
      snapshot.otherSegments,
    )).toEqual(exhaustive);
    expect(Object.isFrozen(snapshot.otherSegments)).toBe(true);
  });

  it('keeps outer-lane contraction candidates bounded by ranked local relevance', () => {
    const edge: Edge = { id: 'current', source: 'source', target: 'target', data: {} };
    const path = [
      { x: 0, y: 0 },
      { x: -10_000, y: 0 },
      { x: -10_000, y: 100 },
      { x: 50, y: 100 },
    ];
    const peerPaths: [string, Point[]][] = Array.from({ length: OUTER_LANE_CONTRACTION_CANDIDATE_LIMIT + 200 }, (_, index) => {
      const x = -9_900 + index * 12;
      return [`peer-${index}`, [{ x, y: 50 }, { x: x + 4, y: 50 }]];
    });
    const paths = new Map<string, Point[]>([
      ['current', path],
      ...peerPaths,
    ]);

    const candidates = buildOuterLaneContractionCandidates(
      path,
      0,
      edge,
      'current',
      paths,
      new Map(),
    );

    expect(candidates).toHaveLength(OUTER_LANE_CONTRACTION_CANDIDATE_LIMIT);
    expect(candidates[0]?.[1]?.x).toBeGreaterThan(candidates.at(-1)?.[1]?.x ?? Number.NEGATIVE_INFINITY);
  });

  it('returns an exact count below a bound and stops only after proving rejection', () => {
    const paths = new Map([
      ['current', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]],
      ['peer-a', [{ x: 50, y: -20 }, { x: 50, y: 120 }]],
      ['peer-b', [{ x: 75, y: -20 }, { x: 75, y: 120 }]],
    ]);
    const segments = toSegments(paths.get('current') ?? []);
    const interactions = createEdgePathInteractionContext('current', paths);
    expect(interactions.countCrossings(segments)).toBe(2);
    expect(interactions.countCrossings(segments, 0)).toBeGreaterThan(0);
    expect(interactions.countCrossings(segments, 2)).toBe(2);
    expect(interactions.readMetrics().cacheHitCount).toBeGreaterThan(0);

    const obstacles = new Map([
      ['source', { x: -20, y: -20, width: 20, height: 20 }],
      ['target', { x: 100, y: 100, width: 20, height: 20 }],
      ['block-a', { x: 30, y: -10, width: 10, height: 20 }],
      ['block-b', { x: 60, y: -10, width: 10, height: 20 }],
    ]);
    const obstacleContext = createEdgeObstacleInteractionContext({
      id: 'current', source: 'source', target: 'target', data: {},
    }, obstacles);
    expect(obstacleContext.countSegmentHits(segments)).toBe(2);
    expect(obstacleContext.countSegmentHits(segments, 0)).toBeGreaterThan(0);
    expect(obstacleContext.countSegmentHits(segments, 2)).toBe(2);
    expect(obstacleContext.readMetrics().cacheHitCount).toBeGreaterThan(0);
  });

  it('keeps segment-memo interaction results identical to uncached evaluation', () => {
    const paths = new Map([
      ['current', [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]],
      ['peer-a', [{ x: 50, y: -20 }, { x: 50, y: 120 }]],
      ['peer-b', [{ x: 0, y: 40 }, { x: 120, y: 40 }]],
    ]);
    const candidates = [
      ...toSegments(paths.get('current') ?? []),
      { a: { x: 0, y: 80 }, b: { x: 100, y: 80 } },
    ];
    const memoized = createEdgePathInteractionContext('current', paths);
    const uncached = createEdgePathInteractionContext('current', paths, {
      disableSegmentMemo: true,
    });

    expect(memoized.countCrossings(candidates)).toBe(uncached.countCrossings(candidates));
    expect(memoized.countCrossings(candidates, 0)).toBeGreaterThan(0);
    expect(memoized.countParallelOverlap(candidates))
      .toBe(uncached.countParallelOverlap(candidates));
    memoized.countCrossings(candidates);
    memoized.countParallelOverlap(candidates);
    expect(memoized.readMetrics().cacheHitCount).toBeGreaterThan(0);

    const edge: Edge = { id: 'current', source: 'source', target: 'target', data: {} };
    const obstacles = new Map([
      ['source', { x: -20, y: -20, width: 20, height: 20 }],
      ['target', { x: 100, y: 100, width: 20, height: 20 }],
      ['block', { x: 30, y: -10, width: 10, height: 20 }],
    ]);
    const memoizedObstacles = createEdgeObstacleInteractionContext(edge, obstacles);
    const uncachedObstacles = createEdgeObstacleInteractionContext(edge, obstacles, {
      disableSegmentMemo: true,
    });
    expect(memoizedObstacles.countSegmentHits(candidates))
      .toBe(uncachedObstacles.countSegmentHits(candidates));
    expect(memoizedObstacles.countPathHits(paths.get('current') ?? []))
      .toBe(uncachedObstacles.countPathHits(paths.get('current') ?? []));
    expect(memoizedObstacles.readMetrics().cacheHitCount).toBeGreaterThan(0);
  });
});
