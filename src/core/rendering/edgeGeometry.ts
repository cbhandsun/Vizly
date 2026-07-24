import type { EdgeProps, Position } from '@xyflow/react';
import { normalizeSvgPaint, normalizeSvgStrokeDasharray } from './styleTokens';
import type { RenderEdgeGeometry, RenderEdgeMarker, RenderHandlePosition, RenderPoint } from './types';

const MAX_POINT_ABS = 1_000_000;
const DEFAULT_STROKE = '#64748b';

const round = (value: number): number => Math.round(value * 1000) / 1000;

export const isFiniteRenderNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_POINT_ABS
);

export const coerceRenderNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (!isFiniteRenderNumber(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

export const normalizeRenderPoint = (value: unknown): RenderPoint | null => {
  const point = value as Partial<RenderPoint> | null | undefined;
  if (!point || !isFiniteRenderNumber(point.x) || !isFiniteRenderNumber(point.y)) return null;
  return { x: round(point.x), y: round(point.y) };
};

export const pointsToSvgPath = (points: readonly RenderPoint[]): string => {
  const safePoints = points.map(normalizeRenderPoint).filter((point): point is RenderPoint => !!point);
  if (safePoints.length < 2) return '';
  const [first, ...rest] = safePoints;
  return [`M ${first.x} ${first.y}`, ...rest.map(point => `L ${point.x} ${point.y}`)].join(' ');
};

export const computeStraightPath = (source: RenderPoint, target: RenderPoint): string => (
  pointsToSvgPath([source, target])
);

export const computeOrthogonalPath = (source: RenderPoint, target: RenderPoint): string => {
  const dx = Math.abs(target.x - source.x);
  const dy = Math.abs(target.y - source.y);
  if (dx < 1 || dy < 1) return computeStraightPath(source, target);
  const mid = dx >= dy
    ? { x: round((source.x + target.x) / 2), y: source.y }
    : { x: source.x, y: round((source.y + target.y) / 2) };
  const second = dx >= dy
    ? { x: mid.x, y: target.y }
    : { x: target.x, y: mid.y };
  return pointsToSvgPath([source, mid, second, target]);
};

export const computeBezierPath = (source: RenderPoint, target: RenderPoint): string => {
  const dx = Math.max(40, Math.abs(target.x - source.x) * 0.5);
  const c1 = { x: round(source.x + dx), y: source.y };
  const c2 = { x: round(target.x - dx), y: target.y };
  return `M ${source.x} ${source.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`;
};

const parsePathPoints = (path: unknown): RenderPoint[] => {
  if (typeof path !== 'string' || path.length > 100_000) return [];
  const tokens = [...path.matchAll(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)].map(match => match[0]);
  const points: RenderPoint[] = [];
  let index = 0;
  let command = '';
  let current: RenderPoint = { x: 0, y: 0 };
  const isCommand = (token: string) => /^[a-zA-Z]$/.test(token);
  const nextNumber = () => Number(tokens[index++]);
  const push = (x: number, y: number, relative: boolean) => {
    const candidate = { x: relative ? current.x + x : x, y: relative ? current.y + y : y };
    const safe = normalizeRenderPoint(candidate);
    if (safe) {
      current = safe;
      points.push(safe);
    }
  };

  while (index < tokens.length) {
    if (isCommand(tokens[index])) command = tokens[index++];
    if (!command) break;
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper === 'M' || upper === 'L') {
      while (index + 1 < tokens.length && !isCommand(tokens[index])) push(nextNumber(), nextNumber(), relative);
      if (upper === 'M') command = relative ? 'l' : 'L';
    } else if (upper === 'H') {
      while (index < tokens.length && !isCommand(tokens[index])) push(nextNumber(), current.y, relative);
    } else if (upper === 'V') {
      while (index < tokens.length && !isCommand(tokens[index])) push(current.x, nextNumber(), relative);
    } else if (upper === 'C') {
      while (index + 5 < tokens.length && !isCommand(tokens[index])) {
        nextNumber(); nextNumber(); nextNumber(); nextNumber();
        push(nextNumber(), nextNumber(), relative);
      }
    } else if (upper === 'Q') {
      while (index + 3 < tokens.length && !isCommand(tokens[index])) {
        nextNumber(); nextNumber();
        push(nextNumber(), nextNumber(), relative);
      }
    } else if (upper === 'A') {
      while (index + 6 < tokens.length && !isCommand(tokens[index])) {
        nextNumber(); nextNumber(); nextNumber(); nextNumber(); nextNumber();
        push(nextNumber(), nextNumber(), relative);
      }
    } else {
      while (index < tokens.length && !isCommand(tokens[index])) index++;
    }
  }
  return points;
};

export const getPathEndpoints = (path: unknown): { source: RenderPoint; target: RenderPoint } | null => {
  const points = parsePathPoints(path);
  if (points.length < 2) return null;
  return { source: points[0], target: points[points.length - 1] };
};

const markerKindFromUnknown = (marker: unknown): RenderEdgeMarker['kind'] => {
  if (!marker) return 'none';
  if (typeof marker === 'string') {
    const lower = marker.toLowerCase();
    if (lower.includes('open')) return 'openArrow';
    if (lower.includes('diamond')) return 'diamond';
    if (lower.includes('circle')) return 'circle';
    if (lower.includes('arrow')) return 'arrow';
    return 'none';
  }
  if (typeof marker !== 'object' || Array.isArray(marker)) return 'none';
  const value = marker as Record<string, unknown>;
  const raw = String(value.type ?? value.kind ?? '').toLowerCase();
  if (raw.includes('open')) return 'openArrow';
  if (raw.includes('diamond')) return 'diamond';
  if (raw.includes('circle')) return 'circle';
  if (raw.includes('arrow')) return 'arrow';
  return 'none';
};

export const resolveEdgeMarker = (marker: unknown, stroke = DEFAULT_STROKE): RenderEdgeMarker => ({
  kind: markerKindFromUnknown(marker),
  color: normalizeSvgPaint(
    marker && typeof marker === 'object' && !Array.isArray(marker)
      ? (marker as Record<string, unknown>).color
      : undefined,
    normalizeSvgPaint(stroke, DEFAULT_STROKE),
  ),
});

const normalizeHandle = (value: unknown): RenderHandlePosition => {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'top' || raw === 't') return 'top';
  if (raw === 'right' || raw === 'r') return 'right';
  if (raw === 'bottom' || raw === 'b') return 'bottom';
  if (raw === 'left' || raw === 'l') return 'left';
  return 'unknown';
};

const normalizePosition = (value: Position | undefined): RenderHandlePosition => normalizeHandle(value);

export const createRenderEdgeGeometryFromEdgeProps = (
  props: EdgeProps,
  path: string,
  points?: readonly RenderPoint[] | null,
): RenderEdgeGeometry => {
  const style = (props.style ?? {}) as Record<string, unknown>;
  const stroke = normalizeSvgPaint(style.stroke, DEFAULT_STROKE);
  const source = normalizeRenderPoint({ x: props.sourceX, y: props.sourceY }) ?? { x: 0, y: 0 };
  const target = normalizeRenderPoint({ x: props.targetX, y: props.targetY }) ?? { x: 0, y: 0 };
  const pathPoints = points?.map(normalizeRenderPoint).filter((point): point is RenderPoint => !!point);
  const resolvedPath = path && getPathEndpoints(path) ? path : pointsToSvgPath(pathPoints?.length ? pathPoints : [source, target]);
  const edgeData = props.data as Record<string, unknown> | undefined;
  const label = props.label ?? edgeData?.label ?? '';

  return {
    id: props.id,
    sourceId: props.source,
    targetId: props.target,
    sourceHandle: normalizeHandle(props.sourceHandleId) === 'unknown' ? normalizePosition(props.sourcePosition) : normalizeHandle(props.sourceHandleId),
    targetHandle: normalizeHandle(props.targetHandleId) === 'unknown' ? normalizePosition(props.targetPosition) : normalizeHandle(props.targetHandleId),
    points: pathPoints?.length ? pathPoints : parsePathPoints(resolvedPath),
    path: resolvedPath,
    label: label === null || typeof label === 'undefined' ? '' : String(label),
    stroke,
    strokeWidth: coerceRenderNumber(style.strokeWidth, 1.5, 0.5, 24),
    strokeDasharray: normalizeSvgStrokeDasharray(style.strokeDasharray),
    opacity: coerceRenderNumber(style.opacity, 1, 0, 1),
    markerStart: resolveEdgeMarker(props.markerStart, stroke),
    markerEnd: resolveEdgeMarker(props.markerEnd, stroke),
    zIndex: coerceRenderNumber((props as typeof props & { zIndex?: unknown }).zIndex, 0, -10_000, 10_000),
  };
};
