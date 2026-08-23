import { getSmoothStepPath, Position, type EdgeProps } from '@xyflow/react';

import { createFilletedPath, getSmartLabelPosition } from '../../../algorithms/smartEdgeUtils';
import type { SimpleNodeData } from '../../../hooks/useNodeMap';
import { getComputedPoints, type SmartPathPoint } from './smartPathCompatibility';
import {
  smartEdgeRenderAdapterAcceptsCommittedGeometry,
  useSmartEdgeRoutingRenderAdapter,
} from '../smartEdgeRoutingRenderAdapter';
import type { SmartEdgeRoutingRenderModel } from '../smartEdgeRoutingRenderModel';

const EMPTY_OBSTACLES: SmartEdgeRoutingRenderModel['obstacles'] = [];
const EMPTY_SIMPLE_NODE_MAP = new Map<string, SimpleNodeData>();

type CanvasRoutedEdgeData = {
  computedPath?: unknown;
  labelPosition?: unknown;
  labelOffset?: unknown;
  absoluteLabelX?: unknown;
  absoluteLabelY?: unknown;
  borderRadius?: unknown;
  edgeConfig?: unknown;
  isTreeBus?: unknown;
  treeRouting?: unknown;
  _draggingNodeIds?: unknown;
};

const finiteNumber = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

const pointRecord = (value: unknown): { x: number; y: number } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const x = finiteNumber(candidate.x);
  const y = finiteNumber(candidate.y);
  return x === null || y === null ? null : { x, y };
};

const readCanvasComputedPoints = (data: CanvasRoutedEdgeData): SmartPathPoint[] | null => {
  const direct = getComputedPoints(data.computedPath);
  if (direct) return direct;
  if (!data.treeRouting || typeof data.treeRouting !== 'object' || Array.isArray(data.treeRouting)) {
    return null;
  }
  return getComputedPoints((data.treeRouting as Record<string, unknown>).points);
};

const isEndpointDragging = (
  value: unknown,
  source: string,
  target: string,
): boolean => (
  Array.isArray(value)
  && value.some(id => typeof id === 'string' && (id === source || id === target))
);

const pointsMatchCurrentEndpoints = (
  points: readonly SmartPathPoint[],
  props: EdgeProps,
): boolean => {
  const tolerance = 48;
  const first = points[0];
  const last = points[points.length - 1];
  return (
    Math.abs(first.x - props.sourceX) <= tolerance
    && Math.abs(first.y - props.sourceY) <= tolerance
    && Math.abs(last.x - props.targetX) <= tolerance
    && Math.abs(last.y - props.targetY) <= tolerance
  );
};

const resolveCanvasCornerRadius = (data: CanvasRoutedEdgeData): number => {
  const edgeConfig = data.edgeConfig && typeof data.edgeConfig === 'object' && !Array.isArray(data.edgeConfig)
    ? data.edgeConfig as Record<string, unknown>
    : {};
  if (edgeConfig.strictOrthogonal !== false) return 0;
  const raw = finiteNumber(data.borderRadius) ?? finiteNumber(edgeConfig.borderRadius) ?? 8;
  return Math.max(0, Math.min(24, raw));
};

export type CanvasRoutedEdgeModel = {
  path: string;
  points: SmartPathPoint[] | null;
  labelX: number;
  labelY: number;
  nodesDragging: boolean;
};

/**
 * Parses the bounded canvas-worker result into render-only edge geometry.
 * Malformed or stale data falls back to React Flow's lightweight smooth step.
 */
export const createCanvasRoutedEdgeModel = (
  props: EdgeProps,
  acceptsCommittedGeometry = false,
): CanvasRoutedEdgeModel => {
  const data = (props.data ?? {}) as CanvasRoutedEdgeData;
  const nodesDragging = isEndpointDragging(data._draggingNodeIds, props.source, props.target);
  const [fallbackPath, fallbackLabelX, fallbackLabelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition ?? Position.Right,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition ?? Position.Left,
    borderRadius: resolveCanvasCornerRadius(data),
  });
  const candidatePoints = nodesDragging || !acceptsCommittedGeometry
    ? null
    : readCanvasComputedPoints(data);
  const points = candidatePoints && pointsMatchCurrentEndpoints(candidatePoints, props)
    ? candidatePoints
    : null;
  const path = points
    ? createFilletedPath(points, resolveCanvasCornerRadius(data))
    : fallbackPath;
  const computedLabel = points ? getSmartLabelPosition(points) : null;
  const labelPosition = pointRecord(data.labelPosition);
  const labelOffset = pointRecord(data.labelOffset) ?? { x: 0, y: 0 };
  const absoluteLabelX = finiteNumber(data.absoluteLabelX);
  const absoluteLabelY = finiteNumber(data.absoluteLabelY);
  const baseLabelX = absoluteLabelX ?? labelPosition?.x ?? computedLabel?.x ?? fallbackLabelX;
  const baseLabelY = absoluteLabelY ?? labelPosition?.y ?? computedLabel?.y ?? fallbackLabelY;

  return {
    path,
    points,
    labelX: baseLabelX + labelOffset.x,
    labelY: baseLabelY + labelOffset.y,
    nodesDragging,
  };
};

/**
 * Canvas-owned edges consume worker output without subscribing to the graph,
 * obstacle, coordinator, or line-jump stores.
 */
export const useCanvasRoutedEdge = (props: EdgeProps): SmartEdgeRoutingRenderModel => {
  const renderAdapter = useSmartEdgeRoutingRenderAdapter();
  const model = createCanvasRoutedEdgeModel(
    props,
    smartEdgeRenderAdapterAcceptsCommittedGeometry(renderAdapter),
  );
  const data = (props.data ?? {}) as CanvasRoutedEdgeData;

  return {
    safeFinalPath: model.path,
    finalLabelX: model.labelX,
    finalLabelY: model.labelY,
    crossfadeOpacity: 1,
    opacity: 1,
    isLoading: model.points === null,
    nodesDragging: model.nodesDragging,
    shouldRenderDebugVisuals: false,
    shouldRenderPortHeatmap: false,
    isStale: false,
    workerSmartPoints: model.points,
    obstacles: EMPTY_OBSTACLES,
    isBusEdge: data.isTreeBus === true || Boolean(data.treeRouting),
    centeredCoords: {
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      targetX: props.targetX,
      targetY: props.targetY,
    },
    workerSmartLabelPos: { x: model.labelX, y: model.labelY },
    simpleNodeMap: EMPTY_SIMPLE_NODE_MAP,
  };
};
