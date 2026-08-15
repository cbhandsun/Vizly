import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { edgeTerminalHandleChangeIsAllowed } from '../../routing/utils/edgeTerminalPolicy';
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

const MIN_BUNDLE_MEMBERS = 3;
const MIN_CURRENT_SIDE_MEMBERS = 2;
const MIN_COMMERCIAL_STEM = 70;
const MAX_COMMERCIAL_STEM = 96;
const MIN_OUTWARD_SPAN = 48;
const REMOTE_TANGENT_ENVELOPE_GAP = 48;
const TERMINAL_CORNER_INSET = 30;
const OUTER_CORRIDOR_CLEARANCE = 64;
const OUTER_CORRIDOR_STUB = 56;

export type PreferredSourceTrunkCandidateValidation = Readonly<{
  baselineEdges: readonly Edge[];
  candidateEdges: readonly Edge[];
  changedEdgeIndexes: readonly number[];
  restoredTrunk: SameSideEndpointTrunkIdentity;
}>;

export type PreferredSourceTrunkRepairOptions = Readonly<{
  finalizeCandidate?: (candidateEdges: Edge[]) => Edge[];
  validateCandidate?: (context: PreferredSourceTrunkCandidateValidation) => boolean;
}>;

const terminalSide = (handle: Edge['sourceHandle']): Side | null => {
  const value = String(handle ?? '').trim().toLowerCase();
  if (value === 't' || value === 'top' || value.endsWith('-top')) return 'top';
  if (value === 'r' || value === 'right' || value.endsWith('-right')) return 'right';
  if (value === 'b' || value === 'bottom' || value.endsWith('-bottom')) return 'bottom';
  if (value === 'l' || value === 'left' || value.endsWith('-left')) return 'left';
  return null;
};

const center = (rect: Rect): Point => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
});

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.max(minimum, Math.min(maximum, value))
);

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

const boundaryPoint = (rect: Rect, side: Side, preferredTangent: number): Point => {
  if (side === 'top' || side === 'bottom') {
    const inset = Math.min(TERMINAL_CORNER_INSET, rect.width / 2);
    return {
      x: clamp(preferredTangent, rect.x + inset, rect.x + rect.width - inset),
      y: side === 'top' ? rect.y : rect.y + rect.height,
    };
  }
  const inset = Math.min(TERMINAL_CORNER_INSET, rect.height / 2);
  return {
    x: side === 'left' ? rect.x : rect.x + rect.width,
    y: clamp(preferredTangent, rect.y + inset, rect.y + rect.height - inset),
  };
};

const outwardDistance = (origin: Point, point: Point, side: Side): number => {
  if (side === 'top') return origin.y - point.y;
  if (side === 'bottom') return point.y - origin.y;
  if (side === 'left') return origin.x - point.x;
  return point.x - origin.x;
};

const targetBelongsToPreferredHemisphere = (
  sourceRect: Rect,
  targetRect: Rect,
  side: Side,
): boolean => {
  const sourceCenter = center(sourceRect);
  const targetCenter = center(targetRect);
  const main = outwardDistance(sourceCenter, targetCenter, side);
  return main >= MIN_OUTWARD_SPAN;
};

const tangentCoordinate = (point: Point, side: Side): number => (
  side === 'top' || side === 'bottom' ? point.x : point.y
);

const dominantSideToward = (sourceRect: Rect, targetRect: Rect): Side => {
  const source = center(sourceRect);
  const target = center(targetRect);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
};

const existingOutwardStemLength = (
  path: readonly Point[],
  side: Side,
): number | null => {
  const terminal = path[0];
  const stub = path[1];
  if (!terminal || !stub) return null;
  const expectedAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  if (axisOf(terminal, stub) !== expectedAxis) return null;
  const distance = outwardDistance(terminal, stub, side);
  return distance > EPS ? distance : null;
};

const branchPoint = (terminal: Point, side: Side, stemLength: number): Point => {
  if (side === 'top') return { x: terminal.x, y: terminal.y - stemLength };
  if (side === 'bottom') return { x: terminal.x, y: terminal.y + stemLength };
  if (side === 'left') return { x: terminal.x - stemLength, y: terminal.y };
  return { x: terminal.x + stemLength, y: terminal.y };
};

const parentNodeIds = (nodes: readonly ReactFlowNode[]): Set<string> => new Set(
  nodes.flatMap(node => typeof node.parentId === 'string' ? [node.parentId] : []),
);

const businessRects = (
  nodes: readonly ReactFlowNode[],
  nodeById: ReadonlyMap<string, ReactFlowNode>,
): Rect[] => {
  const parents = parentNodeIds(nodes);
  return nodes.flatMap(node => {
    const rect = parents.has(node.id) ? null : nodeRect(nodeById.get(node.id));
    return rect ? [rect] : [];
  });
};

const buildOuterSideCorridorPath = (
  edge: Edge,
  sourceRect: Rect,
  targetRect: Rect,
  sourceSide: Side,
  obstacles: readonly Rect[],
): Point[] | null => {
  if (obstacles.length === 0) return null;
  const targetSide = terminalSide(edge.targetHandle);
  if (!targetSide) return null;
  const sourceTerminal = boundaryPoint(
    sourceRect,
    sourceSide,
    tangentCoordinate(center(sourceRect), sourceSide),
  );
  const sourceStub = branchPoint(sourceTerminal, sourceSide, OUTER_CORRIDOR_STUB);
  const targetTerminal = boundaryPoint(
    targetRect,
    targetSide,
    tangentCoordinate(center(targetRect), targetSide),
  );
  const targetStub = branchPoint(targetTerminal, targetSide, OUTER_CORRIDOR_STUB);
  const sourceCenter = center(sourceRect);
  const targetCenter = center(targetRect);
  const useHorizontalOuterLane = sourceSide === 'left' || sourceSide === 'right';
  const path = useHorizontalOuterLane
    ? (() => {
      const outerY = targetCenter.y >= sourceCenter.y
        ? Math.min(...obstacles.map(rect => rect.y)) - OUTER_CORRIDOR_CLEARANCE
        : Math.max(...obstacles.map(rect => rect.y + rect.height)) + OUTER_CORRIDOR_CLEARANCE;
      return [
        sourceTerminal,
        sourceStub,
        { x: sourceStub.x, y: outerY },
        { x: targetStub.x, y: outerY },
        targetStub,
        targetTerminal,
      ];
    })()
    : (() => {
      const outerX = targetCenter.x >= sourceCenter.x
        ? Math.min(...obstacles.map(rect => rect.x)) - OUTER_CORRIDOR_CLEARANCE
        : Math.max(...obstacles.map(rect => rect.x + rect.width)) + OUTER_CORRIDOR_CLEARANCE;
      return [
        sourceTerminal,
        sourceStub,
        { x: outerX, y: sourceStub.y },
        { x: outerX, y: targetStub.y },
        targetStub,
        targetTerminal,
      ];
    })();
  const compacted = compactPath(path);
  return compacted.length >= 2 && compacted.every((point, index) => (
    index === 0 || axisOf(compacted[index - 1], point) !== null
  )) ? compacted : null;
};

const rangesOverlap = (
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): boolean => Math.max(firstStart, secondStart) <= Math.min(firstEnd, secondEnd) + EPS;

const rectContainsCenter = (outer: Rect, inner: Rect): boolean => {
  const point = center(inner);
  return point.x >= outer.x - EPS
    && point.x <= outer.x + outer.width + EPS
    && point.y >= outer.y - EPS
    && point.y <= outer.y + outer.height + EPS;
};

const preferredBranchEscapePath = (
  edge: Edge,
  sourceNode: ReactFlowNode,
  sourceRect: Rect,
  targetRect: Rect,
  sourceSide: Side,
  currentPath: readonly Point[],
  nodes: readonly ReactFlowNode[],
  nodeById: ReadonlyMap<string, ReactFlowNode>,
): Point[] | null => {
  if (currentPath.length < 2) return null;
  const parentRect = typeof sourceNode.parentId === 'string'
    ? nodeRect(nodeById.get(sourceNode.parentId))
    : null;
  if (!parentRect) return null;
  const terminal = boundaryPoint(
    sourceRect,
    sourceSide,
    tangentCoordinate(center(sourceRect), sourceSide),
  );
  const obstacles = businessRects(nodes, nodeById).filter(rect => rect !== sourceRect);
  const targetSuffix = currentPath.slice(-2).map(point => ({ ...point }));
  const suffixStart = targetSuffix[0];
  if (!suffixStart) return null;
  let escape = branchPoint(terminal, sourceSide, MIN_OUTWARD_SPAN);
  let exterior: Point;
  if (sourceSide === 'left' || sourceSide === 'right') {
    const ahead = obstacles.filter(rect => (
      rangesOverlap(terminal.y, terminal.y, rect.y, rect.y + rect.height)
      && (sourceSide === 'right'
        ? rect.x >= sourceRect.x + sourceRect.width - EPS
        : rect.x + rect.width <= sourceRect.x + EPS)
    ));
    if (ahead.length > 0) {
      escape = {
        x: sourceSide === 'right'
          ? Math.min(...ahead.map(rect => rect.x)) - MIN_OUTWARD_SPAN
          : Math.max(...ahead.map(rect => rect.x + rect.width)) + MIN_OUTWARD_SPAN,
        y: terminal.y,
      };
    }
    const targetAboveParent = center(targetRect).y < parentRect.y + parentRect.height / 2;
    exterior = {
      x: escape.x,
      y: targetAboveParent
        ? parentRect.y + parentRect.height + MIN_OUTWARD_SPAN
        : parentRect.y - MIN_OUTWARD_SPAN,
    };
  } else {
    const ahead = obstacles.filter(rect => (
      rangesOverlap(terminal.x, terminal.x, rect.x, rect.x + rect.width)
      && (sourceSide === 'bottom'
        ? rect.y >= sourceRect.y + sourceRect.height - EPS
        : rect.y + rect.height <= sourceRect.y + EPS)
    ));
    if (ahead.length > 0) {
      escape = {
        x: terminal.x,
        y: sourceSide === 'bottom'
          ? Math.min(...ahead.map(rect => rect.y)) - MIN_OUTWARD_SPAN
          : Math.max(...ahead.map(rect => rect.y + rect.height)) + MIN_OUTWARD_SPAN,
      };
    }
    const targetLeftOfParent = center(targetRect).x < parentRect.x + parentRect.width / 2;
    exterior = {
      x: targetLeftOfParent
        ? parentRect.x + parentRect.width + MIN_OUTWARD_SPAN
        : parentRect.x - MIN_OUTWARD_SPAN,
      y: escape.y,
    };
  }
  const path = compactPath(sourceSide === 'left' || sourceSide === 'right'
    ? [terminal, escape, exterior, { x: suffixStart.x, y: exterior.y }, ...targetSuffix]
    : [terminal, escape, exterior, { x: exterior.x, y: suffixStart.y }, ...targetSuffix]);
  return path.length >= 2 && path.every((point, index) => (
    index === 0 || axisOf(path[index - 1], point) !== null
  )) ? path : null;
};

/**
 * Splits authored side branches out of a provisional four-or-more member
 * source trunk while preserving the branch's existing target suffix. The
 * branch exits toward its remote node and travels outside the source domain,
 * so restoring one-to-many source sharing cannot pull the reverse branch back
 * through child nodes or destroy a many-to-one target trunk.
 */
export const repairPreferredSourceBranchCorridors = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  preferredEdges: readonly Edge[] | undefined,
): Edge[] => {
  if (edges.length < MIN_BUNDLE_MEMBERS + 1) return edges;
  const preferredById = new Map((preferredEdges ?? []).map(edge => [edge.id, edge] as const));
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const endpointDegree = new Map<string, number>();
  for (const edge of edges) {
    endpointDegree.set(edge.source, (endpointDegree.get(edge.source) ?? 0) + 1);
    endpointDegree.set(edge.target, (endpointDegree.get(edge.target) ?? 0) + 1);
  }
  const legalSharedTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
  const trunks = legalSharedTrunks
    .filter(trunk => trunk.role === 'source' && trunk.edgeIds.length >= MIN_BUNDLE_MEMBERS + 1)
    .filter(trunk => !legalSharedTrunks.some(other => (
      other !== trunk
      && other.nodeId === trunk.nodeId
      && other.role === 'source'
      && other.edgeIds.length > trunk.edgeIds.length
      && trunk.edgeIds.every(edgeId => other.edgeIds.includes(edgeId))
    )));
  let candidate = edges;
  for (const trunk of trunks) {
    const trunkSide = trunk.side;
    const sourceEdge = trunk.edgeIds
      .map(edgeId => candidate.find(edge => edge.id === edgeId))
      .find((edge): edge is Edge => Boolean(edge));
    const sourceNode = sourceEdge ? nodeById.get(sourceEdge.source) : undefined;
    const sourceRect = nodeRect(sourceNode);
    const parentRect = typeof sourceNode?.parentId === 'string'
      ? nodeRect(nodeById.get(sourceNode.parentId))
      : null;
    if (!sourceNode || !sourceRect) continue;
    const isSeparatedBranch = (edgeId: string): boolean => {
      const edge = candidate.find(item => item.id === edgeId);
      const targetRect = edge ? nodeRect(nodeById.get(edge.target)) : null;
      if (!edge || !targetRect) return false;
      const preferredSide = terminalSide(preferredById.get(edgeId)?.sourceHandle);
      const authoredBranch = preferredSide !== null && preferredSide !== trunkSide;
      const topologicalReverseBranch = Boolean(
        parentRect
        && !rectContainsCenter(parentRect, targetRect)
        && !targetBelongsToPreferredHemisphere(sourceRect, targetRect, trunkSide)
        && dominantSideToward(sourceRect, targetRect) !== trunkSide
        && (endpointDegree.get(edge.target) ?? 0) > 1
      );
      return authoredBranch || topologicalReverseBranch;
    };
    const branchIds = trunk.edgeIds.filter(isSeparatedBranch);
    const retainedIds = trunk.edgeIds.filter(edgeId => !branchIds.includes(edgeId));
    if (retainedIds.length < MIN_BUNDLE_MEMBERS || branchIds.length === 0) continue;
    for (const branchId of branchIds) {
      const edgeIndex = candidate.findIndex(edge => edge.id === branchId);
      const edge = candidate[edgeIndex];
      const sourceNode = edge ? nodeById.get(edge.source) : undefined;
      const sourceRect = nodeRect(sourceNode);
      const targetRect = edge ? nodeRect(nodeById.get(edge.target)) : null;
      if (!edge || !sourceNode || !sourceRect || !targetRect) continue;
      const sourceSide = dominantSideToward(sourceRect, targetRect);
      if (
        sourceSide === trunkSide
        || !edgeTerminalHandleChangeIsAllowed(
          edge,
          'source',
          sourceSide,
          { allowRuntimeHandleChange: true },
        )
      ) continue;
      const path = preferredBranchEscapePath(
        edge,
        sourceNode,
        sourceRect,
        targetRect,
        sourceSide,
        getEdgePath(edge),
        nodes,
        nodeById,
      );
      if (!path) continue;
      const separated = withPath(edge, path, 'source', sourceSide);
      candidate = candidate.map((item, index) => index === edgeIndex ? {
        ...separated,
        data: {
          ...separated.data,
          preferredSourceBranchCorridorSeparated: true,
          sourceBranchCorridorSeparated: true,
        },
      } : item);
    }
  }
  return candidate;
};

const rebuildSourcePrefix = (
  path: readonly Point[],
  terminal: Point,
  stem: Point,
  side: Side,
): Point[] | null => {
  const rejoinIndex = path.findIndex((point, index) => (
    index > 0 && outwardDistance(terminal, point, side) + EPS >= MIN_COMMERCIAL_STEM
      && outwardDistance(terminal, point, side) + EPS >= outwardDistance(terminal, stem, side)
  ));
  if (rejoinIndex < 1) return null;
  const rejoin = path[rejoinIndex];
  const bend = side === 'top' || side === 'bottom'
    ? { x: rejoin.x, y: stem.y }
    : { x: stem.x, y: rejoin.y };
  const candidate = compactPath([
    terminal,
    stem,
    bend,
    ...path.slice(rejoinIndex).map(point => ({ ...point })),
  ]);
  return candidate.length >= 2 && candidate.every((point, index) => (
    index === 0 || axisOf(candidate[index - 1], point) !== null
  )) ? candidate : null;
};

/**
 * Restores a source-authored automatic side only when it completes a genuine
 * three-or-more edge source bundle. The remote-node hemisphere check keeps a
 * legitimate horizontal escape (for example a customs side route) separate
 * from a vertical source trunk even if both started from the same auto side.
 */
export const repairPreferredSourceTrunkBundles = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  preferredEdges: readonly Edge[] | undefined,
  options: PreferredSourceTrunkRepairOptions = {},
): Edge[] => {
  if (!preferredEdges || edges.length < MIN_BUNDLE_MEMBERS) return edges;
  const preferredById = new Map(preferredEdges.map(edge => [edge.id, edge] as const));
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const endpointDegree = new Map<string, number>();
  for (const edge of edges) {
    endpointDegree.set(edge.source, (endpointDegree.get(edge.source) ?? 0) + 1);
    endpointDegree.set(edge.target, (endpointDegree.get(edge.target) ?? 0) + 1);
  }
  const grouped = new Map<string, Array<{
    edge: Edge;
    edgeIndex: number;
    side: Side;
    targetTangent: number;
    targetOutward: number;
    targetDegree: number;
  }>>();

  edges.forEach((edge, edgeIndex) => {
    const preferred = preferredById.get(edge.id);
    const side = terminalSide(preferred?.sourceHandle);
    const sourceRect = nodeRect(nodeById.get(edge.source));
    const targetRect = nodeRect(nodeById.get(edge.target));
    if (!side || !sourceRect || !targetRect) return;
    if (!targetBelongsToPreferredHemisphere(sourceRect, targetRect, side)) return;
    const key = `${edge.source}:${side}`;
    const group = grouped.get(key) ?? [];
    group.push({
      edge,
      edgeIndex,
      side,
      targetTangent: tangentCoordinate(center(targetRect), side),
      targetOutward: outwardDistance(center(sourceRect), center(targetRect), side),
      targetDegree: endpointDegree.get(edge.target) ?? 0,
    });
    grouped.set(key, group);
  });

  for (const group of grouped.values()) {
    if (group.length < MIN_BUNDLE_MEMBERS) continue;
    const side = group[0]?.side;
    const sourceId = group[0]?.edge.source;
    if (!side || !sourceId) continue;
    const currentSideMembers = group.filter(({ edge }) => terminalSide(edge.sourceHandle) === side);
    const mismatchedMembers = group.filter(({ edge }) => terminalSide(edge.sourceHandle) !== side);
    if (
      currentSideMembers.length < MIN_CURRENT_SIDE_MEMBERS
      || mismatchedMembers.length === 0
    ) continue;
    // Connected targets are more reliable trunk anchors than terminal leaf
    // nodes. A leaf may already use the preferred side only because an earlier
    // route could not yet separate its lateral escape.
    const connectedCurrentMembers = currentSideMembers.filter(member => member.targetDegree > 1);
    const currentBundleMembers = connectedCurrentMembers.length >= MIN_CURRENT_SIDE_MEMBERS
      ? connectedCurrentMembers
      : currentSideMembers;
    const currentBundleIndexes = new Set(currentBundleMembers.map(member => member.edgeIndex));
    const otherMembers = group.filter(member => !currentBundleIndexes.has(member.edgeIndex));
    const currentTargetTangents = currentBundleMembers.map(member => member.targetTangent);
    const minimumCurrentTargetTangent = Math.min(...currentTargetTangents);
    const maximumCurrentTargetTangent = Math.max(...currentTargetTangents);
    const maximumCurrentTargetOutward = Math.max(
      ...currentBundleMembers.map(member => member.targetOutward),
    );
    // A nearby tangent outlier is a genuine side corridor. A substantially
    // farther target in the preferred outward direction is still a trunk
    // member: excluding it would make a long cross-domain branch peel off the
    // wrong side merely because its target is laterally offset.
    const restorableMismatchedMembers = otherMembers.filter(member => {
      const insideTangentEnvelope = (
        member.targetTangent >= minimumCurrentTargetTangent - REMOTE_TANGENT_ENVELOPE_GAP
        && member.targetTangent <= maximumCurrentTargetTangent + REMOTE_TANGENT_ENVELOPE_GAP
      );
      return insideTangentEnvelope
        || member.targetOutward >= maximumCurrentTargetOutward + REMOTE_TANGENT_ENVELOPE_GAP;
    });
    const restorableGroup = [...currentBundleMembers, ...restorableMismatchedMembers];
    if (
      restorableGroup.length < MIN_BUNDLE_MEMBERS
      || restorableMismatchedMembers.length === 0
    ) continue;
    if (restorableGroup.some(({ edge }) => !edgeTerminalHandleChangeIsAllowed(
      edge,
      'source',
      side,
      { allowRuntimeHandleChange: true },
    ))) continue;
    const sourceRect = nodeRect(nodeById.get(sourceId));
    if (!sourceRect) continue;
    const sideCorridorMembers = otherMembers.filter(member => (
      !restorableMismatchedMembers.includes(member)
      && member.targetDegree <= 1
      && (() => {
        const targetRect = nodeRect(nodeById.get(member.edge.target));
        if (!targetRect) return false;
        const corridorSide = dominantSideToward(sourceRect, targetRect);
        return corridorSide !== side && terminalSide(member.edge.sourceHandle) !== corridorSide;
      })()
    ));
    if (sideCorridorMembers.some(({ edge }) => {
      const targetRect = nodeRect(nodeById.get(edge.target));
      return !targetRect || !edgeTerminalHandleChangeIsAllowed(
        edge,
        'source',
        dominantSideToward(sourceRect, targetRect),
        { allowRuntimeHandleChange: true },
      );
    })) continue;
    const terminal = boundaryPoint(
      sourceRect,
      side,
      median(restorableGroup.map(member => member.targetTangent)),
    );
    const candidateEdges = [...edges];
    let invalid = false;

    for (const { edge, edgeIndex } of restorableGroup) {
      const currentStemLength = terminalSide(edge.sourceHandle) === side
        ? existingOutwardStemLength(getEdgePath(edge), side)
        : null;
      const stemLength = Math.min(
        MAX_COMMERCIAL_STEM,
        Math.max(MIN_COMMERCIAL_STEM, currentStemLength ?? MIN_COMMERCIAL_STEM),
      );
      const stem = branchPoint(terminal, side, stemLength);
      const candidatePath = rebuildSourcePrefix(
        getEdgePath(edge),
        terminal,
        stem,
        side,
      );
      if (!candidatePath) {
        invalid = true;
        break;
      }
      const rerouted = withPath(edge, candidatePath, 'source', side);
      candidateEdges[edgeIndex] = {
        ...rerouted,
        data: {
          ...rerouted.data,
          preferredSourceTrunkRestored: true,
          sharedTrunkAware: true,
          sharedTrunkSynthesized: true,
        },
      };
    }
    if (!invalid) {
      for (const { edge, edgeIndex } of sideCorridorMembers) {
        const targetRect = nodeRect(nodeById.get(edge.target));
        if (!targetRect) {
          invalid = true;
          break;
        }
        const corridorSide = dominantSideToward(sourceRect, targetRect);
        const corridorTerminal = boundaryPoint(
          sourceRect,
          corridorSide,
          tangentCoordinate(center(sourceRect), corridorSide),
        );
        const currentPath = getEdgePath(edge);
        const corridorPath = rebuildSourcePrefix(
          currentPath,
          corridorTerminal,
          branchPoint(corridorTerminal, corridorSide, MIN_OUTWARD_SPAN),
          corridorSide,
        );
        if (!corridorPath) {
          invalid = true;
          break;
        }
        const separated = withPath(edge, corridorPath, 'source', corridorSide);
        candidateEdges[edgeIndex] = {
          ...separated,
          data: {
            ...separated.data,
            preferredSourceSideCorridorSeparated: true,
          },
        };
      }
    }
    if (invalid) continue;
    const rawCandidates: Edge[][] = [candidateEdges];
    if (sideCorridorMembers.length > 0) {
      const outerCandidate = [...candidateEdges];
      const obstacles = businessRects(nodes, nodeById);
      let outerInvalid = false;
      for (const { edge, edgeIndex } of sideCorridorMembers) {
        const targetRect = nodeRect(nodeById.get(edge.target));
        if (!targetRect) {
          outerInvalid = true;
          break;
        }
        const corridorSide = dominantSideToward(sourceRect, targetRect);
        const outerPath = buildOuterSideCorridorPath(
          edge,
          sourceRect,
          targetRect,
          corridorSide,
          obstacles,
        );
        if (!outerPath) {
          outerInvalid = true;
          break;
        }
        const separated = withPath(edge, outerPath, 'source', corridorSide);
        outerCandidate[edgeIndex] = {
          ...separated,
          data: {
            ...separated.data,
            preferredSourceSideCorridorSeparated: true,
            preferredSourceSideCorridorOuterRouted: true,
          },
        };
      }
      if (!outerInvalid) rawCandidates.push(outerCandidate);
    }
    const expectedEdgeIds = restorableGroup.map(({ edge }) => edge.id);
    for (const rawCandidateEdges of rawCandidates) {
      const finalizedCandidateEdges = options.finalizeCandidate?.(rawCandidateEdges)
        ?? rawCandidateEdges;
      const finalizedChangedEdgeIndexes = finalizedCandidateEdges.flatMap((edge, edgeIndex) => (
        edge !== edges[edgeIndex] ? [edgeIndex] : []
      ));
      const restoredTrunk = auditFinalSameSideEndpointOrder(finalizedCandidateEdges, nodes)
        .legalSharedTrunks.find(trunk => (
          trunk.nodeId === sourceId
          && trunk.role === 'source'
          && trunk.side === side
          && trunk.commonStemLength + EPS >= MIN_COMMERCIAL_STEM
          && expectedEdgeIds.every(edgeId => trunk.edgeIds.includes(edgeId))
        ));
      if (!restoredTrunk) continue;
      if (options.validateCandidate && !options.validateCandidate({
        baselineEdges: edges,
        candidateEdges: finalizedCandidateEdges,
        changedEdgeIndexes: finalizedChangedEdgeIndexes,
        restoredTrunk,
      })) continue;
      return finalizedCandidateEdges;
    }
  }
  return edges;
};
