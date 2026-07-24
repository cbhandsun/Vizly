import type { Point, Rectangle } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';

export interface EdgeCrossingRepairOptions {
    obstacles?: Rectangle[];
    ignoredRectsByEdge?: Map<string, Rectangle[]>;
    buddyGroups?: BuddyGroup[];
    spacing?: number;
    maxIterations?: number;
    mutableEdgeIds?: Set<string>;
    allowObstacleHitIfImprovesCrossing?: boolean;
    preserveEndpointDirections?: boolean;
}

export interface SegmentRef {
    edgeId: string;
    segIdx: number;
    pointCount: number;
    a: Point;
    b: Point;
    h: boolean;
    v: boolean;
}

export interface CrossingHit {
    h: SegmentRef;
    v: SegmentRef;
    x: number;
    y: number;
    sameBuddy: boolean;
}

export interface ParallelOverlapHit {
    a: SegmentRef;
    b: SegmentRef;
    overlapLength: number;
}

export const EDGE_CROSSING_EPSILON = 1.5;
