import type { Edge, Node } from '@xyflow/react';

import { anchorForHandle, getNodeRect, sideForHandle } from './baseReactFlowDisplayEdgeGeometry';
import { displayAxisOf, getDisplayComputedPath, segmentDisplayLength } from './baseReactFlowDisplayGeometry';
import { withDisplayPortBridge } from './baseReactFlowDisplayTerminalPortBridge';
import { displayTerminalSideCanSwitch, type DisplayTerminalSide } from './baseReactFlowDisplayTerminalPolicy';

/** A short arrival can require shortening the opposite shared stem when both
 * terminals are parallel. A free perpendicular port offers a one-bend candidate
 * that retains the remote anchor and extends, rather than shortens, that stem.
 * This only generates candidates; the caller must apply its exact graph gate.
 */
export const buildPerpendicularTerminalStubCandidates = (
  edge: Edge,
  nodes: Node[],
  minimumStub: number,
): Edge[] => {
  const path = getDisplayComputedPath(edge);
  if (path.length !== 4 || !Number.isFinite(minimumStub) || minimumStub <= 0) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const candidates: Edge[] = [];
  for (const role of ['source', 'target'] as const) {
    const oriented = role === 'target' ? path : [...path].reverse();
    if (segmentDisplayLength(oriented[2], oriented[3]) >= minimumStub) continue;
    const remoteAxis = displayAxisOf(oriented[0], oriented[1]);
    if (!remoteAxis || displayAxisOf(oriented[2], oriented[3]) !== remoteAxis) continue;
    const remoteHandle = role === 'target' ? edge.sourceHandle : edge.targetHandle;
    const remoteSide = sideForHandle(remoteHandle);
    const rect = getNodeRect(nodeById.get(edge[role]), nodeById);
    if (!remoteSide || !rect || !Object.values(rect).every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0) continue;
    const sides: DisplayTerminalSide[] = remoteAxis === 'v' ? ['left', 'right'] : ['top', 'bottom'];
    const coordinate = remoteAxis === 'v' ? 'y' : 'x';
    for (const side of sides) {
      if (!displayTerminalSideCanSwitch(edge, role, side)) continue;
      const anchor = anchorForHandle(rect, side);
      if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) continue;
      const start = oriented[0];
      const bend = remoteAxis === 'v' ? { x: start.x, y: anchor.y } : { x: anchor.x, y: start.y };
      const remoteLength = segmentDisplayLength(start, bend);
      if (!Number.isFinite(remoteLength)
        || remoteLength < Math.max(minimumStub, segmentDisplayLength(start, oriented[1]))
        || (bend[coordinate] - start[coordinate]) * (oriented[1][coordinate] - start[coordinate]) <= 0
        || segmentDisplayLength(bend, anchor) < minimumStub) continue;
      const outside = side === 'left' ? bend.x < anchor.x
        : side === 'right' ? bend.x > anchor.x
          : side === 'top' ? bend.y < anchor.y : bend.y > anchor.y;
      if (!outside) continue;
      const nextPath = role === 'target' ? [start, bend, anchor] : [anchor, bend, start];
      candidates.push(withDisplayPortBridge(edge, nextPath,
        role === 'target' ? remoteSide : side,
        role === 'target' ? side : remoteSide));
    }
  }
  return candidates;
};
