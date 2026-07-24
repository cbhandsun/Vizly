import type { Rectangle } from '../algorithms/pathfinding';
import type {
  PathFindingJob,
  SharedGraphContext,
} from '../types/routing';
import { inferRoutingPortSide } from './edgeRoutingPortSeparation';

export interface RoutingTopologyEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
}

export interface HubPortGroupInfo {
  tangent: number;
  jobs: PathFindingJob[];
}

export interface PreparedBusRoutingContext {
  allEdges: RoutingTopologyEdge[];
  outgoingByNode: Map<string, RoutingTopologyEdge[]>;
  incomingByNode: Map<string, RoutingTopologyEdge[]>;
  sourceGroups: Map<string, PathFindingJob[]>;
  targetGroups: Map<string, PathFindingJob[]>;
  getNodeRect: (id: string) => Rectangle | undefined;
  trunkObstacles: Rectangle[];
  layoutDirection: string;
}

interface RoutingNodeLike {
  id: string;
  type?: string;
  parentId?: string;
  parentNode?: string;
  x?: number;
  y?: number;
  position?: { x?: number; y?: number };
  positionAbsolute?: { x?: number; y?: number };
  computed?: { positionAbsolute?: { x?: number; y?: number } };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
}

const CONTAINER_TYPES = new Set([
  'group',
  'subGroup',
  'titleGroup',
  'domain',
  'subDomain',
  'swimlane',
  'annotation',
  'background',
  'sticky',
  'comment',
]);

const finiteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const coordinate = (value: unknown): number =>
  finiteNumber(value) ? value : 0;

const positiveDimension = (value: unknown, fallback: number): number =>
  finiteNumber(value) && value > 0 ? value : fallback;

const endpointKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const optionalText = (value: unknown): string | undefined => {
  const text = endpointKey(value);
  return text || undefined;
};

const parseTopologyEdge = (value: unknown): RoutingTopologyEdge | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const id = endpointKey(candidate.id ?? candidate.edgeId);
  const source = endpointKey(candidate.source);
  const target = endpointKey(candidate.target);
  if (!id || !source || !target) return undefined;
  return {
    id,
    source,
    target,
    ...(optionalText(candidate.sourceHandle)
      ? { sourceHandle: optionalText(candidate.sourceHandle) }
      : {}),
    ...(optionalText(candidate.targetHandle)
      ? { targetHandle: optionalText(candidate.targetHandle) }
      : {}),
    ...(optionalText(candidate.type) ? { type: optionalText(candidate.type) } : {}),
  };
};

const parseRoutingNode = (value: unknown): RoutingNodeLike | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as RoutingNodeLike;
  const id = endpointKey(candidate.id);
  if (!id) return undefined;
  return { ...candidate, id };
};

const pushByKey = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  if (!key) return;
  const group = map.get(key) ?? [];
  group.push(value);
  map.set(key, group);
};

export const prepareBusRoutingContext = (
  jobs: PathFindingJob[],
  graph: SharedGraphContext,
): PreparedBusRoutingContext => {
  const edgeById = new Map<string, RoutingTopologyEdge>();
  for (const rawEdge of Array.isArray(graph.edges) ? graph.edges : []) {
    const edge = parseTopologyEdge(rawEdge);
    if (edge && !edgeById.has(edge.id)) edgeById.set(edge.id, edge);
  }
  for (const job of jobs) {
    const edge = parseTopologyEdge(job);
    if (edge && !edgeById.has(edge.id)) edgeById.set(edge.id, edge);
  }
  const allEdges = [...edgeById.values()];
  const outgoingByNode = new Map<string, RoutingTopologyEdge[]>();
  const incomingByNode = new Map<string, RoutingTopologyEdge[]>();
  for (const edge of allEdges) {
    pushByKey(outgoingByNode, edge.source, edge);
    pushByKey(incomingByNode, edge.target, edge);
  }

  const nodeById = new Map<string, RoutingNodeLike>();
  for (const rawNode of Array.isArray(graph.nodes) ? graph.nodes : []) {
    const node = parseRoutingNode(rawNode);
    if (node && !nodeById.has(node.id)) nodeById.set(node.id, node);
  }
  const absolutePositionById = new Map<string, { x: number; y: number }>();
  const relativePosition = (node: RoutingNodeLike): { x: number; y: number } => ({
    x: coordinate(node.position?.x ?? node.x),
    y: coordinate(node.position?.y ?? node.y),
  });
  const resolveAbsolutePosition = (
    nodeId: string,
    visiting: Set<string> = new Set(),
  ): { x: number; y: number } => {
    const cached = absolutePositionById.get(nodeId);
    if (cached) return cached;
    const node = nodeById.get(nodeId);
    if (!node) return { x: 0, y: 0 };
    const relative = relativePosition(node);
    if (visiting.has(nodeId)) return relative;
    visiting.add(nodeId);
    const parentId = endpointKey(node.parentId ?? node.parentNode);
    let absolute: { x: number; y: number };
    if (parentId && nodeById.has(parentId) && !visiting.has(parentId)) {
      const parent = resolveAbsolutePosition(parentId, visiting);
      absolute = { x: parent.x + relative.x, y: parent.y + relative.y };
    } else if (parentId) {
      absolute = relative;
    } else if (
      finiteNumber(node.computed?.positionAbsolute?.x)
      && finiteNumber(node.computed?.positionAbsolute?.y)
    ) {
      absolute = {
        x: node.computed.positionAbsolute.x,
        y: node.computed.positionAbsolute.y,
      };
    } else if (
      finiteNumber(node.positionAbsolute?.x)
      && finiteNumber(node.positionAbsolute?.y)
    ) {
      absolute = {
        x: node.positionAbsolute.x,
        y: node.positionAbsolute.y,
      };
    } else {
      absolute = relative;
    }
    visiting.delete(nodeId);
    absolutePositionById.set(nodeId, absolute);
    return absolute;
  };

  const getNodeRect = (rawId: string): Rectangle | undefined => {
    const id = endpointKey(rawId);
    const node = nodeById.get(id);
    if (!node) return undefined;
    const position = resolveAbsolutePosition(id);
    return {
      x: position.x,
      y: position.y,
      width: positiveDimension(node.width, positiveDimension(node.measured?.width, 150)),
      height: positiveDimension(node.height, positiveDimension(node.measured?.height, 80)),
    };
  };

  const sourceGroups = new Map<string, PathFindingJob[]>();
  const targetGroups = new Map<string, PathFindingJob[]>();
  for (const job of jobs) {
    const source = endpointKey(job.source);
    const target = endpointKey(job.target);
    job.sourceRect = getNodeRect(source);
    job.targetRect = getNodeRect(target);
    job.isOneToMany = (outgoingByNode.get(source)?.length ?? 0) > 1;
    job.isManyToOne = (incomingByNode.get(target)?.length ?? 0) > 1;
    pushByKey(sourceGroups, source, job);
    pushByKey(targetGroups, target, job);
  }

  const trunkObstacles: Rectangle[] = [];
  for (const node of nodeById.values()) {
    if (CONTAINER_TYPES.has(endpointKey(node.type))) continue;
    const rectangle = getNodeRect(node.id);
    if (rectangle && rectangle.width > 0 && rectangle.height > 0) {
      trunkObstacles.push(rectangle);
    }
  }

  const graphWithLayout = graph as SharedGraphContext & {
    layoutDirection?: unknown;
  };
  return {
    allEdges,
    outgoingByNode,
    incomingByNode,
    sourceGroups,
    targetGroups,
    getNodeRect,
    trunkObstacles,
    layoutDirection: endpointKey(graphWithLayout.layoutDirection) || 'LR',
  };
};

export const collectHubPortGroups = (
  jobs: readonly PathFindingJob[],
): Map<string, HubPortGroupInfo> => {
  const groups = new Map<string, HubPortGroupInfo>();
  for (const job of jobs) {
    const legacyJob = job as PathFindingJob & {
      trunkPort?: unknown;
      trunkPortTangent?: unknown;
      trunkBranchCoord?: unknown;
    };
    const port = job.busRoutingPlan?.trunkPort ?? legacyJob.trunkPort;
    if (port !== 'top' && port !== 'bottom' && port !== 'left' && port !== 'right') {
      continue;
    }
    const rawTangent = job.busRoutingPlan?.trunkPortTangent
      ?? legacyJob.trunkPortTangent
      ?? legacyJob.trunkBranchCoord;
    const tangent = finiteNumber(rawTangent) ? rawTangent : 0;
    const previous = groups.get(port);
    if (!previous) {
      groups.set(port, { tangent, jobs: [job] });
      continue;
    }
    const previousCount = previous.jobs.length;
    previous.tangent = (
      previous.tangent * previousCount + tangent
    ) / (previousCount + 1);
    previous.jobs.push(job);
  }
  return groups;
};

export const assignNonBusIncomingIndices = (
  groupJobs: readonly PathFindingJob[],
): void => {
  const sideBuckets = new Map<string, PathFindingJob[]>();
  for (const job of groupJobs) {
    const side = job.sourceRect && job.targetRect
      ? inferRoutingPortSide(job.sourceRect, job.targetRect, 'target')
      : 'unknown';
    pushByKey(sideBuckets, side, job);
  }
  for (const sideJobs of sideBuckets.values()) {
    sideJobs.sort((left, right) =>
      coordinate(left.sourceY) - coordinate(right.sourceY)
      || endpointKey(left.edgeId).localeCompare(endpointKey(right.edgeId)),
    );
    sideJobs.forEach((job, index) => {
      job.incomingIndex = index;
      job.incomingCount = sideJobs.length;
    });
  }
};
