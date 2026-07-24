import type { PathFindingJob, SharedGraphContext } from '../types/routing';

export type CacheablePathFindingJob = Partial<PathFindingJob> & {
  type?: string;
};

type PendingSegment = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

const MAX_CACHE_STRING_LENGTH = 512;
const MAX_CACHE_PENDING_SEGMENTS = 2_000;

const finiteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const finiteRounded = (value: unknown): number => Math.round(finiteNumber(value));

const boundedString = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_CACHE_STRING_LENGTH) : '';

const serializeRect = (rect: PathFindingJob['sourceRect'] | undefined): string => rect
  ? [rect.x, rect.y, rect.width, rect.height].map(finiteNumber).join(',')
  : '0';

const hashPendingSegments = (pendingEdges: readonly PendingSegment[] | undefined): number => {
  if (!pendingEdges?.length) return 0;
  let hash = pendingEdges.length;
  const count = Math.min(pendingEdges.length, MAX_CACHE_PENDING_SEGMENTS);
  for (let index = 0; index < count; index += 1) {
    const segment = pendingEdges[index];
    hash = (
      (hash * 31)
      + Math.round(finiteNumber(segment?.start?.x) + finiteNumber(segment?.end?.y) * 7)
    ) >>> 0;
  }
  return hash;
};

/** Builds a bounded, deterministic cache-key payload from routing boundary data. */
export const buildEdgeRoutingCacheParams = (
  job: CacheablePathFindingJob,
  _graph: SharedGraphContext,
  pendingEdges?: readonly PendingSegment[],
): Record<string, unknown> => ({
  rv: 16,
  s: boundedString(job.source),
  t: boundedString(job.target),
  sx: finiteRounded(job.sourceX),
  sy: finiteRounded(job.sourceY),
  tx: finiteRounded(job.targetX),
  ty: finiteRounded(job.targetY),
  sr: serializeRect(job.sourceRect),
  tr: serializeRect(job.targetRect),
  type: boundedString(job.type) || 's',
  sourceHandle: boundedString(job.sourceHandle),
  targetHandle: boundedString(job.targetHandle),
  sourcePosition: boundedString(job.sourcePosition),
  targetPosition: boundedString(job.targetPosition),
  bus: [
    !!job.isOneToMany,
    !!job.isManyToOne,
    `${finiteNumber(job.busTrunkSource?.x)},${finiteNumber(job.busTrunkSource?.y)}`,
    `${finiteNumber(job.busTrunkTarget?.x)},${finiteNumber(job.busTrunkTarget?.y)}`,
  ].join('|'),
  pe: hashPendingSegments(pendingEdges),
});
