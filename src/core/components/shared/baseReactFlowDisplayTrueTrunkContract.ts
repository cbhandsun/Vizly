import type { Edge, Node } from '@xyflow/react';

import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointTrunkIdentity,
} from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';

const sameTrunkIdentity = (
  baseline: SameSideEndpointTrunkIdentity,
  candidate: SameSideEndpointTrunkIdentity,
): boolean => (
  candidate.nodeId === baseline.nodeId
  && candidate.role === baseline.role
  && candidate.side === baseline.side
  && baseline.edgeIds.every(edgeId => candidate.edgeIds.includes(edgeId))
);

const terminalSide = (handle: Edge['sourceHandle']): SameSideEndpointTrunkIdentity['side'] | null => {
  const normalized = String(handle ?? '').trim().toLowerCase();
  if (normalized === 'top' || normalized.endsWith('-top')) return 'top';
  if (normalized === 'right' || normalized.endsWith('-right')) return 'right';
  if (normalized === 'bottom' || normalized.endsWith('-bottom')) return 'bottom';
  if (normalized === 'left' || normalized.endsWith('-left')) return 'left';
  return null;
};

export const preservesInitialTrueTrunks = (
  baseline: readonly SameSideEndpointTrunkIdentity[],
  candidate: readonly SameSideEndpointTrunkIdentity[],
): boolean => baseline.every(trunk => candidate.some(next => (
  sameTrunkIdentity(trunk, next)
  && next.commonStemLength + 1e-6 >= trunk.commonStemLength
)));

/**
 * A trusted authored source bundle may supersede a smaller provisional source
 * trunk on another side of the same endpoint. All target trunks and unrelated
 * source trunks remain strict: this exception cannot erase either role of a
 * dual-trunk edge unless that source role moves into the larger restored bundle.
 */
export const preservesInitialTrueTrunksWithPreferredSourceSupersession = (
  baseline: readonly SameSideEndpointTrunkIdentity[],
  candidate: readonly SameSideEndpointTrunkIdentity[],
  restoredTrunk: SameSideEndpointTrunkIdentity | undefined,
  preferredEdges: readonly Edge[] = [],
  separatedSourceBranchIds: ReadonlySet<string> = new Set(),
): boolean => {
  if (restoredTrunk && (
    restoredTrunk.role !== 'source'
    || restoredTrunk.edgeIds.length < 3
    || restoredTrunk.commonStemLength + 1e-6 < COMMERCIAL_BUSINESS_NODE_CLEARANCE
  )) return false;
  const restoredIds = new Set(restoredTrunk?.edgeIds ?? []);
  const preferredById = new Map(preferredEdges.map(edge => [edge.id, edge] as const));
  return baseline.every(trunk => {
    const preserved = candidate.some(next => (
      sameTrunkIdentity(trunk, next)
      && next.commonStemLength + 1e-6 >= trunk.commonStemLength
    ));
    if (preserved) return true;
    if (
      restoredTrunk
      && trunk.role === 'source'
      && trunk.nodeId === restoredTrunk.nodeId
      && trunk.side !== restoredTrunk.side
      && trunk.edgeIds.length < restoredTrunk.edgeIds.length
      && trunk.edgeIds.some(edgeId => restoredIds.has(edgeId))
    ) return true;
    if (trunk.role === 'source' && separatedSourceBranchIds.size > 0) {
      const retainedIds = trunk.edgeIds.filter(edgeId => !separatedSourceBranchIds.has(edgeId));
      if (
        retainedIds.length > 0
        && candidate.some(next => (
          next.nodeId === trunk.nodeId
          && next.role === 'source'
          && next.side === trunk.side
          && next.edgeIds.length >= 3
          && next.commonStemLength + 1e-6 >= COMMERCIAL_BUSINESS_NODE_CLEARANCE
          && retainedIds.every(edgeId => next.edgeIds.includes(edgeId))
        ))
      ) return true;
    }
    if (trunk.role !== 'source' || preferredById.size === 0) return false;
    const retained = candidate.find(next => (
      next.nodeId === trunk.nodeId
      && next.role === 'source'
      && next.side === trunk.side
      && next.edgeIds.length >= 3
      && next.edgeIds.length < trunk.edgeIds.length
      && next.commonStemLength + 1e-6 >= COMMERCIAL_BUSINESS_NODE_CLEARANCE
      && next.edgeIds.every(edgeId => trunk.edgeIds.includes(edgeId))
    ));
    if (!retained) return false;
    const retainedIds = new Set(retained.edgeIds);
    const removedIds = trunk.edgeIds.filter(edgeId => !retainedIds.has(edgeId));
    return removedIds.length > 0
      && (
        separatedSourceBranchIds.size > 0
        || retained.edgeIds.every(edgeId => (
          terminalSide(preferredById.get(edgeId)?.sourceHandle) === trunk.side
        ))
      )
      && removedIds.every(edgeId => {
        const preferredSide = terminalSide(preferredById.get(edgeId)?.sourceHandle);
        return separatedSourceBranchIds.has(edgeId)
          || (preferredSide !== null && preferredSide !== trunk.side);
      });
  });
};

export const preservesCommercialTrueTrunkMembership = (
  baseline: readonly SameSideEndpointTrunkIdentity[],
  candidate: readonly SameSideEndpointTrunkIdentity[],
): boolean => baseline.every(trunk => candidate.some(next => (
  sameTrunkIdentity(trunk, next)
  && next.commonStemLength + 1e-6 >= COMMERCIAL_BUSINESS_NODE_CLEARANCE
)));

export const preservesInitialTrueTrunksWithinClearanceMargin = (
  baseline: readonly SameSideEndpointTrunkIdentity[],
  candidate: readonly SameSideEndpointTrunkIdentity[],
): boolean => {
  const maximumStemReduction = (
    COMMERCIAL_BUSINESS_NODE_ROUTING_CLEARANCE - COMMERCIAL_BUSINESS_NODE_CLEARANCE
  );
  return baseline.every(trunk => candidate.some(next => (
    sameTrunkIdentity(trunk, next)
    && (
      next.commonStemLength + 1e-6 >= Math.max(
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
        trunk.commonStemLength - maximumStemReduction,
      )
      || (
        next.edgeIds.length > trunk.edgeIds.length
        && next.commonStemLength + 1e-6 >= COMMERCIAL_BUSINESS_NODE_CLEARANCE
      )
    )
  )));
};

export const finalSameSideTrueTrunksDoNotRegress = (
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  nodes: Node[],
): boolean => preservesInitialTrueTrunks(
  auditFinalSameSideEndpointOrder(baselineEdges, nodes).legalSharedTrunks,
  auditFinalSameSideEndpointOrder(candidateEdges, nodes).legalSharedTrunks,
);
