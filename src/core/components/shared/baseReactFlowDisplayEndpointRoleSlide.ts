import type { Edge, Node } from '@xyflow/react';
import { edgeTerminalPositionIsFixed } from '../../routing/utils/edgeTerminalPolicy';
import { normalizeHandle } from '../../routing/utils/handleUtils';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { segmentToClearanceRectDistance } from '../../strategies/shared/edgeNodeClearanceGeometry';
import {
  displayAxisOf,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';

type TerminalRole = 'source' | 'target';
type TerminalSide = 'top' | 'right' | 'bottom' | 'left';
type RoleSlideTerminal = Readonly<{ edgeIndex: number; role: TerminalRole }>;

export type DisplayEndpointRoleSlideGroup = Readonly<{
  nodeId: string;
  side: TerminalSide;
  edgeIds: readonly string[];
  terminals: readonly RoleSlideTerminal[];
}>;

type RoleSlideMember = RoleSlideTerminal & Readonly<{
  edge: Edge;
  path: DisplayPoint[];
  coordinate: number;
  prefixLength: number;
}>;

const EPSILON = 0.5;
const MAX_GRAPH_ITEMS = 256;
const MAX_PATH_POINTS = 128;
const MAX_COORDINATE = 1_000_000;
const MAX_CANDIDATES = 8;
const PORT_INSET = 2;

const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

const boundedCoordinate = (value: unknown): value is number => typeof value === 'number'
  && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;

const readBusinessRect = (node: Node | undefined): DisplayRect | null => {
  if (!node || node.hidden || isDisplayContainerNode(node)
    || !boundedCoordinate(node.position?.x) || !boundedCoordinate(node.position?.y)) return null;
  const position = 'positionAbsolute' in node && node.positionAbsolute != null
    ? node.positionAbsolute : node.position;
  if (!position || typeof position !== 'object' || !('x' in position) || !('y' in position)
    || !boundedCoordinate(position.x) || !boundedCoordinate(position.y)) return null;
  const rect = getDisplayNodeRect(node);
  return rect && Object.values(rect).every(boundedCoordinate)
    && boundedCoordinate(rect.x + rect.width) && boundedCoordinate(rect.y + rect.height)
    ? rect : null;
};

const boundedGraph = (edges: readonly Edge[], nodes: readonly Node[]): boolean => (
  edges.length >= 2 && edges.length <= MAX_GRAPH_ITEMS
  && nodes.length > 0 && nodes.length <= MAX_GRAPH_ITEMS
  && new Set(edges.map(edge => edge.id)).size === edges.length
  && new Set(nodes.map(node => node.id)).size === nodes.length
);

const boundedOrthogonalPath = (path: readonly DisplayPoint[]): boolean => path.length >= 3
  && path.length <= MAX_PATH_POINTS
  && path.every(point => boundedCoordinate(point.x) && boundedCoordinate(point.y))
  && path.slice(1).every((point, index) => displayAxisOf(path[index], point) !== null);

/** Unknown incident ports cannot safely be omitted from a complete side group. */
const terminalsAtSide = (
  edges: readonly Edge[], nodeId: string, side: TerminalSide,
): RoleSlideTerminal[] | null => {
  const terminals: RoleSlideTerminal[] = [];
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const edge = edges[edgeIndex];
    for (const role of ['source', 'target'] as const) {
      if (edge[role] !== nodeId) continue;
      const declared = fullDisplayPortSide(normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle));
      if (!declared) return null;
      if (declared === side) terminals.push({ edgeIndex, role });
    }
  }
  return terminals;
};

const readGroup = (
  edges: readonly Edge[], nodes: readonly Node[], group: DisplayEndpointRoleSlideGroup,
): Readonly<{
  members: RoleSlideMember[];
  tangent: 'x' | 'y';
  minimumDelta: number;
  maximumDelta: number;
}> | null => {
  if (!boundedGraph(edges, nodes)) return null;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const rect = readBusinessRect(nodeById.get(group.nodeId));
  const expected = terminalsAtSide(edges, group.nodeId, group.side);
  if (!rect || !expected || expected.length < 2
    || !expected.some(terminal => terminal.role === 'source')
    || !expected.some(terminal => terminal.role === 'target')
    || expected.length !== group.terminals.length || expected.length !== group.edgeIds.length
    || expected.some((terminal, index) => terminal.edgeIndex !== group.terminals[index]?.edgeIndex
      || terminal.role !== group.terminals[index]?.role
      || edges[terminal.edgeIndex].id !== group.edgeIds[index])) return null;
  const horizontalStem = group.side === 'left' || group.side === 'right';
  const tangent = horizontalStem ? 'y' : 'x';
  const normal = horizontalStem ? 'x' : 'y';
  const sign = group.side === 'left' || group.side === 'top' ? -1 : 1;
  const boundary = rect[normal] + (sign > 0 ? horizontalStem ? rect.width : rect.height : 0);
  const minimum = rect[tangent] + PORT_INSET;
  const maximum = rect[tangent] + (horizontalStem ? rect.height : rect.width) - PORT_INSET;
  let minimumDelta = -Infinity;
  let maximumDelta = Infinity;
  const members: RoleSlideMember[] = [];
  for (const terminal of expected) {
    const edge = edges[terminal.edgeIndex];
    if (edge.source === edge.target || edgeTerminalPositionIsFixed(edge, terminal.role)
      || !readBusinessRect(nodeById.get(edge.source)) || !readBusinessRect(nodeById.get(edge.target))) return null;
    const raw = getDisplayComputedPath(edge);
    if (!boundedOrthogonalPath(raw)) return null;
    const path = terminal.role === 'source' ? raw : raw.toReversed();
    const coordinate = path[0][tangent];
    if (Math.abs(path[0][normal] - boundary) > EPSILON
      || coordinate < rect[tangent] - EPSILON
      || coordinate > rect[tangent] + (horizontalStem ? rect.height : rect.width) + EPSILON) return null;
    let prefixLength = 1;
    while (prefixLength < path.length && Math.abs(path[prefixLength][tangent] - coordinate) <= EPSILON) {
      if (sign * (path[prefixLength][normal] - path[prefixLength - 1][normal]) <= EPSILON) return null;
      prefixLength++;
    }
    // Moving a complete straight path would also move its other endpoint.
    if (prefixLength < 2 || prefixLength === path.length) return null;
    minimumDelta = Math.max(minimumDelta, minimum - coordinate);
    maximumDelta = Math.min(maximumDelta, maximum - coordinate);
    members.push({ ...terminal, edge, path, coordinate, prefixLength });
  }
  return minimumDelta <= maximumDelta ? { members, tangent, minimumDelta, maximumDelta } : null;
};

/** Complete same-side source/target units; one frozen terminal freezes its whole unit. */
export const collectDisplayEndpointRoleSlideGroups = (
  edges: readonly Edge[], nodes: readonly Node[], eligibleEdgeIds?: ReadonlySet<string>,
): DisplayEndpointRoleSlideGroup[] => {
  if (!boundedGraph(edges, nodes) || eligibleEdgeIds?.size === 0) return [];
  const groups: DisplayEndpointRoleSlideGroup[] = [];
  for (const node of nodes) {
    if (!readBusinessRect(node)) continue;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const terminals = terminalsAtSide(edges, node.id, side);
      if (!terminals || terminals.length < 2) continue;
      const edgeIds = terminals.map(terminal => edges[terminal.edgeIndex].id);
      if (eligibleEdgeIds && edgeIds.some(id => !eligibleEdgeIds.has(id))) continue;
      const group = { nodeId: node.id, side, edgeIds, terminals };
      if (readGroup(edges, nodes, group)) groups.push(group);
    }
  }
  return groups.sort((a, b) => compareText(a.nodeId, b.nodeId) || compareText(a.side, b.side));
};

/**
 * Slide every role by one tangent delta, retaining port order, spacing, handle
 * identity and the remote endpoints. The caller owns group budgets and exact
 * whole-graph acceptance; a useful partial slide is never returned.
 */
export const buildDisplayEndpointRoleSlideCandidates = <T extends Edge[]>(
  edges: T, nodes: readonly Node[], group: DisplayEndpointRoleSlideGroup,
): T[] => {
  const geometry = readGroup(edges, nodes, group);
  if (!geometry) return [];
  const obstacles = nodes.filter(node => !node.hidden && !isDisplayContainerNode(node));
  const rectangles = obstacles.map(node => ({ nodeId: node.id, rect: readBusinessRect(node) }));
  if (rectangles.some(entry => entry.rect === null)) return [];
  const { members, tangent, minimumDelta, maximumDelta } = geometry;
  const deltas = new Set<number>();
  for (const member of members) {
    const prefix = { a: member.path[0], b: member.path[member.prefixLength - 1] };
    for (const { nodeId, rect } of rectangles) {
      if (!rect || nodeId === member.edge.source || nodeId === member.edge.target
        || segmentToClearanceRectDistance(prefix, rect) >= COMMERCIAL_BUSINESS_NODE_CLEARANCE - EPSILON) continue;
      for (const lane of [rect[tangent] - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        rect[tangent] + (tangent === 'x' ? rect.width : rect.height) + COMMERCIAL_BUSINESS_NODE_CLEARANCE]) {
        const delta = lane - member.coordinate;
        if (boundedCoordinate(delta) && Math.abs(delta) > EPSILON
          && delta >= minimumDelta - EPSILON && delta <= maximumDelta + EPSILON) deltas.add(delta);
      }
    }
  }
  const selectedDeltas: number[] = [];
  for (const delta of [...deltas].sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)) {
    if (selectedDeltas.some(value => Math.abs(value - delta) <= EPSILON)) continue;
    selectedDeltas.push(delta);
    if (selectedDeltas.length >= MAX_CANDIDATES) break;
  }
  return selectedDeltas.flatMap(delta => {
    const candidate = edges.slice() as T;
    for (const member of members) {
      const moved = member.path.map((point, index) => index < member.prefixLength
        ? { ...point, [tangent]: point[tangent] + delta } : point);
      if (!boundedOrthogonalPath(moved)) return [];
      candidate[member.edgeIndex] = withDisplayComputedPath(
        member.edge, member.role === 'source' ? moved : moved.toReversed(),
      );
    }
    return [candidate];
  });
};
