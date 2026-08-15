import type { Edge, EdgeMarker } from '@xyflow/react';

import { isSafeCssColor } from '../../themes/themeImportSecurity';

export const BASE_REACT_FLOW_EDGE_STROKE = '#64748B';
export const BASE_REACT_FLOW_MARKER_SIZE = 20;

export type BaseReactFlowEdgeSemanticRole =
  | 'main'
  | 'data'
  | 'dependency'
  | 'support'
  | 'status';

const SEMANTIC_ROLE_CLASS_PREFIX = 'vizly-edge-role-';
const SEMANTIC_ROLES = new Set<BaseReactFlowEdgeSemanticRole>([
  'main',
  'data',
  'dependency',
  'support',
  'status',
]);
const SEMANTIC_PRESENTATION = {
  main: { stroke: '#475569', strokeWidth: 1.75, strokeDasharray: 'none' },
  data: { stroke: '#0E7490', strokeWidth: 1.5, strokeDasharray: '6 4' },
  dependency: { stroke: '#64748B', strokeWidth: 1.5, strokeDasharray: '3 4' },
  support: { stroke: '#64748B', strokeWidth: 1.5, strokeDasharray: '2 4' },
  status: { stroke: '#B45309', strokeWidth: 1.75, strokeDasharray: '7 4' },
} as const satisfies Record<BaseReactFlowEdgeSemanticRole, {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
}>;

const BUILT_IN_MARKER_TYPES = new Set(['arrow', 'arrowclosed']);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const isBuiltInEdgeMarker = (value: unknown): value is EdgeMarker => (
  isRecord(value) && BUILT_IN_MARKER_TYPES.has(String(value.type))
);

const readSafeColor = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim();
  return isSafeCssColor(candidate) ? candidate : undefined;
};

const readMarkerSize = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) && value >= 4 && value <= 64
    ? value
    : undefined
);

const readStrokeWidth = (value: unknown): number | string | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0.5 && value <= 12 ? value : undefined;
  }
  if (typeof value !== 'string' || value.length > 16) return undefined;
  const candidate = value.trim();
  const match = candidate.match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) return undefined;
  const width = Number.parseFloat(match[1]);
  return width >= 0.5 && width <= 12 ? candidate : undefined;
};

const readStrokeDasharray = (value: unknown): number | string | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 64 ? value : undefined;
  }
  if (typeof value !== 'string' || value.length > 48) return undefined;
  const candidate = value.trim();
  return candidate === 'none' || /^(?:\d+(?:\.\d+)?)(?:[ ,]+\d+(?:\.\d+)?){0,7}$/.test(candidate)
    ? candidate
    : undefined;
};

export const readBaseReactFlowEdgeSemanticRole = (
  value: unknown,
): BaseReactFlowEdgeSemanticRole | undefined => {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim().toLowerCase();
  return SEMANTIC_ROLES.has(candidate as BaseReactFlowEdgeSemanticRole)
    ? candidate as BaseReactFlowEdgeSemanticRole
    : undefined;
};

export const appendBaseReactFlowEdgeSemanticClassName = (
  className: unknown,
  roleValue: unknown,
): string | undefined => {
  const role = readBaseReactFlowEdgeSemanticRole(roleValue);
  const safeClassName = typeof className === 'string' && className.length <= 512
    ? className.trim()
    : '';
  if (!role) return safeClassName || undefined;
  const roleClassName = `${SEMANTIC_ROLE_CLASS_PREFIX}${role}`;
  const classNames = safeClassName.split(/\s+/).filter(Boolean);
  return classNames.includes(roleClassName)
    ? safeClassName
    : [...classNames, roleClassName].join(' ');
};

const readSemanticRoleFromClassName = (
  className: unknown,
): BaseReactFlowEdgeSemanticRole | undefined => {
  if (typeof className !== 'string' || className.length > 512) return undefined;
  for (const candidate of className.split(/\s+/)) {
    if (!candidate.startsWith(SEMANTIC_ROLE_CLASS_PREFIX)) continue;
    const role = readBaseReactFlowEdgeSemanticRole(candidate.slice(SEMANTIC_ROLE_CLASS_PREFIX.length));
    if (role) return role;
  }
  return undefined;
};

const resolveSemanticRole = (
  edge: Edge,
  sourceEdge?: Edge,
): BaseReactFlowEdgeSemanticRole | undefined => (
  readSemanticRoleFromClassName(sourceEdge?.className)
  ?? readSemanticRoleFromClassName(edge.className)
  ?? readBaseReactFlowEdgeSemanticRole(sourceEdge?.type)
  ?? readBaseReactFlowEdgeSemanticRole(edge.type)
  ?? (sourceEdge?.type === 'advanced-smart-step' ? 'main' : undefined)
);

const resolveSemanticStyle = (
  edge: Edge,
  sourceEdge: Edge | undefined,
  role: BaseReactFlowEdgeSemanticRole | undefined,
): Edge['style'] => {
  const currentStyle = edge.style;
  const authoredStyle = sourceEdge ? sourceEdge.style : currentStyle;
  const safeStroke = readSafeColor(authoredStyle?.stroke);
  const unsafeStroke = typeof authoredStyle?.stroke === 'string' && !safeStroke;
  const presentation = role ? SEMANTIC_PRESENTATION[role] : undefined;
  if (!presentation && !unsafeStroke) return currentStyle;

  const stroke = safeStroke ?? presentation?.stroke ?? BASE_REACT_FLOW_EDGE_STROKE;
  const strokeWidth = readStrokeWidth(authoredStyle?.strokeWidth)
    ?? presentation?.strokeWidth
    ?? 1.5;
  const strokeDasharray = readStrokeDasharray(authoredStyle?.strokeDasharray)
    ?? presentation?.strokeDasharray;
  if (
    currentStyle?.stroke === stroke
    && currentStyle.strokeWidth === strokeWidth
    && (strokeDasharray === undefined || currentStyle.strokeDasharray === strokeDasharray)
  ) return currentStyle;

  return {
    ...currentStyle,
    stroke,
    strokeWidth,
    ...(strokeDasharray !== undefined ? { strokeDasharray } : {}),
  };
};

const resolveSemanticStroke = (edge: Edge): string => (
  readSafeColor(edge.style?.stroke) ?? BASE_REACT_FLOW_EDGE_STROKE
);

const resolveBuiltInMarker = (
  value: unknown,
  semanticStroke: string,
  preferSemanticStroke = false,
): EdgeMarker | undefined => {
  if (!isBuiltInEdgeMarker(value)) return undefined;

  const color = preferSemanticStroke
    ? semanticStroke
    : readSafeColor(value.color) ?? semanticStroke;
  const width = readMarkerSize(value.width) ?? BASE_REACT_FLOW_MARKER_SIZE;
  const height = readMarkerSize(value.height) ?? BASE_REACT_FLOW_MARKER_SIZE;
  if (value.color === color && value.width === width && value.height === height) {
    return value;
  }

  return {
    ...value,
    type: value.type,
    color,
    width,
    height,
  };
};

/**
 * Completes the visual contract that React Flow cannot infer from an edge style.
 * In particular, its default marker otherwise keeps the library gray instead of
 * following the semantic stroke. Authored marker URLs, explicit marker removal,
 * safe colors, and bounded custom sizes remain untouched.
 */
export const applyBaseReactFlowEdgePresentation = (
  edges: readonly Edge[],
  sourceEdges: readonly Edge[] = edges,
): Edge[] => {
  const sourceEdgeById = new Map(sourceEdges.map(edge => [edge.id, edge]));
  return edges.map(edge => {
    const sourceEdge = sourceEdgeById.get(edge.id);
    const semanticRole = resolveSemanticRole(edge, sourceEdge);
    const style = resolveSemanticStyle(edge, sourceEdge, semanticRole);
    const className = appendBaseReactFlowEdgeSemanticClassName(edge.className, semanticRole);
    const semanticStroke = readSafeColor(style?.stroke) ?? resolveSemanticStroke(edge);
    const hasExplicitMarkerEnd = Object.prototype.hasOwnProperty.call(edge, 'markerEnd');
    const sourceMarkerEnd = sourceEdge?.markerEnd;
    const preferSemanticEndMarker = Boolean(
      sourceEdge
      && typeof sourceMarkerEnd !== 'string'
      && (!isBuiltInEdgeMarker(sourceMarkerEnd) || !readSafeColor(sourceMarkerEnd.color)),
    );
    const sourceMarkerStart = sourceEdge?.markerStart;
    const preferSemanticStartMarker = Boolean(
      sourceEdge
      && typeof sourceMarkerStart !== 'string'
      && (!isBuiltInEdgeMarker(sourceMarkerStart) || !readSafeColor(sourceMarkerStart.color)),
    );

    if (typeof edge.markerEnd === 'string' || (hasExplicitMarkerEnd && edge.markerEnd === undefined)) {
      if (style === edge.style && className === edge.className) return edge;
      return { ...edge, style, className };
    }

    const markerEnd = resolveBuiltInMarker(
      edge.markerEnd,
      semanticStroke,
      preferSemanticEndMarker,
    ) ?? {
      type: 'arrowclosed',
      color: semanticStroke,
      width: BASE_REACT_FLOW_MARKER_SIZE,
      height: BASE_REACT_FLOW_MARKER_SIZE,
    } satisfies EdgeMarker;

    const markerStart = resolveBuiltInMarker(
      edge.markerStart,
      semanticStroke,
      preferSemanticStartMarker,
    );
    const markerEndUnchanged = edge.markerEnd === markerEnd;
    const markerStartUnchanged = markerStart === undefined || edge.markerStart === markerStart;
    if (
      markerEndUnchanged
      && markerStartUnchanged
      && style === edge.style
      && className === edge.className
    ) return edge;

    return {
      ...edge,
      style,
      className,
      markerEnd,
      ...(markerStart ? { markerStart } : {}),
    };
  });
};
