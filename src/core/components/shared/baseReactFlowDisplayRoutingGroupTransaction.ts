import type { Edge, Node } from '@xyflow/react';

import { createAtomicRouteTransactionEvaluation } from './baseReactFlowDisplayAtomicTransactionEvaluation';
import { getDisplayComputedPath } from './baseReactFlowDisplayGeometry';
import { repairBoundedHubPortRoleTransaction } from './baseReactFlowDisplayHubPortRoleTransaction';
import {
  buildReservedRoutingGroupCandidates,
  createRoutingGroupContract,
  routingGroupOccupiesReservedLanes,
  routingGroupPreservesAuthoredTerminals,
  routingGroupContractVariants,
  type RoutingGroupContract,
} from './baseReactFlowDisplayRoutingGroupContract';
import { getChangedBaseReactFlowDisplayRoutingIndexes } from './baseReactFlowDisplayRoutingTransaction';
import type { RoutingTopologyPlan } from './baseReactFlowDisplayRoutingTopologyPlan';

export type RoutingGroupTransactionDiagnostics = {
  accepted?: 'reserved-group' | 'hub-roles';
  memberIndexes?: readonly number[];
  reservedGroupIndexes?: readonly number[];
  evaluationCount?: number;
};

export type RoutingGroupTransactionOptions = Readonly<{
  topologyPlan: RoutingTopologyPlan;
  primaryEdgeIndexes: readonly number[];
  /** Borrow the outer transaction's total budget, including exact final acceptance. */
  consumeEvaluation: () => boolean;
  finalCandidateIsAccepted: (edges: Edge[]) => boolean;
  diagnostics?: RoutingGroupTransactionDiagnostics;
}>;

/**
 * One affected endpoint unit chooses ports, reserved lanes and established
 * trunks together. Proposals are private until both the atomic graph gate and
 * the final report accept them. The caller retains its baseline on exhaustion.
 * Reservations constrain the reserved proposal only: an unavailable reservation
 * never makes an existing safe route invalid or grants a partial lane lease.
 */
export const repairDisplayRoutingGroupTransaction = <T extends Edge[]>(
  baseline: T,
  seed: T,
  nodes: Node[],
  options: RoutingGroupTransactionOptions,
): T => {
  const diagnostics = options.diagnostics;
  if (diagnostics) {
    diagnostics.accepted = undefined;
    diagnostics.memberIndexes = [];
    diagnostics.reservedGroupIndexes = [];
    diagnostics.evaluationCount = 0;
  }
  if (baseline.length === 0 || baseline.length > 256 || nodes.length > 256
    || baseline.length !== seed.length || options.primaryEdgeIndexes.length > 2
    || options.primaryEdgeIndexes.length === 0
    || options.primaryEdgeIndexes.some(index => !Number.isSafeInteger(index) || !seed[index])
    || new Set(baseline.map(edge => edge.id)).size !== baseline.length
    || !routingGroupPreservesAuthoredTerminals(baseline, seed)
    || [...baseline, ...seed].some(edge => {
      const path = getDisplayComputedPath(edge);
      return path.length < 2 || path.length > 128
        || path.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y));
    })) return baseline;

  let evaluations = 0;
  // This bound subdivides the existing outer-port budget; it is not added to it.
  const consume = (): boolean => {
    if (evaluations >= 12 || !options.consumeEvaluation()) return false;
    evaluations += 1;
    if (diagnostics) diagnostics.evaluationCount = evaluations;
    return true;
  };
  let atomic: ReturnType<typeof createAtomicRouteTransactionEvaluation<T>> | undefined;
  const accept = (candidate: Edge[], contract?: RoutingGroupContract): boolean => {
    if (!routingGroupPreservesAuthoredTerminals(baseline, candidate)
      || contract && !routingGroupOccupiesReservedLanes(contract, candidate)) return false;
    const changed = getChangedBaseReactFlowDisplayRoutingIndexes(baseline, candidate);
    if (changed.length === 0 || !consume()) return false;
    atomic ??= createAtomicRouteTransactionEvaluation(baseline, nodes);
    const result = atomic.evaluate(candidate as T, changed);
    if (!result.hardQualityDoesNotRegress || !result.obstacleHitsDoNotRegress
      || !result.terminalsAnchored || !result.trunksPreserved || !consume()) return false;
    return options.finalCandidateIsAccepted(candidate);
  };
  const contract = createRoutingGroupContract(options.topologyPlan, seed, options.primaryEdgeIndexes);
  if (contract) {
    for (const variant of routingGroupContractVariants(contract)) {
      for (const proposal of buildReservedRoutingGroupCandidates(seed, variant)) {
        if (!accept(proposal, variant)) continue;
        if (diagnostics) {
          diagnostics.accepted = 'reserved-group';
          diagnostics.memberIndexes = variant.memberIndexes;
          diagnostics.reservedGroupIndexes = variant.groupIndexes;
        }
        return proposal;
      }
    }
  }
  // A primary port move can leave crossings on the other role of the same hub.
  // Search those companions jointly while preserving the baseline's true trunks.
  const hub = repairBoundedHubPortRoleTransaction(seed, nodes, baseline, {
    primaryEdgeIndexes: options.primaryEdgeIndexes,
    maxQualityEvaluations: 8,
    consumeEvaluation: consume,
    candidateIsAccepted: candidate => accept(candidate),
  });
  if (hub !== seed) {
    if (diagnostics) {
      diagnostics.accepted = 'hub-roles';
      diagnostics.memberIndexes = getChangedBaseReactFlowDisplayRoutingIndexes(baseline, hub);
    }
    return hub;
  }
  return baseline;
};
