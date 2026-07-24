import { describe, expect, it } from 'vitest';

import type {
  PathFindingJob,
  SharedGraphContext,
} from '../../../types/routing';
import { ObstacleAnalyzer } from '../../preprocessing/ObstacleAnalyzer';
import {
  createSelfLoopRoutingResult,
  resolveWorkerRoutingContext,
} from '../edgeRoutingWorkerContext';

const job = (
  source = 'source',
  target = 'target',
): PathFindingJob => ({
  jobId: 'job-edge',
  edgeId: 'edge',
  source,
  target,
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
});

const graph = (
  nodes: unknown[],
  edges: unknown[] = [],
  obstacles: unknown[] = [],
  containerBounds: unknown[] = [],
): SharedGraphContext => ({
  nodes,
  edges,
  obstacles,
  containerBounds,
  config: {},
} as SharedGraphContext);

describe('edgeRoutingWorkerContext', () => {
  it('parses graph boundaries and removes endpoint obstacles', () => {
    const resolution = resolveWorkerRoutingContext(
      job(),
      graph(
        [
          {
            id: 'source',
            position: { x: 10, y: 20 },
            measured: { width: 80, height: 40 },
          },
          {
            id: 'target',
            position: { x: 300, y: 200 },
            measured: { width: 0, height: Number.NaN },
          },
          { id: '', position: { x: 999, y: 999 } },
          null,
        ],
        [
          { id: 'edge', source: 'source', target: 'target' },
          { id: '', source: 'source', target: 'target' },
        ],
        [
          { id: 'source', x: 10, y: 20, width: 80, height: 40 },
          { x: 300, y: 200, width: 150, height: 80 },
          { id: 'middle', x: 150, y: 100, width: 20, height: 20 },
          { x: Number.NaN, y: 0, width: 10, height: 10 },
        ],
        [
          { x: 0, y: 0, width: 500, height: 400 },
          { x: 0, y: 0, width: -1, height: 10 },
        ],
      ),
      new ObstacleAnalyzer(),
    );

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.sourceRect).toEqual({
      x: 10,
      y: 20,
      width: 80,
      height: 40,
    });
    expect(resolution.value.targetRect).toEqual({
      x: 300,
      y: 200,
      width: 150,
      height: 80,
    });
    expect(resolution.value.allObstacles).toHaveLength(3);
    expect(resolution.value.routingObstacles).toEqual([
      expect.objectContaining({ id: 'middle' }),
    ]);
    expect(resolution.value.containerBorders).toHaveLength(1);
    expect(resolution.value.edgeMap.has('edge')).toBe(true);
  });

  it('returns an explicit error when either endpoint is missing', () => {
    const resolution = resolveWorkerRoutingContext(
      job(),
      graph([{ id: 'source', position: { x: 0, y: 0 } }]),
      new ObstacleAnalyzer(),
    );
    expect(resolution).toEqual({
      ok: false,
      error: 'Source or Target node not found',
    });
  });

  it('coerces non-finite node coordinates before routing', () => {
    const resolution = resolveWorkerRoutingContext(
      job(' source ', 'target'),
      graph([
        { id: 'source', position: { x: Number.NaN, y: Number.POSITIVE_INFINITY } },
        { id: 'target', position: { x: 100, y: 200 } },
      ]),
      new ObstacleAnalyzer(),
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.sourceRect).toEqual({
      x: 0,
      y: 0,
      width: 150,
      height: 80,
    });
  });

  it('builds a spatial index only for sufficiently large valid obstacle sets', () => {
    const obstacles = Array.from({ length: 21 }, (_, index) => ({
      x: index * 20,
      y: index * 10,
      width: 10,
      height: 10,
    }));
    const resolution = resolveWorkerRoutingContext(
      job(),
      graph([
        { id: 'source', position: { x: 0, y: 0 } },
        { id: 'target', position: { x: 1000, y: 1000 } },
      ], [], obstacles),
      new ObstacleAnalyzer(),
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.spatialIndex).toBeDefined();
  });

  it('creates a deterministic finite self-loop result', () => {
    const loop = createSelfLoopRoutingResult(
      job('source', 'source'),
      { x: 10, y: 20, width: 100, height: 60 },
    );
    expect(loop.metadata?.strategy).toBe('Self-Loop');
    expect(loop.points).toHaveLength(6);
    expect(loop.points[0]).toEqual(loop.points.at(-1));
    expect(loop.points.every(point =>
      Number.isFinite(point.x) && Number.isFinite(point.y),
    )).toBe(true);
    expect(loop.labelX).toBe(154);
    expect(loop.labelY).toBe(50);
  });
});
