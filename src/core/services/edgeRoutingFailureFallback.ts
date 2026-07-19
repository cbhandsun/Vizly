import type { PathFindingResult } from '../types/routing';

export const EDGE_ROUTING_BATCH_FAILURE_MESSAGE = 'Batch routing failed';

interface FailedRoutingJob {
    jobId?: unknown;
    sourceX?: unknown;
    sourceY?: unknown;
    targetX?: unknown;
    targetY?: unknown;
}

const toFiniteCoordinate = (value: unknown): number => (
    typeof value === 'number' && Number.isFinite(value) ? value : 0
);

export const buildEdgeRoutingFailureFallback = (
    edgeId: string,
    job?: FailedRoutingJob,
): PathFindingResult => {
    const sourceX = toFiniteCoordinate(job?.sourceX);
    const sourceY = toFiniteCoordinate(job?.sourceY);
    const targetX = toFiniteCoordinate(job?.targetX);
    const targetY = toFiniteCoordinate(job?.targetY);

    return {
        jobId: typeof job?.jobId === 'string' && job.jobId ? job.jobId : edgeId,
        edgeId,
        path: `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`,
        points: [
            { x: sourceX, y: sourceY },
            { x: targetX, y: targetY },
        ],
        labelX: (sourceX + targetX) / 2,
        labelY: (sourceY + targetY) / 2,
        error: EDGE_ROUTING_BATCH_FAILURE_MESSAGE,
    };
};
