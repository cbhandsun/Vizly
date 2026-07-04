import type { PathFindingJob, Rectangle } from '../types/routing';

export const EDGE_ROUTING_CANDIDATE_AXIS_LIMIT = 240;

type CandidateAxes = {
    horizontal: number[];
    vertical: number[];
};

function addRectAxes(horizontal: Set<number>, vertical: Set<number>, rect: Rectangle, margin: number): void {
    horizontal.add(Math.round(rect.y - margin));
    horizontal.add(Math.round(rect.y + rect.height + margin));
    vertical.add(Math.round(rect.x - margin));
    vertical.add(Math.round(rect.x + rect.width + margin));
}

export function buildEdgeRoutingCandidateAxes(options: {
    hardObstacles?: Rectangle[];
    softObstacles?: Rectangle[];
    assignedJobs?: PathFindingJob[];
}): CandidateAxes {
    const horizontal = new Set<number>();
    const vertical = new Set<number>();

    (options.hardObstacles ?? []).forEach(rect => addRectAxes(horizontal, vertical, rect, 8));
    (options.softObstacles ?? []).forEach(rect => addRectAxes(horizontal, vertical, rect, 6));

    (options.assignedJobs ?? []).forEach(job => {
        if (!job.busTrunkSource || !job.busTrunkTarget) return;
        if (Math.abs(job.busTrunkSource.x - job.busTrunkTarget.x) < 1.0) {
            vertical.add(Math.round(job.busTrunkSource.x));
        } else if (Math.abs(job.busTrunkSource.y - job.busTrunkTarget.y) < 1.0) {
            horizontal.add(Math.round(job.busTrunkSource.y));
        }
    });

    return {
        horizontal: [...horizontal].slice(0, EDGE_ROUTING_CANDIDATE_AXIS_LIMIT),
        vertical: [...vertical].slice(0, EDGE_ROUTING_CANDIDATE_AXIS_LIMIT),
    };
}
