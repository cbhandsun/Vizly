import { QuadTree, type SpatialIndex } from '../../algorithms/SpatialIndex';
import { getNodePosition } from '../../algorithms/smartEdgeUtils';
import type {
  PathFindingJob,
  PathFindingResult,
  Point,
  Rectangle,
  SharedGraphContext,
} from '../../types/routing';
import { Position } from '../../types/routing';
import type { ObstacleAnalyzer } from '../preprocessing/ObstacleAnalyzer';

export interface WorkerGraphNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  position?: { x: number; y: number };
  positionAbsolute?: { x: number; y: number };
  computed?: { positionAbsolute?: { x: number; y: number } };
  [key: string]: unknown;
}

export interface WorkerGraphEdge {
  id: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

export interface ResolvedWorkerRoutingContext {
  nodes: WorkerGraphNode[];
  nodeMap: Map<string, WorkerGraphNode>;
  edgeMap: Map<string, WorkerGraphEdge>;
  sourceNode: WorkerGraphNode;
  targetNode: WorkerGraphNode;
  sourceRect: Rectangle;
  targetRect: Rectangle;
  allObstacles: Rectangle[];
  routingObstacles: Rectangle[];
  clearanceRects: Rectangle[];
  containerBorders: Rectangle[];
  spatialIndex?: SpatialIndex;
}

export type WorkerRoutingContextResolution =
  | { ok: true; value: ResolvedWorkerRoutingContext }
  | { ok: false; error: string };

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const coordinate = (value: unknown): number => finiteNumber(value) ? value : 0;

const positiveDimension = (value: unknown, fallback: number): number =>
  finiteNumber(value) && value > 0 ? value : fallback;

const endpointKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizePoint = (value: unknown): { x: number; y: number } | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { x?: unknown; y?: unknown };
  return { x: coordinate(candidate.x), y: coordinate(candidate.y) };
};

const parseNode = (value: unknown): WorkerGraphNode | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as WorkerGraphNode;
  const id = endpointKey(candidate.id);
  if (!id) return undefined;
  const position = normalizePoint(candidate.position);
  const positionAbsolute = normalizePoint(candidate.positionAbsolute);
  const computedPosition = normalizePoint(candidate.computed?.positionAbsolute);
  return {
    ...candidate,
    id,
    ...(position ? { position } : {}),
    ...(positionAbsolute ? { positionAbsolute } : {}),
    ...(computedPosition
      ? { computed: { ...candidate.computed, positionAbsolute: computedPosition } }
      : {}),
  };
};

const parseEdge = (value: unknown): WorkerGraphEdge | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as WorkerGraphEdge;
  const id = endpointKey(candidate.id);
  const source = endpointKey(candidate.source);
  const target = endpointKey(candidate.target);
  return id && source && target
    ? { ...candidate, id, source, target }
    : undefined;
};

const parseRectangle = (value: unknown): Rectangle | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Rectangle;
  if (
    !finiteNumber(candidate.x)
    || !finiteNumber(candidate.y)
    || !finiteNumber(candidate.width)
    || !finiteNumber(candidate.height)
    || candidate.width < 0
    || candidate.height < 0
  ) return undefined;
  return { ...candidate };
};

const sameRectangle = (left: Rectangle, right: Rectangle): boolean =>
  Math.abs(left.x - right.x) < 1
  && Math.abs(left.y - right.y) < 1
  && Math.abs(left.width - right.width) < 1
  && Math.abs(left.height - right.height) < 1;

const nodeRectangle = (node: WorkerGraphNode): Rectangle => {
  const position = getNodePosition(node);
  return {
    x: coordinate(position?.x),
    y: coordinate(position?.y),
    width: positiveDimension(node.measured?.width, 150),
    height: positiveDimension(node.measured?.height, 80),
  };
};

export const resolveWorkerRoutingContext = (
  job: PathFindingJob,
  graph: SharedGraphContext,
  analyzer: ObstacleAnalyzer,
  prebuiltSpatialIndex?: SpatialIndex,
): WorkerRoutingContextResolution => {
  const nodeMap = new Map<string, WorkerGraphNode>();
  for (const rawNode of Array.isArray(graph.nodes) ? graph.nodes : []) {
    const node = parseNode(rawNode);
    if (node && !nodeMap.has(node.id)) nodeMap.set(node.id, node);
  }
  const nodes = [...nodeMap.values()];
  const edgeMap = new Map<string, WorkerGraphEdge>();
  for (const rawEdge of Array.isArray(graph.edges) ? graph.edges : []) {
    const edge = parseEdge(rawEdge);
    if (edge && !edgeMap.has(edge.id)) edgeMap.set(edge.id, edge);
  }
  const sourceId = endpointKey(job.source);
  const targetId = endpointKey(job.target);
  const sourceNode = nodeMap.get(sourceId);
  const targetNode = nodeMap.get(targetId);
  if (!sourceNode || !targetNode) {
    return { ok: false, error: 'Source or Target node not found' };
  }

  const sourceRect = nodeRectangle(sourceNode);
  const targetRect = nodeRectangle(targetNode);
  const allObstacles = (Array.isArray(graph.obstacles) ? graph.obstacles : [])
    .map(parseRectangle)
    .filter((rectangle): rectangle is Rectangle => !!rectangle);
  const routingObstacles = allObstacles.filter(rawRectangle => {
    const rectangle = rawRectangle as Rectangle & { id?: unknown };
    const obstacleId = endpointKey(rectangle.id);
    if (obstacleId === sourceId || obstacleId === targetId) return false;
    return !sameRectangle(rectangle, sourceRect)
      && !sameRectangle(rectangle, targetRect);
  });
  const containerBorders = (
    Array.isArray(graph.containerBounds) ? graph.containerBounds : []
  ).map(parseRectangle).filter((rectangle): rectangle is Rectangle => !!rectangle);

  let spatialIndex = prebuiltSpatialIndex;
  if (!spatialIndex && allObstacles.length > 20) {
    const bounds = analyzer.getBounds(allObstacles);
    const padding = 2000;
    spatialIndex = new QuadTree({
      x: bounds.minX - padding,
      y: bounds.minY - padding,
      width: bounds.maxX - bounds.minX + padding * 2,
      height: bounds.maxY - bounds.minY + padding * 2,
    });
    allObstacles.forEach(obstacle => spatialIndex?.insert(obstacle));
  }

  return {
    ok: true,
    value: {
      nodes,
      nodeMap,
      edgeMap,
      sourceNode,
      targetNode,
      sourceRect,
      targetRect,
      allObstacles,
      routingObstacles,
      clearanceRects: [sourceRect, targetRect],
      containerBorders,
      spatialIndex,
    },
  };
};

export const createSelfLoopRoutingResult = (
  job: PathFindingJob,
  rectangle: Rectangle,
): PathFindingResult => {
  const loopWidth = 40;
  const loopHeight = 30;
  const offset = 8;
  const rightX = rectangle.x + rectangle.width;
  const centerY = rectangle.y + rectangle.height / 2;
  const points: Point[] = [
    { x: rightX, y: centerY },
    { x: rightX + offset, y: centerY },
    { x: rightX + loopWidth, y: centerY - loopHeight / 2 },
    { x: rightX + loopWidth, y: centerY + loopHeight / 2 },
    { x: rightX + offset, y: centerY },
    { x: rightX, y: centerY },
  ];
  return {
    jobId: job.jobId,
    edgeId: job.edgeId,
    path: `M ${points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' L ')}`,
    points,
    labelX: rightX + loopWidth + 4,
    labelY: centerY,
    sourcePos: Position.Right,
    targetPos: Position.Right,
    usedSourcePos: Position.Right,
    usedTargetPos: Position.Right,
    metadata: { strategy: 'Self-Loop' },
    debugInfo: {
      algorithmDebug: {
        strategy: 'Self-Loop',
        rawPoints: points,
        visited: [],
        grid: null,
        obstacles: [],
        sourceRect: rectangle,
        targetRect: rectangle,
        portSelection: {
          selected: { source: Position.Right, target: Position.Right },
          layoutDirection: job.layoutDirection,
          detectedGeometry: 'collocated',
          hasExplicitSource: false,
          hasExplicitTarget: false,
          isManyToOne: false,
          incomingCount: 1,
          hasPrecomputedTrunk: false,
          peerGroupSize: 0,
          peerGroupKey: '',
          peerGroupMembers: [],
          trunkAxis: null,
          trunkVertical: null,
          sourceHandle: null,
          targetHandle: null,
          centers: {
            source: {
              x: rectangle.x + rectangle.width / 2,
              y: rectangle.y + rectangle.height / 2,
            },
            target: {
              x: rectangle.x + rectangle.width / 2,
              y: rectangle.y + rectangle.height / 2,
            },
            dx: 0,
            dy: 0,
          },
        },
      },
      obstacles: [],
      selectedSourcePos: Position.Right,
      selectedTargetPos: Position.Right,
    },
  };
};
