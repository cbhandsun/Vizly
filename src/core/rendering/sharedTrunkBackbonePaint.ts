import type { Edge } from '@xyflow/react';

export type SharedTrunkBackbonePaintToken = 'semantic' | 'mixed-neutral';

export interface SharedTrunkBackbonePaint {
  token: SharedTrunkBackbonePaintToken;
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
  opacity: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  strokeLinejoin: 'bevel' | 'miter' | 'round';
}

export interface SharedTrunkCanonicalOwnerPriority {
  strokeWidth: number;
  solidStroke: number;
  opacity: number;
}

const SAFE_CSS_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9+.,%\-\s]+\)|[a-z]{3,32})$/iu;
const SAFE_DASH_ARRAY = /^(?:\d+(?:\.\d+)?)(?:[\s,]+\d+(?:\.\d+)?)*$/u;

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const finiteNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

export const MIXED_SEMANTIC_SHARED_TRUNK_PAINT: Readonly<SharedTrunkBackbonePaint> = Object.freeze({
  token: 'mixed-neutral',
  stroke: '#64748B',
  strokeWidth: 3,
  strokeDasharray: '',
  opacity: 0.92,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

const normalizeSafeColor = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 96 || !SAFE_CSS_COLOR.test(trimmed)) return null;
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : trimmed.toLowerCase();
};

const normalizeSafeDashArray = (value: unknown): string | null => {
  const normalizedString = typeof value === 'string' ? value.trim().toLowerCase() : value;
  if (
    normalizedString === undefined
    || normalizedString === null
    || normalizedString === ''
    || normalizedString === 'none'
    || normalizedString === 0
  ) {
    return '';
  }
  const candidate = typeof normalizedString === 'number' && Number.isFinite(normalizedString)
    ? String(normalizedString)
    : typeof normalizedString === 'string' ? normalizedString : '';
  if (candidate.length === 0 || candidate.length > 64 || !SAFE_DASH_ARRAY.test(candidate)) return null;
  const values = candidate.split(/[\s,]+/u).map(Number);
  if (values.some(item => !Number.isFinite(item) || item < 0 || item > 1_000)) return null;
  return values.join(' ');
};

const normalizeLineCap = (value: unknown): SharedTrunkBackbonePaint['strokeLinecap'] => (
  value === 'butt' || value === 'square' || value === 'round' ? value : 'round'
);

const normalizeLineJoin = (value: unknown): SharedTrunkBackbonePaint['strokeLinejoin'] => (
  value === 'bevel' || value === 'miter' || value === 'round' ? value : 'round'
);

const semanticBackbonePaint = (edge: Edge): SharedTrunkBackbonePaint | null => {
  const style = asRecord(edge.style);
  const data = asRecord(edge.data);
  const stroke = normalizeSafeColor(style.stroke ?? data.stroke);
  const strokeDasharray = normalizeSafeDashArray(style.strokeDasharray ?? data.strokeDasharray);
  if (!stroke || strokeDasharray === null) return null;
  const rawWidth = finiteNumber(style.strokeWidth) ?? finiteNumber(data.strokeWidth) ?? 2;
  const rawOpacity = finiteNumber(style.opacity) ?? finiteNumber(data.opacity) ?? 1;
  return {
    token: 'semantic',
    stroke,
    strokeWidth: Math.max(0.5, Math.min(16, rawWidth)),
    strokeDasharray,
    opacity: Math.max(0, Math.min(1, rawOpacity)),
    strokeLinecap: normalizeLineCap(style.strokeLinecap ?? data.strokeLinecap),
    strokeLinejoin: normalizeLineJoin(style.strokeLinejoin ?? data.strokeLinejoin),
  };
};

export const sharedTrunkBackbonePaintSignature = (paint: SharedTrunkBackbonePaint): string => (
  [
    paint.token,
    paint.stroke,
    paint.strokeWidth,
    paint.strokeDasharray,
    paint.opacity,
    paint.strokeLinecap,
    paint.strokeLinejoin,
  ].join('\u0000')
);

export const resolveSharedTrunkCanonicalPaint = (edges: readonly Edge[]): SharedTrunkBackbonePaint => {
  const paints = edges.map(semanticBackbonePaint);
  const first = paints[0];
  if (
    first
    && paints.every(paint => (
      paint && sharedTrunkBackbonePaintSignature(paint) === sharedTrunkBackbonePaintSignature(first)
    ))
  ) {
    return { ...first };
  }
  return { ...MIXED_SEMANTIC_SHARED_TRUNK_PAINT };
};

export const readSharedTrunkBackbonePaint = (value: unknown): SharedTrunkBackbonePaint | null => {
  const paint = asRecord(value);
  if (paint.token === 'mixed-neutral') return { ...MIXED_SEMANTIC_SHARED_TRUNK_PAINT };
  if (paint.token !== 'semantic') return null;
  const stroke = normalizeSafeColor(paint.stroke);
  const strokeWidth = finiteNumber(paint.strokeWidth);
  const strokeDasharray = normalizeSafeDashArray(paint.strokeDasharray);
  const opacity = finiteNumber(paint.opacity);
  if (
    !stroke
    || strokeWidth === undefined || strokeWidth < 0.5 || strokeWidth > 16
    || strokeDasharray === null
    || opacity === undefined || opacity < 0 || opacity > 1
  ) {
    return null;
  }
  return {
    token: 'semantic',
    stroke,
    strokeWidth,
    strokeDasharray,
    opacity,
    strokeLinecap: normalizeLineCap(paint.strokeLinecap),
    strokeLinejoin: normalizeLineJoin(paint.strokeLinejoin),
  };
};

export const readSharedTrunkCanonicalOwnerPriority = (
  edge: Edge,
): SharedTrunkCanonicalOwnerPriority => {
  const style = asRecord(edge.style);
  const data = asRecord(edge.data);
  const rawWidth = finiteNumber(style.strokeWidth) ?? finiteNumber(data.strokeWidth) ?? 1;
  const rawOpacity = finiteNumber(style.opacity) ?? finiteNumber(data.opacity) ?? 1;
  const dashValue = style.strokeDasharray ?? data.strokeDasharray;
  const normalizedDash = typeof dashValue === 'string' ? dashValue.trim().toLowerCase() : dashValue;
  const solidStroke = normalizedDash === undefined
    || normalizedDash === null
    || normalizedDash === ''
    || normalizedDash === 'none'
    || normalizedDash === 0;
  return {
    strokeWidth: Math.max(0, Math.min(64, rawWidth)),
    solidStroke: solidStroke ? 1 : 0,
    opacity: Math.max(0, Math.min(1, rawOpacity)),
  };
};
