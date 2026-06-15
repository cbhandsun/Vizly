import type { Point, Rectangle } from '../types/routing';

export interface RoutingNodeRect extends Rectangle {
    id: string;
    type?: string;
}

export interface ContainerHeaderSkimRepairOptions {
    edgeId: string;
    sourceId: string;
    targetId: string;
    nodes: RoutingNodeRect[];
    obstacles?: Rectangle[];
    otherPaths?: Map<string, Point[]>;
    clearance?: number;
}

const EPS = 1;
const DEFAULT_CONTAINER_ENTRY_CLEARANCE = 96;
const DEFAULT_SOURCE_EXIT_STUB = 72;
const DEFAULT_ENDPOINT_STUB = 48;
const CONTAINER_TYPES = new Set(['group', 'subGroup', 'titleGroup', 'domain', 'subDomain', 'swimlane']);

export const recommendedEndpointEntryStub = (node: Pick<Rectangle, 'width' | 'height'>): number => {
    const shortSide = Math.min(node.width, node.height);
    return Math.min(
        DEFAULT_CONTAINER_ENTRY_CLEARANCE,
        Math.max(DEFAULT_ENDPOINT_STUB, shortSide * 0.75),
    );
};

const isContainerNode = (node: RoutingNodeRect): boolean => CONTAINER_TYPES.has(String(node.type ?? ''));

const nodeCenter = (rect: Rectangle): Point => ({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
});

const pointInsideRect = (point: Point, rect: Rectangle): boolean =>
    point.x >= rect.x - EPS
    && point.x <= rect.x + rect.width + EPS
    && point.y >= rect.y - EPS
    && point.y <= rect.y + rect.height + EPS;

const rangeOverlap = (a1: number, a2: number, b1: number, b2: number): number =>
    Math.max(0, Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)));

const headerHeightFor = (container: RoutingNodeRect): number => {
    if (container.type === 'titleGroup') return Math.min(84, Math.max(48, container.height * 0.12));
    return Math.min(56, Math.max(40, container.height * 0.08));
};

const simplifyOrthogonalPoints = (points: Point[]): Point[] => {
    const deduped: Point[] = [];
    for (const point of points) {
        const prev = deduped[deduped.length - 1];
        if (!prev || Math.abs(prev.x - point.x) > EPS || Math.abs(prev.y - point.y) > EPS) {
            deduped.push({ x: point.x, y: point.y });
        }
    }
    if (deduped.length <= 2) return deduped;

    const result: Point[] = [deduped[0]];
    for (let i = 1; i < deduped.length - 1; i++) {
        const prev = result[result.length - 1];
        const cur = deduped[i];
        const next = deduped[i + 1];
        if (
            (Math.abs(prev.x - cur.x) < EPS && Math.abs(cur.x - next.x) < EPS)
            || (Math.abs(prev.y - cur.y) < EPS && Math.abs(cur.y - next.y) < EPS)
        ) {
            continue;
        }
        result.push(cur);
    }
    result.push(deduped[deduped.length - 1]);
    return result;
};

const segmentHitsRect = (a: Point, b: Point, rect: Rectangle, padding = 2): boolean => {
    const left = rect.x + padding;
    const right = rect.x + rect.width - padding;
    const top = rect.y + padding;
    const bottom = rect.y + rect.height - padding;
    if (right <= left || bottom <= top) return false;

    if (Math.abs(a.x - b.x) < EPS) {
        const x = a.x;
        if (x <= left || x >= right) return false;
        return Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom);
    }

    if (Math.abs(a.y - b.y) < EPS) {
        const y = a.y;
        if (y <= top || y >= bottom) return false;
        return Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right);
    }

    return true;
};

const pathHitsObstacles = (points: Point[], obstacles: Rectangle[]): boolean => {
    for (let i = 0; i < points.length - 1; i++) {
        for (const obstacle of obstacles) {
            if (segmentHitsRect(points[i], points[i + 1], obstacle)) return true;
        }
    }
    return false;
};

const segmentsStrictlyCross = (a: Point, b: Point, c: Point, d: Point): boolean => {
    const aH = Math.abs(a.y - b.y) < EPS;
    const aV = Math.abs(a.x - b.x) < EPS;
    const cH = Math.abs(c.y - d.y) < EPS;
    const cV = Math.abs(c.x - d.x) < EPS;
    if ((!aH && !aV) || (!cH && !cV) || aH === cH) return false;

    const hA = aH ? a : c;
    const hB = aH ? b : d;
    const vA = aV ? a : c;
    const vB = aV ? b : d;
    const x = vA.x;
    const y = hA.y;
    return x > Math.min(hA.x, hB.x) + 2
        && x < Math.max(hA.x, hB.x) - 2
        && y > Math.min(vA.y, vB.y) + 2
        && y < Math.max(vA.y, vB.y) - 2;
};

const pathHasStrictCrossing = (points: Point[], otherPaths: Map<string, Point[]>, edgeId: string): boolean => {
    for (let i = 0; i < points.length - 1; i++) {
        for (const [otherId, other] of otherPaths) {
            if (otherId === edgeId) continue;
            for (let j = 0; j < other.length - 1; j++) {
                if (segmentsStrictlyCross(points[i], points[i + 1], other[j], other[j + 1])) return true;
            }
        }
    }
    return false;
};

const hasHeaderSkim = (points: Point[], containers: RoutingNodeRect[]): boolean => {
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (Math.abs(a.y - b.y) >= EPS) continue;
        const y = a.y;
        const minX = Math.min(a.x, b.x);
        const maxX = Math.max(a.x, b.x);
        for (const container of containers) {
            const headerTop = container.y - 12;
            const headerBottom = container.y + headerHeightFor(container);
            const overlapsHeader = y >= headerTop && y <= headerBottom;
            const overlapLength = rangeOverlap(minX, maxX, container.x, container.x + container.width);
            if (overlapsHeader && overlapLength >= 40) return true;
        }
    }
    return false;
};

type EndpointSide = 'top' | 'right' | 'bottom' | 'left';

const getEndpointSide = (point: Point, rect: Rectangle): EndpointSide | null => {
    const distances: Array<{ side: EndpointSide; value: number }> = [
        { side: 'top', value: Math.abs(point.y - rect.y) },
        { side: 'bottom', value: Math.abs(point.y - (rect.y + rect.height)) },
        { side: 'left', value: Math.abs(point.x - rect.x) },
        { side: 'right', value: Math.abs(point.x - (rect.x + rect.width)) },
    ];
    distances.sort((a, b) => a.value - b.value);
    return distances[0]?.value <= 3 ? distances[0].side : null;
};

const sideCenterPoint = (rect: Rectangle, side: EndpointSide): Point => {
    const center = nodeCenter(rect);
    if (side === 'left') return { x: rect.x, y: center.y };
    if (side === 'right') return { x: rect.x + rect.width, y: center.y };
    if (side === 'top') return { x: center.x, y: rect.y };
    return { x: center.x, y: rect.y + rect.height };
};

const sideVector = (side: EndpointSide): Point => {
    if (side === 'left') return { x: -1, y: 0 };
    if (side === 'right') return { x: 1, y: 0 };
    if (side === 'top') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
};

const pointForSide = (rect: Rectangle, side: EndpointSide, currentPoint?: Point): Point => {
    if (!currentPoint) return sideCenterPoint(rect, side);
    if (side === 'left' || side === 'right') {
        const y = Math.max(rect.y, Math.min(rect.y + rect.height, currentPoint.y));
        return { x: side === 'left' ? rect.x : rect.x + rect.width, y };
    }
    const x = Math.max(rect.x, Math.min(rect.x + rect.width, currentPoint.x));
    return { x, y: side === 'top' ? rect.y : rect.y + rect.height };
};

const followsSourceSide = (start: Point, next: Point, side: EndpointSide): boolean => {
    const vector = sideVector(side);
    const dx = next.x - start.x;
    const dy = next.y - start.y;
    return vector.x !== 0 ? dx * vector.x > EPS : dy * vector.y > EPS;
};

const followsTargetSide = (prev: Point, end: Point, side: EndpointSide): boolean => {
    const vector = sideVector(side);
    const dx = prev.x - end.x;
    const dy = prev.y - end.y;
    return vector.x !== 0 ? dx * vector.x > EPS : dy * vector.y > EPS;
};

const sideAlignmentPenalty = (side: EndpointSide, from: Rectangle, to: Rectangle, endpointRole: 'source' | 'target'): number => {
    const fromCenter = nodeCenter(from);
    const toCenter = nodeCenter(to);
    const vector = sideVector(side);
    const direction = endpointRole === 'source'
        ? { x: toCenter.x - fromCenter.x, y: toCenter.y - fromCenter.y }
        : { x: toCenter.x - fromCenter.x, y: toCenter.y - fromCenter.y };
    const distance = Math.hypot(direction.x, direction.y);
    if (distance < EPS) return 40;
    const dot = (vector.x * direction.x + vector.y * direction.y) / distance;
    if (dot > 0.65) return 0;
    if (dot > 0.2) return 60;
    if (dot > -0.2) return 160;
    return 260;
};

const pathLength = (points: Point[]): number => points.reduce((sum, point, index) => {
    if (index === 0) return sum;
    const prev = points[index - 1];
    return sum + Math.abs(point.x - prev.x) + Math.abs(point.y - prev.y);
}, 0);

const chooseHorizontalSourceSide = (source: Rectangle, target: Rectangle, currentSide: EndpointSide): EndpointSide | null => {
    if (currentSide === 'left' || currentSide === 'right') return null;

    const sourceCenter = nodeCenter(source);
    const targetCenter = nodeCenter(target);
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < Math.max(160, source.width * 1.2)) return null;
    if (absDx < absDy * 1.1) return null;
    return dx < 0 ? 'left' : 'right';
};

const targetContainersFor = (
    nodes: RoutingNodeRect[],
    source: RoutingNodeRect,
    target: RoutingNodeRect,
): RoutingNodeRect[] => {
    const sourceCenter = nodeCenter(source);
    const targetCenter = nodeCenter(target);
    return nodes
        .filter(isContainerNode)
        .filter(container => pointInsideRect(targetCenter, container))
        .filter(container => !pointInsideRect(sourceCenter, container));
};

const validateCandidate = (
    candidate: Point[],
    current: Point[],
    options: ContainerHeaderSkimRepairOptions,
): Point[] | null => {
    if (candidate.length < 2) return null;

    const currentLength = current.reduce((sum, point, index) => {
        if (index === 0) return sum;
        const prev = current[index - 1];
        return sum + Math.abs(point.x - prev.x) + Math.abs(point.y - prev.y);
    }, 0);
    const candidateLength = candidate.reduce((sum, point, index) => {
        if (index === 0) return sum;
        const prev = candidate[index - 1];
        return sum + Math.abs(point.x - prev.x) + Math.abs(point.y - prev.y);
    }, 0);
    const clearance = options.clearance ?? DEFAULT_CONTAINER_ENTRY_CLEARANCE;
    if (candidateLength > currentLength + clearance * 4) return null;
    if (pathHitsObstacles(candidate, options.obstacles ?? [])) return null;
    if (options.otherPaths && pathHasStrictCrossing(candidate, options.otherPaths, options.edgeId)) return null;

    return candidate;
};

export function repairEndpointPortConstraintPath(
    points: Point[],
    options: ContainerHeaderSkimRepairOptions,
): Point[] | null {
    const current = simplifyOrthogonalPoints(points);
    if (current.length < 2) return null;

    const source = options.nodes.find(node => node.id === options.sourceId);
    const target = options.nodes.find(node => node.id === options.targetId);
    if (!source || !target) return null;

    const start = current[0];
    const first = current[1];
    const end = current[current.length - 1];
    const prev = current[current.length - 2];
    const currentSourceSide = getEndpointSide(start, source);
    const currentTargetSide = getEndpointSide(end, target);
    if (!currentSourceSide || !currentTargetSide) return null;

    const sourceOk = followsSourceSide(start, first, currentSourceSide);
    const targetOk = followsTargetSide(prev, end, currentTargetSide);
    if (sourceOk && targetOk) return null;

    const endpointStub = Math.max(
        24,
        Math.min(
            DEFAULT_SOURCE_EXIT_STUB,
            Math.max(
                DEFAULT_ENDPOINT_STUB,
                Math.min(source.width, source.height, target.width, target.height) * 0.5,
            ),
        ),
    );
    const sourceSides: EndpointSide[] = sourceOk
        ? [currentSourceSide]
        : ['top', 'right', 'bottom', 'left'];
    const targetSides: EndpointSide[] = targetOk
        ? [currentTargetSide]
        : ['top', 'right', 'bottom', 'left'];
    const candidateRecords: Array<{ points: Point[]; score: number }> = [];
    const sourcePreferredBonus = sourceOk ? 0 : sideAlignmentPenalty(currentSourceSide, source, target, 'source');
    const targetPreferredBonus = targetOk ? 0 : sideAlignmentPenalty(currentTargetSide, target, source, 'target');

    const addCandidate = (candidate: Point[], sourceSide: EndpointSide, targetSide: EndpointSide): void => {
        const normalized = simplifyOrthogonalPoints(candidate);
        if (normalized.length < 2) return;
        if (!followsSourceSide(normalized[0], normalized[1], sourceSide)) return;
        if (!followsTargetSide(normalized[normalized.length - 2], normalized[normalized.length - 1], targetSide)) return;
        const validated = validateCandidate(normalized, current, options);
        if (!validated) return;

        const bends = Math.max(0, validated.length - 2);
        const sourceSwitchPenalty = sourceSide === currentSourceSide ? (sourceOk ? -20 : sourcePreferredBonus) : 0;
        const targetSwitchPenalty = targetSide === currentTargetSide ? (targetOk ? -20 : targetPreferredBonus) : 0;
        const score = pathLength(validated)
            + bends * 12
            + sideAlignmentPenalty(sourceSide, source, target, 'source')
            + sideAlignmentPenalty(targetSide, target, source, 'target')
            + sourceSwitchPenalty
            + targetSwitchPenalty;
        candidateRecords.push({ points: validated, score });
    };

    for (const sourceSide of sourceSides) {
        const sourcePoint = pointForSide(source, sourceSide, sourceSide === currentSourceSide ? start : undefined);
        const sourceVector = sideVector(sourceSide);
        const sourceStub = {
            x: sourcePoint.x + sourceVector.x * endpointStub,
            y: sourcePoint.y + sourceVector.y * endpointStub,
        };

        for (const targetSide of targetSides) {
            const targetPoint = pointForSide(target, targetSide, targetSide === currentTargetSide ? end : undefined);
            const targetVector = sideVector(targetSide);
            const targetStub = {
                x: targetPoint.x + targetVector.x * endpointStub,
                y: targetPoint.y + targetVector.y * endpointStub,
            };

            addCandidate([
                sourcePoint,
                sourceStub,
                { x: targetStub.x, y: sourceStub.y },
                targetStub,
                targetPoint,
            ], sourceSide, targetSide);
            addCandidate([
                sourcePoint,
                sourceStub,
                { x: sourceStub.x, y: targetStub.y },
                targetStub,
                targetPoint,
            ], sourceSide, targetSide);
        }
    }

    candidateRecords.sort((a, b) => a.score - b.score);
    return candidateRecords[0]?.points ?? null;
}

export function repairTangentialEndpointEntryPath(
    points: Point[],
    options: ContainerHeaderSkimRepairOptions,
): Point[] | null {
    const current = simplifyOrthogonalPoints(points);
    if (current.length < 3) return null;

    const source = options.nodes.find(node => node.id === options.sourceId);
    const target = options.nodes.find(node => node.id === options.targetId);
    if (!source || !target) return null;

    const end = current[current.length - 1];
    const prev = current[current.length - 2];
    const side = getEndpointSide(end, target);
    if (!side) return null;

    const finalHorizontal = Math.abs(prev.y - end.y) < EPS;
    const finalVertical = Math.abs(prev.x - end.x) < EPS;
    const needsVerticalEntry = side === 'top' || side === 'bottom';
    const entryLength = Math.abs(prev.x - end.x) + Math.abs(prev.y - end.y);
    const minEntryStub = recommendedEndpointEntryStub(target);
    if (
        ((needsVerticalEntry && finalVertical) || (!needsVerticalEntry && finalHorizontal))
        && entryLength >= minEntryStub
    ) return null;

    const clearance = options.clearance ?? DEFAULT_CONTAINER_ENTRY_CLEARANCE;
    const targetContainers = targetContainersFor(options.nodes, source, target);
    let candidate: Point[];
    const start = current[0];

    if (side === 'top' || side === 'bottom') {
        const sourceAboveTargetContainers = targetContainers.length > 0
            && source.y + source.height <= Math.min(...targetContainers.map(container => container.y)) - 4;
        const sourceBelowTargetContainers = targetContainers.length > 0
            && source.y >= Math.max(...targetContainers.map(container => container.y + container.height)) + 4;
        const corridorY = side === 'top'
            ? (sourceAboveTargetContainers
                ? Math.min(...targetContainers.map(container => container.y)) - clearance
                : target.y - clearance)
            : (sourceBelowTargetContainers
                ? Math.max(...targetContainers.map(container => container.y + container.height)) + clearance
                : target.y + target.height + clearance);
        candidate = simplifyOrthogonalPoints([
            { ...start },
            { x: start.x, y: corridorY },
            { x: end.x, y: corridorY },
            { ...end },
        ]);
    } else {
        const sourceLeftOfTargetContainers = targetContainers.length > 0
            && source.x + source.width <= Math.min(...targetContainers.map(container => container.x)) - 4;
        const sourceRightOfTargetContainers = targetContainers.length > 0
            && source.x >= Math.max(...targetContainers.map(container => container.x + container.width)) + 4;
        const corridorX = side === 'left'
            ? (sourceLeftOfTargetContainers
                ? Math.min(...targetContainers.map(container => container.x)) - clearance
                : target.x - clearance)
            : (sourceRightOfTargetContainers
                ? Math.max(...targetContainers.map(container => container.x + container.width)) + clearance
                : target.x + target.width + clearance);
        candidate = simplifyOrthogonalPoints([
            { ...start },
            { x: corridorX, y: start.y },
            { x: corridorX, y: end.y },
            { ...end },
        ]);
    }

    return validateCandidate(candidate, current, { ...options, otherPaths: undefined });
}

export function repairDirectionalSourceExitPath(
    points: Point[],
    options: ContainerHeaderSkimRepairOptions,
): Point[] | null {
    const current = simplifyOrthogonalPoints(points);
    if (current.length < 3) return null;

    const source = options.nodes.find(node => node.id === options.sourceId);
    const target = options.nodes.find(node => node.id === options.targetId);
    if (!source || !target) return null;

    const start = current[0];
    const sourceSide = getEndpointSide(start, source);
    if (!sourceSide) return null;

    const desiredSide = chooseHorizontalSourceSide(source, target, sourceSide);
    if (!desiredSide) return null;

    const targetContainers = targetContainersFor(options.nodes, source, target);
    if (targetContainers.length === 0) return null;

    const sourceCenter = nodeCenter(source);
    const targetCenter = nodeCenter(target);
    const targetIsBelowSource = targetCenter.y > sourceCenter.y;
    const targetIsAboveSource = targetCenter.y < sourceCenter.y;
    if (!targetIsBelowSource && !targetIsAboveSource) return null;

    const clearance = options.clearance ?? DEFAULT_CONTAINER_ENTRY_CLEARANCE;
    const end = current[current.length - 1];
    const corridorX = desiredSide === 'left'
        ? source.x - clearance
        : source.x + source.width + clearance;
    const corridorY = targetIsBelowSource
        ? Math.min(...targetContainers.map(container => container.y)) - clearance
        : Math.max(...targetContainers.map(container => container.y + container.height)) + clearance;

    if (!Number.isFinite(corridorX) || !Number.isFinite(corridorY)) return null;

    let candidate: Point[];
    if ((sourceSide === 'bottom' && targetIsBelowSource) || (sourceSide === 'top' && targetIsAboveSource)) {
        const sourcePoint = sideCenterPoint(source, sourceSide);
        const direction = sourceSide === 'bottom' ? 1 : -1;
        const stub = Math.min(DEFAULT_SOURCE_EXIT_STUB, Math.max(40, Math.abs(corridorY - sourcePoint.y) - 40));
        const exitY = sourcePoint.y + direction * stub;
        candidate = simplifyOrthogonalPoints([
            sourcePoint,
            { x: sourcePoint.x, y: exitY },
            { x: corridorX, y: exitY },
            { x: corridorX, y: corridorY },
            { x: end.x, y: corridorY },
            { ...end },
        ]);
    } else {
        const sourcePoint = sideCenterPoint(source, desiredSide);
        candidate = simplifyOrthogonalPoints([
            sourcePoint,
            { x: corridorX, y: sourcePoint.y },
            { x: corridorX, y: corridorY },
            { x: end.x, y: corridorY },
            { ...end },
        ]);
    }
    return validateCandidate(candidate, current, { ...options, otherPaths: undefined });
}

export function repairContainerHeaderSkimPath(
    points: Point[],
    options: ContainerHeaderSkimRepairOptions,
): Point[] | null {
    const current = simplifyOrthogonalPoints(points);
    if (current.length < 3) return null;

    const source = options.nodes.find(node => node.id === options.sourceId);
    const target = options.nodes.find(node => node.id === options.targetId);
    if (!source || !target) return null;

    const targetContainers = targetContainersFor(options.nodes, source, target);
    if (targetContainers.length === 0 || !hasHeaderSkim(current, targetContainers)) return null;

    const clearance = options.clearance ?? DEFAULT_CONTAINER_ENTRY_CLEARANCE;
    const sourceAboveTargetContainers = source.y + source.height <= Math.min(...targetContainers.map(container => container.y)) - 4;
    const sourceBelowTargetContainers = source.y >= Math.max(...targetContainers.map(container => container.y + container.height)) + 4;
    if (!sourceAboveTargetContainers && !sourceBelowTargetContainers) return null;

    const start = current[0];
    const end = current[current.length - 1];
    const corridorY = sourceAboveTargetContainers
        ? Math.min(...targetContainers.map(container => container.y)) - clearance
        : Math.max(...targetContainers.map(container => container.y + container.height)) + clearance;

    if (!Number.isFinite(corridorY) || Math.abs(corridorY - start.y) < EPS || Math.abs(corridorY - end.y) < EPS) {
        return null;
    }

    const candidate = simplifyOrthogonalPoints([
        { ...start },
        { x: start.x, y: corridorY },
        { x: end.x, y: corridorY },
        { ...end },
    ]);
    return validateCandidate(candidate, current, { ...options, otherPaths: undefined });
}

export function detectContainerHeaderSkimRisk(
    points: Point[],
    options: Pick<ContainerHeaderSkimRepairOptions, 'sourceId' | 'targetId' | 'nodes'>,
): boolean {
    const current = simplifyOrthogonalPoints(points);
    if (current.length < 3) return false;

    const source = options.nodes.find(node => node.id === options.sourceId);
    const target = options.nodes.find(node => node.id === options.targetId);
    if (!source || !target) return false;

    const targetContainers = targetContainersFor(options.nodes, source, target);
    return targetContainers.length > 0 && hasHeaderSkim(current, targetContainers);
}
