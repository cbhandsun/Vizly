import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  bendCount,
  compactPath,
  countTinyInteriorSegments,
  createEdgeObstacleInteractionContext,
  createLocalDoglegCandidateSnapshot,
  getRoutingObstacles,
  hasTinyInteriorSegment,
  pathLength,
  segmentIntersectsRect,
  toSegments,
  type Point,
  type Rect,
} from '../edgeLocalDoglegGeometry';

function legacyObstacleHits(
  path: readonly Point[],
  edge: Edge,
  obstacles: ReadonlyMap<string, Rect>,
): number {
  let hits = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const [nodeId, rect] of obstacles) {
      if (nodeId === edge.source || nodeId === edge.target) continue;
      if (segmentIntersectsRect(path[index], path[index + 1], rect)) hits += 1;
    }
  }
  return hits;
}

function expectSnapshotParity(input: Point[]): void {
  const normalized = compactPath(input);
  const snapshot = createLocalDoglegCandidateSnapshot(input);
  expect(snapshot.path).toEqual(normalized);
  expect(snapshot.segments).toEqual(toSegments(normalized));
  expect(snapshot.length).toEqual(pathLength(normalized));
  expect(snapshot.bends).toEqual(bendCount(normalized));
}

describe('local dogleg candidate snapshots', () => {
  it('counts only finite orthogonal tiny interior segments', () => {
    expect(countTinyInteriorSegments([])).toBe(0);
    expect(countTinyInteriorSegments([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 8, y: 80 },
      { x: 8, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 200 },
    ])).toBe(1);
    expect(countTinyInteriorSegments([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 20, y: 100 },
      { x: 20, y: 140 },
      { x: Number.NaN, y: 140 },
    ])).toBe(0);
    expect(hasTinyInteriorSegment([
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 8, y: 80 },
      { x: 8, y: 140 },
    ])).toBe(true);
  });

  it('matches the legacy geometry for empty, invalid, and mixed-axis paths', () => {
    expectSnapshotParity([]);
    expectSnapshotParity([{ x: 0, y: 0 }]);
    expectSnapshotParity([{ x: Number.NaN, y: 0 }, { x: 20, y: 0 }]);
    expectSnapshotParity([{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }]);
    expectSnapshotParity([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }]);
    expectSnapshotParity([{ x: 0, y: 0 }, { x: 20, y: 20 }, { x: 40, y: 20 }]);
    expectSnapshotParity([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
      { x: 0, y: 80 },
      { x: 60, y: 80 },
      { x: 60, y: 10 },
    ]);
  });

  it('keeps indexed obstacle counts identical for horizontal, vertical, tangential, and non-finite cases', () => {
    const candidateEdge: Edge = { id: 'candidate', source: 'source', target: 'target' };
    const obstacles = new Map<string, Rect>([
      ['source', { x: -30, y: -30, width: 60, height: 60 }],
      ['target', { x: 170, y: -30, width: 60, height: 60 }],
      ['middle', { x: 50, y: 50, width: 40, height: 40 }],
      ['right', { x: 120, y: 20, width: 20, height: 20 }],
      ['nan', { x: Number.NaN, y: 0, width: 20, height: 20 }],
      ['infinite-width', { x: 140, y: 50, width: Number.POSITIVE_INFINITY, height: 20 }],
    ]);
    const paths: Point[][] = [
      [],
      [{ x: 0, y: 60 }, { x: 200, y: 60 }],
      [{ x: 60, y: 0 }, { x: 60, y: 120 }],
      [{ x: 0, y: 42 }, { x: 42, y: 42 }],
      [{ x: 0, y: 42 }, { x: 43, y: 42 }],
      [{ x: -20, y: 0 }, { x: 20, y: 0 }],
      [{ x: 180, y: 0 }, { x: 220, y: 0 }],
      [{ x: 0, y: 0 }, { x: 20, y: 20 }],
      [{ x: Number.NaN, y: 0 }, { x: 200, y: 0 }],
      [{ x: 0, y: 60 }, { x: Number.POSITIVE_INFINITY, y: 60 }],
    ];
    const context = createEdgeObstacleInteractionContext(candidateEdge, obstacles);

    for (const path of paths) {
      const expected = legacyObstacleHits(path, candidateEdge, obstacles);
      expect(context.countPathHits(path)).toBe(expected);
      expect(context.countSegmentHits(toSegments(path))).toBe(expected);
    }
  });

  it('preserves source/target exclusion and container filtering', () => {
    const nodes: Node[] = [
      {
        id: 'source',
        type: 'default',
        position: { x: 0, y: 0 },
        measured: { width: 80, height: 80 },
        data: {},
      },
      {
        id: 'target',
        type: 'default',
        position: { x: 300, y: 0 },
        measured: { width: 80, height: 80 },
        data: {},
      },
      {
        id: 'ordinary',
        type: 'default',
        position: { x: 140, y: 20 },
        measured: { width: 60, height: 60 },
        data: {},
      },
      {
        id: 'container',
        type: 'group',
        position: { x: 100, y: -100 },
        measured: { width: 240, height: 240 },
        data: {},
      },
    ];
    const obstacles = getRoutingObstacles(nodes);
    const candidateEdge: Edge = { id: 'candidate', source: 'source', target: 'target' };
    const path = [{ x: 20, y: 40 }, { x: 360, y: 40 }];
    const context = createEdgeObstacleInteractionContext(candidateEdge, obstacles);

    expect(obstacles.has('container')).toBe(false);
    expect(legacyObstacleHits(path, candidateEdge, obstacles)).toBe(1);
    expect(context.countPathHits(path)).toBe(1);
    expect(context.countSegmentHits(toSegments(path))).toBe(1);
  });

  it('matches the legacy obstacle scan for a large numeric input', () => {
    const candidateEdge: Edge = { id: 'candidate', source: 'source', target: 'target' };
    const obstacles = new Map<string, Rect>();
    for (let index = 0; index < 512; index += 1) {
      obstacles.set(`obstacle-${index}`, {
        x: (index % 32) * 40,
        y: Math.floor(index / 32) * 40,
        width: 24,
        height: 24,
      });
    }
    const paths: Point[][] = [
      [{ x: -20, y: 128 }, { x: 1320, y: 128 }],
      [{ x: 128, y: -20 }, { x: 128, y: 680 }],
      [
        { x: -20, y: 248 },
        { x: 1280, y: 248 },
        { x: 1280, y: 608 },
        { x: 0, y: 608 },
      ],
    ];
    const context = createEdgeObstacleInteractionContext(candidateEdge, obstacles);

    for (const path of paths) {
      const expected = legacyObstacleHits(path, candidateEdge, obstacles);
      expect(context.countPathHits(path)).toBe(expected);
      expect(context.countSegmentHits(toSegments(path))).toBe(expected);
    }
  });
});
