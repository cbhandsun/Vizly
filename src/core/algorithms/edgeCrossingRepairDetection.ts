import type { Point } from '../types/routing';
import type { BuddyGroup } from './globalChannelRouting';
import type {
    CrossingHit,
    ParallelOverlapHit,
    SegmentRef,
} from './edgeCrossingRepairTypes';
import { EDGE_CROSSING_EPSILON } from './edgeCrossingRepairTypes';

export function findRepairableCrossings(
    paths: Map<string, Point[]>,
    buddyGroupByEdgeId: Map<string, Set<string>>
): CrossingHit[] {
    const hits: CrossingHit[] = [];
    const segments = extractSegments(paths);
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const a = segments[i];
            const b = segments[j];
            if (a.edgeId === b.edgeId) continue;
            if (a.h === b.h) continue;
            const h = a.h ? a : b;
            const v = a.v ? a : b;
            const hx1 = Math.min(h.a.x, h.b.x);
            const hx2 = Math.max(h.a.x, h.b.x);
            const vy1 = Math.min(v.a.y, v.b.y);
            const vy2 = Math.max(v.a.y, v.b.y);
            const x = v.a.x;
            const y = h.a.y;
            if (x > hx1 + 2 && x < hx2 - 2 && y > vy1 + 2 && y < vy2 - 2) {
                hits.push({
                    h,
                    v,
                    x,
                    y,
                    sameBuddy: shareBuddyGroup(a.edgeId, b.edgeId, buddyGroupByEdgeId),
                });
            }
        }
    }
    hits.sort((a, b) => Number(a.sameBuddy) - Number(b.sameBuddy));
    return hits;
}

export function findRepairableParallelOverlaps(
    paths: Map<string, Point[]>,
    buddyGroupByEdgeId: Map<string, Set<string>>,
    minLength: number
): ParallelOverlapHit[] {
    const hits: ParallelOverlapHit[] = [];
    const segments = extractSegments(paths);
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const a = segments[i];
            const b = segments[j];
            if (a.edgeId === b.edgeId) continue;
            if (a.h !== b.h) continue;
            if (a.h && Math.abs(a.a.y - b.a.y) > EDGE_CROSSING_EPSILON) continue;
            if (a.v && Math.abs(a.a.x - b.a.x) > EDGE_CROSSING_EPSILON) continue;

            const overlapLength = a.h
                ? Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x))
                    - Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x))
                : Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y))
                    - Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y));

            if (isProtectedSharedTrunkOverlap(a, b, buddyGroupByEdgeId)) {
                continue;
            }
            if (overlapLength >= minLength) hits.push({ a, b, overlapLength });
        }
    }
    hits.sort((a, b) => b.overlapLength - a.overlapLength);
    return hits;
}

function extractSegments(paths: Map<string, Point[]>): SegmentRef[] {
    const segments: SegmentRef[] = [];
    for (const [edgeId, points] of paths) {
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const h = Math.abs(a.y - b.y) < EDGE_CROSSING_EPSILON;
            const v = Math.abs(a.x - b.x) < EDGE_CROSSING_EPSILON;
            if ((!h && !v) || Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 8) continue;
            segments.push({ edgeId, segIdx: i, pointCount: points.length, a, b, h, v });
        }
    }
    return segments;
}

function isProtectedSharedTrunkOverlap(
    a: SegmentRef,
    b: SegmentRef,
    lookup: Map<string, Set<string>>
): boolean {
    const groupsA = lookup.get(a.edgeId);
    const groupsB = lookup.get(b.edgeId);
    if (!groupsA || !groupsB) return false;

    for (const group of groupsA) {
        if (!groupsB.has(group)) continue;
        if (group.startsWith('o2m:') && a.segIdx === 0 && b.segIdx === 0) return true;
        if (group.startsWith('m2o:')
            && a.segIdx >= a.pointCount - 3
            && b.segIdx >= b.pointCount - 3) {
            return true;
        }
    }
    return false;
}
export function buildBuddyGroupLookup(groups: BuddyGroup[]): Map<string, Set<string>> {
    const lookup = new Map<string, Set<string>>();
    groups.forEach((group, index) => {
        const key = `${group.type}:${index}`;
        group.edgeIds.forEach(edgeId => {
            if (!lookup.has(edgeId)) lookup.set(edgeId, new Set());
            lookup.get(edgeId)!.add(key);
        });
    });
    return lookup;
}

export function buildBuddyTypeLookup(groups: BuddyGroup[]): Map<string, Set<BuddyGroup['type']>> {
    const lookup = new Map<string, Set<BuddyGroup['type']>>();
    groups.forEach(group => {
        group.edgeIds.forEach(edgeId => {
            if (!lookup.has(edgeId)) lookup.set(edgeId, new Set());
            lookup.get(edgeId)!.add(group.type);
        });
    });
    return lookup;
}

function shareBuddyGroup(edgeA: string, edgeB: string, lookup: Map<string, Set<string>>): boolean {
    const a = lookup.get(edgeA);
    const b = lookup.get(edgeB);
    if (!a || !b) return false;
    for (const group of a) {
        if (b.has(group)) return true;
    }
    return false;
}
