import type { Edge, Node } from '@xyflow/react';

import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  displayAxisOf,
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const OUTER_BRIDGE_CLEARANCE = 48;
const SHARED_TERMINAL_TOLERANCE = 2;

const pointsCoincide = (first: DisplayPoint, second: DisplayPoint): boolean => (
  Math.abs(first.x - second.x) <= SHARED_TERMINAL_TOLERANCE
  && Math.abs(first.y - second.y) <= SHARED_TERMINAL_TOLERANCE
);

/**
 * Builds a planar escape for an incoming edge whose route crosses an outgoing
 * edge from the same node. The source-side prefix is retained (so a real source
 * trunk is not split), while the remote leg travels outside the graph and
 * merges into an existing sibling's target trunk.
 */
export const buildSharedTargetOuterBridgeCandidates = <T extends Edge[]>(
  edges: T,
  incomingSegment: DisplaySegment,
  outgoingSegment: DisplaySegment,
  nodes: Node[],
): T[] => {
  const incomingEdge = edges[incomingSegment.edgeIndex];
  const outgoingEdge = edges[outgoingSegment.edgeIndex];
  if (!incomingEdge || !outgoingEdge || incomingEdge.target !== outgoingEdge.source) return [];

  const incomingPath = getDisplayComputedPath(incomingEdge);
  if (incomingPath.length < 6) return [];
  const sourcePrefix = incomingPath.slice(0, 3).map(point => ({ ...point }));
  const prefixEnd = sourcePrefix[sourcePrefix.length - 1];
  const incomingTerminal = incomingPath[incomingPath.length - 1];
  const incomingTerminalStub = incomingPath[incomingPath.length - 2];
  const terminalAxis = displayAxisOf(incomingTerminalStub, incomingTerminal);
  const prefixExitAxis = displayAxisOf(prefixEnd, incomingPath[3]);
  if (!terminalAxis || !prefixExitAxis || terminalAxis === prefixExitAxis) return [];

  const rects = nodes.flatMap((node) => {
    const rect = getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  if (rects.length === 0) return [];

  const outerCoordinates = terminalAxis === 'v'
    ? [
      Math.min(...rects.map(rect => rect.x)) - OUTER_BRIDGE_CLEARANCE,
      Math.max(...rects.map(rect => rect.x + rect.width)) + OUTER_BRIDGE_CLEARANCE,
    ]
    : [
      Math.min(...rects.map(rect => rect.y)) - OUTER_BRIDGE_CLEARANCE,
      Math.max(...rects.map(rect => rect.y + rect.height)) + OUTER_BRIDGE_CLEARANCE,
    ];

  const siblingEdges = edges.filter((edge, edgeIndex) => (
    edgeIndex !== incomingSegment.edgeIndex
    && edge.target === incomingEdge.target
  )).slice(0, 3);
  const candidates: T[] = [];

  for (const siblingEdge of siblingEdges) {
    const siblingPath = getDisplayComputedPath(siblingEdge);
    if (siblingPath.length < 4) continue;
    const sharedSuffix = siblingPath.slice(-3).map(point => ({ ...point }));
    const sharedStart = sharedSuffix[0];
    const sharedStub = sharedSuffix[1];
    const sharedTerminal = sharedSuffix[2];
    if (!pointsCoincide(incomingTerminal, sharedTerminal)) continue;
    if (displayAxisOf(sharedStub, sharedTerminal) !== terminalAxis) continue;
    if (displayAxisOf(sharedStart, sharedStub) === terminalAxis) continue;

    for (const outerCoordinate of outerCoordinates) {
      const outerAtPrefix = terminalAxis === 'v'
        ? { x: outerCoordinate, y: prefixEnd.y }
        : { x: prefixEnd.x, y: outerCoordinate };
      const outerAtTargetLane = terminalAxis === 'v'
        ? { x: outerCoordinate, y: sharedStart.y }
        : { x: sharedStart.x, y: outerCoordinate };
      const candidatePath = compactOrthogonalPath([
        ...sourcePrefix,
        outerAtPrefix,
        outerAtTargetLane,
        ...sharedSuffix,
      ]);
      if (candidatePath.length < 6) continue;
      const candidateEdge = withDisplayComputedPath(incomingEdge, candidatePath);
      candidates.push(edges.map((edge, edgeIndex) => (
        edgeIndex === incomingSegment.edgeIndex ? candidateEdge : edge
      )) as T);
    }
  }

  return candidates;
};
