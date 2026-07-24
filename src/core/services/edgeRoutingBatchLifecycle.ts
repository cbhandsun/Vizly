import type {
  PathFindingJob,
  PathFindingResult,
  SharedGraphContext,
} from '../types/routing';

export interface RoutingBatchRequest {
  edgeId: string;
  job: Partial<PathFindingJob> & {
    source: string;
    target: string;
    sourceRect?: PathFindingJob['sourceRect'];
    targetRect?: PathFindingJob['targetRect'];
  };
  graph: SharedGraphContext;
  priority?: number;
}

export interface LatestRoutingRequestEntry {
  request: RoutingBatchRequest;
  graphKey: string;
  seq: number;
  updatedAt: number;
}

export interface RoutingBatchSnapshot {
  graph: SharedGraphContext;
  requests: RoutingBatchRequest[];
  graphKey: string;
  seqByEdge: Map<string, number>;
}

interface PendingRoutingResolver {
  resolve: (result: PathFindingResult) => void;
}

interface CommitRoutingBatchResultsOptions {
  requests: readonly RoutingBatchRequest[];
  results: ReadonlyArray<PathFindingResult | null>;
  jobs: readonly PathFindingJob[];
  seqByEdge: ReadonlyMap<string, number>;
  getLatestSeq: (edgeId: string) => number | undefined;
  pendingResolvers: Map<string, PendingRoutingResolver>;
  clearDirtyEdge: (edgeId: string) => void;
  onMissingResult?: (edgeId: string, index: number) => void;
  onResult: (
    request: RoutingBatchRequest,
    result: PathFindingResult,
    job: PathFindingJob | undefined,
    index: number,
  ) => void;
  onCommitFailure?: (error: unknown, edgeId: string) => void;
}

interface TrunkDebugEntryLike {
  edgeType?: string;
  delta: number;
  side: number;
  typeInfluenced: boolean;
  trunk?: {
    direction: 'horizontal' | 'vertical';
    axis: number;
    range: { min: number; max: number };
    port?: string;
  };
}

const finiteCoordinate = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const createRoutingBatchSnapshot = (
  dirtyEdgeIds: readonly string[],
  latestRequests: ReadonlyMap<string, LatestRoutingRequestEntry>,
): RoutingBatchSnapshot | undefined => {
  const entries = dirtyEdgeIds
    .map(edgeId => latestRequests.get(edgeId))
    .filter((entry): entry is LatestRoutingRequestEntry => !!entry);
  if (entries.length === 0) return undefined;

  const freshest = entries.reduce((left, right) =>
    left.updatedAt >= right.updatedAt ? left : right,
  );
  const seqByEdge = new Map<string, number>();
  const requests = entries.map(entry => {
    seqByEdge.set(entry.request.edgeId, entry.seq);
    return entry.request;
  });
  return {
    graph: freshest.request.graph,
    requests,
    graphKey: freshest.graphKey,
    seqByEdge,
  };
};

export const syncPreparedJobsToLatestRequests = (
  jobs: readonly PathFindingJob[],
  latestRequests: ReadonlyMap<string, LatestRoutingRequestEntry>,
): void => {
  for (const job of jobs) {
    const requestJob = latestRequests.get(job.edgeId)?.request.job;
    if (!requestJob) continue;
    requestJob.outgoingIndex = job.outgoingIndex;
    requestJob.outgoingCount = job.outgoingCount;
    requestJob.incomingIndex = job.incomingIndex;
    requestJob.incomingCount = job.incomingCount;
    requestJob.isOneToMany = job.isOneToMany;
    requestJob.isManyToOne = job.isManyToOne;
    requestJob.busTrunkSource = job.busTrunkSource;
    requestJob.busTrunkTarget = job.busTrunkTarget;
    requestJob.busRoutingPlan = job.busRoutingPlan;
  }
};

export const createMissingRoutingResult = (
  request: RoutingBatchRequest,
): PathFindingResult => {
  const sourceX = finiteCoordinate(request.job.sourceX);
  const sourceY = finiteCoordinate(request.job.sourceY);
  const targetX = finiteCoordinate(request.job.targetX);
  const targetY = finiteCoordinate(request.job.targetY);
  return {
    jobId: String(request.job.jobId || request.edgeId),
    edgeId: request.edgeId,
    path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
    points: [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ],
    labelX: (sourceX + targetX) / 2,
    labelY: (sourceY + targetY) / 2,
    error: 'Missing result from parallel routing',
  };
};

export const commitRoutingBatchResults = ({
  requests,
  results,
  jobs,
  seqByEdge,
  getLatestSeq,
  pendingResolvers,
  clearDirtyEdge,
  onMissingResult,
  onResult,
  onCommitFailure,
}: CommitRoutingBatchResultsOptions): Map<string, PathFindingResult> => {
  const committed = new Map<string, PathFindingResult>();
  requests.forEach((request, index) => {
    const result = results[index];
    const pending = pendingResolvers.get(request.edgeId);
    if (!result) {
      onMissingResult?.(request.edgeId, index);
      if (pending) {
        pending.resolve(createMissingRoutingResult(request));
        pendingResolvers.delete(request.edgeId);
      }
      return;
    }

    committed.set(request.edgeId, result);
    try {
      onResult(request, result, jobs[index], index);
    } catch (error) {
      onCommitFailure?.(error, request.edgeId);
    }

    const expectedSeq = seqByEdge.get(request.edgeId);
    const latestSeq = getLatestSeq(request.edgeId);
    const superseded = typeof expectedSeq === 'number'
      && typeof latestSeq === 'number'
      && expectedSeq !== latestSeq;
    if (!superseded) clearDirtyEdge(request.edgeId);
    if (pending) {
      pending.resolve(result);
      pendingResolvers.delete(request.edgeId);
    }
  });
  return committed;
};

export const buildRoutingDebugPayload = (
  edgeId: string,
  result: PathFindingResult,
  trunkData: TrunkDebugEntryLike | undefined,
  rawJob: Partial<PathFindingJob> | undefined,
): Record<string, unknown> => {
  const job = rawJob as (PathFindingJob & {
    peerGroupMembers?: string[];
    peerGroupSize?: number;
    peerGroupKey?: string;
  }) | undefined;
  const trunkVisualization = trunkData?.trunk
    ? {
        trunkAxis: trunkData.trunk.axis,
        trunkVertical: trunkData.trunk.direction === 'vertical',
        trunkRange: trunkData.trunk.range,
      }
    : {};
  const peerGroupInfo = job?.peerGroupMembers
    ? {
        peerGroupMembers: [...job.peerGroupMembers],
        peerGroupSize: job.peerGroupSize ?? job.peerGroupMembers.length,
        peerGroupKey: job.peerGroupKey,
      }
    : {};
  const algorithmDebug = (
    result.debugInfo as Record<string, unknown> | undefined
  )?.algorithmDebug as Record<string, unknown> | undefined;
  const portSelection = algorithmDebug?.portSelection as
    | Record<string, unknown>
    | undefined;
  return {
    edgeId,
    pathPoints: result.points,
    metadata: result.metadata,
    ...(result.debugInfo ?? {}),
    trunkClassification: trunkData
      ? {
          side: trunkData.side > 0 ? 'FORWARD' : 'BACKWARD',
          edgeType: trunkData.edgeType,
          delta: trunkData.delta,
          typeInfluenced: trunkData.typeInfluenced,
          trunk: trunkData.trunk,
        }
      : null,
    algorithmDebug: {
      ...(algorithmDebug ?? {}),
      portSelection: {
        ...(portSelection ?? {}),
        ...trunkVisualization,
        ...peerGroupInfo,
      },
    },
  };
};
