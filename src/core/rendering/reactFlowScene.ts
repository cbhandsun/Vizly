import type { Edge, Node } from '@xyflow/react';
import {
  collectLineJumpIntersections,
  injectLineJumps,
  JUMP_RADIUS,
  type IntersectionInfo,
} from '../services/LineJumpEngine';
import { coerceRenderNumber, computeBezierPath, computeOrthogonalPath, computeStraightPath, normalizeRenderPoint, pointsToSvgPath, resolveEdgeMarker } from './edgeGeometry';
import {
  applySharedTrunkPaintPlan,
  createSharedTrunkBackboneFragments,
  createSharedTrunkJunctionFragments,
  createSharedTrunkPaintFragments,
  normalizeSharedTrunkPaintPoints,
  readSharedTrunkPaintPlan,
} from './sharedTrunkPaint';
import { normalizeSvgFontWeight, normalizeSvgPaint, normalizeSvgStrokeDasharray } from './styleTokens';
import type { DiagramRenderScene, RenderBounds, RenderEdgeGeometry, RenderNodeGeometry, RenderPoint } from './types';

const MAX_LABEL_CHARS = 240;
const MAX_TABLE_COLUMNS = 24;
const MAX_COLUMN_TEXT_CHARS = 80;
const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 120;

type RenderFlowNode = Node & {
  positionAbsolute?: unknown;
  internals?: { positionAbsolute?: unknown };
  measured?: { width?: unknown; height?: unknown };
  width?: unknown;
  height?: unknown;
  label?: unknown;
  zIndex?: unknown;
};

type RenderFlowEdge = Edge & {
  markerStart?: unknown;
  markerEnd?: unknown;
  zIndex?: unknown;
};

interface GlobalReactFlowInstance {
  getNodes?: () => Node[];
  getEdges?: () => Edge[];
  getViewport?: () => { x?: unknown; y?: unknown; zoom?: unknown };
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
export interface ReactFlowRenderSnapshot {
  nodes: readonly Node[];
  edges: readonly Edge[];
  viewport?: { x?: unknown; y?: unknown; zoom?: unknown };
}

export interface BuildRenderSceneOptions {
  viewport?: { x?: unknown; y?: unknown; zoom?: unknown };
  padding?: number;
  theme?: Partial<DiagramRenderScene['theme']>;
}

const defaultTheme: DiagramRenderScene['theme'] = {
  background: '#ffffff',
  nodeFill: '#ffffff',
  nodeStroke: '#d1d5db',
  textColor: '#111827',
  edgeStroke: '#64748b',
};

const stripMarkup = (value: string): string => value
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const textFromUnknown = (value: unknown): string => {
  if (value === null || typeof value === 'undefined') return '';
  const text = stripMarkup(String(value));
  return text.length > MAX_LABEL_CHARS ? `${text.slice(0, MAX_LABEL_CHARS)}...` : text;
};

const iconTextFromUnknown = (value: unknown): string | undefined => {
  const text = textFromUnknown(value);
  if (!text) return undefined;
  return text.slice(0, 48);
};

const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = textFromUnknown(value);
    if (text) return text;
  }
  return '';
};

const normalizeStatus = (value: unknown): RenderNodeGeometry['status'] | undefined => {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'success' || raw === 'ok' || raw === 'healthy' || raw === 'normal') return raw === 'normal' ? 'normal' : 'success';
  if (raw === 'warning' || raw === 'warn') return 'warning';
  if (raw === 'error' || raw === 'danger' || raw === 'critical' || raw === 'failed') return 'error';
  return undefined;
};

const columnTextFromUnknown = (value: unknown): string => {
  const text = textFromUnknown(value);
  return text.length > MAX_COLUMN_TEXT_CHARS ? `${text.slice(0, MAX_COLUMN_TEXT_CHARS)}...` : text;
};

const normalizeTableColumns = (value: unknown): RenderNodeGeometry['tableColumns'] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const columns = value.slice(0, MAX_TABLE_COLUMNS).map(column => {
    const record = column as Record<string, unknown> | null | undefined;
    const name = columnTextFromUnknown(record?.name ?? record?.label ?? record?.field);
    const type = columnTextFromUnknown(record?.type ?? record?.dataType ?? record?.kind);
    if (!name && !type) return null;
    return {
      name: name || 'column',
      type,
      isPrimary: record?.isPrimary === true || record?.primaryKey === true || record?.key === 'PK',
      isForeign: record?.isForeign === true || record?.foreignKey === true || record?.key === 'FK',
    };
  }).filter((column): column is NonNullable<typeof column> => !!column);
  return columns.length ? columns : undefined;
};

const nodePosition = (node: Node): RenderPoint => {
  const renderNode = node as RenderFlowNode;
  const raw = renderNode.positionAbsolute ?? renderNode.internals?.positionAbsolute ?? node.position;
  return normalizeRenderPoint(raw) ?? { x: 0, y: 0 };
};

const nodeDimension = (node: Node, key: 'width' | 'height', fallback: number): number => {
  const renderNode = node as RenderFlowNode;
  const style = asRecord(node.style);
  const raw = renderNode.measured?.[key] ?? renderNode[key] ?? style[key];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0
    ? coerceRenderNumber(raw, fallback, 1, 12_000)
    : fallback;
};

const styleColor = (style: unknown, key: string, fallback: string): string => {
  const value = (style as Record<string, unknown> | undefined)?.[key];
  return normalizeSvgPaint(value, fallback);
};

const dataStyleColor = (data: Record<string, unknown> | undefined, style: unknown, key: string, fallback: string): string => {
  const dataStyle = data?.style as Record<string, unknown> | undefined;
  return styleColor(style, key, styleColor(dataStyle, key, fallback));
};

const normalizeShape = (node: Node, data: Record<string, unknown> | undefined): string | undefined => {
  const raw = String(data?.shape ?? data?.nodeShape ?? node.type ?? '').toLowerCase();
  if (raw.includes('diamond') || raw.includes('decision')) return 'diamond';
  if (raw.includes('database') || raw.includes('cylinder') || raw.includes('table')) return 'database';
  if (raw.includes('ellipse') || raw.includes('circle') || raw.includes('oval')) return 'ellipse';
  if (raw.includes('note') || raw.includes('sticky')) return 'note';
  if (raw.includes('group') || raw.includes('swimlane')) return 'group';
  return undefined;
};

const isContainerType = (node: Node, data: Record<string, unknown> | undefined): boolean => {
  const raw = String(data?.shape ?? data?.nodeShape ?? node.type ?? '').toLowerCase();
  return raw.includes('group') || raw.includes('swimlane') || raw.includes('domain') || raw.includes('container');
};

const normalizeLaneDirection = (value: unknown): 'horizontal' | 'vertical' => {
  const raw = String(value ?? '').toLowerCase();
  return raw === 'horizontal' || raw === 'h' || raw === 'tb' || raw === 'bt' ? 'horizontal' : 'vertical';
};

const normalizeContainerMetadata = (
  node: Node,
  data: Record<string, unknown> | undefined,
  shape: string | undefined,
): RenderNodeGeometry['container'] | undefined => {
  const type = String(node.type ?? '').toLowerCase();
  const isSwimlane = type.includes('swimlane') || String(data?.shape ?? '').toLowerCase().includes('swimlane');
  const isLane = data?.isLane === true || type.includes('lane');
  const isContainer = shape === 'group' || isContainerType(node, data);
  if (!isContainer && !isSwimlane && !isLane) return undefined;
  const laneCount = coerceRenderNumber(data?.laneCount, 0, 0, 24);
  const childCount = coerceRenderNumber(data?.childCount ?? data?.childrenCount, 0, 0, 999);
  const dataStyle = data?.style as Record<string, unknown> | undefined;
  return {
    isContainer: true,
    isSwimlane,
    isLane,
    collapsed: data?.collapsed === true,
    childCount,
    laneCount,
    laneDirection: normalizeLaneDirection(data?.direction ?? data?.laneDirection),
    headerColor: normalizeSvgPaint(data?.themeColor ?? dataStyle?.backgroundColor ?? dataStyle?.borderColor, ''),
  };
};

const normalizeBorderRadius = (style: unknown, shape: string | undefined): number => {
  if (shape === 'ellipse' || shape === 'diamond') return 0;
  const raw = (style as Record<string, unknown> | undefined)?.borderRadius;
  if (typeof raw === 'number') return coerceRenderNumber(raw, 8, 0, 80);
  if (typeof raw === 'string') {
    const parsed = Number.parseFloat(raw);
    return coerceRenderNumber(parsed, shape === 'note' ? 4 : 8, 0, 80);
  }
  return shape === 'note' ? 4 : shape === 'group' ? 10 : 8;
};

const buildNode = (node: Node): RenderNodeGeometry | null => {
  const renderNode = node as RenderFlowNode;
  const nodeStyle = asRecord(node.style);
  if (!node?.id || node.hidden || nodeStyle.display === 'none') return null;
  const position = nodePosition(node);
  const width = nodeDimension(node, 'width', DEFAULT_WIDTH);
  const height = nodeDimension(node, 'height', DEFAULT_HEIGHT);
  const data = node.data as Record<string, unknown> | undefined;
  const shape = normalizeShape(node, data);
  const dataStyle = data?.style as Record<string, unknown> | undefined;
  const tableColumns = normalizeTableColumns(data?.columns);
  const label = firstText(data?.tableName, data?.title, data?.label, data?.description, renderNode.label, node.id);
  const subtitle = firstText(data?.subtitle, data?.caption, data?.description);
  const container = normalizeContainerMetadata(node, data, shape);
  return {
    id: String(node.id),
    x: position.x,
    y: position.y,
    width,
    height,
    hidden: false,
    zIndex: coerceRenderNumber(renderNode.zIndex, 0, -10_000, 10_000),
    label,
    subtitle: subtitle && subtitle !== label ? subtitle : undefined,
    icon: iconTextFromUnknown(data?.icon),
    status: normalizeStatus(data?.status ?? data?.state ?? data?.severity),
    type: typeof node.type === 'string' ? node.type : undefined,
    shape,
    fill: dataStyleColor(data, node.style, 'backgroundColor', styleColor(node.style, 'background', defaultTheme.nodeFill)),
    stroke: dataStyleColor(data, node.style, 'borderColor', defaultTheme.nodeStroke),
    textColor: dataStyleColor(data, node.style, 'color', defaultTheme.textColor),
    strokeDasharray: shape === 'group'
      ? (normalizeSvgStrokeDasharray(nodeStyle.strokeDasharray) || normalizeSvgStrokeDasharray(dataStyle?.strokeDasharray) || '6 4')
      : (normalizeSvgStrokeDasharray(nodeStyle.strokeDasharray) || normalizeSvgStrokeDasharray(dataStyle?.strokeDasharray)),
    borderRadius: normalizeBorderRadius(node.style ?? dataStyle, shape),
    fontSize: coerceRenderNumber(nodeStyle.fontSize ?? dataStyle?.fontSize, 13, 8, 48),
    fontWeight: normalizeSvgFontWeight(nodeStyle.fontWeight) || normalizeSvgFontWeight(dataStyle?.fontWeight),
    tableColumns,
    container,
  };
};

const portPoint = (node: RenderNodeGeometry, handle: unknown, fallback: 'source' | 'target'): RenderPoint => {
  const raw = String(handle ?? '').toLowerCase();
  const side = raw.includes('top') || raw === 't'
    ? 'top'
    : raw.includes('bottom') || raw === 'b'
      ? 'bottom'
      : raw.includes('left') || raw === 'l'
        ? 'left'
        : raw.includes('right') || raw === 'r'
          ? 'right'
          : fallback === 'source' ? 'right' : 'left';
  if (side === 'top') return { x: node.x + node.width / 2, y: node.y };
  if (side === 'bottom') return { x: node.x + node.width / 2, y: node.y + node.height };
  if (side === 'left') return { x: node.x, y: node.y + node.height / 2 };
  return { x: node.x + node.width, y: node.y + node.height / 2 };
};

const edgePointsFromData = (edge: Edge): RenderPoint[] => {
  const data = edge.data as Record<string, unknown> | undefined;
  const rawPoints = data?.computedPath ?? data?.points ?? data?.pathPoints;
  if (!Array.isArray(rawPoints)) return [];
  return rawPoints.map(normalizeRenderPoint).filter((point): point is RenderPoint => !!point);
};

/**
 * Mirrors the canvas-only shared-trunk paint plan in exported scene geometry.
 * Every member contributes only visible semantic fragments. The canonical
 * owner additionally contributes markerless backbone fragments, so canvas and
 * export preserve the same one-paint ownership model.
 */
const expandSharedTrunkRenderEdge = (
  edge: RenderEdgeGeometry,
  pointsValue: unknown,
  edgeData: unknown,
  jumps: readonly IntersectionInfo[],
): RenderEdgeGeometry[] => {
  const plan = readSharedTrunkPaintPlan(edgeData);
  if (!plan || (plan.hiddenRanges.length === 0 && plan.backboneRanges.length === 0)) return [edge];

  const normalizedPoints = normalizeSharedTrunkPaintPoints(pointsValue);
  if (!normalizedPoints) return [edge];
  const normalizedPathLength = normalizedPoints.reduce(
    (total, point, index) => index === 0
      ? total
      : total + Math.hypot(
        point.x - normalizedPoints[index - 1].x,
        point.y - normalizedPoints[index - 1].y,
      ),
    0,
  );
  const fragments = createSharedTrunkPaintFragments(pointsValue, plan);
  const backboneFragments = createSharedTrunkBackboneFragments(pointsValue, plan);
  const junctionFragments = createSharedTrunkJunctionFragments(pointsValue, plan);

  const fragmentLengths = fragments.map(fragment => fragment.points.reduce(
    (total, point, index) => index === 0
      ? total
      : total + Math.hypot(
        point.x - fragment.points[index - 1].x,
        point.y - fragment.points[index - 1].y,
      ),
    0,
  ));
  const labelFragmentIndex = fragmentLengths.length === 0
    ? -1
    : fragmentLengths.reduce(
      (bestIndex, length, index) => length > fragmentLengths[bestIndex] ? index : bestIndex,
      0,
    );
  const renderFragmentPath = (points: readonly RenderPoint[]): string => (
    injectLineJumps([...points], [...jumps], JUMP_RADIUS, 0) || pointsToSvgPath(points)
  );

  const semanticFragments: RenderEdgeGeometry[] = fragments.map((fragment, index) => ({
    ...edge,
    points: [...fragment.points],
    path: renderFragmentPath(fragment.points),
    // A label belongs to the logical edge, rather than every visible piece.
    label: index === labelFragmentIndex ? edge.label : '',
    markerStart: fragment.startsAtSource ? edge.markerStart : { kind: 'none', color: edge.stroke },
    markerEnd: fragment.endsAtTarget ? edge.markerEnd : { kind: 'none', color: edge.stroke },
  }));
  const canonicalBackbones: RenderEdgeGeometry[] = backboneFragments.map((fragment, index) => ({
    ...edge,
    id: `${edge.id}::shared-backbone:${index}`,
    points: [...fragment.points],
    path: renderFragmentPath(fragment.points),
    label: '',
    stroke: fragment.paint.stroke,
    strokeWidth: fragment.paint.strokeWidth,
    strokeDasharray: fragment.paint.strokeDasharray || undefined,
    opacity: fragment.paint.opacity,
    markerStart: { kind: 'none' as const, color: fragment.paint.stroke },
    markerEnd: { kind: 'none' as const, color: fragment.paint.stroke },
    zIndex: edge.zIndex - 0.25,
  }));
  const canonicalJunctions: RenderEdgeGeometry[] = junctionFragments.map((fragment, index) => {
    const junctionStrokeWidth = Math.max(5, fragment.paint.strokeWidth + 2);
    const points = [
      { x: fragment.point.x - 0.01, y: fragment.point.y },
      { x: fragment.point.x + 0.01, y: fragment.point.y },
    ];
    return {
      ...edge,
      id: `${edge.id}::shared-junction:${index}`,
      points,
      path: pointsToSvgPath(points),
      label: '',
      stroke: fragment.paint.stroke,
      strokeWidth: junctionStrokeWidth,
      strokeDasharray: undefined,
      opacity: 1,
      markerStart: { kind: 'none' as const, color: fragment.paint.stroke },
      markerEnd: { kind: 'none' as const, color: fragment.paint.stroke },
      zIndex: edge.zIndex - 0.125,
    };
  });

  const ownsCanonicalEndpoint = (role: 'source' | 'target'): boolean => (
    plan.backboneRanges.some(range => (
      range.role === role
      && range.ownerEdgeId === edge.id
      && (role === 'source' ? range.from <= 0.01 : range.to >= normalizedPathLength - 0.01)
    ))
  );
  const needsSourceMarkerCarrier = edge.markerStart.kind !== 'none'
    && ownsCanonicalEndpoint('source')
    && !fragments.some(fragment => fragment.startsAtSource);
  const needsTargetMarkerCarrier = edge.markerEnd.kind !== 'none'
    && ownsCanonicalEndpoint('target')
    && !fragments.some(fragment => fragment.endsAtTarget);
  const markerCarrier: RenderEdgeGeometry[] = needsSourceMarkerCarrier || needsTargetMarkerCarrier
    ? [{
      ...edge,
      id: `${edge.id}::shared-terminal-markers`,
      label: '',
      stroke: 'transparent',
      strokeDasharray: undefined,
      opacity: 1,
      markerStart: needsSourceMarkerCarrier
        ? edge.markerStart
        : { kind: 'none', color: edge.stroke },
      markerEnd: needsTargetMarkerCarrier
        ? edge.markerEnd
        : { kind: 'none', color: edge.stroke },
      zIndex: edge.zIndex + 0.25,
      markerOnly: true,
    }]
    : [];

  return [...canonicalBackbones, ...canonicalJunctions, ...semanticFragments, ...markerCarrier];
};

const buildEdge = (
  edge: Edge,
  nodesById: Map<string, RenderNodeGeometry>,
  warnings: string[],
  jumpsByEdge: ReadonlyMap<string, readonly IntersectionInfo[]>,
): RenderEdgeGeometry[] => {
  const flowEdge = edge as RenderFlowEdge;
  const source = nodesById.get(String(edge.source));
  const target = nodesById.get(String(edge.target));
  if (!source || !target) {
    warnings.push(`edge:${edge.id}:missing-endpoint`);
    return [];
  }

  const style = (edge.style ?? {}) as Record<string, unknown>;
  const stroke = styleColor(edge.style, 'stroke', defaultTheme.edgeStroke);
  const sourcePoint = portPoint(source, edge.sourceHandle, 'source');
  const targetPoint = portPoint(target, edge.targetHandle, 'target');
  const dataPoints = edgePointsFromData(edge);
  const edgeData = asRecord(edge.data);
  const pathType = String(edgeData.pathType ?? edge.type ?? '').toLowerCase();
  const undecoratedPath = dataPoints.length >= 2
    ? pointsToSvgPath(dataPoints)
    : pathType.includes('bezier')
      ? computeBezierPath(sourcePoint, targetPoint)
      : pathType.includes('step') || pathType.includes('orthogonal') || pathType.includes('smart')
        ? computeOrthogonalPath(sourcePoint, targetPoint)
        : computeStraightPath(sourcePoint, targetPoint);
  const jumps = jumpsByEdge.get(String(edge.id)) ?? [];
  const path = dataPoints.length >= 2 && jumps.length > 0
    ? injectLineJumps(dataPoints, [...jumps], JUMP_RADIUS, 0) || undecoratedPath
    : undecoratedPath;

  const geometry: RenderEdgeGeometry = {
    id: String(edge.id),
    sourceId: String(edge.source),
    targetId: String(edge.target),
    sourceHandle: 'unknown',
    targetHandle: 'unknown',
    points: dataPoints.length >= 2 ? dataPoints : [sourcePoint, targetPoint],
    path,
    label: firstText(edge.label, edgeData.label),
    stroke,
    strokeWidth: coerceRenderNumber(style.strokeWidth, 1.5, 0.5, 24),
    strokeDasharray: normalizeSvgStrokeDasharray(style.strokeDasharray),
    opacity: coerceRenderNumber(style.opacity, 1, 0, 1),
    markerStart: resolveEdgeMarker(flowEdge.markerStart, stroke),
    markerEnd: resolveEdgeMarker(flowEdge.markerEnd, stroke),
    zIndex: coerceRenderNumber(flowEdge.zIndex, 0, -10_000, 10_000),
  };
  return expandSharedTrunkRenderEdge(geometry, dataPoints, edgeData, jumps);
};

const boundsFromNodes = (nodes: RenderNodeGeometry[], padding: number): RenderBounds => {
  if (nodes.length === 0) {
    return { minX: -padding, minY: -padding, maxX: 400 + padding, maxY: 300 + padding, width: 400 + padding * 2, height: 300 + padding * 2 };
  }
  const minX = Math.min(...nodes.map(node => node.x)) - padding;
  const minY = Math.min(...nodes.map(node => node.y)) - padding;
  const maxX = Math.max(...nodes.map(node => node.x + node.width)) + padding;
  const maxY = Math.max(...nodes.map(node => node.y + node.height)) + padding;
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

export const buildRenderSceneFromReactFlow = (
  nodes: readonly Node[],
  edges: readonly Edge[],
  options: BuildRenderSceneOptions = {},
): DiagramRenderScene => {
  const warnings: string[] = [];
  const padding = coerceRenderNumber(options.padding, 40, 0, 400);
  const renderNodes = nodes.map(buildNode).filter((node): node is RenderNodeGeometry => !!node);
  const nodesById = new Map(renderNodes.map(node => [node.id, node]));
  const displayEdges = applySharedTrunkPaintPlan(edges);
  const jumpsByEdge = new Map<string, IntersectionInfo[]>();
  collectLineJumpIntersections(displayEdges.flatMap(edge => {
    const points = edgePointsFromData(edge);
    return points.length >= 2 ? [{
      edgeId: String(edge.id),
      points,
      endpointInfo: { source: String(edge.source), target: String(edge.target) },
    }] : [];
  })).forEach(jump => {
    const existing = jumpsByEdge.get(jump.horizontalEdgeId) ?? [];
    existing.push(jump);
    jumpsByEdge.set(jump.horizontalEdgeId, existing);
  });
  const renderEdges = displayEdges
    .flatMap(edge => buildEdge(edge, nodesById, warnings, jumpsByEdge));
  const bounds = boundsFromNodes(renderNodes, padding);

  const theme = {
    background: normalizeSvgPaint(options.theme?.background, defaultTheme.background),
    nodeFill: normalizeSvgPaint(options.theme?.nodeFill, defaultTheme.nodeFill),
    nodeStroke: normalizeSvgPaint(options.theme?.nodeStroke, defaultTheme.nodeStroke),
    textColor: normalizeSvgPaint(options.theme?.textColor, defaultTheme.textColor),
    edgeStroke: normalizeSvgPaint(options.theme?.edgeStroke, defaultTheme.edgeStroke),
  };

  return {
    nodes: renderNodes.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)),
    edges: renderEdges.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)),
    bounds,
    viewport: {
      x: coerceRenderNumber(options.viewport?.x, 0, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE),
      y: coerceRenderNumber(options.viewport?.y, 0, -MAX_SAFE_COORDINATE, MAX_SAFE_COORDINATE),
      zoom: coerceRenderNumber(options.viewport?.zoom, 1, 0.05, 8),
    },
    theme,
    warnings,
  };
};

const MAX_SAFE_COORDINATE = 1_000_000;

export const buildRenderSceneFromGlobalReactFlow = (options: BuildRenderSceneOptions = {}): DiagramRenderScene => {
  const globalWindow = typeof window === 'undefined'
    ? null
    : window as Window & { reactFlowInstance?: GlobalReactFlowInstance };
  const rf = globalWindow?.reactFlowInstance;
  const nodes = typeof rf?.getNodes === 'function' ? rf.getNodes() : [];
  const edges = typeof rf?.getEdges === 'function' ? rf.getEdges() : [];
  const viewport = typeof rf?.getViewport === 'function' ? rf.getViewport() : options.viewport;
  return buildRenderSceneFromReactFlow(nodes, edges, { ...options, viewport });
};

export const buildRenderSceneFromReactFlowSnapshot = (
  snapshot: ReactFlowRenderSnapshot | null | undefined,
  options: BuildRenderSceneOptions = {},
): DiagramRenderScene => buildRenderSceneFromReactFlow(
  snapshot?.nodes ?? [],
  snapshot?.edges ?? [],
  { ...options, viewport: snapshot?.viewport ?? options.viewport },
);
