import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createLocalDoglegRepairDiagnostics,
  repairLocalDoglegArtifacts,
} from '../edgeLocalDoglegRepair';
import {
  createEdgeObstacleInteractionContext,
  createEdgePathInteractionContext,
  toSegments,
} from '../edgeLocalDoglegGeometry';
import { buildOuterLaneContractionCandidates } from '../edgeLocalDoglegLaneGeometry';

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
    expect(diagnostics.passCount).toBeGreaterThan(1);
    expect(diagnostics.cacheHitCount).toBeGreaterThan(diagnostics.passCount);
    expect(Object.keys(diagnostics).sort()).toEqual([
      'cacheHitCount',
      'candidateCount',
      'passCount',
      'processedEdgeCount',
      'qualityEvaluationCount',
      'riskyEdgeCount',
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
  });
});
