import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { PathFindingJob, PathFindingResult, SharedGraphContext } from '../../types/routing';

const safeLogState = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
}));

vi.mock('../../utils/consoleCleanup', () => ({
  safeLog: safeLogState,
}));

const graph = (): SharedGraphContext => ({
  nodes: [],
  edges: [],
  obstacles: [],
  config: {},
});

const job = (id: string): PathFindingJob => ({
  jobId: id,
  edgeId: id,
  source: `source-${id}`,
  target: `target-${id}`,
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
});

const result = (input: PathFindingJob): PathFindingResult => ({
  jobId: input.jobId,
  edgeId: input.edgeId,
  path: `M ${input.sourceX} ${input.sourceY} L ${input.targetX} ${input.targetY}`,
  points: [{ x: input.sourceX, y: input.sourceY }, { x: input.targetX, y: input.targetY }],
  labelX: 50,
  labelY: 50,
});

describe('edgeRoutingParallel', () => {
  afterEach(() => {
    Object.values(safeLogState).forEach(mock => mock.mockReset());
    vi.restoreAllMocks();
  });

  it('runs serial fallback hooks and returns fallback paths when a job fails', async () => {
    const { routeSerialFallbackJobs } = await import('../edgeRoutingParallel');
    const jobs = [job('ok'), job('bad')];
    const assignBusIndices = vi.fn();
    const assignSameSidePortSeparation = vi.fn();
    const assignGlobalChannels = vi.fn();
    const calculatePath = vi.fn(async (currentJob: PathFindingJob) => {
      if (currentJob.edgeId === 'bad') {
        throw new Error('Authorization: Bearer serial-secret');
      }
      return result(currentJob);
    });

    const results = await routeSerialFallbackJobs({
      jobs,
      graph: graph(),
      assignBusIndices,
      assignSameSidePortSeparation,
      assignGlobalChannels,
      calculatePath,
    });

    expect(assignBusIndices).toHaveBeenCalledOnce();
    expect(assignSameSidePortSeparation).toHaveBeenCalledOnce();
    expect(assignGlobalChannels).toHaveBeenCalledOnce();
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ edgeId: 'ok' });
    expect(results[1]).toMatchObject({ edgeId: 'bad', path: 'M 0 0 L 100 100' });
    const payload = JSON.stringify(safeLogState.error.mock.calls);
    expect(payload).toContain('[Coordinator] Serial routing failed for bad:');
    expect(payload).toContain('[redacted]');
    expect(payload).not.toContain('serial-secret');
  });

  it('routes in parallel when available and seeds allEdges from jobs', async () => {
    const { routeJobsWithParallelFallback } = await import('../edgeRoutingParallel');
    const jobs = [job('a'), job('b')];
    const setAllEdges = vi.fn();
    const parallelPool = {
      calculatePaths: vi.fn(async (currentJobs: PathFindingJob[]) => currentJobs.map(result)),
    };

    const results = await routeJobsWithParallelFallback({
      jobs,
      graph: graph(),
      useParallelRouting: true,
      parallelPool,
      runSerialFallback: vi.fn(),
      allEdges: [],
      setAllEdges,
    });

    expect(parallelPool.calculatePaths).toHaveBeenCalledOnce();
    expect(setAllEdges).toHaveBeenCalledWith([
      { id: 'a', source: 'source-a', target: 'target-a', data: {} },
      { id: 'b', source: 'source-b', target: 'target-b', data: {} },
    ] satisfies Edge[]);
    expect(results).toEqual([result(jobs[0]), result(jobs[1])]);
  });

  it('falls back to serial mode when pool is missing, incomplete, or throws', async () => {
    const { routeJobsWithParallelFallback } = await import('../edgeRoutingParallel');
    const jobs = [job('a'), job('b')];
    const serialResult = [result(jobs[0])];

    const missingPoolFallback = vi.fn(async () => serialResult);
    await expect(routeJobsWithParallelFallback({
      jobs,
      graph: graph(),
      useParallelRouting: true,
      parallelPool: null,
      runSerialFallback: missingPoolFallback,
      allEdges: [{ id: 'existing', source: 's', target: 't', data: {} }],
      setAllEdges: vi.fn(),
    })).resolves.toBe(serialResult);
    expect(missingPoolFallback).toHaveBeenCalledOnce();

    const incompleteFallback = vi.fn(async () => serialResult);
    const incompleteResults = await routeJobsWithParallelFallback({
      jobs,
      graph: graph(),
      useParallelRouting: true,
      parallelPool: {
        calculatePaths: vi.fn(async () => [result(jobs[0])]),
      },
      runSerialFallback: incompleteFallback,
      allEdges: [{ id: 'existing', source: 's', target: 't', data: {} }],
      setAllEdges: vi.fn(),
    });
    expect(incompleteResults).toHaveLength(1);
    expect(safeLogState.error).toHaveBeenCalledWith(
      '[EdgeRoutingCoordinator] Parallel routing returned incomplete results. Expected 2, got 1'
    );
    expect(incompleteFallback).not.toHaveBeenCalled();

    const thrownFallback = vi.fn(async () => serialResult);
    await expect(routeJobsWithParallelFallback({
      jobs,
      graph: graph(),
      useParallelRouting: true,
      parallelPool: {
        calculatePaths: vi.fn(async () => {
          throw new Error('token=parallel-secret');
        }),
      },
      runSerialFallback: thrownFallback,
      allEdges: [{ id: 'existing', source: 's', target: 't', data: {} }],
      setAllEdges: vi.fn(),
    })).resolves.toBe(serialResult);
    expect(thrownFallback).toHaveBeenCalledOnce();
    expect(JSON.stringify(safeLogState.error.mock.calls)).toContain('[redacted]');
    expect(JSON.stringify(safeLogState.error.mock.calls)).not.toContain('parallel-secret');
  });
});
