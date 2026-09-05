import type { Edge, Node } from '@xyflow/react';
import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { segmentToClearanceRectDistance } from '../../strategies/shared/edgeNodeClearanceGeometry';
import {
  extractDisplaySegments, getDisplayComputedPath, getDisplayNodeRect,
  isDisplayContainerNode, RESIDUAL_PARALLEL_LANE_GAP,
  shiftDisplayInternalSegment, withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

/** Move a skimming lane and its blocking parallel neighbour as one candidate.
 * Endpoints stay fixed; callers must validate the entire graph before publication.
 */
export function* pairedDisplayClearanceCandidates(edges: Edge[], nodes: Node[]): Generator<Edge[]> {
  const clearance = COMMERCIAL_BUSINESS_NODE_CLEARANCE;
  const segments = extractDisplaySegments(edges).filter(segment => (
    segment.segmentIndex > 0
    && segment.segmentIndex < getDisplayComputedPath(edges[segment.edgeIndex]).length - 2
    && !readEdgeTerminalPolicy(edges[segment.edgeIndex], 'source').forbidden
    && !readEdgeTerminalPolicy(edges[segment.edgeIndex], 'target').forbidden
  ));
  const obstacles = nodes.filter(node => !node.hidden && !isDisplayContainerNode(node));
  for (const segment of segments) {
    const edge = edges[segment.edgeIndex];
    const axis = segment.axis === 'v' ? 'x' : 'y';
    const along = axis === 'x' ? 'y' : 'x';
    const oldLane = segment.a[axis];
    for (const node of obstacles) {
      if (node.id === edge.source || node.id === edge.target) continue;
      const rect = getDisplayNodeRect(node);
      if (!rect || segmentToClearanceRectDistance(segment, rect) >= clearance - 0.5) continue;
      const far = rect[axis] + (axis === 'x' ? rect.width : rect.height);
      // Only translate an existing outside lane; node traversal needs a different repair.
      const sign = oldLane <= rect[axis] ? -1 : oldLane >= far ? 1 : 0;
      if (!sign) continue;
      const lane = sign < 0 ? rect[axis] - clearance : far + clearance;
      if (!Number.isFinite(lane) || Math.abs(lane) > 1_000_000) continue;
      for (const peer of segments) {
        if (peer.edgeIndex === segment.edgeIndex || peer.axis !== segment.axis) continue;
        const separation = sign * (peer.a[axis] - oldLane);
        if (separation <= 0.5 || sign * (peer.a[axis] - lane) >= RESIDUAL_PARALLEL_LANE_GAP) continue;
        if (Math.max(Math.min(segment.a[along], segment.b[along]), Math.min(peer.a[along], peer.b[along]))
          >= Math.min(Math.max(segment.a[along], segment.b[along]), Math.max(peer.a[along], peer.b[along]))) continue;
        const peerLane = lane + sign * RESIDUAL_PARALLEL_LANE_GAP;
        if (Math.abs(peerLane) > 1_000_000) continue;
        const moved = shiftDisplayInternalSegment(getDisplayComputedPath(edge), segment.segmentIndex, segment.axis, lane);
        const movedPeer = shiftDisplayInternalSegment(getDisplayComputedPath(edges[peer.edgeIndex]), peer.segmentIndex, peer.axis, peerLane);
        if (!moved || !movedPeer) continue;
        yield edges.map((item, index) => index === segment.edgeIndex
          ? withDisplayComputedPath(item, moved)
          : index === peer.edgeIndex ? withDisplayComputedPath(item, movedPeer) : item);
      }
    }
  }
}
