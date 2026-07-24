import { repairEdgeCrossingViolations } from '../../algorithms/edgeCrossingRepair';
import type { BuddyGroup } from '../../algorithms/globalChannelRouting';
import { RoutingCrossingScorer } from '../../algorithms/routingCrossingScorer';
import type { Point } from '../types/routing';

type UnknownRecord = Record<string, unknown>;

interface TreeBusEdge {
    id: string;
    source: string;
    target: string;
    data?: unknown;
}

const asRecord = (value: unknown): UnknownRecord => (
    typeof value === 'object' && value !== null ? value as UnknownRecord : {}
);

const axisOf = (a: Point, b: Point): 'h' | 'v' | null => {
    if (Math.abs(a.y - b.y) <= 1.5 && Math.abs(a.x - b.x) > 1.5) return 'h';
    if (Math.abs(a.x - b.x) <= 1.5 && Math.abs(a.y - b.y) > 1.5) return 'v';
    return null;
};

const manhattanDistance = (a: Point, b: Point): number => (
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
);

const compactOrthogonalPath = (points: Point[]): Point[] => {
    const rounded: Point[] = [];
    for (const point of points) {
        const next = { x: Math.round(point.x), y: Math.round(point.y) };
        const previous = rounded[rounded.length - 1];
        if (!previous || Math.abs(previous.x - next.x) > 1 || Math.abs(previous.y - next.y) > 1) {
            rounded.push(next);
        }
    }

    const orthogonal: Point[] = [];
    for (let index = 0; index < rounded.length; index++) {
        const point = rounded[index];
        const previous = orthogonal[orthogonal.length - 1];
        if (previous && Math.abs(previous.x - point.x) > 1.5 && Math.abs(previous.y - point.y) > 1.5) {
            const following = rounded[index + 1];
            const horizontalThenVertical = { x: point.x, y: previous.y };
            const verticalThenHorizontal = { x: previous.x, y: point.y };
            const horizontalScore = (
                following && axisOf(horizontalThenVertical, point) !== axisOf(point, following) ? 1 : 0
            ) + (Math.min(
                Math.abs(previous.x - horizontalThenVertical.x),
                Math.abs(horizontalThenVertical.y - point.y),
            ) < 8 ? 2 : 0);
            const verticalScore = (
                following && axisOf(verticalThenHorizontal, point) !== axisOf(point, following) ? 1 : 0
            ) + (Math.min(
                Math.abs(previous.y - verticalThenHorizontal.y),
                Math.abs(verticalThenHorizontal.x - point.x),
            ) < 8 ? 2 : 0);
            orthogonal.push(
                horizontalScore <= verticalScore ? horizontalThenVertical : verticalThenHorizontal,
            );
        }
        orthogonal.push(point);
    }

    let simplified = RoutingCrossingScorer.simplifyOrthogonalPoints(orthogonal);
    let changed = true;
    while (changed) {
        changed = false;
        for (let index = 1; index < simplified.length - 1; index++) {
            const previous = simplified[index - 1];
            const current = simplified[index];
            const following = simplified[index + 1];
            const shortIncoming = manhattanDistance(previous, current) < 8;
            const shortOutgoing = manhattanDistance(current, following) < 8;
            if ((shortIncoming || shortOutgoing) && axisOf(previous, following)) {
                simplified = [...simplified.slice(0, index), ...simplified.slice(index + 1)];
                changed = true;
                break;
            }
        }
    }
    return RoutingCrossingScorer.simplifyOrthogonalPoints(simplified);
};

const roundPath = (points: Point[]): Point[] => points.map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
}));

const edgePath = (edge: { data?: unknown }): Point[] => {
    const data = asRecord(edge.data);
    const treeRouting = asRecord(data.treeRouting);
    const raw = treeRouting.points || data.computedPath || data.elkPath || [];
    if (!Array.isArray(raw)) return [];
    return raw
        .map((point) => asRecord(point))
        .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
};

const samePath = (left: Point[], right: Point[]): boolean => (
    left.length === right.length && left.every((point, index) => (
        Math.abs(point.x - right[index]?.x) <= 1
        && Math.abs(point.y - right[index]?.y) <= 1
    ))
);

const withPath = <T extends { data?: unknown }>(
    edge: T,
    path: Point[],
    flags: UnknownRecord = {},
): T => {
    const originalData = asRecord(edge.data);
    const data: UnknownRecord = { ...originalData, ...flags, computedPath: path };
    const treeRouting = asRecord(originalData.treeRouting);
    if (Array.isArray(treeRouting.points)) {
        data.treeRouting = { ...treeRouting, points: path };
    }
    return { ...edge, data } as T;
};

const buildBuddyGroups = <T extends TreeBusEdge>(edges: T[]): BuddyGroup[] => {
    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();
    for (const edge of edges) {
        const outgoingIds = outgoing.get(edge.source) ?? new Set<string>();
        outgoingIds.add(edge.id);
        outgoing.set(edge.source, outgoingIds);
        const incomingIds = incoming.get(edge.target) ?? new Set<string>();
        incomingIds.add(edge.id);
        incoming.set(edge.target, incomingIds);
    }
    const groups: BuddyGroup[] = [];
    for (const edgeIds of outgoing.values()) {
        if (edgeIds.size >= 2) groups.push({ type: 'o2m', edgeIds });
    }
    for (const edgeIds of incoming.values()) {
        if (edgeIds.size >= 2) groups.push({ type: 'm2o', edgeIds });
    }
    return groups;
};

const pathMapFromEdges = <T extends TreeBusEdge>(edges: T[]): Map<string, Point[]> => {
    const paths = new Map<string, Point[]>();
    for (const edge of edges) {
        const hasTreeRouting = Boolean(asRecord(edge.data).treeRouting);
        const path = hasTreeRouting
            ? roundPath(edgePath(edge))
            : compactOrthogonalPath(edgePath(edge));
        if (path.length >= 2) paths.set(edge.id, path);
    }
    return paths;
};

const applyPathMap = <T extends TreeBusEdge>(
    edges: T[],
    paths: Map<string, Point[]>,
    flags: UnknownRecord,
): T[] => edges.map((edge) => {
    const path = paths.get(edge.id);
    if (!path || samePath(edgePath(edge), path)) return edge;
    return withPath(edge, path, flags);
});

const collectTreeOutGroups = <T extends TreeBusEdge>(
    edges: T[],
): Array<{ trunkId: string; edgeIds: string[] }> => {
    const groups = new Map<string, string[]>();
    for (const edge of edges) {
        const routing = asRecord(asRecord(edge.data).treeRouting);
        if (routing.type !== 'tree-out' || typeof routing.trunkId !== 'string' || !routing.trunkId) continue;
        const edgeIds = groups.get(routing.trunkId) ?? [];
        edgeIds.push(edge.id);
        groups.set(routing.trunkId, edgeIds);
    }
    return [...groups.entries()]
        .filter(([, edgeIds]) => edgeIds.length >= 2)
        .map(([trunkId, edgeIds]) => ({ trunkId, edgeIds }));
};

const perpendicularCandidateValues = (
    paths: Map<string, Point[]>,
    groupEdgeIds: string[],
    axis: 'h' | 'v',
    original: number,
): number[] => {
    const values = new Set<number>();
    const groupSet = new Set(groupEdgeIds);
    const spacing = 24;
    for (const edgeId of groupEdgeIds) {
        const path = paths.get(edgeId);
        if (!path || path.length < 3) continue;
        const trunkA = path[1];
        const trunkB = path[2];
        const minimumMain = axis === 'h' ? Math.min(trunkA.x, trunkB.x) : Math.min(trunkA.y, trunkB.y);
        const maximumMain = axis === 'h' ? Math.max(trunkA.x, trunkB.x) : Math.max(trunkA.y, trunkB.y);
        for (const [otherId, otherPath] of paths) {
            if (groupSet.has(otherId)) continue;
            for (let index = 0; index < otherPath.length - 1; index++) {
                const start = otherPath[index];
                const end = otherPath[index + 1];
                if (axis === 'h' && axisOf(start, end) === 'v') {
                    const minimumY = Math.min(start.y, end.y);
                    const maximumY = Math.max(start.y, end.y);
                    if (start.x > minimumMain + 2 && start.x < maximumMain - 2
                        && original > minimumY + 2 && original < maximumY - 2) {
                        values.add(Math.round(minimumY - spacing));
                        values.add(Math.round(maximumY + spacing));
                        values.add(Math.round(minimumY - spacing * 2));
                        values.add(Math.round(maximumY + spacing * 2));
                    }
                }
                if (axis === 'v' && axisOf(start, end) === 'h') {
                    const minimumX = Math.min(start.x, end.x);
                    const maximumX = Math.max(start.x, end.x);
                    if (start.y > minimumMain + 2 && start.y < maximumMain - 2
                        && original > minimumX + 2 && original < maximumX - 2) {
                        values.add(Math.round(minimumX - spacing));
                        values.add(Math.round(maximumX + spacing));
                        values.add(Math.round(minimumX - spacing * 2));
                        values.add(Math.round(maximumX + spacing * 2));
                    }
                }
            }
        }
    }
    return [...values].filter((value) => Number.isFinite(value) && Math.abs(value - original) >= 12);
};

const treeOutFallbackCandidateValues = (
    paths: Map<string, Point[]>,
    groupEdgeIds: string[],
    axis: 'h' | 'v',
    original: number,
): number[] => {
    const values = new Set<number>();
    const firstPath = paths.get(groupEdgeIds[0]);
    if (!firstPath || firstPath.length < 4) return [];
    const coordinates = groupEdgeIds
        .map((edgeId) => paths.get(edgeId))
        .filter((path): path is Point[] => Boolean(path && path.length >= 4))
        .map((path) => axis === 'h' ? path[path.length - 1].y : path[path.length - 1].x);
    if (coordinates.length === 0) return [];
    const sourceCoordinate = axis === 'h' ? firstPath[0].y : firstPath[0].x;
    const average = coordinates.reduce((sum, coordinate) => sum + coordinate, 0) / coordinates.length;
    const direction = Math.sign(average - sourceCoordinate) || Math.sign(original - sourceCoordinate) || 1;
    const boundary = direction > 0 ? Math.min(...coordinates) : Math.max(...coordinates);
    values.add(Math.round(sourceCoordinate + direction * 120));
    values.add(Math.round(sourceCoordinate + direction * 220));
    values.add(Math.round(boundary - direction * 80));
    values.add(Math.round(boundary - direction * 140));
    return [...values].filter((value) => Number.isFinite(value) && Math.abs(value - original) >= 12);
};

const moveTreeOutGroup = (
    paths: Map<string, Point[]>,
    edgeIds: string[],
    axis: 'h' | 'v',
    value: number,
): Map<string, Point[]> => {
    const moved = new Map(paths);
    for (const edgeId of edgeIds) {
        const path = paths.get(edgeId);
        if (!path || path.length < 4) continue;
        const candidate = path.map((point) => ({ ...point }));
        if (axis === 'h') candidate[1].y = candidate[2].y = value;
        else candidate[1].x = candidate[2].x = value;
        moved.set(edgeId, roundPath(candidate));
    }
    return moved;
};

const optimizeTreeOutTrunkAxes = <T extends TreeBusEdge>(
    edges: T[],
    paths: Map<string, Point[]>,
    buddyGroups: BuddyGroup[],
): Map<string, Point[]> => {
    const scorer = new RoutingCrossingScorer({ buddyGroups, parallelOverlapMinLength: 24 });
    let bestPaths = paths;
    let bestScore = scorer.score(bestPaths);
    for (let pass = 0; pass < 3; pass++) {
        let changed = false;
        for (const group of collectTreeOutGroups(edges)) {
            const firstPath = bestPaths.get(group.edgeIds[0]);
            if (!firstPath || firstPath.length < 4) continue;
            const trunkAxis = axisOf(firstPath[1], firstPath[2]);
            if (!trunkAxis) continue;
            const original = trunkAxis === 'h' ? firstPath[1].y : firstPath[1].x;
            const candidates = [
                ...perpendicularCandidateValues(bestPaths, group.edgeIds, trunkAxis, original),
                ...treeOutFallbackCandidateValues(bestPaths, group.edgeIds, trunkAxis, original),
            ];
            for (const value of candidates) {
                const trial = moveTreeOutGroup(bestPaths, group.edgeIds, trunkAxis, value);
                const score = scorer.score(trial);
                const improvesCrossings = score.hardCrossings !== bestScore.hardCrossings
                    ? score.hardCrossings < bestScore.hardCrossings
                    : score.buddyCrossings !== bestScore.buddyCrossings
                        ? score.buddyCrossings < bestScore.buddyCrossings
                        : scorer.isBetter(score, bestScore);
                if (improvesCrossings) {
                    bestPaths = trial;
                    bestScore = score;
                    changed = true;
                }
            }
        }
        if (!changed) break;
    }
    return bestPaths;
};

export const postProcessTreeBusRouting = <T extends TreeBusEdge>(edges: T[]): T[] => {
    const buddyGroups = buildBuddyGroups(edges);
    let paths = pathMapFromEdges(edges);
    if (paths.size < 2) return applyPathMap(edges, paths, { orthogonalSanitized: true });

    paths = optimizeTreeOutTrunkAxes(edges, paths, buddyGroups);
    const mutableEdgeIds = new Set(edges
        .filter((edge) => !asRecord(edge.data).treeRouting)
        .map((edge) => edge.id));
    paths = repairEdgeCrossingViolations(paths, {
        spacing: 12,
        maxIterations: 8,
        buddyGroups,
        mutableEdgeIds,
    });

    const repaired = new Map<string, Point[]>();
    paths.forEach((path, edgeId) => {
        const edge = edges.find((item) => item.id === edgeId);
        const hasTreeRouting = Boolean(edge && asRecord(edge.data).treeRouting);
        repaired.set(edgeId, hasTreeRouting ? roundPath(path) : compactOrthogonalPath(path));
    });
    return applyPathMap(edges, repaired, {
        orthogonalSanitized: true,
        sharedTrunkAware: true,
    });
};
