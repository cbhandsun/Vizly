import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createLocalDoglegRepairDiagnostics,
  repairLocalDoglegArtifacts,
} from '../edgeLocalDoglegRepair';
import { createEdgePathInteractionContext } from '../edgeLocalDoglegGeometry';
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
    expect(Object.keys(diagnostics).sort()).toEqual([
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
});
