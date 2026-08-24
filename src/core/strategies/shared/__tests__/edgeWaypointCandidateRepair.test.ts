import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import {
  createSharedTrunkPreservationContext,
  generateWaypointCandidates,
  preservesSharedTrunk,
  preservesSharedTrunkWithContext,
} from '../edgeWaypointCandidateRepair';

describe('topology-preferred waypoint candidates', () => {
  it('keeps cached shared-trunk preservation identical to direct evaluation', () => {
    const original = [
      { x: 0, y: 0 },
      { x: 0, y: 60 },
      { x: 180, y: 60 },
      { x: 180, y: 180 },
    ];
    const edge: Edge = { id: 'fan', source: 'source', target: 'target' };
    const groups = [{ type: 'o2m' as const, edgeIds: new Set(['fan']) }];
    const obstacles = new Map([
      ['blocker', { x: -20, y: 20, width: 40, height: 40 }],
    ]);
    const context = createSharedTrunkPreservationContext(
      original,
      edge,
      groups,
      obstacles,
    );
    const candidates = [
      original,
      [{ x: 0, y: 0 }, { x: 0, y: 30 }, { x: 220, y: 30 }, { x: 180, y: 180 }],
      [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 180, y: 60 }, { x: 180, y: 180 }],
    ];

    for (const candidate of candidates) {
      expect(preservesSharedTrunkWithContext(candidate, context)).toBe(
        preservesSharedTrunk(candidate, original, edge, groups, obstacles),
      );
    }
  });

  it('reuses an authoritative node-risk result without rescanning node geometry', () => {
    let geometryReads = 0;
    const measured = {
      get width() {
        geometryReads += 1;
        return 80;
      },
      get height() {
        geometryReads += 1;
        return 48;
      },
    };
    const nodes: Node[] = [{
      id: 'unrelated',
      position: { x: 500, y: 500 },
      measured,
      data: {},
    }];
    const edge: Edge = { id: 'edge', source: 'source', target: 'target' };

    generateWaypointCandidates(
      [{ x: 0, y: 0 }, { x: 200, y: 0 }],
      'LR',
      nodes,
      edge,
      { knownNodeRoutingRisk: false },
    );

    expect(geometryReads).toBe(0);
  });

  it('adds finite nearby topology axes as bounded orthogonal candidates', () => {
    const candidates = generateWaypointCandidates(
      [
        { x: 0, y: 0 },
        { x: 0, y: 48 },
        { x: 200, y: 48 },
        { x: 200, y: 200 },
      ],
      'TB',
      undefined,
      undefined,
      { preferredAxes: { x: [96], y: [112] } },
    );

    expect(candidates.some(path => path.some(point => point.x === 96))).toBe(true);
    expect(candidates.some(path => path.some(point => point.y === 112))).toBe(true);
    expect(candidates.length).toBeLessThanOrEqual(140);
    expect(candidates.every(path => path.every(point => (
      Number.isFinite(point.x) && Number.isFinite(point.y)
    )))).toBe(true);
  });

  it('fails closed for non-finite and remote axes without expanding the budget', () => {
    const basePath = [{ x: 0, y: 0 }, { x: 200, y: 200 }];
    const baseline = generateWaypointCandidates(basePath, 'LR');
    const candidates = generateWaypointCandidates(
      basePath,
      'LR',
      undefined,
      undefined,
      {
        preferredAxes: {
          x: [Number.NaN, Number.POSITIVE_INFINITY, 1_000_000],
          y: [Number.NEGATIVE_INFINITY, -1_000_000],
        },
      },
    );

    expect(candidates).toEqual(baseline);
    expect(candidates.length).toBeLessThanOrEqual(140);
  });
});
