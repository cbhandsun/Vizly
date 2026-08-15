import type { Edge, Node } from '@xyflow/react';

import { getEdgePath } from './edgeDetachedOverlapRepair';
import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointTrunkIdentity,
} from './edgeFinalSameSideEndpointOrderRepair';
import {
  EPS,
  axisOf,
  compactPath,
  nodeRect,
  withPath,
  type Point,
  type Rect,
  type Side,
} from './edgeSharedEndpointPortOrderGeometry';

const MIN_RECLAIMED_TARGET_STEM = 48;
const MIN_OVEREXTENDED_TARGET_STEM = 192;
const MAX_SHARED_PARENT_LANE_DRIFT = 4;

const terminalSide = (handle: Edge['targetHandle']): Side | null => {
  const normalized = String(handle ?? '').trim().toLowerCase();
  if (normalized === 'top' || normalized.endsWith('-top')) return 'top';
  if (normalized === 'right' || normalized.endsWith('-right')) return 'right';
  if (normalized === 'bottom' || normalized.endsWith('-bottom')) return 'bottom';
  if (normalized === 'left' || normalized.endsWith('-left')) return 'left';
  return null;
};

const parentBoundaryLane = (rect: Rect, side: Side): number => {
  if (side === 'left') return rect.x;
  if (side === 'right') return rect.x + rect.width;
  if (side === 'top') return rect.y;
  return rect.y + rect.height;
};

const rangesOverlap = (
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean => Math.max(
  Math.min(firstStart, firstEnd),
  Math.min(secondStart, secondEnd),
) <= Math.min(
  Math.max(firstStart, firstEnd),
  Math.max(secondStart, secondEnd),
) + EPS;

const reclaimedCorridorLane = (
  parentRect: Rect,
  parentId: string,
  side: Side,
  spanStart: number,
  spanEnd: number,
  nodes: readonly Node[],
): number | null => {
  const childRects = nodes.flatMap(node => {
    if (node.parentId !== parentId) return [];
    const rect = nodeRect(node);
    return rect ? [rect] : [];
  });
  const relevantRects = childRects.filter(rect => (
    side === 'left' || side === 'right'
      ? rangesOverlap(spanStart, spanEnd, rect.y, rect.y + rect.height)
      : rangesOverlap(spanStart, spanEnd, rect.x, rect.x + rect.width)
  ));
  const boundary = parentBoundaryLane(parentRect, side);
  const candidates = [
    boundary,
    ...relevantRects.flatMap(rect => (
      side === 'left' || side === 'right'
        ? [
          rect.x - MIN_RECLAIMED_TARGET_STEM,
          rect.x + rect.width + MIN_RECLAIMED_TARGET_STEM,
        ]
        : [
          rect.y - MIN_RECLAIMED_TARGET_STEM,
          rect.y + rect.height + MIN_RECLAIMED_TARGET_STEM,
        ]
    )),
  ].filter(lane => (
    side === 'left' || side === 'right'
      ? lane >= parentRect.x - MIN_RECLAIMED_TARGET_STEM - EPS
        && lane <= parentRect.x + parentRect.width + MIN_RECLAIMED_TARGET_STEM + EPS
      : lane >= parentRect.y - MIN_RECLAIMED_TARGET_STEM - EPS
        && lane <= parentRect.y + parentRect.height + MIN_RECLAIMED_TARGET_STEM + EPS
  )).sort((first, second) => (
    Math.abs(first - boundary) - Math.abs(second - boundary) || first - second
  ));
  return candidates.find(lane => relevantRects.every(rect => (
    side === 'left' || side === 'right'
      ? lane <= rect.x - MIN_RECLAIMED_TARGET_STEM + EPS
        || lane >= rect.x + rect.width + MIN_RECLAIMED_TARGET_STEM - EPS
      : lane <= rect.y - MIN_RECLAIMED_TARGET_STEM + EPS
        || lane >= rect.y + rect.height + MIN_RECLAIMED_TARGET_STEM - EPS
  ))) ?? null;
};

const isBeyondParentBoundary = (current: number, boundary: number, side: Side): boolean => (
  side === 'left' || side === 'top'
    ? current < boundary - EPS
    : current > boundary + EPS
);

const terminalStemLength = (path: readonly Point[], side: Side, lane: number): number => {
  const terminal = path.at(-1);
  if (!terminal) return 0;
  return side === 'left' || side === 'right'
    ? Math.abs(terminal.x - lane)
    : Math.abs(terminal.y - lane);
};

const moveTargetApproachLane = (
  path: readonly Point[],
  side: Side,
  lane: number,
): Point[] | null => {
  if (path.length < 4) return null;
  const beforeApproach = path[path.length - 3];
  const approach = path[path.length - 2];
  const terminal = path[path.length - 1];
  const expectedApproachAxis = side === 'left' || side === 'right' ? 'v' : 'h';
  const expectedTerminalAxis = expectedApproachAxis === 'v' ? 'h' : 'v';
  if (
    axisOf(beforeApproach, approach) !== expectedApproachAxis
    || axisOf(approach, terminal) !== expectedTerminalAxis
  ) return null;
  const next = path.map(point => ({ ...point }));
  if (expectedApproachAxis === 'v') {
    next[next.length - 3].x = lane;
    next[next.length - 2].x = lane;
  } else {
    next[next.length - 3].y = lane;
    next[next.length - 2].y = lane;
  }
  const compacted = compactPath(next);
  return compacted.length >= 2 && compacted.every((point, index) => (
    index === 0 || axisOf(compacted[index - 1], point) !== null
  )) ? compacted : null;
};

const maximalTargetTrunks = (
  trunks: readonly SameSideEndpointTrunkIdentity[],
): SameSideEndpointTrunkIdentity[] => trunks.filter(trunk => (
  trunk.role === 'target'
  && trunk.edgeIds.length >= 3
  && trunk.commonStemLength >= MIN_OVEREXTENDED_TARGET_STEM
  && !trunks.some(other => (
    other !== trunk
    && other.nodeId === trunk.nodeId
    && other.role === 'target'
    && other.side === trunk.side
    && other.edgeIds.length > trunk.edgeIds.length
    && trunk.edgeIds.every(edgeId => other.edgeIds.includes(edgeId))
  ))
));

/**
 * Reclaims an overextended many-to-one target trunk from outside the shared
 * source domain to that domain's real boundary. Every member moves in one
 * transaction, so target membership is retained while the historical stem
 * length is allowed to shrink to the commercial floor.
 */
export const repairOverextendedTargetTrunkCorridors = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  if (edges.length < 3 || nodes.length === 0) return edges;
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const trunks = maximalTargetTrunks(
    auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks,
  );
  for (const trunk of trunks) {
    const members = trunk.edgeIds.flatMap(edgeId => {
      const edgeIndex = edges.findIndex(edge => edge.id === edgeId);
      const edge = edges[edgeIndex];
      const sourceNode = edge ? nodeById.get(edge.source) : undefined;
      const parentId = typeof sourceNode?.parentId === 'string'
        ? sourceNode.parentId
        : null;
      const parentRect = parentId
        ? nodeRect(nodeById.get(parentId))
        : null;
      const path = edge ? getEdgePath(edge) : [];
      return edge && parentId && parentRect && path.length >= 4
        ? [{ edge, edgeIndex, parentId, parentRect, path }]
        : [];
    });
    if (members.length !== trunk.edgeIds.length) continue;
    const side = terminalSide(members[0]?.edge.targetHandle);
    if (!side || members.some(member => terminalSide(member.edge.targetHandle) !== side)) continue;
    const parentId = members[0]?.parentId;
    if (!parentId || members.some(member => member.parentId !== parentId)) continue;
    const parentLanes = members.map(member => parentBoundaryLane(member.parentRect, side));
    const minimumLane = Math.min(...parentLanes);
    const maximumLane = Math.max(...parentLanes);
    if (maximumLane - minimumLane > MAX_SHARED_PARENT_LANE_DRIFT) continue;
    const spanCoordinates = members.flatMap(member => {
      const beforeApproach = member.path.at(-3);
      const approach = member.path.at(-2);
      if (!beforeApproach || !approach) return [];
      return side === 'left' || side === 'right'
        ? [beforeApproach.y, approach.y]
        : [beforeApproach.x, approach.x];
    });
    if (spanCoordinates.length !== members.length * 2) continue;
    const lane = reclaimedCorridorLane(
      members[0].parentRect,
      parentId,
      side,
      Math.min(...spanCoordinates),
      Math.max(...spanCoordinates),
      nodes,
    );
    if (lane === null) continue;
    if (members.some(member => (
      terminalStemLength(member.path, side, lane) < MIN_RECLAIMED_TARGET_STEM
    ))) continue;
    const candidate = [...edges] as T;
    let changed = false;
    let invalid = false;
    for (const member of members) {
      const currentLane = side === 'left' || side === 'right'
        ? member.path.at(-2)?.x
        : member.path.at(-2)?.y;
      if (currentLane === undefined) {
        invalid = true;
        break;
      }
      if (Math.abs(currentLane - lane) <= EPS) {
        if (member.edge.data?.overextendedTargetTrunkCorridorReclaimed === true) continue;
        candidate[member.edgeIndex] = {
          ...member.edge,
          data: {
            ...member.edge.data,
            overextendedTargetTrunkCorridorReclaimed: true,
          },
        };
        changed = true;
        continue;
      }
      const parentBoundary = parentBoundaryLane(member.parentRect, side);
      if (!isBeyondParentBoundary(currentLane, parentBoundary, side)) continue;
      const path = moveTargetApproachLane(member.path, side, lane);
      if (!path) {
        invalid = true;
        break;
      }
      const repaired = withPath(member.edge, path);
      candidate[member.edgeIndex] = {
        ...repaired,
        data: {
          ...repaired.data,
          overextendedTargetTrunkCorridorReclaimed: true,
        },
      };
      changed = true;
    }
    if (!invalid && changed) return candidate;
  }
  return edges;
};
