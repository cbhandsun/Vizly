import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { createEdgePathQualityEvaluationContext } from '../../strategies/shared/edgeStrictCrossingGuard';
import { countRoutingObstacleHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  buildDisplayRoutingObstacles,
  candidateStrictCrossingsForEdge,
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
  visualPolishHardQualityDoesNotRegress,
  visualPolishHardQualityWithoutStrictDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import {
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import {
  buildFacingPortPathCandidates,
  buildNearTerminalSideCandidates,
  buildSharedNodeTerminalSideCandidates,
  type SharedNodePortRole,
  type SharedNodePortSide,
} from './baseReactFlowSharedNodePortRoleRepair';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalAxisRepair';

const MIN_ENDPOINT_STUB = 48;
const MAX_PRIMARY_EDGES = 2;
const MAX_HUB_ROLES = 4;
const MAX_SEARCH_DEPTH = 5;
const MAX_BEAM_WIDTH = 6;
const MAX_CANDIDATES_PER_ROLE = 6;
const MAX_QUALITY_EVALUATIONS = 96;
const SIDES: SharedNodePortSide[] = ['top', 'bottom', 'left', 'right'];

export type HubRole = {
  edgeIndex: number;
  nodeId: string;
  role: SharedNodePortRole;
};

type RankedRoleCandidate = {
  edge: Edge;
  obstacleHits: number;
  pathLength: number;
  side: SharedNodePortSide;
  strictCrossings: number;
};

type RoleCandidateBuildResult = {
  candidates: RankedRoleCandidate[];
  generatedBySide: Record<SharedNodePortSide, number>;
  selectedBySide: Record<SharedNodePortSide, number>;
};

type HubBeamState<T extends Edge[]> = {
  edges: T;
  changedIndexes: number[];
  changedRoleKeys: string[];
  obstacleHits: number;
  quality: ReturnType<ReturnType<typeof createEdgePathQualityEvaluationContext>['evaluate']>;
  signature: string;
};

export interface BoundedHubPortRoleTransactionOptions {
  /** Seed edges whose port roles created the small crossing cluster. */
  primaryEdgeIndexes?: readonly number[];
  /** Optional caller-owned object populated without production logging. */
  diagnostics?: BoundedHubPortRoleTransactionDiagnostics;
}

export interface BoundedHubPortRoleTransactionDiagnostics {
  reason?: 'invalid' | 'no-roles' | 'accepted' | 'exhausted';
  primaryEdgeIndexes?: number[];
  roles?: Array<HubRole & {
    candidateCount: number;
    generatedBySide: Record<SharedNodePortSide, number>;
    selectedBySide: Record<SharedNodePortSide, number>;
  }>;
  evaluations?: number;
  pruned?: {
    duplicate: number;
    strict: number;
    hardQuality: number;
    obstacle: number;
  };
  bestPartial?: {
    changedEdgeIndexes: number[];
    obstacleHits: number;
    strictCrossings: number;
    reverseOverlap: number;
    unrelatedOverlap: number;
    unexplainedRelatedOverlap: number;
    shortEndpointStubs: number;
    tinyInteriorDoglegs: number;
    hairpins: number;
    roleSides: Array<HubRole & { side: SharedNodePortSide | null }>;
    remainingStrictCompanionIndexes: number[];
  };
}

const pathSignature = (path: readonly DisplayPoint[]): string => (
  path.map(point => `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}`).join('|')
);

const edgeRoutingSignature = (edge: Edge): string => (
  `${String(edge.sourceHandle)}>${String(edge.targetHandle)}:${pathSignature(getDisplayComputedPath(edge))}`
);

const roleKey = (role: HubRole): string => `${role.edgeIndex}:${role.nodeId}:${role.role}`;

const sharedNodeIds = (first: Edge, second: Edge): string[] => {
  const firstIds = new Set([first.source, first.target]);
  return [...new Set([second.source, second.target].filter(nodeId => firstIds.has(nodeId)))];
};

const parsePrimaryIndexes = (
  seedEdges: Edge[],
  acceptanceEdges: Edge[],
  requested: readonly number[] | undefined,
): number[] => {
  const candidates = requested ?? seedEdges.flatMap((edge, index) => (
    edgeRoutingSignature(edge) === edgeRoutingSignature(acceptanceEdges[index] ?? edge) ? [] : [index]
  ));
  const indexes: number[] = [];
  for (const value of candidates) {
    if (!Number.isInteger(value) || value < 0 || value >= seedEdges.length || indexes.includes(value)) continue;
    indexes.push(value);
    if (indexes.length >= MAX_PRIMARY_EDGES) break;
  }
  return indexes;
};

const discoverHubRoles = (
  edges: Edge[],
  primaryIndexes: readonly number[],
): HubRole[] => {
  const primarySet = new Set(primaryIndexes);
  const roles = new Map<string, HubRole>();
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    for (const companionIndex of [hit.a.edgeIndex, hit.b.edgeIndex]) {
      if (primarySet.has(companionIndex)) continue;
      const companion = edges[companionIndex];
      if (!companion) continue;
      for (const primaryIndex of primaryIndexes) {
        const primary = edges[primaryIndex];
        if (!primary) continue;
        for (const nodeId of sharedNodeIds(companion, primary)) {
          if (companion.source === nodeId) {
            const role = { edgeIndex: companionIndex, nodeId, role: 'source' as const };
            roles.set(roleKey(role), role);
          }
          if (companion.target === nodeId) {
            const role = { edgeIndex: companionIndex, nodeId, role: 'target' as const };
            roles.set(roleKey(role), role);
          }
        }
      }
    }
  }
  return [...roles.values()].slice(0, MAX_HUB_ROLES);
};

const currentPortSide = (edge: Edge, role: SharedNodePortRole): SharedNodePortSide | null => (
  fullDisplayPortSide(normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle)) ?? null
);

const facingPortSides = (
  sourceRect: { x: number; y: number; width: number; height: number },
  targetRect: { x: number; y: number; width: number; height: number },
): readonly [SharedNodePortSide, SharedNodePortSide] => {
  const sourceX = sourceRect.x + sourceRect.width / 2;
  const sourceY = sourceRect.y + sourceRect.height / 2;
  const targetX = targetRect.x + targetRect.width / 2;
  const targetY = targetRect.y + targetRect.height / 2;
  if (Math.abs(targetX - sourceX) >= Math.abs(targetY - sourceY)) {
    return targetX >= sourceX ? ['right', 'left'] : ['left', 'right'];
  }
  return targetY >= sourceY ? ['bottom', 'top'] : ['top', 'bottom'];
};

const candidateConnectorLanes = (
  edges: Edge[],
  primaryIndexes: readonly number[],
  nodeId: string,
  side: SharedNodePortSide,
): number[] => {
  const horizontalTerminal = side === 'left' || side === 'right';
  const lanes: number[] = [];
  for (const primaryIndex of primaryIndexes) {
    const edge = edges[primaryIndex];
    if (!edge || (edge.source !== nodeId && edge.target !== nodeId)) continue;
    for (const point of getDisplayComputedPath(edge)) lanes.push(horizontalTerminal ? point.y : point.x);
  }
  return [...new Set(lanes.filter(Number.isFinite))];
};

const emptySideCounts = (): Record<SharedNodePortSide, number> => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
});

const buildRoleCandidates = (
  edges: Edge[],
  nodesById: Map<string, Node>,
  obstacles: ReturnType<typeof buildDisplayRoutingObstacles>,
  primaryIndexes: readonly number[],
  hubRole: HubRole,
): RoleCandidateBuildResult => {
  const edge = edges[hubRole.edgeIndex];
  const node = nodesById.get(hubRole.nodeId);
  const rect = node ? getDisplayNodeRect(node) : null;
  const sourceNode = edge ? nodesById.get(edge.source) : undefined;
  const targetNode = edge ? nodesById.get(edge.target) : undefined;
  const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
  const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
  const path = edge ? getDisplayComputedPath(edge) : [];
  const sourceSide = edge ? currentPortSide(edge, 'source') : null;
  const targetSide = edge ? currentPortSide(edge, 'target') : null;
  if (!edge || !rect || !sourceRect || !targetRect || path.length < 2 || !sourceSide || !targetSide) {
    return { candidates: [], generatedBySide: emptySideCounts(), selectedBySide: emptySideCounts() };
  }

  const otherSegments = extractDisplaySegments(edges).filter(segment => segment.edgeIndex !== hubRole.edgeIndex);
  const candidates: RankedRoleCandidate[] = [];
  const generatedBySide = emptySideCounts();
  const seen = new Set<string>();
  const currentStrictCrossings = candidateStrictCrossingsForEdge(
    hubRole.edgeIndex,
    path,
    otherSegments,
  );
  const appendCandidate = (
    candidatePath: DisplayPoint[],
    side: SharedNodePortSide,
    candidateSourceSide = hubRole.role === 'source' ? side : sourceSide,
    candidateTargetSide = hubRole.role === 'target' ? side : targetSide,
  ): void => {
    const signature = `${candidateSourceSide}>${candidateTargetSide}:${pathSignature(candidatePath)}`;
    if (seen.has(signature) || signature.endsWith(`:${pathSignature(path)}`)) return;
    seen.add(signature);
    const candidateEdge = withDisplayPortBridge(
      edge,
      candidatePath,
      candidateSourceSide,
      candidateTargetSide,
    );
    candidates.push({
      edge: candidateEdge,
      obstacleHits: countRoutingObstacleHits(candidatePath, candidateEdge, obstacles),
      pathLength: candidatePath.reduce((total, point, index) => {
        if (index === 0) return 0;
        const previous = candidatePath[index - 1];
        return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
      }, 0),
      side,
      strictCrossings: candidateStrictCrossingsForEdge(
        hubRole.edgeIndex,
        candidatePath,
        otherSegments,
      ),
    });
    generatedBySide[side] += 1;
  };
  for (const side of SIDES) {
    if (!displayTerminalSideCanSwitch(edge, hubRole.role, side)) continue;
    const connectorLanes = candidateConnectorLanes(edges, primaryIndexes, hubRole.nodeId, side);
    const candidatePaths = [
      ...buildSharedNodeTerminalSideCandidates(
        path,
        hubRole.role,
        rect,
        side,
        MIN_ENDPOINT_STUB,
        3,
        connectorLanes,
      ),
      ...buildNearTerminalSideCandidates(
        path,
        hubRole.role,
        rect,
        side,
        MIN_ENDPOINT_STUB,
        2,
      ),
    ];
    for (const candidatePath of candidatePaths) appendCandidate(candidatePath, side);

    const localSideCandidates = candidates.filter(candidate => candidate.side === side);
    if (!localSideCandidates.some(candidate => candidate.strictCrossings < currentStrictCrossings)) {
      const facingCandidates = buildFacingPortPathCandidates(
        sourceRect,
        targetRect,
        hubRole.role === 'source' ? side : sourceSide,
        hubRole.role === 'target' ? side : targetSide,
        MIN_ENDPOINT_STUB,
      );
      const rankedFacing = facingCandidates
        .map((candidatePath) => {
          const candidateEdge = withDisplayPortBridge(
            edge,
            candidatePath,
            hubRole.role === 'source' ? side : sourceSide,
            hubRole.role === 'target' ? side : targetSide,
          );
          return {
            candidatePath,
            obstacleHits: countRoutingObstacleHits(candidatePath, candidateEdge, obstacles),
            pathLength: candidatePath.reduce((total, point, index) => {
              if (index === 0) return 0;
              const previous = candidatePath[index - 1];
              return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
            }, 0),
            strictCrossings: candidateStrictCrossingsForEdge(
              hubRole.edgeIndex,
              candidatePath,
              otherSegments,
            ),
          };
        })
        .sort((first, second) => (
          first.strictCrossings - second.strictCrossings
          || first.obstacleHits - second.obstacleHits
          || first.pathLength - second.pathLength
        ));
      if (rankedFacing[0]) appendCandidate(rankedFacing[0].candidatePath, side);

      const singleFacingCandidates = candidates.filter(candidate => candidate.side === side);
      if (!singleFacingCandidates.some(candidate => candidate.strictCrossings < currentStrictCrossings)) {
        const [preferredSourceSide, preferredTargetSide] = facingPortSides(sourceRect, targetRect);
        const otherRole: SharedNodePortRole = hubRole.role === 'source' ? 'target' : 'source';
        const currentOtherSide = hubRole.role === 'source' ? targetSide : sourceSide;
        const preferredOtherSide = hubRole.role === 'source' ? preferredTargetSide : preferredSourceSide;
        if (
          preferredOtherSide !== currentOtherSide
          && displayTerminalSideCanSwitch(edge, otherRole, preferredOtherSide)
        ) {
          const pairedSourceSide = hubRole.role === 'source' ? side : preferredOtherSide;
          const pairedTargetSide = hubRole.role === 'target' ? side : preferredOtherSide;
          const rankedPairedFacing = buildFacingPortPathCandidates(
            sourceRect,
            targetRect,
            pairedSourceSide,
            pairedTargetSide,
            MIN_ENDPOINT_STUB,
          ).map((candidatePath) => {
            const candidateEdge = withDisplayPortBridge(
              edge,
              candidatePath,
              pairedSourceSide,
              pairedTargetSide,
            );
            return {
              candidatePath,
              obstacleHits: countRoutingObstacleHits(candidatePath, candidateEdge, obstacles),
              pathLength: candidatePath.reduce((total, point, index) => {
                if (index === 0) return 0;
                const previous = candidatePath[index - 1];
                return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
              }, 0),
              strictCrossings: candidateStrictCrossingsForEdge(
                hubRole.edgeIndex,
                candidatePath,
                otherSegments,
              ),
            };
          }).sort((first, second) => (
            first.strictCrossings - second.strictCrossings
            || first.obstacleHits - second.obstacleHits
            || first.pathLength - second.pathLength
          ));
          if (rankedPairedFacing[0]) {
            appendCandidate(
              rankedPairedFacing[0].candidatePath,
              side,
              pairedSourceSide,
              pairedTargetSide,
            );
          }
        }
      }
    }
  }
  const rankedBySide = new Map(SIDES.map(side => [
    side,
    candidates.filter(candidate => candidate.side === side).sort((first, second) => (
      first.strictCrossings - second.strictCrossings
      || first.obstacleHits - second.obstacleHits
      || first.pathLength - second.pathLength
    )),
  ] as const));
  const selected = SIDES.flatMap(side => rankedBySide.get(side)?.slice(0, 1) ?? []);
  const selectedSet = new Set(selected);
  const remaining = candidates
    .filter(candidate => !selectedSet.has(candidate))
    .sort((first, second) => (
      first.strictCrossings - second.strictCrossings
      || first.obstacleHits - second.obstacleHits
      || first.pathLength - second.pathLength
    ));
  selected.push(...remaining.slice(0, Math.max(0, MAX_CANDIDATES_PER_ROLE - selected.length)));
  const selectedBySide = emptySideCounts();
  for (const candidate of selected) selectedBySide[candidate.side] += 1;
  return { candidates: selected, generatedBySide, selectedBySide };
};

const stateSignature = (edges: Edge[], changedIndexes: readonly number[]): string => (
  changedIndexes.map(index => `${index}:${edgeRoutingSignature(edges[index])}`).join('||')
);

const compareStates = <T extends Edge[]>(first: HubBeamState<T>, second: HubBeamState<T>): number => (
  first.quality.strictCrossings - second.quality.strictCrossings
  || first.obstacleHits - second.obstacleHits
  || first.changedIndexes.length - second.changedIndexes.length
  || first.quality.bends - second.quality.bends
  || first.quality.totalLength - second.quality.totalLength
);

const selectDiverseStates = <T extends Edge[]>(states: HubBeamState<T>[]): HubBeamState<T>[] => {
  const sorted = [...states].sort(compareStates);
  const selected: HubBeamState<T>[] = [];
  const selectedSet = new Set<HubBeamState<T>>();
  const seenRoleSets = new Set<string>();
  for (const state of sorted) {
    const roleSet = [...new Set(state.changedRoleKeys)].sort().join('|');
    if (seenRoleSets.has(roleSet)) continue;
    seenRoleSets.add(roleSet);
    selected.push(state);
    selectedSet.add(state);
    if (selected.length >= MAX_BEAM_WIDTH) return selected;
  }
  for (const state of sorted) {
    if (selectedSet.has(state)) continue;
    selected.push(state);
    if (selected.length >= MAX_BEAM_WIDTH) break;
  }
  return selected;
};

/**
 * Repairs a small strict-crossing cluster produced by a bounded primary port
 * transaction. Crossing companions are associated with the primary edges by a
 * shared endpoint node; their terminal roles are then searched jointly.
 */
export const repairBoundedHubPortRoleTransaction = <T extends Edge[]>(
  seedEdges: T,
  nodes: Node[],
  acceptanceEdges: T,
  options: BoundedHubPortRoleTransactionOptions = {},
): T => {
  const diagnostics = options.diagnostics;
  const pruned = { duplicate: 0, strict: 0, hardQuality: 0, obstacle: 0 };
  if (diagnostics) {
    diagnostics.reason = undefined;
    diagnostics.primaryEdgeIndexes = [];
    diagnostics.roles = [];
    diagnostics.evaluations = 0;
    diagnostics.pruned = pruned;
    diagnostics.bestPartial = undefined;
  }
  if (seedEdges.length === 0 || seedEdges.length !== acceptanceEdges.length) {
    if (diagnostics) diagnostics.reason = 'invalid';
    return seedEdges;
  }
  const primaryIndexes = parsePrimaryIndexes(seedEdges, acceptanceEdges, options.primaryEdgeIndexes);
  const primaryIndexSet = new Set(primaryIndexes);
  if (diagnostics) diagnostics.primaryEdgeIndexes = [...primaryIndexes];
  if (primaryIndexes.length === 0) {
    if (diagnostics) diagnostics.reason = 'invalid';
    return seedEdges;
  }
  const roles = discoverHubRoles(seedEdges, primaryIndexes);
  if (roles.length === 0) {
    if (diagnostics) diagnostics.reason = 'no-roles';
    return seedEdges;
  }

  const qualityContext = createEdgePathQualityEvaluationContext(seedEdges);
  const obstacleContext = createDisplayObstacleEvaluationContext(seedEdges, nodes);
  const seedQuality = qualityContext.evaluate(seedEdges);
  const seedObstacleHits = obstacleContext.evaluate(seedEdges);
  const acceptanceQuality = qualityContext.evaluate(acceptanceEdges);
  const acceptanceObstacleHits = obstacleContext.evaluate(acceptanceEdges);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  const acceptanceTerminals = getDisplayTerminalValidationReport(acceptanceEdges, terminalSnapshot);
  const acceptanceUnanchoredIndexes = new Set(acceptanceTerminals.unanchoredEdgeIndexes);
  const nodesById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacles = buildDisplayRoutingObstacles(nodes);
  if (diagnostics) {
    diagnostics.roles = roles.map((hubRole) => {
      const result = buildRoleCandidates(seedEdges, nodesById, obstacles, primaryIndexes, hubRole);
      return {
        ...hubRole,
        candidateCount: result.candidates.length,
        generatedBySide: result.generatedBySide,
        selectedBySide: result.selectedBySide,
      };
    });
  }
  if (seedQuality.strictCrossings === 0) {
    if (diagnostics) diagnostics.reason = 'invalid';
    return seedEdges;
  }

  const recordBestPartial = (state: HubBeamState<T>): void => {
    if (!diagnostics) return;
    const prior = diagnostics.bestPartial;
    if (
      prior
      && prior.strictCrossings < state.quality.strictCrossings
      && prior.obstacleHits <= state.obstacleHits
    ) return;
    diagnostics.bestPartial = {
      changedEdgeIndexes: [...state.changedIndexes],
      obstacleHits: state.obstacleHits,
      strictCrossings: state.quality.strictCrossings,
      reverseOverlap: state.quality.reverseOverlap,
      unrelatedOverlap: state.quality.unrelatedOverlap,
      unexplainedRelatedOverlap: state.quality.unexplainedRelatedOverlap,
      shortEndpointStubs: state.quality.shortEndpointStubs,
      tinyInteriorDoglegs: state.quality.tinyInteriorDoglegs,
      hairpins: state.quality.hairpins,
      roleSides: roles.map(hubRole => ({
        ...hubRole,
        side: currentPortSide(state.edges[hubRole.edgeIndex], hubRole.role),
      })),
      remainingStrictCompanionIndexes: [...new Set(
        findDisplayStrictCrossingHits(state.edges).flatMap(hit => (
          [hit.a.edgeIndex, hit.b.edgeIndex].filter(index => !primaryIndexSet.has(index))
        )),
      )].sort((first, second) => first - second),
    };
  };

  const isAccepted = (state: HubBeamState<T>): boolean => {
    if (
      state.quality.strictCrossings !== 0
      || state.quality.reverseOverlap !== 0
      || state.quality.unrelatedOverlap !== 0
      || state.quality.unexplainedRelatedOverlap !== 0
      || state.obstacleHits > acceptanceObstacleHits
      || !visualPolishHardQualityDoesNotRegress(acceptanceQuality, state.quality)
    ) return false;
    const terminals = getDisplayTerminalValidationReport(state.edges, terminalSnapshot);
    return terminals.allAttached
      && terminals.unanchoredEdgeIndexes.every(index => acceptanceUnanchoredIndexes.has(index));
  };

  let beam: HubBeamState<T>[] = [{
    edges: seedEdges,
    changedIndexes: [],
    changedRoleKeys: [],
    obstacleHits: seedObstacleHits,
    quality: seedQuality,
    signature: '',
  }];
  let evaluations = 0;
  recordBestPartial(beam[0]);

  for (let depth = 0; depth < MAX_SEARCH_DEPTH; depth += 1) {
    const nextStates: HubBeamState<T>[] = [];
    const seen = new Set<string>();
    for (const state of beam) {
      const strictEdgeIndexes = new Set(findDisplayStrictCrossingHits(state.edges).flatMap(hit => (
        [hit.a.edgeIndex, hit.b.edgeIndex]
      )));
      const directedRoles = roles
        .filter((hubRole) => {
          const key = roleKey(hubRole);
          const priorChanges = state.changedRoleKeys.filter(changedKey => changedKey === key).length;
          return strictEdgeIndexes.has(hubRole.edgeIndex) && priorChanges < 2;
        })
        .sort((first, second) => {
          const firstKey = roleKey(first);
          const secondKey = roleKey(second);
          const firstChanges = state.changedRoleKeys.filter(key => key === firstKey).length;
          const secondChanges = state.changedRoleKeys.filter(key => key === secondKey).length;
          return firstChanges - secondChanges || first.edgeIndex - second.edgeIndex;
        });
      for (const hubRole of directedRoles) {
        const key = roleKey(hubRole);
        const roleCandidates = buildRoleCandidates(
          state.edges,
          nodesById,
          obstacles,
          primaryIndexes,
          hubRole,
        );
        for (const candidate of roleCandidates.candidates) {
          if (evaluations >= MAX_QUALITY_EVALUATIONS) break;
          evaluations += 1;
          const candidateEdges = state.edges.map((edge, index) => (
            index === hubRole.edgeIndex ? candidate.edge : edge
          )) as T;
          const changedIndexes = [...new Set([...state.changedIndexes, hubRole.edgeIndex])]
            .sort((first, second) => first - second);
          const signature = stateSignature(candidateEdges, changedIndexes);
          if (seen.has(signature)) {
            pruned.duplicate += 1;
            continue;
          }
          seen.add(signature);
          const quality = qualityContext.evaluateChanged(candidateEdges, changedIndexes);
          if (quality.strictCrossings > seedQuality.strictCrossings) {
            pruned.strict += 1;
            continue;
          }
          if (!visualPolishHardQualityWithoutStrictDoesNotRegress(seedQuality, quality)) {
            pruned.hardQuality += 1;
            continue;
          }
          const obstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, changedIndexes);
          if (obstacleHits > seedObstacleHits) {
            pruned.obstacle += 1;
            continue;
          }
          const nextState: HubBeamState<T> = {
            edges: candidateEdges,
            changedIndexes,
            changedRoleKeys: [...state.changedRoleKeys, key],
            obstacleHits,
            quality,
            signature,
          };
          recordBestPartial(nextState);
          if (isAccepted(nextState)) {
            if (diagnostics) {
              diagnostics.reason = 'accepted';
              diagnostics.evaluations = evaluations;
            }
            return candidateEdges;
          }
          nextStates.push(nextState);
        }
        if (evaluations >= MAX_QUALITY_EVALUATIONS) break;
      }
      if (evaluations >= MAX_QUALITY_EVALUATIONS) break;
    }
    if (nextStates.length === 0) break;
    beam = selectDiverseStates(nextStates);
  }
  if (diagnostics) {
    diagnostics.reason = 'exhausted';
    diagnostics.evaluations = evaluations;
  }
  return seedEdges;
};
