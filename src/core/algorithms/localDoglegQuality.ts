export interface OrthogonalPoint {
    x: number;
    y: number;
}

export interface LocalDoglegRisk {
    index: number;
    rule: 'aligned-local-dogleg' | 'local-micro-dogleg';
    type: 'V-H-V' | 'H-V-H';
    depth: number;
    extraLength: number;
}

export interface LocalDoglegOptions {
    axisTolerance?: number;
    minDepth?: number;
    maxDepth?: number;
    minExtraLength?: number;
    minLengthRatio?: number;
}

const defaults: Required<LocalDoglegOptions> = {
    axisTolerance: 1,
    minDepth: 16,
    maxDepth: 72,
    minExtraLength: 24,
    minLengthRatio: 1.15,
};

export const manhattanPathLength = (points: OrthogonalPoint[]): number => {
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
        length += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    }
    return length;
};

export const simplifyOrthogonalPointChain = (
    points: OrthogonalPoint[],
    axisTolerance = defaults.axisTolerance,
): OrthogonalPoint[] => {
    const deduped: OrthogonalPoint[] = [];
    for (const point of points) {
        const previous = deduped[deduped.length - 1];
        if (!previous || Math.abs(previous.x - point.x) > axisTolerance || Math.abs(previous.y - point.y) > axisTolerance) {
            deduped.push({ x: point.x, y: point.y });
        }
    }
    if (deduped.length <= 2) return deduped;

    const orthogonalized: OrthogonalPoint[] = [deduped[0]];
    for (let i = 1; i < deduped.length; i++) {
        const previous = orthogonalized[orthogonalized.length - 1];
        const next = deduped[i];
        if (Math.abs(previous.x - next.x) <= axisTolerance || Math.abs(previous.y - next.y) <= axisTolerance) {
            orthogonalized.push({ x: next.x, y: next.y });
            continue;
        }

        const following = deduped[i + 1];
        const bridge = following && Math.abs(following.x - next.x) <= axisTolerance
            ? { x: next.x, y: previous.y }
            : { x: previous.x, y: next.y };
        if (Math.abs(previous.x - bridge.x) + Math.abs(previous.y - bridge.y) > axisTolerance) {
            orthogonalized.push(bridge);
        }
        orthogonalized.push({ x: next.x, y: next.y });
    }

    const collapsed: OrthogonalPoint[] = [];
    for (const point of orthogonalized) {
        collapsed.push({ x: point.x, y: point.y });
        while (collapsed.length >= 3) {
            const a = collapsed[collapsed.length - 3];
            const b = collapsed[collapsed.length - 2];
            const c = collapsed[collapsed.length - 1];
            const collinearX = Math.abs(a.x - b.x) <= axisTolerance && Math.abs(b.x - c.x) <= axisTolerance;
            const collinearY = Math.abs(a.y - b.y) <= axisTolerance && Math.abs(b.y - c.y) <= axisTolerance;
            if (!collinearX && !collinearY) break;
            collapsed.splice(collapsed.length - 2, 1);
        }
    }

    return collapsed;
};

export const buildAlignedDirectPath = (
    points: OrthogonalPoint[],
    axisTolerance = defaults.axisTolerance,
): OrthogonalPoint[] | null => {
    if (points.length < 2) return null;
    const start = points[0];
    const end = points[points.length - 1];
    if (Math.abs(start.x - end.x) <= axisTolerance) {
        return [{ ...start }, { x: start.x, y: end.y }];
    }
    if (Math.abs(start.y - end.y) <= axisTolerance) {
        return [{ ...start }, { x: end.x, y: start.y }];
    }
    return null;
};

export function detectLocalDoglegRisks(
    inputPoints: OrthogonalPoint[],
    options: LocalDoglegOptions = {},
): LocalDoglegRisk[] {
    const config = { ...defaults, ...options };
    const points = simplifyOrthogonalPointChain(inputPoints, config.axisTolerance);
    if (points.length < 4) return [];

    const risks: LocalDoglegRisk[] = [];
    const direct = buildAlignedDirectPath(points, config.axisTolerance);
    if (direct) {
        const directLength = Math.max(1, manhattanPathLength(direct));
        const currentLength = manhattanPathLength(points);
        const vertical = Math.abs(points[0].x - points[points.length - 1].x) <= config.axisTolerance;
        const lateralSpread = vertical
            ? Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x))
            : Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
        const extraLength = currentLength - directLength;

        if (
            lateralSpread >= config.minDepth
            && lateralSpread <= config.maxDepth
            && extraLength >= config.minExtraLength
            && currentLength / directLength >= config.minLengthRatio
        ) {
            risks.push({
                index: 0,
                rule: 'aligned-local-dogleg',
                type: vertical ? 'V-H-V' : 'H-V-H',
                depth: Number(lateralSpread.toFixed(2)),
                extraLength: Number(extraLength.toFixed(2)),
            });
        }
    }

    for (let i = 0; i + 3 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        const c = points[i + 2];
        const d = points[i + 3];
        const firstVertical = Math.abs(a.x - b.x) <= config.axisTolerance;
        const bridgeHorizontal = Math.abs(b.y - c.y) <= config.axisTolerance;
        const secondVertical = Math.abs(c.x - d.x) <= config.axisTolerance;
        if (firstVertical && bridgeHorizontal && secondVertical) {
            const sameDirection = Math.sign(b.y - a.y) === Math.sign(d.y - c.y);
            const depth = Math.abs(b.x - c.x);
            const bridgeLength = Math.abs(b.x - c.x);
            const adjacent = Math.min(Math.abs(b.y - a.y), Math.abs(d.y - c.y));
            if (sameDirection && depth >= config.minDepth && depth <= config.maxDepth && adjacent <= config.maxDepth) {
                risks.push({
                    index: i,
                    rule: 'local-micro-dogleg',
                    type: 'V-H-V',
                    depth: Number(depth.toFixed(2)),
                    extraLength: Number((bridgeLength * 2).toFixed(2)),
                });
            }
        }

        const firstHorizontal = Math.abs(a.y - b.y) <= config.axisTolerance;
        const bridgeVertical = Math.abs(b.x - c.x) <= config.axisTolerance;
        const secondHorizontal = Math.abs(c.y - d.y) <= config.axisTolerance;
        if (firstHorizontal && bridgeVertical && secondHorizontal) {
            const sameDirection = Math.sign(b.x - a.x) === Math.sign(d.x - c.x);
            const depth = Math.abs(b.y - c.y);
            const bridgeLength = Math.abs(b.y - c.y);
            const adjacent = Math.min(Math.abs(b.x - a.x), Math.abs(d.x - c.x));
            if (sameDirection && depth >= config.minDepth && depth <= config.maxDepth && adjacent <= config.maxDepth) {
                risks.push({
                    index: i,
                    rule: 'local-micro-dogleg',
                    type: 'H-V-H',
                    depth: Number(depth.toFixed(2)),
                    extraLength: Number((bridgeLength * 2).toFixed(2)),
                });
            }
        }
    }

    return risks;
}
