import type { Node } from '@xyflow/react';
import { getStroke } from 'perfect-freehand';

export type FreehandPoint = [x: number, y: number, pressure: number];

export interface FreehandStroke {
    points: FreehandPoint[];
    color: string;
    size: number;
}

export interface FreehandNodeData extends Record<string, unknown> {
    label: string;
    points: FreehandPoint[];
    color: string;
    size: number;
    layer?: string;
}

export const MAX_FREEHAND_POINTS = 2_048;
export const MAX_FREEHAND_COORDINATE_ABS = 1_000_000;
export const DEFAULT_FREEHAND_COLOR = '#000000';
export const DEFAULT_FREEHAND_SIZE = 4;

const NODE_PADDING = 8;
const MIN_NODE_SIZE = 16;
const MIN_POINT_DISTANCE = 0.5;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const coerceFiniteNumber = (value: unknown): number | null => (
    typeof value === 'number' && Number.isFinite(value) ? value : null
);

const coercePoint = (value: unknown): FreehandPoint | null => {
    if (!Array.isArray(value) || value.length < 2) return null;
    const x = coerceFiniteNumber(value[0]);
    const y = coerceFiniteNumber(value[1]);
    const rawPressure = value.length > 2 ? coerceFiniteNumber(value[2]) : 0.5;
    if (
        x === null || y === null || rawPressure === null ||
        Math.abs(x) > MAX_FREEHAND_COORDINATE_ABS ||
        Math.abs(y) > MAX_FREEHAND_COORDINATE_ABS
    ) return null;

    return [x, y, Math.min(1, Math.max(0, rawPressure))];
};

export const coerceFreehandColor = (value: unknown): string => (
    typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
        ? value.toLowerCase()
        : DEFAULT_FREEHAND_COLOR
);

export const coerceFreehandStroke = (value: unknown): FreehandStroke | null => {
    if (!isRecord(value) || !Array.isArray(value.points) || value.points.length === 0) return null;

    const points: FreehandPoint[] = [];
    for (const rawPoint of value.points.slice(0, MAX_FREEHAND_POINTS)) {
        const point = coercePoint(rawPoint);
        if (!point) continue;
        const previous = points[points.length - 1];
        if (previous && Math.hypot(point[0] - previous[0], point[1] - previous[1]) < MIN_POINT_DISTANCE) {
            continue;
        }
        points.push(point);
    }
    if (points.length === 0) return null;

    const rawSize = coerceFiniteNumber(value.size);
    return {
        points,
        color: coerceFreehandColor(value.color),
        size: rawSize === null ? DEFAULT_FREEHAND_SIZE : Math.min(64, Math.max(1, rawSize)),
    };
};

const drawingOptions = (size: number) => ({
    size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    easing: (value: number) => value,
    start: { taper: 0, easing: (value: number) => value, cap: true },
    end: { taper: 0, easing: (value: number) => value, cap: true },
});

export const getFreehandOutline = (stroke: FreehandStroke): number[][] => (
    getStroke(stroke.points, drawingOptions(stroke.size))
);

export const getFreehandSvgPath = (stroke: FreehandStroke): string => {
    const outline = getFreehandOutline(stroke);
    if (outline.length === 0) return '';

    const path = outline.reduce((result, [x0, y0], index) => {
        const [x1, y1] = outline[(index + 1) % outline.length];
        return `${result} Q ${x0} ${y0} ${(x0 + x1) / 2} ${(y0 + y1) / 2}`;
    }, `M ${outline[0][0]} ${outline[0][1]}`);
    return `${path} Z`;
};

export const createFreehandNode = (
    value: unknown,
    layer?: string,
    createId: () => string = () => crypto.randomUUID(),
): Node<FreehandNodeData> | null => {
    const stroke = coerceFreehandStroke(value);
    if (!stroke) return null;
    const outline = getFreehandOutline(stroke);
    if (outline.length === 0) return null;

    const xValues = outline.map(point => point[0]);
    const yValues = outline.map(point => point[1]);
    const minX = Math.min(...xValues) - NODE_PADDING;
    const minY = Math.min(...yValues) - NODE_PADDING;
    const maxX = Math.max(...xValues) + NODE_PADDING;
    const maxY = Math.max(...yValues) + NODE_PADDING;
    const width = Math.max(MIN_NODE_SIZE, maxX - minX);
    const height = Math.max(MIN_NODE_SIZE, maxY - minY);
    const points = stroke.points.map<FreehandPoint>(([x, y, pressure]) => [
        x - minX,
        y - minY,
        pressure,
    ]);

    return {
        id: `freehand-${createId()}`,
        type: 'freehand',
        position: { x: minX, y: minY },
        style: { width, height },
        width,
        height,
        data: {
            label: '自由画笔',
            points,
            color: stroke.color,
            size: stroke.size,
            ...(layer ? { layer } : {}),
        },
    };
};
