import type { Edge, Node } from '@xyflow/react';
import { edgeTerminalPositionIsFixed } from '../../routing/utils/edgeTerminalPolicy';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import {
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

type TrunkGroup = Readonly<{
  nodeId: string;
  role: 'source' | 'target';
  side: 'top' | 'right' | 'bottom' | 'left';
  edgeIds: readonly string[];
}>;

/** Proposes a shared port slide; the caller owns whole-graph atomic acceptance. */
export const buildEndpointTrunkSlideCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  group: TrunkGroup,
): T[] => {
  const portNode = nodes.find(node => node.id === group.nodeId);
  const rect = portNode ? getDisplayNodeRect(portNode) : null;
  if (!rect) return [];
  const horizontalStem = group.side === 'left' || group.side === 'right';
  const tangent = horizontalStem ? 'y' : 'x';
  const minimum = rect[tangent] + 2;
  const maximum = rect[tangent] + (horizontalStem ? rect.height : rect.width) - 2;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum >= maximum) return [];
  const memberIds = new Set(group.edgeIds);
  const members = edges.flatMap((edge, index) => {
    if (!memberIds.has(edge.id)) return [];
    const raw = getDisplayComputedPath(edge);
    const path = group.role === 'source' ? raw : [...raw].reverse();
    const coordinate = path[0]?.[tangent];
    if (coordinate === undefined || edgeTerminalPositionIsFixed(edge, group.role)) return [];
    let prefixLength = 0;
    while (prefixLength < path.length && Math.abs(path[prefixLength][tangent] - coordinate) <= 0.5) {
      prefixLength++;
    }
    // A straight edge would move its other terminal as well.
    if (prefixLength < 2 || prefixLength === path.length) return [];
    return [{ edge, index, path, coordinate, prefixLength }];
  });
  if (members.length !== group.edgeIds.length || members.length < 2) return [];
  const coordinate = members[0].coordinate;
  if (members.some(member => Math.abs(member.coordinate - coordinate) > 0.5)) return [];

  const lanes = nodes.flatMap(node => {
    if (node.id === group.nodeId || node.hidden || isDisplayContainerNode(node)) return [];
    const obstacle = getDisplayNodeRect(node);
    if (!obstacle) return [];
    return [
      obstacle[tangent] - COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      obstacle[tangent] + (horizontalStem ? obstacle.height : obstacle.width)
        + COMMERCIAL_BUSINESS_NODE_CLEARANCE,
    ];
  }).filter(lane => Number.isFinite(lane) && lane >= minimum && lane <= maximum
    && Math.abs(lane - coordinate) > 0.5);
  const coordinates = [...new Set(lanes)]
    .sort((a, b) => Math.abs(a - coordinate) - Math.abs(b - coordinate) || a - b)
    .slice(0, 8);
  return coordinates.map(lane => {
    const candidate = edges.slice() as T;
    for (const member of members) {
      const moved = member.path.map((point, index) => index < member.prefixLength
        ? { ...point, [tangent]: lane } : point);
      candidate[member.index] = withDisplayComputedPath(
        member.edge, group.role === 'source' ? moved : moved.reverse(),
      );
    }
    return candidate;
  });
};
