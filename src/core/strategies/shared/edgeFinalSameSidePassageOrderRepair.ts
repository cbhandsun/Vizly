import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointTrunkIdentity,
} from './edgeFinalSameSideEndpointOrderRepair';
import {
  acceptFirstRankedPassageCandidate,
  buildRankedNearTrunkCandidates,
} from './edgeFinalSameSidePassageNearTrunkCandidates';
import { createEdgePathQualityEvaluationContext } from './edgeStrictCrossingGuard';
import {
  auditFinalSameSidePassageOrder,
  asRecord,
  buildPassageGroups,
  compareRemote,
  lateralInterval,
  orientedPath,
  stemLength,
  type Leg,
  type LegBlock,
  type LegGroup,
  type SameSidePassageAudit,
} from './edgeFinalSameSidePassageAudit';
export {
  auditFinalSameSidePassageOrder,
  type SameSidePassageAudit,
  type SameSidePassageGroupAudit,
} from './edgeFinalSameSidePassageAudit';
import {
  EPS,
  buildObstacleMap,
  compactPath,
  hardQualityDoesNotRegress,
  totalObstacleHits,
  type Point,
} from './edgeSharedEndpointPortOrderGeometry';

const MIN_TRUE_TRUNK_STEM = 48;
const PASSAGE_LANE_GAP = 24;
const MIN_PARALLEL_CHILD_OVERLAP = 24;
const MIN_OPPOSITE_CHILD_OVERLAP = 8;
const MAX_LOCAL_TRUNK_CANDIDATES = 24;
const MAX_PARALLEL_LANE_ESCAPE_STEPS = 16;
const MAX_PARALLEL_LANE_ESCAPE_CANDIDATES = 96;

export type SameSidePassageCandidateValidation = Readonly<{
  baselineEdges: readonly Edge[];
  candidateEdges: readonly Edge[];
  changedEdgeIndexes: readonly number[];
  baselineAudit: SameSidePassageAudit;
  candidateAudit: SameSidePassageAudit;
}>;

export type SameSidePassageRepairOptions = Readonly<{
  validateCandidate?: (context: SameSidePassageCandidateValidation) => boolean;
}>;

type Candidate = { edges: Edge[]; changedEdgeIndexes: number[] };
type Assignment = {
  block: LegBlock;
  terminalCoordinate?: number;
  branchLaneByEdge?: ReadonlyMap<number, number>;
};

function orderedBlocks(blocks: readonly LegBlock[]): LegBlock[] {
  const result = [...blocks].sort((first, second) => (
    first.terminalCoordinate - second.terminalCoordinate
  ));
  for (let pass = 0; pass < result.length; pass += 1) {
    let changed = false;
    for (let index = 0; index < result.length - 1; index += 1) {
      if (compareRemote(result[index], result[index + 1]) !== 1) continue;
      [result[index], result[index + 1]] = [result[index + 1], result[index]];
      changed = true;
    }
    if (!changed) break;
  }
  return result;
}

function withPath(edge: Edge, path: Point[]): Edge {
  const data = asRecord(edge.data);
  const treeRouting = asRecord(data.treeRouting);
  return {
    ...edge,
    data: {
      ...data,
      computedPath: path,
      ...(Array.isArray(treeRouting.points) ? { treeRouting: { ...treeRouting, points: path } } : {}),
      finalSameSidePassageOrderRepaired: true,
    },
  };
}

function editLeg(
  leg: Leg,
  terminalCoordinate: number | undefined,
  branchLane: number | undefined,
): Point[] | null {
  const ordered = orientedPath(leg.path, leg.role);
  if (ordered.length < 3) return null;
  const branchEnd = leg.branchEnd;
  const branchEndIndex = branchEnd
    ? ordered.findIndex(point => (
      Math.abs(point.x - branchEnd.x) <= EPS && Math.abs(point.y - branchEnd.y) <= EPS
    ))
    : -1;
  if (typeof terminalCoordinate === 'number') {
    if (branchEndIndex < 2) return null;
    if (leg.side === 'top' || leg.side === 'bottom') {
      for (let index = 0; index < branchEndIndex; index += 1) ordered[index].x = terminalCoordinate;
    } else {
      for (let index = 0; index < branchEndIndex; index += 1) ordered[index].y = terminalCoordinate;
    }
  }
  if (typeof branchLane === 'number' && leg.branchEnd) {
    if (branchEndIndex < 2) return null;
    if (leg.side === 'top' || leg.side === 'bottom') {
      ordered[branchEndIndex - 1].y = branchLane;
      ordered[branchEndIndex].y = branchLane;
    } else {
      ordered[branchEndIndex - 1].x = branchLane;
      ordered[branchEndIndex].x = branchLane;
    }
  }
  const compacted = compactPath(ordered);
  return leg.role === 'source' ? compacted : compacted.reverse();
}

function materialize(edges: readonly Edge[], assignments: readonly Assignment[]): Candidate | null {
  const result = [...edges];
  const changed: number[] = [];
  for (const assignment of assignments) {
    for (const leg of assignment.block.legs) {
      const lane = assignment.branchLaneByEdge?.get(leg.edgeIndex);
      const path = editLeg(leg, assignment.terminalCoordinate, lane);
      const edge = result[leg.edgeIndex];
      if (!path || !edge) return null;
      const terminalChanged = typeof assignment.terminalCoordinate === 'number'
        && Math.abs(assignment.terminalCoordinate - leg.terminalCoordinate) > EPS;
      const laneChanged = typeof lane === 'number'
        && (leg.branchLane === null || Math.abs(lane - leg.branchLane) > EPS);
      if (!terminalChanged && !laneChanged) continue;
      result[leg.edgeIndex] = withPath(edge, path);
      changed.push(leg.edgeIndex);
    }
  }
  return changed.length > 0 ? { edges: result, changedEdgeIndexes: [...new Set(changed)] } : null;
}

function buildPassageCandidate(edges: readonly Edge[], group: LegGroup): Candidate | null {
  const blocks = orderedBlocks(group.blocks);
  const movableSingletons = blocks.filter(block => block.movable && block.legs.length === 1);
  const coordinates = movableSingletons.map(block => block.terminalCoordinate).sort((a, b) => a - b);
  const assignments = new Map<LegBlock, Assignment>();
  movableSingletons.forEach((block, index) => {
    assignments.set(block, { block, terminalCoordinate: coordinates[index] });
  });

  for (const direction of [-1, 1] as const) {
    const cohort = blocks.flatMap(block => (
      block.movable
        ? block.legs
          .filter(leg => leg.branchDirection === direction && leg.branchLane !== null)
          .map(leg => ({ block, leg }))
        : []
    ));
    if (cohort.length < 2) continue;
    const orderedCohort = [...cohort].sort((first, second) => (
      first.leg.terminalCoordinate - second.leg.terminalCoordinate
      || first.leg.remoteCoordinate - second.leg.remoteCoordinate
      || first.leg.edgeId.localeCompare(second.leg.edgeId)
    ));
    const firstLeg = orderedCohort[0].leg;
    const currentDistances = cohort.map(({ leg }) => {
      return leg.outwardDirection * ((leg.branchLane ?? leg.terminalNormal) - leg.terminalNormal);
    }).sort((a, b) => b - a);
    const middle = Math.floor(currentDistances.length / 2);
    const centerDistance = currentDistances.length % 2 === 0
      ? (currentDistances[middle - 1] + currentDistances[middle]) / 2
      : currentDistances[middle];
    const centerIndex = (currentDistances.length - 1) / 2;
    const distances = currentDistances.map((_, index) => (
      centerDistance + (centerIndex - index) * PASSAGE_LANE_GAP
    ));
    const minimumDistance = Math.min(...distances);
    if (minimumDistance < MIN_TRUE_TRUNK_STEM) {
      const outwardShift = MIN_TRUE_TRUNK_STEM - minimumDistance;
      for (let index = 0; index < distances.length; index += 1) {
        distances[index] += outwardShift;
      }
    }
    orderedCohort.forEach(({ block, leg }, index) => {
      const lane = leg.terminalNormal + firstLeg.outwardDirection * distances[index];
      const assignment = assignments.get(block) ?? { block };
      const lanes = new Map(assignment.branchLaneByEdge ?? []);
      lanes.set(leg.edgeIndex, lane);
      assignments.set(block, { ...assignment, branchLaneByEdge: lanes });
    });
  }
  for (const block of blocks) {
    if (!block.movable || block.legs.length !== 1) continue;
    const leg = block.legs[0];
    if (leg.branchDirection === 0 || leg.branchLane === null) continue;
    let conflictingLeg: Leg | null = null;
    for (const other of blocks) {
      if (other === block) continue;
      for (const otherLeg of other.legs) {
        if (
          otherLeg.branchDirection !== -leg.branchDirection
          || otherLeg.branchLane === null
          || otherLeg.outwardDirection !== leg.outwardDirection
          || Math.abs(otherLeg.branchLane - leg.branchLane) > EPS
        ) continue;
        const firstInterval = lateralInterval(leg);
        const secondInterval = lateralInterval(otherLeg);
        if (!firstInterval || !secondInterval) continue;
        const overlap = Math.min(firstInterval.maximum, secondInterval.maximum)
          - Math.max(firstInterval.minimum, secondInterval.minimum);
        if (overlap < MIN_OPPOSITE_CHILD_OVERLAP - EPS) continue;
        conflictingLeg = otherLeg;
        break;
      }
      if (conflictingLeg) break;
    }
    if (!conflictingLeg) continue;
    const minimumTangent = group.side === 'top' || group.side === 'bottom'
      ? group.rect.x
      : group.rect.y;
    const maximumTangent = group.side === 'top' || group.side === 'bottom'
      ? group.rect.x + group.rect.width
      : group.rect.y + group.rect.height;
    const escapeCoordinate = Math.max(minimumTangent, Math.min(
      maximumTangent,
      conflictingLeg.terminalCoordinate - conflictingLeg.branchDirection * PASSAGE_LANE_GAP,
    ));
    let finalDistance = leg.outwardDirection * (leg.branchLane - leg.terminalNormal);
    for (const other of blocks) {
      for (const otherLeg of other.legs) {
        if (
          otherLeg === leg
          || otherLeg.branchDirection !== leg.branchDirection
          || otherLeg.branchLane === null
          || otherLeg.outwardDirection !== leg.outwardDirection
        ) continue;
        const otherDistance = otherLeg.outwardDirection
          * (otherLeg.branchLane - otherLeg.terminalNormal);
        finalDistance = escapeCoordinate > otherLeg.terminalCoordinate
          ? Math.min(finalDistance, otherDistance - PASSAGE_LANE_GAP)
          : Math.max(finalDistance, otherDistance + PASSAGE_LANE_GAP);
      }
    }
    if (finalDistance < MIN_TRUE_TRUNK_STEM - EPS) continue;
    const assignment = assignments.get(block) ?? { block };
    const lanes = new Map(assignment.branchLaneByEdge ?? []);
    lanes.set(leg.edgeIndex, leg.terminalNormal + leg.outwardDirection * finalDistance);
    assignments.set(block, {
      ...assignment,
      terminalCoordinate: escapeCoordinate,
      branchLaneByEdge: lanes,
    });
  }
  return materialize(edges, [...assignments.values()]);
}

function parallelChildLaneEscapeLegs(group: LegGroup): Leg[] {
  const result = new Map<number, Leg>();
  for (let firstIndex = 0; firstIndex < group.blocks.length; firstIndex += 1) {
    const first = group.blocks[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < group.blocks.length; secondIndex += 1) {
      const second = group.blocks[secondIndex];
      for (const firstLeg of first.legs) {
        for (const secondLeg of second.legs) {
          if (
            firstLeg.branchDirection === 0
            || firstLeg.branchDirection !== secondLeg.branchDirection
            || firstLeg.outwardDirection !== secondLeg.outwardDirection
            || firstLeg.branchLane === null
            || secondLeg.branchLane === null
            || Math.abs(firstLeg.branchLane - secondLeg.branchLane) > EPS
          ) continue;
          const firstInterval = lateralInterval(firstLeg);
          const secondInterval = lateralInterval(secondLeg);
          if (!firstInterval || !secondInterval) continue;
          const overlap = Math.min(firstInterval.maximum, secondInterval.maximum)
            - Math.max(firstInterval.minimum, secondInterval.minimum);
          if (overlap < MIN_PARALLEL_CHILD_OVERLAP - EPS) continue;
          if (first.movable) result.set(firstLeg.edgeIndex, firstLeg);
          if (second.movable) result.set(secondLeg.edgeIndex, secondLeg);
        }
      }
    }
  }
  return [...result.values()].sort((first, second) => (
    first.terminalCoordinate - second.terminalCoordinate
    || first.remoteCoordinate - second.remoteCoordinate
    || first.edgeId.localeCompare(second.edgeId)
  ));
}

function buildParallelChildLaneEscapeCandidates(
  edges: readonly Edge[],
  group: LegGroup,
): Candidate[] {
  const blockByEdgeIndex = new Map(group.blocks.flatMap(block => (
    block.legs.map(leg => [leg.edgeIndex, block] as const)
  )));
  const candidates: Candidate[] = [];
  for (const leg of parallelChildLaneEscapeLegs(group)) {
    const block = blockByEdgeIndex.get(leg.edgeIndex);
    if (!block || leg.branchLane === null) continue;
    for (let step = 1; step <= MAX_PARALLEL_LANE_ESCAPE_STEPS; step += 1) {
      for (const direction of [leg.outwardDirection, -leg.outwardDirection] as const) {
        const lane = leg.branchLane + direction * step * PASSAGE_LANE_GAP;
        const distance = leg.outwardDirection * (lane - leg.terminalNormal);
        if (distance < MIN_TRUE_TRUNK_STEM - EPS) continue;
        const candidate = materialize(edges, [{
          block,
          branchLaneByEdge: new Map([[leg.edgeIndex, lane]]),
        }]);
        if (candidate) candidates.push(candidate);
        if (candidates.length >= MAX_PARALLEL_LANE_ESCAPE_CANDIDATES) return candidates;
      }
    }
  }
  return candidates;
}

function buildNearTrunkCandidates(
  edges: readonly Edge[],
  nodes: ReactFlowNode[],
  group: LegGroup,
): Candidate[] {
  return buildRankedNearTrunkCandidates(
    group.blocks,
    block => block.movable && block.legs.every(leg => stemLength(leg) >= MIN_TRUE_TRUNK_STEM - EPS),
    (winner, loser) => materialize(edges, [{ block: loser, terminalCoordinate: winner.terminalCoordinate }]),
    (candidate) => auditFinalSameSidePassageOrder(candidate.edges, nodes),
  );
}

function blockChildSignature(block: LegBlock): { leg: Leg; interval: { minimum: number; maximum: number } } | null {
  const leg = block.legs[0];
  const branchLane = leg?.branchLane;
  if (!leg || leg.branchDirection === 0 || branchLane === null || branchLane === undefined) return null;
  const interval = lateralInterval(leg);
  if (!interval) return null;
  if (!block.legs.every(item => (
    item.branchDirection === leg.branchDirection
    && item.branchLane !== null
    && Math.abs(item.branchLane - branchLane) <= EPS
    && stemLength(item) >= MIN_TRUE_TRUNK_STEM - EPS
  ))) return null;
  return { leg, interval };
}

function buildChildOverlapTrunkCandidates(edges: readonly Edge[], group: LegGroup): Candidate[] {
  const candidates: Candidate[] = [];
  for (let firstIndex = 0; firstIndex < group.blocks.length; firstIndex += 1) {
    const first = group.blocks[firstIndex];
    const firstChild = blockChildSignature(first);
    if (!first.movable || !firstChild) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < group.blocks.length; secondIndex += 1) {
      const second = group.blocks[secondIndex];
      const secondChild = blockChildSignature(second);
      if (!second.movable || !secondChild) continue;
      if (
        firstChild.leg.branchDirection !== secondChild.leg.branchDirection
        || firstChild.leg.outwardDirection !== secondChild.leg.outwardDirection
        || Math.abs((firstChild.leg.branchLane ?? 0) - (secondChild.leg.branchLane ?? 0)) > EPS
        || Math.abs(first.terminalCoordinate - second.terminalCoordinate) > PASSAGE_LANE_GAP + EPS
      ) continue;
      const overlap = Math.min(firstChild.interval.maximum, secondChild.interval.maximum)
        - Math.max(firstChild.interval.minimum, secondChild.interval.minimum);
      if (overlap < MIN_TRUE_TRUNK_STEM - EPS) continue;
      const anchorCoordinate = firstChild.leg.branchDirection > 0
        ? Math.min(first.terminalCoordinate, second.terminalCoordinate)
        : Math.max(first.terminalCoordinate, second.terminalCoordinate);
      const moving = Math.abs(first.terminalCoordinate - anchorCoordinate) <= EPS ? second : first;
      const candidate = materialize(edges, [{ block: moving, terminalCoordinate: anchorCoordinate }]);
      if (candidate) candidates.push(candidate);
      if (candidates.length >= MAX_LOCAL_TRUNK_CANDIDATES) return candidates;
    }
  }
  return candidates;
}

function buildOppositeChildTrunkCandidates(edges: readonly Edge[], group: LegGroup): Candidate[] {
  const candidates: Candidate[] = [];
  for (const singleton of group.blocks) {
    if (!singleton.movable || singleton.legs.length !== 1) continue;
    const leg = singleton.legs[0];
    const interval = lateralInterval(leg);
    if (!interval || stemLength(leg) < MIN_TRUE_TRUNK_STEM - EPS) continue;
    for (const trunk of group.blocks) {
      if (trunk === singleton || trunk.legs.length < 2) continue;
      if (Math.abs(singleton.terminalCoordinate - trunk.terminalCoordinate) > PASSAGE_LANE_GAP + EPS) {
        continue;
      }
      for (const trunkLeg of trunk.legs) {
        if (
          trunkLeg.branchDirection !== -leg.branchDirection
          || trunkLeg.branchLane === null
          || leg.branchLane === null
          || Math.abs(trunkLeg.branchLane - leg.branchLane) > EPS
        ) continue;
        const trunkInterval = lateralInterval(trunkLeg);
        if (!trunkInterval) continue;
        const overlap = Math.min(interval.maximum, trunkInterval.maximum)
          - Math.max(interval.minimum, trunkInterval.minimum);
        if (overlap < MIN_OPPOSITE_CHILD_OVERLAP - EPS) continue;
        const candidate = materialize(edges, [{
          block: singleton,
          terminalCoordinate: trunk.terminalCoordinate,
        }]);
        if (!candidate) continue;
        candidates.push(candidate);
        if (candidates.length >= MAX_LOCAL_TRUNK_CANDIDATES) return candidates;
        break;
      }
    }
  }
  return candidates;
}

function preservesTrunks(
  baseline: readonly SameSideEndpointTrunkIdentity[],
  candidate: readonly SameSideEndpointTrunkIdentity[],
): boolean {
  return baseline.every(trunk => candidate.some((retained) => (
    retained.nodeId === trunk.nodeId
    && retained.role === trunk.role
    && retained.side === trunk.side
    && retained.commonStemLength >= trunk.commonStemLength - EPS
    && trunk.edgeIds.every(edgeId => retained.edgeIds.includes(edgeId))
  )));
}

function auditImproves(baseline: SameSidePassageAudit, candidate: SameSidePassageAudit): boolean {
  return candidate.passageDefects < baseline.passageDefects
    || (
      candidate.passageDefects === baseline.passageDefects
      && candidate.nearTrunkOpportunities < baseline.nearTrunkOpportunities
    );
}

function accept(
  current: Edge[],
  candidate: Candidate | null,
  nodes: ReactFlowNode[],
  options: SameSidePassageRepairOptions,
): Edge[] | null {
  if (!candidate) return null;
  const baselineAudit = auditFinalSameSidePassageOrder(current, nodes);
  const candidateAudit = auditFinalSameSidePassageOrder(candidate.edges, nodes);
  if (!auditImproves(baselineAudit, candidateAudit)) return null;
  const baselineTrunks = auditFinalSameSideEndpointOrder(current, nodes).legalSharedTrunks;
  const candidateTrunks = auditFinalSameSideEndpointOrder(candidate.edges, nodes).legalSharedTrunks;
  if (!preservesTrunks(baselineTrunks, candidateTrunks)) return null;
  const quality = createEdgePathQualityEvaluationContext(current);
  const baselineQuality = quality.evaluate(current);
  const candidateQuality = quality.evaluateChanged(candidate.edges, candidate.changedEdgeIndexes);
  if (candidateQuality.strictCrossings > baselineQuality.strictCrossings) return null;
  if (!hardQualityDoesNotRegress(baselineQuality, candidateQuality)) return null;
  const obstacles = buildObstacleMap(nodes);
  if (totalObstacleHits(candidate.edges, obstacles) > totalObstacleHits(current, obstacles)) return null;
  if (options.validateCandidate) {
    try {
      if (!options.validateCandidate({
        baselineEdges: current,
        candidateEdges: candidate.edges,
        changedEdgeIndexes: candidate.changedEdgeIndexes,
        baselineAudit,
        candidateAudit,
      })) return null;
    } catch {
      return null;
    }
  }
  return candidate.edges;
}

export function repairFinalSameSidePassageOrder(
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: SameSidePassageRepairOptions = {},
): Edge[] {
  if (edges.length < 2 || nodes.length === 0) return edges;
  let current = edges;
  const groupKeys = buildPassageGroups(current, nodes).groups.map(group => group.key);
  for (const groupKey of groupKeys) {
    let group = buildPassageGroups(current, nodes).groups.find(item => item.key === groupKey);
    if (!group) continue;
    for (const candidate of buildNearTrunkCandidates(current, nodes, group)) {
      const accepted = accept(current, candidate, nodes, options);
      if (!accepted) continue;
      current = accepted;
      break;
    }
    group = buildPassageGroups(current, nodes).groups.find(item => item.key === groupKey);
    if (!group) continue;
    current = acceptFirstRankedPassageCandidate(buildChildOverlapTrunkCandidates(current, group),
      candidate => auditFinalSameSidePassageOrder(candidate.edges, nodes),
      candidate => accept(current, candidate, nodes, options)) ?? current;
    group = buildPassageGroups(current, nodes).groups.find(item => item.key === groupKey);
    if (!group) continue;
    current = acceptFirstRankedPassageCandidate(buildOppositeChildTrunkCandidates(current, group),
      candidate => auditFinalSameSidePassageOrder(candidate.edges, nodes),
      candidate => accept(current, candidate, nodes, options)) ?? current;
    group = buildPassageGroups(current, nodes).groups.find(item => item.key === groupKey);
    if (!group) continue;
    for (let pass = 0; pass < 4; pass += 1) {
      const accepted = acceptFirstRankedPassageCandidate(
        buildParallelChildLaneEscapeCandidates(current, group),
        candidate => auditFinalSameSidePassageOrder(candidate.edges, nodes),
        candidate => accept(current, candidate, nodes, options),
      );
      if (!accepted) break;
      current = accepted;
      group = buildPassageGroups(current, nodes).groups.find(item => item.key === groupKey);
      if (!group) break;
    }
    if (!group) continue;
    current = accept(current, buildPassageCandidate(current, group), nodes, options) ?? current;
  }
  return current;
}
