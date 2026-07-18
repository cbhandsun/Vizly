import type { PathFindingJob, PathFindingResult } from '../../types/routing';
import { describe, expect, it } from 'vitest';

import {
  attachWaypointRefinementDebug,
  applyRefinedPathsToResults,
  buildFanInIgnoredRectangles,
  buildManyToOneFanInGroups,
  buildRoutingBuddyGroups,
  collectFixedRoutingPathContext,
  collectPendingRoutingLineObstacles,
  compactEdgeRoutingLineObstacles,
} from '../edgeRoutingCoordinatorPostProcessing';

describe('edgeRoutingCoordinatorPostProcessing', () => {
  it('merges axis-aligned segments, deduplicates diagonals, and enforces limits', () => {
    const diagonal = { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } };
    const result = compactEdgeRoutingLineObstacles([
      { start: { x: 0, y: 10 }, end: { x: 10, y: 10 } },
      { start: { x: 11, y: 10.4 }, end: { x: 20, y: 10.4 } },
      diagonal,
      { start: diagonal.end, end: diagonal.start },
      { start: { x: Number.NaN, y: 0 }, end: { x: 1, y: 1 } },
    ], 2);

    expect(result).toEqual([
      { start: { x: 0, y: 10 }, end: { x: 20, y: 10 } },
      { start: diagonal.end, end: diagonal.start },
    ]);
    expect(compactEdgeRoutingLineObstacles(result, -1)).toEqual([]);
    expect(compactEdgeRoutingLineObstacles(result, Number.NaN)).toEqual([]);
  });

  it('builds only multi-edge fan-in groups using assigned or graph semantics', () => {
    const requests = [
      { edgeId: 'a', job: { source: 'A', target: 'T' } },
      { edgeId: 'b', job: { source: 'B', target: 'T' } },
      { edgeId: 'c', job: { source: 'C', target: 'U' } },
      { edgeId: '', job: { source: 'D', target: 'U' } },
    ];
    const assignedJobs = requests.map((request, index) => ({
      ...request.job,
      jobId: `job-${index}`,
      edgeId: request.edgeId,
      sourceX: 0,
      sourceY: 0,
      targetX: 0,
      targetY: 0,
      isOneToMany: false,
      isManyToOne: index === 2,
    })) as PathFindingJob[];

    expect(buildManyToOneFanInGroups(
      requests,
      [{ target: 'T' }, { target: 'T' }],
      assignedJobs,
    )).toEqual([{ targetId: 'T', edgeIds: ['a', 'b'] }]);
  });

  it('collects nearby clean pending paths and compacts them to the limit', () => {
    const candidates = [
      {
        edgeId: 'active-neighbor',
        graphKey: 'graph',
        sourceId: 'A',
        targetId: 'B',
        dirty: false,
        cachedPoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
      {
        edgeId: 'nearby',
        graphKey: 'graph',
        sourceId: 'C',
        targetId: 'D',
        dirty: false,
        points: [{ x: 150, y: 20 }, { x: 250, y: 20 }],
      },
      {
        edgeId: 'dirty',
        graphKey: 'graph',
        dirty: true,
        points: [{ x: 0, y: 40 }, { x: 100, y: 40 }],
      },
      {
        edgeId: 'far',
        graphKey: 'graph',
        dirty: false,
        points: [{ x: 1000, y: 1000 }, { x: 1100, y: 1000 }],
      },
    ];

    expect(collectPendingRoutingLineObstacles(
      candidates,
      'graph',
      new Set(['A']),
      2,
    )).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { start: { x: 150, y: 20 }, end: { x: 250, y: 20 } },
    ]);
  });

  it('selects finite fixed paths overlapping the active spatial context', () => {
    const activeResults = [{
      jobId: 'active-job',
      edgeId: 'active',
      path: '',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      labelX: 0,
      labelY: 0,
    }] satisfies PathFindingResult[];
    const result = collectFixedRoutingPathContext([
      {
        edgeId: 'near',
        graphKey: 'graph',
        dirty: false,
        points: [{ x: 200, y: 20 }, { x: 300, y: 20 }],
      },
      {
        edgeId: 'active',
        graphKey: 'graph',
        dirty: false,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      },
      {
        edgeId: 'far',
        graphKey: 'graph',
        dirty: false,
        points: [{ x: 1000, y: 1000 }, { x: 1100, y: 1000 }],
      },
    ], 'graph', activeResults, new Set(['active']), 1);

    expect([...result.entries()]).toEqual([[
      'near',
      [{ x: 200, y: 20 }, { x: 300, y: 20 }],
    ]]);
  });

  it('copies only finite non-negative endpoint rectangles', () => {
    const result = buildFanInIgnoredRectangles([
      {
        edgeId: 'edge',
        job: {
          source: 'A',
          target: 'B',
          sourceRect: { x: 0, y: 0, width: 10, height: 20 },
          targetRect: { x: 0, y: 0, width: -1, height: 20 },
        },
      },
    ]);

    expect(result.get('edge')).toEqual([
      { x: 0, y: 0, width: 10, height: 20 },
    ]);
  });

  it('attaches per-edge waypoint refinement status without losing debug data', () => {
    const results = [
      {
        jobId: 'changed-job',
        edgeId: 'changed',
        points: [],
        path: '',
        labelX: 0,
        labelY: 0,
        debugInfo: { algorithmDebug: { existing: true } },
      },
      {
        jobId: 'stable-job',
        edgeId: 'stable',
        points: [],
        path: '',
        labelX: 0,
        labelY: 0,
      },
    ] satisfies PathFindingResult[];
    const summary = {
      changedEdgeIds: ['changed'],
      changedEdgeCount: 1,
      iterationCount: 2,
    } as any;

    attachWaypointRefinementDebug(results, summary);

    expect((results[0].debugInfo as any).algorithmDebug.existing).toBe(true);
    expect((results[0].debugInfo as any).algorithmDebug.waypointRefinement.changed).toBe(true);
    expect((results[1].debugInfo as any).algorithmDebug.waypointRefinement.changed).toBe(false);
  });

  it('builds O2M and M2O buddy groups with deduplicated members', () => {
    const requests = [
      { edgeId: 'a', job: { source: 'S', target: 'T', isOneToMany: true } },
      { edgeId: 'b', job: { source: 'S', target: 'U', isOneToMany: true } },
      { edgeId: 'c', job: { source: 'V', target: 'T', isManyToOne: true } },
    ];
    const groups = buildRoutingBuddyGroups(requests);

    expect(groups.map(group => ({
      type: group.type,
      edgeIds: [...group.edgeIds],
    }))).toEqual([
      { type: 'o2m', edgeIds: ['a', 'b'] },
      { type: 'm2o', edgeIds: ['c'] },
    ]);
  });

  it('applies only finite changed paths and updates label geometry', () => {
    const results = [{
      jobId: 'job',
      edgeId: 'edge',
      path: 'old',
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      labelX: 5,
      labelY: 0,
    }] satisfies PathFindingResult[];
    const changed = applyRefinedPathsToResults(results, new Map([
      ['edge', [{ x: 0, y: 0 }, { x: 20, y: 0 }]],
      ['invalid', [{ x: Number.NaN, y: 0 }]],
    ]), Number.NaN);

    expect(changed).toBe(1);
    expect(results[0].points).toEqual([{ x: 0, y: 0 }, { x: 20, y: 0 }]);
    expect(results[0].labelX).toBe(10);
    expect(results[0].labelY).toBe(0);
    expect(results[0].path).not.toBe('old');
  });
});
