import type { Edge, Node } from '@xyflow/react';
import { isReadableOrthogonalCrossing, READABLE_CROSSING_CLEARANCE } from '../../routing/orthogonalCrossingPolicy';
import { commonDirectedSharedTrunkLength } from '../../rendering/sharedTrunkPaintGeometry';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { findDisplayGeometricCrossingHits, getDisplayComputedPath, withDisplayComputedPath, type DisplayPoint } from './baseReactFlowDisplayGeometry';
import { getExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import { countRenderUnsafeEndpointStubs } from './baseReactFlowDisplayEndpointStubRepair';
import { preservesCommercialTrueTrunkMembership } from './baseReactFlowDisplayTrueTrunkContract';

const distance = (a: DisplayPoint, b: DisplayPoint): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const bounded = (edges: Edge[]): boolean => edges.length > 0 && edges.length <= 256
  && edges.every(edge => {
    const path = getDisplayComputedPath(edge);
    return path.length >= 2 && path.length <= 128
      && path.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)
        && Math.abs(p.x) <= 1_000_000_000 && Math.abs(p.y) <= 1_000_000_000);
  }) && edges.reduce((sum, edge) => sum + getDisplayComputedPath(edge).length, 0) <= 4096;

/** A crossing cannot host both a source fork and a target merge of a third edge. */
export const findDisplayDualTrunkJunctionConflicts = (edges: Edge[]) => {
  const conflicts = new Map<string, { edgeIndex: number; pointIndex: number }>();
  if (!bounded(edges)) return [];
  const paths = edges.map(getDisplayComputedPath);
  const hits = findDisplayGeometricCrossingHits(edges);
  if (hits.length > 4096) return [];
  for (const { a, b } of hits) {
    if (!isReadableOrthogonalCrossing(a, b)) continue;
    const horizontal = a.axis === 'h' ? a : b;
    const vertical = a.axis === 'v' ? a : b;
    const crossing = { x: vertical.a.x, y: horizontal.a.y };
    const first = edges[a.edgeIndex];
    const second = edges[b.edgeIndex];
    paths.forEach((path, edgeIndex) => {
      if (edgeIndex === a.edgeIndex || edgeIndex === b.edgeIndex) return;
      const edge = edges[edgeIndex];
      const sourcePeer = edge.source === first.source && edge.target === second.target ? a.edgeIndex
        : edge.source === second.source && edge.target === first.target ? b.edgeIndex : null;
      if (sourcePeer === null) return;
      const targetPeer = sourcePeer === a.edgeIndex ? b.edgeIndex : a.edgeIndex;
      const sourceLength = commonDirectedSharedTrunkLength(path, paths[sourcePeer]);
      const targetLength = commonDirectedSharedTrunkLength([...path].reverse(), [...paths[targetPeer]].reverse());
      const length = path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
      let fromSource = 0;
      for (let pointIndex = 1; pointIndex < path.length - 1; pointIndex++) {
        fromSource += distance(path[pointIndex - 1], path[pointIndex]);
        if (distance(path[pointIndex], crossing) >= READABLE_CROSSING_CLEARANCE) continue;
        if (sourceLength + 0.5 < fromSource || targetLength + 0.5 < length - fromSource) continue;
        conflicts.set(`${edgeIndex}:${pointIndex}`, { edgeIndex, pointIndex });
      }
    });
  }
  return [...conflicts.values()];
};

// Reserve room for the new middle passage between existing crossing lanes.
// If the target trunk has to move, all of its coincident members move together.
const junctionLaneCandidates = (
  edges: Edge[], edgeIndex: number, pointIndex: number, eligible?: ReadonlySet<string>,
): Edge[][] => {
  const path = getDisplayComputedPath(edges[edgeIndex]);
  const joint = path[pointIndex];
  const previous = path[pointIndex - 1];
  const next = path[pointIndex + 1];
  const normalAxis = Math.abs(joint.y - previous.y) > 0.5 ? 'y' : 'x';
  const tangentAxis = normalAxis === 'y' ? 'x' : 'y';
  const direction = Math.sign(joint[normalAxis] - previous[normalAxis]);
  const shifts = new Set<number>();
  for (const { a, b } of findDisplayGeometricCrossingHits(edges)) {
    const own = a.edgeIndex === edgeIndex ? a : b.edgeIndex === edgeIndex ? b : undefined;
    if (own?.segmentIndex !== pointIndex - 1) continue;
    const other = own === a ? b : a;
    const shift = other.a[normalAxis] + direction * READABLE_CROSSING_CLEARANCE * 2 - joint[normalAxis];
    if (shift * direction > 0.5 && Math.abs(shift) <= READABLE_CROSSING_CLEARANCE) shifts.add(shift);
  }
  const results = [edges];
  const suffixLength = path.slice(pointIndex + 1).reduce((sum, p, i) => sum + distance(path[pointIndex + i], p), 0);
  for (const shift of [...shifts].slice(0, 4)) {
    const candidate = edges.slice();
    let complete = true;
    edges.forEach((edge, index) => {
      if (edge.target !== edges[edgeIndex].target) return;
      const peerPath = getDisplayComputedPath(edge);
      if (commonDirectedSharedTrunkLength([...path].reverse(), [...peerPath].reverse()) + 0.5 < suffixLength) return;
      const moved = peerPath.map(p => ({ ...p }));
      let changed = false;
      for (let p = 0; p < peerPath.length - 1; p++) {
        if (Math.abs(peerPath[p][normalAxis] - joint[normalAxis]) > 0.5
          || Math.abs(peerPath[p + 1][normalAxis] - joint[normalAxis]) > 0.5) continue;
        const overlap = Math.min(Math.max(peerPath[p][tangentAxis], peerPath[p + 1][tangentAxis]), Math.max(joint[tangentAxis], next[tangentAxis]))
          - Math.max(Math.min(peerPath[p][tangentAxis], peerPath[p + 1][tangentAxis]), Math.min(joint[tangentAxis], next[tangentAxis]));
        if (overlap <= 0.5) continue;
        if (p === 0 || p + 1 === peerPath.length - 1 || (eligible && !eligible.has(edge.id))) {
          complete = false;
          continue;
        }
        moved[p][normalAxis] = peerPath[p][normalAxis] + shift;
        moved[p + 1][normalAxis] = peerPath[p + 1][normalAxis] + shift;
        changed = true;
      }
      if (changed) candidate[index] = withDisplayComputedPath(edge, moved);
    });
    if (complete && candidate[edgeIndex] !== edges[edgeIndex]) results.push(candidate);
  }
  return results;
};

/**
 * Give a dual-trunk edge a short exclusive middle passage between its fork and
 * merge. Port coordinates stay fixed; a target trunk can move as a complete
 * group to reserve the required channel. The exact gate
 * preserves both trunk memberships, clearance and render-safe terminal stems.
 */
export const repairDisplayDualTrunkJunctions = (
  edges: Edge[], nodes: Node[], eligibleEdgeIds?: ReadonlySet<string>,
): Edge[] => {
  if (!bounded(edges) || nodes.length === 0 || nodes.length > 256 || eligibleEdgeIds?.size === 0) return edges;
  let current = edges;
  for (let pass = 0; pass < 4; pass++) {
    const conflicts = findDisplayDualTrunkJunctionConflicts(current);
    if (conflicts.length === 0) break;
    const beforeOrder = auditFinalSameSideEndpointOrder(current, nodes);
    let accepted: Edge[] | undefined;
    for (const { edgeIndex, pointIndex } of conflicts.slice(0, 8)) {
      const edge = current[edgeIndex];
      if (eligibleEdgeIds && !eligibleEdgeIds.has(edge.id)) continue;
      for (const laneCandidate of junctionLaneCandidates(current, edgeIndex, pointIndex, eligibleEdgeIds)) {
        const path = getDisplayComputedPath(laneCandidate[edgeIndex]);
        const previous = path[pointIndex - 1];
        const joint = path[pointIndex];
        const next = path[pointIndex + 1];
        if (!previous || !joint || !next) continue;
        const incoming = { x: Math.sign(joint.x - previous.x), y: Math.sign(joint.y - previous.y) };
        const outgoing = { x: Math.sign(next.x - joint.x), y: Math.sign(next.y - joint.y) };
        if (Math.abs(incoming.x) + Math.abs(incoming.y) !== 1
          || Math.abs(outgoing.x) + Math.abs(outgoing.y) !== 1
          || incoming.x * outgoing.x + incoming.y * outgoing.y !== 0) continue;
        for (const gap of [READABLE_CROSSING_CLEARANCE, READABLE_CROSSING_CLEARANCE * 2]) {
          if (distance(previous, joint) <= gap || distance(joint, next) <= gap) continue;
          const first = { x: joint.x - incoming.x * gap, y: joint.y - incoming.y * gap };
          const last = { x: joint.x + outgoing.x * gap, y: joint.y + outgoing.y * gap };
          const middle = { x: first.x + outgoing.x * gap, y: first.y + outgoing.y * gap };
          const candidate = laneCandidate.slice();
          candidate[edgeIndex] = withDisplayComputedPath(edge, [
            ...path.slice(0, pointIndex), first, middle, last, ...path.slice(pointIndex + 1),
          ]);
          if (!getExactDisplayHardReport(candidate, nodes).hardClean
            || countRenderUnsafeEndpointStubs(candidate) > countRenderUnsafeEndpointStubs(current)
            || findDisplayDualTrunkJunctionConflicts(candidate).length >= conflicts.length) continue;
          const afterOrder = auditFinalSameSideEndpointOrder(candidate, nodes);
          if (!preservesCommercialTrueTrunkMembership(beforeOrder.legalSharedTrunks, afterOrder.legalSharedTrunks)
            || afterOrder.inversions > beforeOrder.inversions
            || afterOrder.ambiguousLaneTies > beforeOrder.ambiguousLaneTies) continue;
          accepted = candidate;
          break;
        }
        if (accepted) break;
      }
      if (accepted) break;
    }
    if (!accepted) break;
    current = accepted;
  }
  return current;
};
