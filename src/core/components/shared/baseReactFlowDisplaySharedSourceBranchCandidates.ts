import type { Edge, Node } from '@xyflow/react';

import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  anchorForHandle,
  getNodeRect,
  sideForHandle,
} from './baseReactFlowDisplayEdgeGeometry';
import {
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  displayTerminalSideCanSwitch,
  resolveDisplayTerminalHandleForSide,
} from './baseReactFlowDisplayTerminalPolicy';
import { crossedSpineTerminalStubPoint } from './baseReactFlowDisplayCrossedSpineSkirtGeometry';

const PROJECTION_EPSILON = 0.5;
const MAX_SHARED_SOURCE_BRANCH_CANDIDATES = 24;

const liesWithin = (value: number, first: number, second: number): boolean => (
  value >= Math.min(first, second) - PROJECTION_EPSILON
  && value <= Math.max(first, second) + PROJECTION_EPSILON
);

const projectTargetStubOntoSegment = (
  first: DisplayPoint,
  second: DisplayPoint,
  targetStub: DisplayPoint,
): DisplayPoint | null => {
  if (Math.abs(first.y - second.y) <= PROJECTION_EPSILON) {
    return liesWithin(targetStub.x, first.x, second.x)
      ? { x: targetStub.x, y: first.y }
      : null;
  }
  if (Math.abs(first.x - second.x) <= PROJECTION_EPSILON) {
    return liesWithin(targetStub.y, first.y, second.y)
      ? { x: first.x, y: targetStub.y }
      : null;
  }
  return null;
};

/**
 * Reuses a same-source peer corridor before branching to this edge's target.
 * This closes the common fan-out failure where a short branch cuts across a
 * longer sibling spine. Every returned route still goes through the caller's
 * graph-wide terminal, obstacle, crossing, and true-trunk gates.
 */
export const buildSharedSourcePeerBranchCandidates = (
  edges: Edge[],
  nodes: Node[],
  edgeIndex: number,
): Edge[] => {
  const edge = edges[edgeIndex];
  if (!edge) return [];
  const targetSide = sideForHandle(edge.targetHandle);
  if (!targetSide) return [];

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const targetRect = getNodeRect(nodeById.get(edge.target), nodeById);
  if (!targetRect) return [];
  const targetHandle = resolveDisplayTerminalHandleForSide(edge, 'target', targetSide);
  const targetAnchor = anchorForHandle(targetRect, targetHandle);
  const targetStub = crossedSpineTerminalStubPoint(targetAnchor, targetSide);
  const candidates: Edge[] = [];
  const seen = new Set<string>();

  for (let peerIndex = 0; peerIndex < edges.length; peerIndex += 1) {
    if (peerIndex === edgeIndex) continue;
    const peer = edges[peerIndex];
    if (!peer || peer.source !== edge.source) continue;
    const peerSourceSide = sideForHandle(peer.sourceHandle);
    if (!peerSourceSide || !displayTerminalSideCanSwitch(edge, 'source', peerSourceSide)) continue;
    const peerPath = getDisplayComputedPath(peer);
    if (peerPath.length < 3) continue;
    const sourceHandle = resolveDisplayTerminalHandleForSide(edge, 'source', peerSourceSide);

    for (let segmentIndex = 0; segmentIndex < peerPath.length - 1; segmentIndex += 1) {
      const projection = projectTargetStubOntoSegment(
        peerPath[segmentIndex],
        peerPath[segmentIndex + 1],
        targetStub,
      );
      if (!projection) continue;
      const candidatePath = compactOrthogonalPath([
        ...peerPath.slice(0, segmentIndex + 1),
        projection,
        targetStub,
        targetAnchor,
      ]);
      if (candidatePath.length < 3) continue;
      const key = `${String(sourceHandle)}:${String(targetHandle)}:${candidatePath
        .map(point => `${point.x}:${point.y}`).join('|')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        ...withDisplayComputedPath(edge, candidatePath),
        sourceHandle,
        targetHandle,
      });
      if (candidates.length >= MAX_SHARED_SOURCE_BRANCH_CANDIDATES) return candidates;
    }
  }
  return candidates;
};
