import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { displayTerminalSideCanSwitch } from './baseReactFlowDisplayTerminalPolicy';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayStrictCrossesHorizontal,
  extractDisplaySegments,
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';

const SHARED_TARGET_BRIDGE_CLEARANCE = 48;
const SEGMENT_EPSILON = 1;

const sideHandle = (side: 'top' | 'bottom'): 't' | 'b' => (
  side === 'top' ? 't' : 'b'
);

const verticalRange = (segment: DisplaySegment): [number, number] => [
  Math.min(segment.a.y, segment.b.y),
  Math.max(segment.a.y, segment.b.y),
];

const connectedBarrierRange = (
  blockers: DisplaySegment[],
  allSegments: DisplaySegment[],
  edgeIndex: number,
  firstX: number,
  secondX: number,
): [number, number] => {
  let minY = Math.min(...blockers.flatMap(segment => verticalRange(segment)));
  let maxY = Math.max(...blockers.flatMap(segment => verticalRange(segment)));
  const corridorMinX = Math.min(firstX, secondX) + SEGMENT_EPSILON;
  const corridorMaxX = Math.max(firstX, secondX) - SEGMENT_EPSILON;
  const corridorSegments = allSegments.filter(segment => (
    segment.edgeIndex !== edgeIndex
    && segment.axis === 'v'
    && segment.a.x >= corridorMinX
    && segment.a.x <= corridorMaxX
  ));

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const segment of corridorSegments) {
      const [segmentMinY, segmentMaxY] = verticalRange(segment);
      if (
        segmentMinY > maxY + SEGMENT_EPSILON
        || segmentMaxY < minY - SEGMENT_EPSILON
      ) continue;
      const nextMinY = Math.min(minY, segmentMinY);
      const nextMaxY = Math.max(maxY, segmentMaxY);
      if (nextMinY !== minY || nextMaxY !== maxY) {
        minY = nextMinY;
        maxY = nextMaxY;
        expanded = true;
      }
    }
  }
  return [minY, maxY];
};

const obstacleEscapeX = (
  nodes: Node[],
  edge: Edge,
  startX: number,
  endY: number,
  bridgeY: number,
  barrierX: number,
): number => {
  const minY = Math.min(bridgeY, endY);
  const maxY = Math.max(bridgeY, endY);
  const blockers = [...buildDisplayRoutingObstacles(nodes)]
    .filter(([nodeId, rect]) => (
      nodeId !== edge.source
      && nodeId !== edge.target
      && startX > rect.x - SEGMENT_EPSILON
      && startX < rect.x + rect.width + SEGMENT_EPSILON
      && maxY > rect.y + SEGMENT_EPSILON
      && minY < rect.y + rect.height - SEGMENT_EPSILON
    ))
    .map(([, rect]) => rect);
  if (blockers.length === 0) return startX;
  return startX < barrierX
    ? Math.min(...blockers.map(rect => rect.x)) - SHARED_TARGET_BRIDGE_CLEARANCE
    : Math.max(...blockers.map(rect => rect.x + rect.width)) + SHARED_TARGET_BRIDGE_CLEARANCE;
};

/**
 * Moves a final horizontal target approach above or below a crossing spine,
 * then joins an existing vertical same-target trunk. This keeps the target
 * port order planar without replacing a real shared target trunk with an
 * unrelated outer detour.
 */
export const buildSharedTargetCrossingBridgeCandidates = (
  edges: Edge[],
  nodes: Node[],
  edgeIndex: number,
  spine: DisplaySegment,
): Edge[] => {
  const edge = edges[edgeIndex];
  const path = edge ? getDisplayComputedPath(edge) : [];
  if (
    !edge
    || path.length < 4
    || spine.axis !== 'h'
    || spine.segmentIndex !== path.length - 2
    || nodes.every(node => node.id !== edge.target)
  ) return [];

  const allSegments = extractDisplaySegments(edges);
  const blockers = allSegments.filter(segment => (
    segment.edgeIndex !== edgeIndex
    && displayStrictCrossesHorizontal(spine.a, spine.b, segment)
  ));
  if (blockers.length === 0) return [];

  const peers = edges.flatMap((peer, peerIndex) => {
    if (peerIndex === edgeIndex || peer.target !== edge.target) return [];
    const peerPath = getDisplayComputedPath(peer);
    const finalStart = peerPath.at(-2);
    const finalEnd = peerPath.at(-1);
    if (!finalStart || !finalEnd || Math.abs(finalStart.x - finalEnd.x) > 1) return [];
    const approachesDown = finalEnd.y > finalStart.y;
    const targetSide = approachesDown ? 'top' : 'bottom';
    if (
      normalizeHandle(edge.targetHandle) !== sideHandle(targetSide)
      && !displayTerminalSideCanSwitch(edge, 'target', targetSide)
    ) return [];
    return [{ peer, peerPath, finalStart, finalEnd, targetSide }];
  }).sort((first, second) => (
    Math.abs(first.finalEnd.x - spine.b.x) - Math.abs(second.finalEnd.x - spine.b.x)
  ));

  const stablePrefix = path.slice(0, spine.segmentIndex);
  const outerX = spine.a.x;
  const candidates: Edge[] = [];
  const seen = new Set<string>();
  const appendCandidate = (
    peer: typeof peers[number],
    points: DisplayPoint[],
  ) => {
    const candidatePath = compactOrthogonalPath(points);
    if (candidatePath.length < 4) return;
    const key = `${peer.targetSide}:${candidatePath.map(point => `${point.x}:${point.y}`).join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      ...withDisplayComputedPath(edge, candidatePath),
      targetHandle: peer.peer.targetHandle ?? edge.targetHandle,
    });
  };
  for (const peer of peers.slice(0, 4)) {
    const prefixEnd = stablePrefix.at(-1);
    if (prefixEnd) {
      for (let joinIndex = 1; joinIndex < peer.peerPath.length - 1; joinIndex += 1) {
        const join = peer.peerPath[joinIndex];
        if (!join) continue;
        const suffix = peer.peerPath.slice(joinIndex + 1);
        appendCandidate(peer, [
          ...stablePrefix,
          { x: prefixEnd.x, y: join.y },
          { ...join },
          ...suffix,
        ]);
        appendCandidate(peer, [
          ...stablePrefix,
          { x: join.x, y: prefixEnd.y },
          { ...join },
          ...suffix,
        ]);
      }
    }
    const [barrierMinY, barrierMaxY] = connectedBarrierRange(
      blockers,
      allSegments,
      edgeIndex,
      outerX,
      peer.finalEnd.x,
    );
    const bridgeY = peer.finalEnd.y > peer.finalStart.y
      ? barrierMinY - SHARED_TARGET_BRIDGE_CLEARANCE
      : barrierMaxY + SHARED_TARGET_BRIDGE_CLEARANCE;
    const escapeX = obstacleEscapeX(
      nodes,
      edge,
      peer.finalEnd.x,
      peer.finalStart.y,
      bridgeY,
      outerX,
    );
    appendCandidate(peer, [
      ...stablePrefix,
      { x: outerX, y: bridgeY },
      { x: escapeX, y: bridgeY },
      { x: escapeX, y: peer.finalStart.y },
      { ...peer.finalStart },
      { ...peer.finalEnd },
    ]);
  }
  return candidates;
};
