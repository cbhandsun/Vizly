import type { Edge, Node } from '@xyflow/react';

import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointTrunkIdentity,
} from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';
import { MIN_RENDER_SAFE_ENDPOINT_STUB } from './baseReactFlowDisplayEndpointStubRepair';
import { createBaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { passesBaseReactFlowFinalDisplayGate } from './baseReactFlowDisplayFinalEndpointGate';
import {
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';

const MAX_TRUNK_RECONNECT_EVALUATIONS = 16;

const containsTrunk = (
  trunks: readonly SameSideEndpointTrunkIdentity[],
  expected: SameSideEndpointTrunkIdentity,
): boolean => trunks.some(trunk => trunk.nodeId === expected.nodeId
  && trunk.role === expected.role && trunk.side === expected.side
  && expected.edgeIds.every(id => trunk.edgeIds.includes(id)));

const reconnectTrunkMember = (
  baseline: Edge,
  edge: Edge,
  trunk: SameSideEndpointTrunkIdentity,
  rect: DisplayRect,
): Edge | null => {
  if (readEdgeTerminalPolicy(edge, trunk.role).positionFixed
    || baseline.sourceHandle !== edge.sourceHandle
    || baseline.targetHandle !== edge.targetHandle) return null;
  const path = getDisplayComputedPath(baseline).map(point => ({ ...point }));
  if (trunk.role === 'target') path.reverse();
  if (path.length < 3 || path.length > 512
    || !path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  const vertical = trunk.side === 'top' || trunk.side === 'bottom';
  const normal = vertical ? 'y' : 'x';
  const tangent = vertical ? 'x' : 'y';
  const sign = trunk.side === 'bottom' || trunk.side === 'right' ? 1 : -1;
  const boundary = vertical
    ? rect.y + (sign > 0 ? rect.height : 0)
    : rect.x + (sign > 0 ? rect.width : 0);
  const minimum = vertical ? rect.x : rect.y;
  const maximum = minimum + (vertical ? rect.width : rect.height);
  const nextNormal = boundary + sign * Math.max(
    MIN_RENDER_SAFE_ENDPOINT_STUB, (path[1][normal] - boundary) * sign,
  );
  // A one-bend path reaches the remote terminal on its second segment. Do not
  // move that terminal to make room for the relocated shared stem.
  if (path.length === 3 && Math.abs(nextNormal - path[1][normal]) > 0.5) return null;
  path[0][normal] = boundary;
  path[0][tangent] = Math.max(minimum, Math.min(maximum, path[0][tangent]));
  path[1][tangent] = path[0][tangent];
  path[1][normal] = nextNormal;
  if (path.length > 3) path[2][normal] = nextNormal;
  return withDisplayComputedPath(edge, trunk.role === 'source' ? path : path.reverse());
};

/** Restore a moved endpoint's committed trunk as one transaction after the
 * individual reconnect search. Never infer membership from business IDs or
 * newly adjacent paths. The unchanged corridors and exact final gates decide
 * whether the original bundle can still be represented at the new position.
 */
export const restoreBaseReactFlowReconnectTrunks = ({
  baselineEdges, baselineNodes, edges, nodes, changedNodeIds, mutableEdgeIds,
}: {
  baselineEdges: Edge[];
  baselineNodes: Node[];
  edges: Edge[];
  nodes: Node[];
  changedNodeIds: readonly string[];
  mutableEdgeIds: readonly string[];
}): Edge[] => {
  const changed = new Set(changedNodeIds);
  const mutable = new Set(mutableEdgeIds);
  if (changed.size === 0 || mutable.size < 2) return edges;
  const absoluteBaseline = withDisplayAbsolutePositions(
    baselineNodes, new Map(baselineNodes.map(node => [node.id, node])),
  );
  const trunks = auditFinalSameSideEndpointOrder(baselineEdges, absoluteBaseline).legalSharedTrunks;
  if (trunks.length === 0) return edges;
  const byId = new Map(baselineEdges.map(edge => [edge.id, edge]));
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const evaluation = createBaseReactFlowFinalEndpointEvaluation(nodes);
  let best = edges;
  let evaluations = 0;
  for (const trunk of trunks) {
    if (evaluations >= MAX_TRUNK_RECONNECT_EVALUATIONS) break;
    if (!changed.has(trunk.nodeId) || !trunk.edgeIds.every(id => mutable.has(id))) continue;
    const before = evaluation.endpointOrder(best);
    if (containsTrunk(before.legalSharedTrunks, trunk)) continue;
    const node = nodeById.get(trunk.nodeId);
    const rect = node && getDisplayNodeRect(node);
    if (!rect || !Object.values(rect).every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0) continue;
    const members = new Set(trunk.edgeIds);
    let valid = true;
    const candidate = best.map(edge => {
      if (!members.has(edge.id)) return edge;
      const baseline = byId.get(edge.id);
      const replacement = baseline && !changed.has(edge[trunk.role === 'source' ? 'target' : 'source'])
        ? reconnectTrunkMember(baseline, edge, trunk, rect) : null;
      if (!replacement) valid = false;
      return replacement ?? edge;
    });
    if (!valid) continue;
    evaluations += 1;
    const indexes = candidate.flatMap((edge, index) => edge === best[index] ? [] : [index]);
    const order = evaluation.endpointOrder(candidate);
    if (!containsTrunk(order.legalSharedTrunks, trunk)
      || order.inversions > before.inversions
      || order.ambiguousLaneTies > before.ambiguousLaneTies
      || order.collapsedLanePairs > before.collapsedLanePairs
      || !evaluation.hardReport(candidate).hardClean
      || !passesBaseReactFlowFinalDisplayGate(best, candidate, indexes, { eligibleEdgeIds: mutable }, evaluation)
      || evaluation.passageOrder(candidate).passageDefects > evaluation.passageOrder(best).passageDefects
      || indexes.some(index => scoreNodeClearanceRisk(
        getDisplayComputedPath(candidate[index]), nodes, candidate[index], COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ) > scoreNodeClearanceRisk(
        getDisplayComputedPath(best[index]), nodes, best[index], COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      ))) continue;
    best = candidate;
  }
  return best;
};
