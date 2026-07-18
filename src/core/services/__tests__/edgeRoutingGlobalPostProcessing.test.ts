import { describe, expect, it, vi } from 'vitest';

import type {
  PathFindingResult,
  Point,
} from '../../types/routing';
import {
  applyGlobalRoutingPostProcessing,
  cleanRoutingPath,
} from '../edgeRoutingGlobalPostProcessing';

const result = (
  edgeId: string,
  points: Point[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }],
): PathFindingResult => ({
  jobId: `job-${edgeId}`,
  edgeId,
  path: '',
  points,
  labelX: 0,
  labelY: 0,
});

const request = (edgeId: string) => ({
  edgeId,
  job: {
    source: 'source',
    target: 'target',
  },
});

describe('edgeRoutingGlobalPostProcessing', () => {
  it('normalizes finite rounded orthogonal paths', () => {
    const cleaned = cleanRoutingPath([
      { x: 0.2, y: 0.4 },
      { x: Number.NaN, y: 5 },
      { x: 10.4, y: 10.2 },
      { x: 20.1, y: 10.4 },
      { x: 30, y: 10 },
    ]);

    expect(cleaned[0]).toEqual({ x: 0, y: 0 });
    expect(cleaned.at(-1)).toEqual({ x: 30, y: 10 });
    expect(cleaned.every(point =>
      Number.isInteger(point.x) && Number.isInteger(point.y),
    )).toBe(true);
    for (let index = 1; index < cleaned.length; index++) {
      expect(
        cleaned[index - 1].x === cleaned[index].x
        || cleaned[index - 1].y === cleaned[index].y,
      ).toBe(true);
    }
  });

  it('runs the repair pipeline in a deterministic bounded order', () => {
    const calls: string[] = [];
    const pass = (name: string) => vi.fn((paths: Map<string, Point[]>) => {
      calls.push(name);
      return paths;
    });
    const channelRouting = vi.fn((
      paths: Map<string, Point[]>,
      _spacing = 12,
      _buddyGroups?: unknown[],
      _fixedEdgeIds = new Set<string>(),
    ) => {
      calls.push('channel');
      return paths;
    });
    const applyPaths = vi.fn(() => {
      calls.push('apply');
      return 1;
    });

    applyGlobalRoutingPostProcessing({
      results: [result('edge-a')],
      requests: [request('edge-a')],
      graphEdges: [],
      config: {
        postProcessing: {
          enableWaypointRefinement: false,
          nudgeSpacing: 16,
        },
      } as any,
      hardObstacles: [],
      softObstacles: [],
      candidateAxes: { horizontal: [], vertical: [] },
      operations: {
        channelRouting,
        refineFanIn: pass('fan-in'),
        repairHardObstacles: pass('hard'),
        repairCrossings: pass('crossing'),
        applyPaths,
      } as any,
    });

    expect(calls).toEqual([
      'channel',
      'fan-in',
      'hard',
      'crossing',
      'hard',
      'crossing',
      'hard',
      'crossing',
      'hard',
      'apply',
    ]);
    expect(channelRouting.mock.calls[0][1]).toBe(16);
    expect(applyPaths).toHaveBeenCalledOnce();
  });

  it('sanitizes spacing and includes fixed paths as immutable context', () => {
    const channelRouting = vi.fn((
      paths: Map<string, Point[]>,
      _spacing = 12,
      _buddyGroups?: unknown[],
      _fixedEdgeIds = new Set<string>(),
    ) => paths);
    applyGlobalRoutingPostProcessing({
      results: [result('active')],
      requests: [request('active')],
      graphEdges: [],
      config: {
        postProcessing: {
          enableWaypointRefinement: false,
          nudgeSpacing: Number.NaN,
        },
      } as any,
      fixedContextPaths: new Map([
        ['fixed', [{ x: 0.2, y: 0.2 }, { x: 10.2, y: 10.2 }]],
      ]),
      hardObstacles: [],
      softObstacles: [],
      candidateAxes: { horizontal: [], vertical: [] },
      operations: {
        channelRouting,
      },
    });

    const [paths, spacing, , fixedEdgeIds] = channelRouting.mock.calls[0];
    expect(spacing).toBe(12);
    expect(paths.has('active')).toBe(true);
    expect(paths.get('fixed')).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(fixedEdgeIds).toEqual(new Set(['fixed']));
  });

  it('isolates post-processing failures through the supplied safe callback', () => {
    const failure = new Error('channel failure');
    const onFailure = vi.fn();
    const applyPaths = vi.fn();
    applyGlobalRoutingPostProcessing({
      results: [result('edge-a')],
      requests: [request('edge-a')],
      graphEdges: [],
      config: {},
      hardObstacles: [],
      softObstacles: [],
      candidateAxes: { horizontal: [], vertical: [] },
      onFailure,
      operations: {
        channelRouting: vi.fn(() => {
          throw failure;
        }),
        applyPaths,
      },
    });

    expect(onFailure).toHaveBeenCalledWith(failure);
    expect(applyPaths).not.toHaveBeenCalled();
  });

  it('skips null, errored and empty results without invoking algorithms', () => {
    const channelRouting = vi.fn();
    const errored = Object.assign(result('errored'), { error: 'failed' });
    applyGlobalRoutingPostProcessing({
      results: [null, errored, result('empty', [])],
      requests: [],
      graphEdges: [],
      config: {},
      hardObstacles: [],
      softObstacles: [],
      candidateAxes: { horizontal: [], vertical: [] },
      operations: { channelRouting },
    });

    expect(channelRouting).not.toHaveBeenCalled();
  });
});
