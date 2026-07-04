import type { Edge } from '@xyflow/react';
import type { PathFindingJob, PathFindingResult, SharedGraphContext } from '../types/routing';
import {
  logEdgeRoutingCoordinatorParallelFallback,
  logEdgeRoutingCoordinatorParallelIncomplete,
  logEdgeRoutingCoordinatorSerialRoutingFailure,
} from '../utils/routingLogging';

type SerialFallbackOptions = {
  jobs: PathFindingJob[];
  graph: SharedGraphContext;
  assignBusIndices: (jobs: PathFindingJob[], graph: SharedGraphContext) => void;
  assignSameSidePortSeparation: (jobs: PathFindingJob[], graph: SharedGraphContext) => void;
  assignGlobalChannels: (jobs: PathFindingJob[]) => void;
  calculatePath: (job: PathFindingJob, graph: SharedGraphContext) => Promise<PathFindingResult>;
};

type ParallelRouteOptions = {
  jobs: PathFindingJob[];
  graph: SharedGraphContext;
  useParallelRouting: boolean;
  parallelPool: { calculatePaths: (jobs: PathFindingJob[], graph: SharedGraphContext) => Promise<PathFindingResult[]> } | null | undefined;
  runSerialFallback: () => Promise<PathFindingResult[]>;
  allEdges: Edge[];
  setAllEdges: (edges: Edge[]) => void;
};

export const buildFallbackPathResult = (job: PathFindingJob, error: unknown): PathFindingResult => ({
  jobId: job.jobId,
  edgeId: job.edgeId,
  path: `M ${job.sourceX} ${job.sourceY} L ${job.targetX} ${job.targetY}`,
  points: [{ x: job.sourceX, y: job.sourceY }, { x: job.targetX, y: job.targetY }],
  labelX: (job.sourceX + job.targetX) / 2,
  labelY: (job.sourceY + job.targetY) / 2,
  error: String(error),
});

export const routeSerialFallbackJobs = async ({
  jobs,
  graph,
  assignBusIndices,
  assignSameSidePortSeparation,
  assignGlobalChannels,
  calculatePath,
}: SerialFallbackOptions): Promise<PathFindingResult[]> => {
  assignBusIndices(jobs, graph);
  assignSameSidePortSeparation(jobs, graph);
  assignGlobalChannels(jobs);

  const results: PathFindingResult[] = [];

  for (const job of jobs) {
    try {
      results.push(await calculatePath(job, graph));
    } catch (error) {
      logEdgeRoutingCoordinatorSerialRoutingFailure(job.edgeId, error);
      results.push(buildFallbackPathResult(job, error));
    }
  }

  return results;
};

export const routeJobsWithParallelFallback = async ({
  jobs,
  graph,
  useParallelRouting,
  parallelPool,
  runSerialFallback,
  allEdges,
  setAllEdges,
}: ParallelRouteOptions): Promise<PathFindingResult[]> => {
  if (allEdges.length === 0 && jobs.length > 0) {
    setAllEdges(jobs.map(job => ({
      id: job.edgeId,
      source: job.source,
      target: job.target,
      data: {},
    })) as Edge[]);
  }

  if (!useParallelRouting || !parallelPool) {
    return runSerialFallback();
  }

  try {
    const results = await parallelPool.calculatePaths(jobs, graph);
    if (!results || results.length !== jobs.length) {
      logEdgeRoutingCoordinatorParallelIncomplete(jobs.length, results?.length);
    }
    return results;
  } catch (error) {
    logEdgeRoutingCoordinatorParallelFallback(error);
    return runSerialFallback();
  }
};
