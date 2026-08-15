import {
    buildAlignedDirectPath,
    detectLocalDoglegRisks,
    simplifyOrthogonalPointChain,
    type OrthogonalPoint,
} from './localDoglegQuality';

export type RenderedAuditSeverity = 'error' | 'warning' | 'info';

export interface RenderedAuditNode {
    id: string;
    type?: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface RenderedAuditEdge {
    id: string;
    source: string;
    target: string;
    path: string;
    labelRect?: RenderedAuditRect;
    /** Resolved values from the rendered SVG/CSS, not source-edge metadata. */
    stroke?: unknown;
    strokeWidth?: unknown;
    strokeDasharray?: unknown;
    opacity?: unknown;
    markerStart?: unknown;
    markerEnd?: unknown;
    zoom?: unknown;
    selected?: unknown;
    labelVisible?: unknown;
    /** Optional edge-specific contract used only when presentation auditing is enabled. */
    expectedPresentation?: unknown;
}

export type RenderedAuditPresentationField =
    | 'stroke'
    | 'strokeWidth'
    | 'strokeDasharray'
    | 'opacity'
    | 'markerStart'
    | 'markerEnd'
    | 'zoom'
    | 'selected'
    | 'labelVisible';

export interface RenderedAuditPresentationPolicy {
    requiredFields?: unknown;
    lowZoomThreshold?: unknown;
    minimumVisibleOpacity?: unknown;
    minimumSelectedOpacity?: unknown;
    minimumSelectedStrokeWidth?: unknown;
}

export interface RenderedRoutingAuditOptions {
    /** Disabled by default so existing callers retain the geometry-only audit. */
    presentation?: boolean | RenderedAuditPresentationPolicy;
}

export interface RenderedAuditRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface RenderedAuditFinding {
    edgeId?: string;
    rule: string;
    severity: RenderedAuditSeverity;
    reason: string;
    measuredValue?: number;
    relatedNodeIds?: string[];
    relatedEdgeIds?: string[];
    presentationField?: RenderedAuditPresentationField;
    actualValue?: string | number | boolean;
    expectedValue?: string | number | boolean;
    isHardConstraint: boolean;
}

export interface RenderedRoutingAuditResult {
    errors: RenderedAuditFinding[];
    warnings: RenderedAuditFinding[];
    infos: RenderedAuditFinding[];
}

interface ParsedPathPoint {
    x: number;
    y: number;
    command: 'M' | 'L' | 'A' | 'C' | 'Q';
}

interface Segment {
    a: ParsedPathPoint;
    b: ParsedPathPoint;
    segmentIndex: number;
    pointCount: number;
}

type EndpointSide = 'top' | 'right' | 'bottom' | 'left';

const EPS = 1;
const STRICT_CROSSING_INTERIOR_EPS = 0.5;
const NODE_NEAR_PATH_WARNING_DISTANCE = 16;
const PARALLEL_OVERLAP_ERROR_LENGTH = 24;
const MAIN_AXIS_BACKTRACK_WARNING_DISTANCE = 48;
const MAX_SHARED_TRUNK_SEGMENTS = 256;
const CONTAINER_TYPES = new Set(['group', 'subGroup', 'titleGroup', 'domain', 'subDomain', 'swimlane']);
const PRESENTATION_FIELDS: readonly RenderedAuditPresentationField[] = [
    'stroke',
    'strokeWidth',
    'strokeDasharray',
    'opacity',
    'markerStart',
    'markerEnd',
    'zoom',
    'selected',
    'labelVisible',
];
const DEFAULT_REQUIRED_PRESENTATION_FIELDS: readonly RenderedAuditPresentationField[] = [
    'stroke',
    'strokeWidth',
    'opacity',
    'zoom',
    'selected',
    'labelVisible',
];
const MAX_PRESENTATION_STRING_LENGTH = 256;

type ParsedPresentationScalar = string | number | boolean;

type ParsedPresentationValue =
    | { status: 'valid'; value: ParsedPresentationScalar }
    | { status: 'missing' | 'invalid'; value?: never };

interface ResolvedPresentationPolicy {
    enabled: boolean;
    requiredFields: ReadonlySet<RenderedAuditPresentationField>;
    lowZoomThreshold: number;
    minimumVisibleOpacity: number;
    minimumSelectedOpacity: number;
    minimumSelectedStrokeWidth: number;
    invalidFields: string[];
}

const hasOwn = (value: object, key: PropertyKey): boolean =>
    Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isPresentationField = (value: unknown): value is RenderedAuditPresentationField =>
    typeof value === 'string' && PRESENTATION_FIELDS.some(field => field === value);

const hasControlCharacter = (value: string): boolean =>
    [...value].some(character => character.charCodeAt(0) < 32);

const finiteNumber = (
    value: unknown,
    minimum: number,
    maximum: number,
    allowPx = false,
    allowPercent = false,
): number | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
    }
    if (typeof value !== 'string' || value.length > 64) return null;
    const trimmed = value.trim();
    if (allowPercent && /^[-+]?\d*\.?\d+%$/.test(trimmed)) {
        const parsedPercent = Number(trimmed.slice(0, -1)) / 100;
        return Number.isFinite(parsedPercent) && parsedPercent >= minimum && parsedPercent <= maximum
            ? parsedPercent
            : null;
    }
    const pattern = allowPx ? /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?(?:px)?$/i : /^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i;
    if (!pattern.test(trimmed)) return null;
    const parsed = Number(allowPx ? trimmed.replace(/px$/i, '') : trimmed);
    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

const parseStroke = (value: unknown): ParsedPresentationValue => {
    if (value === undefined || value === null) return { status: 'missing' };
    if (typeof value !== 'string') return { status: 'invalid' };
    const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length === 0 || normalized.length > 128 || /[;{}<>]/.test(normalized) || hasControlCharacter(normalized)) {
        return { status: 'invalid' };
    }
    const isHex = /^#[0-9a-f]{3,8}$/i.test(normalized);
    const isNamed = /^[a-z][a-z0-9-]{0,31}$/i.test(normalized);
    const isFunctional = /^(?:rgb|rgba|hsl|hsla)\([0-9.,%+\-\s/]+\)$/i.test(normalized);
    return isHex || isNamed || isFunctional
        ? { status: 'valid', value: isFunctional ? normalized.replace(/\s+/g, '') : normalized }
        : { status: 'invalid' };
};

const parseDasharray = (value: unknown): ParsedPresentationValue => {
    if (value === undefined || value === null) return { status: 'valid', value: 'none' };
    if (typeof value !== 'string' || value.length > MAX_PRESENTATION_STRING_LENGTH) return { status: 'invalid' };
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '' || trimmed === 'none' || trimmed === '0' || trimmed === '0px') {
        return { status: 'valid', value: 'none' };
    }
    const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 32) return { status: 'invalid' };
    const values = tokens.map(token => finiteNumber(token, 0, 10_000, true));
    if (values.some(item => item === null) || values.every(item => item === 0)) return { status: 'invalid' };
    return { status: 'valid', value: values.map(item => Number(item).toString()).join(' ') };
};

const parseMarker = (value: unknown): ParsedPresentationValue => {
    if (value === undefined || value === null) return { status: 'valid', value: 'none' };
    if (typeof value !== 'string' || value.length > MAX_PRESENTATION_STRING_LENGTH) return { status: 'invalid' };
    const normalized = value.trim();
    if (normalized === '' || normalized.toLowerCase() === 'none') return { status: 'valid', value: 'none' };
    const match = /^url\(\s*["']?#([A-Za-z][\w:.-]{0,127})["']?\s*\)$/.exec(normalized);
    return match ? { status: 'valid', value: `url(#${match[1]})` } : { status: 'invalid' };
};

const parseBoolean = (value: unknown): ParsedPresentationValue => {
    if (value === undefined || value === null) return { status: 'missing' };
    if (typeof value === 'boolean') return { status: 'valid', value };
    if (value === 'true' || value === 'false') return { status: 'valid', value: value === 'true' };
    return { status: 'invalid' };
};

const parsePresentationField = (
    field: RenderedAuditPresentationField,
    value: unknown,
): ParsedPresentationValue => {
    if (field === 'stroke') return parseStroke(value);
    if (field === 'strokeDasharray') return parseDasharray(value);
    if (field === 'markerStart' || field === 'markerEnd') return parseMarker(value);
    if (field === 'selected' || field === 'labelVisible') return parseBoolean(value);
    if (value === undefined || value === null) return { status: 'missing' };
    const number = field === 'strokeWidth'
        ? finiteNumber(value, Number.EPSILON, 64, true)
        : field === 'opacity'
            ? finiteNumber(value, 0, 1, false, true)
            : finiteNumber(value, Number.EPSILON, 32);
    return number === null ? { status: 'invalid' } : { status: 'valid', value: number };
};

const policyNumber = (
    policy: Record<string, unknown>,
    field: string,
    fallback: number,
    minimum: number,
    maximum: number,
    invalidFields: string[],
): number => {
    if (!hasOwn(policy, field)) return fallback;
    const parsed = finiteNumber(policy[field], minimum, maximum);
    if (parsed !== null) return parsed;
    invalidFields.push(field);
    return fallback;
};

const resolvePresentationPolicy = (
    value: RenderedRoutingAuditOptions['presentation'],
): ResolvedPresentationPolicy => {
    const disabled: ResolvedPresentationPolicy = {
        enabled: false,
        requiredFields: new Set(),
        lowZoomThreshold: 0.4,
        minimumVisibleOpacity: 0.1,
        minimumSelectedOpacity: 0.85,
        minimumSelectedStrokeWidth: 2,
        invalidFields: [],
    };
    if (value === undefined || value === false) return disabled;

    const invalidFields: string[] = [];
    const policy = value === true ? {} : isRecord(value) ? value : {};
    if (value !== true && !isRecord(value)) invalidFields.push('presentation');
    let requiredFields: readonly RenderedAuditPresentationField[] = DEFAULT_REQUIRED_PRESENTATION_FIELDS;
    if (hasOwn(policy, 'requiredFields')) {
        const candidate = policy.requiredFields;
        if (Array.isArray(candidate)
            && candidate.length <= PRESENTATION_FIELDS.length
            && candidate.every(isPresentationField)) {
            requiredFields = [...new Set<RenderedAuditPresentationField>(candidate)];
        } else {
            invalidFields.push('requiredFields');
        }
    }
    return {
        enabled: true,
        requiredFields: new Set(requiredFields),
        lowZoomThreshold: policyNumber(policy, 'lowZoomThreshold', 0.4, Number.EPSILON, 4, invalidFields),
        minimumVisibleOpacity: policyNumber(policy, 'minimumVisibleOpacity', 0.1, 0, 1, invalidFields),
        minimumSelectedOpacity: policyNumber(policy, 'minimumSelectedOpacity', 0.85, 0, 1, invalidFields),
        minimumSelectedStrokeWidth: policyNumber(policy, 'minimumSelectedStrokeWidth', 2, Number.EPSILON, 64, invalidFields),
        invalidFields,
    };
};

const presentationValuesEqual = (left: ParsedPresentationScalar, right: ParsedPresentationScalar): boolean =>
    typeof left === 'number' && typeof right === 'number'
        ? Math.abs(left - right) <= 0.001
        : left === right;

export function parseRenderedSvgPath(path: string): ParsedPathPoint[] {
    const tokens = [...String(path || '').matchAll(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map(match => match[0]);
    const points: ParsedPathPoint[] = [];
    let index = 0;
    let command = '';
    let current = { x: 0, y: 0 };

    const number = () => Number(tokens[index++]);

    while (index < tokens.length) {
        if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
        const relative = command === command.toLowerCase();
        const upper = command.toUpperCase();

        if (upper === 'M' || upper === 'L') {
            const x = number();
            const y = number();
            current = { x: relative ? current.x + x : x, y: relative ? current.y + y : y };
            points.push({ ...current, command: upper as 'M' | 'L' });
            if (upper === 'M') command = relative ? 'l' : 'L';
        } else if (upper === 'H') {
            const x = number();
            current = { x: relative ? current.x + x : x, y: current.y };
            points.push({ ...current, command: 'L' });
        } else if (upper === 'V') {
            const y = number();
            current = { x: current.x, y: relative ? current.y + y : y };
            points.push({ ...current, command: 'L' });
        } else if (upper === 'A') {
            index += 5;
            const x = number();
            const y = number();
            current = { x: relative ? current.x + x : x, y: relative ? current.y + y : y };
            points.push({ ...current, command: 'A' });
        } else if (upper === 'C') {
            index += 4;
            const x = number();
            const y = number();
            current = { x: relative ? current.x + x : x, y: relative ? current.y + y : y };
            points.push({ ...current, command: 'C' });
        } else if (upper === 'Q') {
            index += 2;
            const x = number();
            const y = number();
            current = { x: relative ? current.x + x : x, y: relative ? current.y + y : y };
            points.push({ ...current, command: 'Q' });
        } else {
            index++;
        }
    }

    return points;
}

const structuralSegments = (points: ParsedPathPoint[]): Segment[] => {
    const segments: Segment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (b.command === 'A' || b.command === 'C' || b.command === 'Q') continue;
        if (Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS) continue;
        segments.push({ a, b, segmentIndex: i, pointCount: points.length });
    }
    return segments;
};

const isContainerNode = (node: RenderedAuditNode): boolean =>
    CONTAINER_TYPES.has(String(node.type ?? ''));

const sideVector = (side: EndpointSide) => {
    if (side === 'left') return { x: -1, y: 0 };
    if (side === 'right') return { x: 1, y: 0 };
    if (side === 'top') return { x: 0, y: -1 };
    return { x: 0, y: 1 };
};

const endpointSide = (point: ParsedPathPoint | undefined, node: RenderedAuditNode): EndpointSide | null => {
    if (!point) return null;
    const candidates = [
        { side: 'left' as const, distance: Math.abs(point.x - node.x), inBand: point.y >= node.y - 4 && point.y <= node.y + node.height + 4 },
        { side: 'right' as const, distance: Math.abs(point.x - (node.x + node.width)), inBand: point.y >= node.y - 4 && point.y <= node.y + node.height + 4 },
        { side: 'top' as const, distance: Math.abs(point.y - node.y), inBand: point.x >= node.x - 4 && point.x <= node.x + node.width + 4 },
        { side: 'bottom' as const, distance: Math.abs(point.y - (node.y + node.height)), inBand: point.x >= node.x - 4 && point.x <= node.x + node.width + 4 },
    ].filter(candidate => candidate.inBand).sort((a, b) => a.distance - b.distance);
    return candidates[0]?.distance <= 6 ? candidates[0].side : null;
};

const segmentFollowsVector = (segment: Segment | undefined, vector: { x: number; y: number }): boolean => {
    if (!segment) return false;
    const dx = segment.b.x - segment.a.x;
    const dy = segment.b.y - segment.a.y;
    if (Math.abs(vector.x) > 0) return Math.abs(dy) <= 1.5 && dx * vector.x > EPS;
    return Math.abs(dx) <= 1.5 && dy * vector.y > EPS;
};

const segmentHitsRect = (a: ParsedPathPoint, b: ParsedPathPoint, rect: RenderedAuditRect, padding = 2): boolean => {
    const left = rect.x + padding;
    const right = rect.x + rect.width - padding;
    const top = rect.y + padding;
    const bottom = rect.y + rect.height - padding;
    if (right <= left || bottom <= top) return false;

    if (Math.abs(a.x - b.x) <= EPS) {
        if (a.x <= left || a.x >= right) return false;
        return Math.max(Math.min(a.y, b.y), top) < Math.min(Math.max(a.y, b.y), bottom);
    }

    if (Math.abs(a.y - b.y) <= EPS) {
        if (a.y <= top || a.y >= bottom) return false;
        return Math.max(Math.min(a.x, b.x), left) < Math.min(Math.max(a.x, b.x), right);
    }

    return true;
};

const segmentsStrictlyCross = (first: Segment, second: Segment): boolean => {
    const firstHorizontal = Math.abs(first.a.y - first.b.y) <= EPS;
    const firstVertical = Math.abs(first.a.x - first.b.x) <= EPS;
    const secondHorizontal = Math.abs(second.a.y - second.b.y) <= EPS;
    const secondVertical = Math.abs(second.a.x - second.b.x) <= EPS;
    if ((!firstHorizontal && !firstVertical) || (!secondHorizontal && !secondVertical) || firstHorizontal === secondHorizontal) {
        return false;
    }

    const hA = firstHorizontal ? first.a : second.a;
    const hB = firstHorizontal ? first.b : second.b;
    const vA = firstVertical ? first.a : second.a;
    const vB = firstVertical ? first.b : second.b;
    const x = vA.x;
    const y = hA.y;
    return x > Math.min(hA.x, hB.x) + STRICT_CROSSING_INTERIOR_EPS
        && x < Math.max(hA.x, hB.x) - STRICT_CROSSING_INTERIOR_EPS
        && y > Math.min(vA.y, vB.y) + STRICT_CROSSING_INTERIOR_EPS
        && y < Math.max(vA.y, vB.y) - STRICT_CROSSING_INTERIOR_EPS;
};

const parallelOverlapLength = (first: Segment, second: Segment): number => {
    const firstHorizontal = Math.abs(first.a.y - first.b.y) <= EPS;
    const firstVertical = Math.abs(first.a.x - first.b.x) <= EPS;
    const secondHorizontal = Math.abs(second.a.y - second.b.y) <= EPS;
    const secondVertical = Math.abs(second.a.x - second.b.x) <= EPS;
    if ((!firstHorizontal && !firstVertical) || (!secondHorizontal && !secondVertical) || firstHorizontal !== secondHorizontal) return 0;
    if (firstHorizontal && Math.abs(first.a.y - second.a.y) > 2) return 0;
    if (firstVertical && Math.abs(first.a.x - second.a.x) > 2) return 0;

    return firstHorizontal
        ? Math.min(Math.max(first.a.x, first.b.x), Math.max(second.a.x, second.b.x))
            - Math.max(Math.min(first.a.x, first.b.x), Math.min(second.a.x, second.b.x))
        : Math.min(Math.max(first.a.y, first.b.y), Math.max(second.a.y, second.b.y))
            - Math.max(Math.min(first.a.y, first.b.y), Math.min(second.a.y, second.b.y));
};

const isProtectedRenderedSharedTrunk = (
    first: Segment,
    firstSegments: readonly Segment[],
    firstEdge: RenderedAuditEdge,
    second: Segment,
    secondSegments: readonly Segment[],
    secondEdge: RenderedAuditEdge,
): boolean => {
    const chainContains = (target: boolean): boolean => {
        const offsets = [first, second].map(segment => target ? segment.pointCount - 2 - segment.segmentIndex : segment.segmentIndex);
        if (offsets[0] !== offsets[1] || offsets[0] < 0 || offsets[0] >= MAX_SHARED_TRUNK_SEGMENTS) return false;
        for (let offset = 0; offset <= offsets[0]; offset++) {
            const a = target ? firstSegments[firstSegments.length - 1 - offset] : firstSegments[offset];
            const b = target ? secondSegments[secondSegments.length - 1 - offset] : secondSegments[offset];
            if (!a || !b
                || a.segmentIndex !== (target ? a.pointCount - 2 - offset : offset)
                || b.segmentIndex !== (target ? b.pointCount - 2 - offset : offset)) return false;
            const [aStart, aEnd] = target ? [a.b, a.a] : [a.a, a.b];
            const [bStart, bEnd] = target ? [b.b, b.a] : [b.a, b.b];
            const values = [aStart.x, aStart.y, aEnd.x, aEnd.y, bStart.x, bStart.y, bEnd.x, bEnd.y];
            if (!values.every(Number.isFinite)
                || Math.abs(aStart.x - bStart.x) > EPS || Math.abs(aStart.y - bStart.y) > EPS) return false;
            const [aDx, aDy, bDx, bDy] = [aEnd.x - aStart.x, aEnd.y - aStart.y, bEnd.x - bStart.x, bEnd.y - bStart.y];
            if (!((Math.abs(aDy) <= EPS && Math.abs(bDy) <= EPS && aDx * bDx > EPS)
                || (Math.abs(aDx) <= EPS && Math.abs(bDx) <= EPS && aDy * bDy > EPS))) return false;
            if (offset < offsets[0]
                && (Math.abs(aEnd.x - bEnd.x) > EPS || Math.abs(aEnd.y - bEnd.y) > EPS)) return false;
        }
        return true;
    };
    return (firstEdge.source === secondEdge.source && chainContains(false))
        || (firstEdge.target === secondEdge.target && chainContains(true));
};

const distanceToSegment = (point: { x: number; y: number }, segment: Segment): number => {
    if (Math.abs(segment.a.x - segment.b.x) <= EPS) {
        const y = Math.max(Math.min(segment.a.y, segment.b.y), Math.min(Math.max(segment.a.y, segment.b.y), point.y));
        return Math.hypot(point.x - segment.a.x, point.y - y);
    }
    if (Math.abs(segment.a.y - segment.b.y) <= EPS) {
        const x = Math.max(Math.min(segment.a.x, segment.b.x), Math.min(Math.max(segment.a.x, segment.b.x), point.x));
        return Math.hypot(point.x - x, point.y - segment.a.y);
    }
    return Number.POSITIVE_INFINITY;
};

const intervalGap = (aMin: number, aMax: number, bMin: number, bMax: number): number => {
    if (aMax < bMin) return bMin - aMax;
    if (bMax < aMin) return aMin - bMax;
    return 0;
};

const segmentRectClearance = (segment: Segment, rect: RenderedAuditRect): number => {
    if (segmentHitsRect(segment.a, segment.b, rect, 0)) return 0;

    const minX = Math.min(segment.a.x, segment.b.x);
    const maxX = Math.max(segment.a.x, segment.b.x);
    const minY = Math.min(segment.a.y, segment.b.y);
    const maxY = Math.max(segment.a.y, segment.b.y);

    if (Math.abs(segment.a.x - segment.b.x) <= EPS) {
        const dx = intervalGap(segment.a.x, segment.a.x, rect.x, rect.x + rect.width);
        const dy = intervalGap(minY, maxY, rect.y, rect.y + rect.height);
        return Math.hypot(dx, dy);
    }

    if (Math.abs(segment.a.y - segment.b.y) <= EPS) {
        const dx = intervalGap(minX, maxX, rect.x, rect.x + rect.width);
        const dy = intervalGap(segment.a.y, segment.a.y, rect.y, rect.y + rect.height);
        return Math.hypot(dx, dy);
    }

    return Math.min(
        distanceToSegment({ x: rect.x, y: rect.y }, segment),
        distanceToSegment({ x: rect.x + rect.width, y: rect.y }, segment),
        distanceToSegment({ x: rect.x, y: rect.y + rect.height }, segment),
        distanceToSegment({ x: rect.x + rect.width, y: rect.y + rect.height }, segment),
    );
};

const directPathHitsBusinessNode = (
    directPath: OrthogonalPoint[],
    edge: RenderedAuditEdge,
    nodes: RenderedAuditNode[],
): boolean => {
    for (let i = 0; i < directPath.length - 1; i++) {
        const a = { ...directPath[i], command: 'L' as const };
        const b = { ...directPath[i + 1], command: 'L' as const };
        for (const node of nodes) {
            if (node.id === edge.source || node.id === edge.target || isContainerNode(node)) continue;
            if (segmentHitsRect(a, b, node)) return true;
        }
    }
    return false;
};

const mainAxisBacktrackDistance = (points: OrthogonalPoint[]): number => {
    if (points.length < 2) return 0;
    const start = points[0];
    const end = points[points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const horizontalDominant = Math.abs(dx) >= Math.abs(dy);
    const mainDelta = horizontalDominant ? dx : dy;
    if (Math.abs(mainDelta) <= EPS) return 0;

    const expectedDirection = mainDelta > 0 ? 1 : -1;
    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        const segmentDx = next.x - current.x;
        const segmentDy = next.y - current.y;
        const segmentHorizontal = Math.abs(segmentDy) <= EPS && Math.abs(segmentDx) > EPS;
        const segmentVertical = Math.abs(segmentDx) <= EPS && Math.abs(segmentDy) > EPS;
        if (horizontalDominant && !segmentHorizontal) continue;
        if (!horizontalDominant && !segmentVertical) continue;
        const direction = (horizontalDominant ? segmentDx : segmentDy) > 0 ? 1 : -1;
        if (direction !== expectedDirection) {
            total += Math.abs(segmentDx) + Math.abs(segmentDy);
        }
    }
    return Number(total.toFixed(2));
};

export function auditRenderedEdgeRouting(
    edges: RenderedAuditEdge[],
    nodes: RenderedAuditNode[],
    options: RenderedRoutingAuditOptions = {},
): RenderedRoutingAuditResult {
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const parsedEdges = edges.map(edge => {
        const points = parseRenderedSvgPath(edge.path);
        return { edge, points, segments: structuralSegments(points) };
    });
    const errors: RenderedAuditFinding[] = [];
    const warnings: RenderedAuditFinding[] = [];
    const infos: RenderedAuditFinding[] = [];

    const pushError = (finding: Omit<RenderedAuditFinding, 'severity' | 'isHardConstraint'>) => {
        errors.push({ ...finding, severity: 'error', isHardConstraint: true });
    };
    const pushWarning = (finding: Omit<RenderedAuditFinding, 'severity' | 'isHardConstraint'>) => {
        warnings.push({ ...finding, severity: 'warning', isHardConstraint: false });
    };
    const presentationPolicy = resolvePresentationPolicy(options.presentation);
    for (const field of presentationPolicy.invalidFields) {
        pushWarning({ rule: 'presentation-policy-invalid', reason: `Presentation audit policy field "${field}" is invalid; the safe default was used.` });
    }
    const auditPresentation = (edge: RenderedAuditEdge) => {
        if (!presentationPolicy.enabled) return;
        const expected = isRecord(edge.expectedPresentation) ? edge.expectedPresentation : null;
        if (edge.expectedPresentation !== undefined && !expected) {
            pushWarning({ edgeId: edge.id, rule: 'presentation-expectation-invalid', reason: 'Expected presentation must be a bounded object of supported fields.' });
        }
        if (expected && Object.keys(expected).some(key => !isPresentationField(key))) {
            pushWarning({ edgeId: edge.id, rule: 'presentation-expectation-invalid', reason: 'Expected presentation contains an unsupported field.' });
        }
        const actualValues = new Map<RenderedAuditPresentationField, ParsedPresentationValue>();
        for (const field of PRESENTATION_FIELDS) {
            const actual = parsePresentationField(field, edge[field]);
            actualValues.set(field, actual);
            const expectedProvided = expected ? hasOwn(expected, field) : false;
            if (actual.status === 'missing' && (presentationPolicy.requiredFields.has(field) || expectedProvided)) {
                pushWarning({ edgeId: edge.id, rule: 'presentation-field-missing', reason: `Rendered presentation field "${field}" is missing.`, presentationField: field });
            } else if (actual.status === 'invalid') {
                pushWarning({ edgeId: edge.id, rule: 'presentation-field-invalid', reason: `Rendered presentation field "${field}" is invalid or outside its safe bound.`, presentationField: field });
            }
            if (!expectedProvided) continue;
            const contract = parsePresentationField(field, expected?.[field]);
            if (contract.status !== 'valid') {
                pushWarning({ edgeId: edge.id, rule: 'presentation-expectation-invalid', reason: `Expected presentation field "${field}" is invalid.`, presentationField: field });
            } else if (actual.status === 'valid' && !presentationValuesEqual(actual.value, contract.value)) {
                pushWarning({ edgeId: edge.id, rule: 'presentation-field-mismatch', reason: `Rendered presentation field "${field}" differs from its edge contract.`, presentationField: field, actualValue: actual.value, expectedValue: contract.value });
            }
        }
        const value = (field: RenderedAuditPresentationField) => actualValues.get(field)?.value;
        const selectedValue = value('selected');
        const selected = selectedValue === true;
        const opacity = value('opacity');
        const strokeWidth = value('strokeWidth');
        const zoom = value('zoom');
        const labelVisible = value('labelVisible');
        if (typeof opacity === 'number' && opacity < presentationPolicy.minimumVisibleOpacity) {
            pushWarning({ edgeId: edge.id, rule: 'edge-low-opacity', reason: 'Rendered edge opacity is below the visible presentation floor.', presentationField: 'opacity', actualValue: opacity, expectedValue: presentationPolicy.minimumVisibleOpacity });
        }
        if (selected && typeof opacity === 'number' && opacity < presentationPolicy.minimumSelectedOpacity) {
            pushWarning({ edgeId: edge.id, rule: 'selected-edge-low-opacity', reason: 'Selected edge is not visually prominent enough.', presentationField: 'opacity', actualValue: opacity, expectedValue: presentationPolicy.minimumSelectedOpacity });
        }
        if (selected && typeof strokeWidth === 'number' && strokeWidth < presentationPolicy.minimumSelectedStrokeWidth) {
            pushWarning({ edgeId: edge.id, rule: 'selected-edge-too-thin', reason: 'Selected edge stroke is below the trace emphasis floor.', presentationField: 'strokeWidth', actualValue: strokeWidth, expectedValue: presentationPolicy.minimumSelectedStrokeWidth });
        }
        if (selected && labelVisible === false) {
            pushWarning({ edgeId: edge.id, rule: 'selected-label-hidden', reason: 'Selected edge label is hidden, breaking end-to-end trace readability.', presentationField: 'labelVisible', actualValue: false, expectedValue: true });
        }
        if (selectedValue === false && typeof zoom === 'number' && zoom < presentationPolicy.lowZoomThreshold && labelVisible === true) {
            pushWarning({ edgeId: edge.id, rule: 'low-zoom-label-visible', reason: 'Unselected edge label exceeds the low-zoom label budget.', presentationField: 'labelVisible', actualValue: true, expectedValue: false });
        }
    };

    for (const parsed of parsedEdges) {
        const { edge, points, segments } = parsed;
        auditPresentation(edge);
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        const nearestBusinessNodeById = new Map<string, { node: RenderedAuditNode; distance: number }>();
        if (!source || !target) {
            pushError({ edgeId: edge.id, rule: 'missing-node', reason: 'Source or target node is absent from the rendered node list.' });
            continue;
        }

        const sourceSide = endpointSide(points[0], source);
        const targetSide = endpointSide(points[points.length - 1], target);
        if (!sourceSide) {
            pushError({ edgeId: edge.id, rule: 'source-not-on-boundary', reason: 'Rendered source endpoint is not on the source node boundary.' });
        } else if (!segmentFollowsVector(segments[0], sideVector(sourceSide))) {
            pushError({ edgeId: edge.id, rule: 'source-direction', reason: 'First structural segment does not leave perpendicular to the source side.' });
        }

        if (!targetSide) {
            pushError({ edgeId: edge.id, rule: 'target-not-on-boundary', reason: 'Rendered target endpoint is not on the target node boundary.' });
        } else {
            const targetVector = sideVector(targetSide);
            if (!segmentFollowsVector(segments[segments.length - 1], { x: -targetVector.x, y: -targetVector.y })) {
                pushError({ edgeId: edge.id, rule: 'target-direction', reason: 'Last structural segment does not enter perpendicular to the target side.' });
            }
        }

        for (const segment of segments) {
            if (Math.abs(segment.a.x - segment.b.x) > 1.5 && Math.abs(segment.a.y - segment.b.y) > 1.5) {
                pushError({ edgeId: edge.id, rule: 'diagonal-segment', reason: 'Structural segment is not horizontal or vertical.' });
            }

            for (const node of nodes) {
                if (node.id === edge.source || node.id === edge.target || isContainerNode(node)) continue;
                const hitsNode = segmentHitsRect(segment.a, segment.b, node);
                if (hitsNode) {
                    pushError({
                        edgeId: edge.id,
                        rule: 'obstacle-hit',
                        reason: 'Structural segment crosses a rendered business node.',
                        relatedNodeIds: [node.id],
                    });
                }

                const clearance = hitsNode ? Number.POSITIVE_INFINITY : segmentRectClearance(segment, node);
                if (clearance < NODE_NEAR_PATH_WARNING_DISTANCE) {
                    const existing = nearestBusinessNodeById.get(node.id);
                    if (!existing || clearance < existing.distance) {
                        nearestBusinessNodeById.set(node.id, { node, distance: clearance });
                    }
                }
            }
        }

        for (const { node, distance } of nearestBusinessNodeById.values()) {
            pushWarning({
                edgeId: edge.id,
                rule: 'business-node-near-path',
                reason: 'Rendered path runs too close to an unrelated business node and can look attached or overpainted when highlighted.',
                measuredValue: Number(distance.toFixed(2)),
                relatedNodeIds: [node.id],
            });
        }

        if (edge.labelRect && segments.length > 0) {
            const center = {
                x: edge.labelRect.x + edge.labelRect.width / 2,
                y: edge.labelRect.y + edge.labelRect.height / 2,
            };
            const minDistance = Math.min(...segments.map(segment => distanceToSegment(center, segment)));
            if (minDistance < 8) {
                pushWarning({
                    edgeId: edge.id,
                    rule: 'label-near-path',
                    reason: 'Edge label is too close to the rendered path.',
                    measuredValue: Number(minDistance.toFixed(2)),
                });
            }
        }

        const visualPoints = simplifyOrthogonalPointChain(points);
        const backtrackDistance = mainAxisBacktrackDistance(visualPoints);
        if (backtrackDistance >= MAIN_AXIS_BACKTRACK_WARNING_DISTANCE) {
            pushWarning({
                edgeId: edge.id,
                rule: 'main-axis-backtrack',
                reason: 'Rendered path moves away from the target on its dominant axis before returning, which reads as an unnecessary loop or far-side trunk.',
                measuredValue: backtrackDistance,
            });
        }
        const doglegRisks = detectLocalDoglegRisks(visualPoints);
        const directPath = buildAlignedDirectPath(visualPoints);
        const alignedDirectBlocked = directPath
            ? directPathHitsBusinessNode(directPath, edge, nodes)
            : false;
        for (const risk of doglegRisks) {
            if (risk.rule === 'aligned-local-dogleg' && alignedDirectBlocked) continue;
            pushWarning({
                edgeId: edge.id,
                rule: risk.rule,
                reason: risk.rule === 'aligned-local-dogleg'
                    ? 'Nearly aligned endpoints use a short local dogleg that can likely be flattened.'
                    : 'Rendered path contains a compact local dogleg that reduces readability.',
                measuredValue: risk.depth,
            });
        }
    }

    for (let i = 0; i < parsedEdges.length; i++) {
        for (let j = i + 1; j < parsedEdges.length; j++) {
            for (const first of parsedEdges[i].segments) {
                for (const second of parsedEdges[j].segments) {
                    if (segmentsStrictlyCross(first, second)) {
                        pushError({
                            rule: 'edge-crossing',
                            reason: 'Two rendered structural segments strictly cross.',
                            relatedEdgeIds: [parsedEdges[i].edge.id, parsedEdges[j].edge.id],
                        });
                        continue;
                    }

                    const overlap = parallelOverlapLength(first, second);
                    if (overlap >= PARALLEL_OVERLAP_ERROR_LENGTH
                        && !isProtectedRenderedSharedTrunk(
                            first, parsedEdges[i].segments, parsedEdges[i].edge,
                            second, parsedEdges[j].segments, parsedEdges[j].edge,
                        )) {
                        pushError({
                            rule: 'edge-parallel-overlap',
                            reason: 'Two rendered structural segments share a non-protected lane long enough to obscure flow direction.',
                            measuredValue: Number(overlap.toFixed(2)),
                            relatedEdgeIds: [parsedEdges[i].edge.id, parsedEdges[j].edge.id],
                        });
                    }
                }
            }
        }
    }

    return { errors, warnings, infos };
}
