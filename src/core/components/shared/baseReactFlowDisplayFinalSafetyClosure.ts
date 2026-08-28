import type { Edge, Node } from '@xyflow/react';

import { repairBusinessNodeClearanceRisks } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { repairDisplayMicroArtifacts } from '../../strategies/shared/edgeDisplayMicroCleanup';
import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointTrunkIdentity,
} from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import {
  auditFinalSameSidePassageOrder,
  repairFinalSameSidePassageOrder,
} from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { repairBaseReactFlowFinalEndpointOrder } from './baseReactFlowDisplayFinalEndpointOrder';
import {
  countRenderUnsafeEndpointStubs,
  repairRenderSafeEndpointStubs,
} from './baseReactFlowDisplayEndpointStubRepair';
import { repairFastDisplayHardSafety } from './baseReactFlowFastEdgeSafety';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import type { BaseReactFlowFinalEndpointEvaluation } from './baseReactFlowDisplayFinalEndpointEvaluation';
import { repairFinalResidualStrictCrossings } from './baseReactFlowDisplayStrictResidualRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  buildForwardReverseOuterPairCandidates,
  buildPerpendicularSharedTargetTrunkCandidates,
  buildReversePassageTargetTrunkCandidates,
} from './baseReactFlowDisplayBundleClosureCandidates';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';
import { createBaseReactFlowFinalSafetyNoopCache } from './baseReactFlowDisplayFinalSafetyNoopCache';
import {
  finalSafetyCandidateIsAccepted,
  finalSafetyPreservesInitialTrueTrunks as preservesInitialTrueTrunks,
  sameFinalSafetyEdgeReferences as sameEdgeReferences,
  type BaseReactFlowFinalSafetyCandidateOptions,
} from './baseReactFlowDisplayFinalSafetyEvaluation';
import {
  startBaseReactFlowFinalSafetyRepairStage,
  type BaseReactFlowFinalSafetyRepairPhase,
  type BaseReactFlowFinalSafetyTraceOptions,
} from './baseReactFlowDisplayFinalSafetyTrace';
import { buildTrueTrunkCrossingSkirtCandidates } from './baseReactFlowDisplayTrueTrunkCrossingCandidates';

export { buildTrueTrunkCrossingSkirtCandidates } from './baseReactFlowDisplayTrueTrunkCrossingCandidates';

export type BaseReactFlowFinalSafetyClosureOptions =
  BaseReactFlowFinalSafetyCandidateOptions
  & BaseReactFlowFinalSafetyTraceOptions
  & Readonly<{
  onNoopCacheHit?: () => void;
}>;

const finalSafetyNoopCacheByEvaluation = new WeakMap<
  BaseReactFlowFinalEndpointEvaluation,
  ReturnType<typeof createBaseReactFlowFinalSafetyNoopCache>
>();

const resolveFinalSafetyNoopCache = (
  evaluation?: BaseReactFlowFinalEndpointEvaluation,
): ReturnType<typeof createBaseReactFlowFinalSafetyNoopCache> | null => {
  if (!evaluation) return null;
  const cached = finalSafetyNoopCacheByEvaluation.get(evaluation);
  if (cached) return cached;
  const created = createBaseReactFlowFinalSafetyNoopCache();
  finalSafetyNoopCacheByEvaluation.set(evaluation, created);
  return created;
};

const displayHandleSide = (handle: Edge['sourceHandle']): string => {
  const normalized = String(handle ?? '').trim().toLowerCase();
  for (const side of ['top', 'right', 'bottom', 'left']) {
    if (normalized === side || normalized.endsWith(`-${side}`)) return side;
  }
  return '';
};

const replaceEdgePath = (
  edge: Edge,
  path: ReturnType<typeof getDisplayComputedPath>,
  sourceHandle?: Edge['sourceHandle'],
): Edge => {
  const changed = withDisplayComputedPath(edge, path);
  return sourceHandle === undefined ? changed : { ...changed, sourceHandle };
};

/**
 * Rebuild a crossed one-to-many/many-to-one bundle as one atomic candidate.
 *
 * A through-edge cannot always skirt a source trunk locally: the skirt can be
 * trapped by a sibling target approach farther downstream. For the bounded
 * vertical-flow case, this transaction moves the whole affected bundle:
 * source siblings share one terminal stem, the through-edge uses the outside
 * lane, and every later target sibling joins the earliest protected target
 * trunk. The caller still applies the complete hard/order/trunk gate.
 */
export const buildBidirectionalPortBundleTransactionCandidates = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[][] => {
  const crossingCounts = new Map<number, number>();
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    crossingCounts.set(hit.a.edgeIndex, (crossingCounts.get(hit.a.edgeIndex) ?? 0) + 1);
    crossingCounts.set(hit.b.edgeIndex, (crossingCounts.get(hit.b.edgeIndex) ?? 0) + 1);
  }
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const trueTargetTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks
    .filter(trunk => trunk.role === 'target')
    .sort((first, second) => second.commonStemLength - first.commonStemLength);
  const obstacleRects = nodes.flatMap(node => {
    if (isDisplayContainerNode(node)) return [];
    const rect = getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  if (obstacleRects.length === 0) return [];

  const candidates: Edge[][] = [];
  for (const [movingIndex, crossingCount] of crossingCounts) {
    if (crossingCount < 2 || candidates.length >= 8) continue;
    const moving = edges[movingIndex];
    if (!moving || (eligibleEdgeIds && !eligibleEdgeIds.has(moving.id))) continue;
    if (displayHandleSide(moving.sourceHandle) !== 'bottom'
      || displayHandleSide(moving.targetHandle) !== 'top') continue;
    const sourceNode = nodeById.get(moving.source);
    const targetNode = nodeById.get(moving.target);
    if (!sourceNode || !targetNode) continue;
    const sourceRect = getDisplayNodeRect(sourceNode);
    const targetRect = getDisplayNodeRect(targetNode);
    const movingPath = getDisplayComputedPath(moving);
    if (!sourceRect || !targetRect || movingPath.length < 4) continue;

    const protectedTargetTrunk = trueTargetTrunks.find(trunk => (
      trunk.nodeId === moving.target
      && trunk.edgeIds.includes(moving.id)
      && trunk.edgeIds.length >= 2
    ));
    const targetSibling = protectedTargetTrunk?.edgeIds
      .filter(edgeId => edgeId !== moving.id)
      .map(edgeId => edges.find(edge => edge.id === edgeId))
      .find((edge): edge is Edge => {
        if (!edge || displayHandleSide(edge.targetHandle) !== 'top') return false;
        const path = getDisplayComputedPath(edge);
        return path.length >= 4
          && Math.abs(path[path.length - 1].x - path[path.length - 2].x) <= 0.5
          && Math.abs(path[path.length - 2].y - path[path.length - 3].y) <= 0.5;
      });
    if (!targetSibling) continue;
    const targetSiblingPath = getDisplayComputedPath(targetSibling);
    const targetJoin = targetSiblingPath[targetSiblingPath.length - 2];
    const targetApproach = targetSiblingPath[targetSiblingPath.length - 3];
    const targetEndpoint = targetSiblingPath[targetSiblingPath.length - 1];
    if (targetJoin.y <= sourceRect.y + sourceRect.height + 48) continue;

    const sourceSiblings = edges.flatMap((edge, edgeIndex) => {
      if (
        edgeIndex === movingIndex
        || edge.source !== moving.source
        || displayHandleSide(edge.sourceHandle) !== 'bottom'
      ) return [];
      const path = getDisplayComputedPath(edge);
      if (path.length < 2 || Math.abs(path[0].x - path[1].x) > 0.5) return [];
      return [{ edge, edgeIndex, path }];
    });
    const branchSiblings = sourceSiblings
      .filter(sibling => sibling.path.length >= 4)
      .filter(sibling => Math.abs(sibling.path[1].y - sibling.path[2].y) <= 0.5)
      .sort((first, second) => (
        Math.abs(first.path[1].y - (sourceRect.y + sourceRect.height))
        - Math.abs(second.path[1].y - (sourceRect.y + sourceRect.height))
      ));
    if (branchSiblings.length === 0) continue;
    const sourceEndpoint = {
      x: sourceRect.x + sourceRect.width / 2,
      y: sourceRect.y + sourceRect.height,
    };
    const usedDirections = new Set<number>();
    for (const branchSibling of branchSiblings) {
      if (candidates.length >= 8) break;
      const branchY = branchSibling.path[1].y;
      if (branchY >= targetJoin.y - 48) continue;
      const branchDirection = Math.sign(branchSibling.path[2].x - branchSibling.path[1].x);
      if (branchDirection === 0 || usedDirections.has(branchDirection)) continue;
      usedDirections.add(branchDirection);
      const outsideX = branchDirection < 0
        ? Math.min(...obstacleRects.map(rect => rect.x)) - 12
        : Math.max(...obstacleRects.map(rect => rect.x + rect.width)) + 12;

      const changedIndexes = new Set<number>([movingIndex]);
      const next = edges.slice();
      next[movingIndex] = replaceEdgePath(moving, [
        sourceEndpoint,
        { x: sourceEndpoint.x, y: branchY },
        { x: outsideX, y: branchY },
        { x: outsideX, y: targetJoin.y },
        { x: targetJoin.x, y: targetJoin.y },
        targetEndpoint,
      ], 'bottom');

      for (const sibling of sourceSiblings) {
        const first = sibling.path[0];
        const second = sibling.path[1];
        if (Math.abs(first.y - sourceEndpoint.y) > 0.5) continue;
        const alignedPath = sibling.path.map((point, index) => (
          index <= 1 ? { x: sourceEndpoint.x, y: point.y } : point
        ));
        if (Math.abs(first.x - sourceEndpoint.x) <= 0.5
          && Math.abs(second.x - sourceEndpoint.x) <= 0.5) continue;
        changedIndexes.add(sibling.edgeIndex);
        next[sibling.edgeIndex] = replaceEdgePath(sibling.edge, alignedPath, 'bottom');
      }

      edges.forEach((edge, edgeIndex) => {
        if (
          edgeIndex === movingIndex
          || edge.id === targetSibling.id
          || edge.target !== moving.target
          || displayHandleSide(edge.targetHandle) !== 'top'
        ) return;
        const path = getDisplayComputedPath(edge);
        if (path.length < 4) return;
        const branch = path[path.length - 3];
        const join = path[path.length - 2];
        const endpoint = path[path.length - 1];
        if (
          Math.abs(join.x - targetEndpoint.x) > 0.5
          || Math.abs(endpoint.x - targetEndpoint.x) > 0.5
          || Math.abs(branch.y - join.y) > 0.5
          || branch.y <= targetJoin.y + 0.5
        ) return;
        changedIndexes.add(edgeIndex);
        next[edgeIndex] = replaceEdgePath(edge, [
          ...path.slice(0, -3),
          { x: branch.x, y: targetJoin.y },
          { x: targetApproach.x, y: targetJoin.y },
          targetJoin,
          targetEndpoint,
        ]);
      });

      if (eligibleEdgeIds && [...changedIndexes].some(index => !eligibleEdgeIds.has(edges[index].id))) {
        continue;
      }
      candidates.push(next);
    }
  }
  return candidates;
};

export const buildAlternateSourceCorridorCandidates = (
  edges: Edge[],
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[][] => {
  const crossingCounts = new Map<number, number>();
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    crossingCounts.set(hit.a.edgeIndex, (crossingCounts.get(hit.a.edgeIndex) ?? 0) + 1);
    crossingCounts.set(hit.b.edgeIndex, (crossingCounts.get(hit.b.edgeIndex) ?? 0) + 1);
  }
  const allPoints = edges.flatMap(getDisplayComputedPath);
  const laneGap = 12;
  const candidates: Edge[][] = [];
  for (const [edgeIndex, crossingCount] of crossingCounts) {
    if (crossingCount < 2 || candidates.length >= 32) continue;
    const edge = edges[edgeIndex];
    if (!edge || (eligibleEdgeIds && !eligibleEdgeIds.has(edge.id))) continue;
    const path = getDisplayComputedPath(edge);
    if (path.length < 5) continue;
    const joinIndex = path.length - 3;
    const join = path[joinIndex];
    const suffix = path.slice(joinIndex);
    const laneXs = [...new Set(allPoints.flatMap(point => [
      point.x - laneGap,
      point.x + laneGap,
    ]))]
      .filter(Number.isFinite)
      .sort((first, second) => Math.abs(first - join.x) - Math.abs(second - join.x))
      .slice(0, 24);
    const sourceSiblings = edges.filter(candidate => (
      candidate.id !== edge.id
      && candidate.source === edge.source
      && candidate.sourceHandle !== edge.sourceHandle
      && getDisplayComputedPath(candidate).length >= 3
    ));
    for (const sibling of sourceSiblings) {
      const siblingPath = getDisplayComputedPath(sibling);
      for (const prefixLength of [2, 3]) {
        if (prefixLength > siblingPath.length) continue;
        const prefix = siblingPath.slice(0, prefixLength);
        const branch = prefix[prefix.length - 1];
        for (const laneX of laneXs) {
          if (candidates.length >= 32) break;
          const candidatePath = compactOrthogonalPath([
            ...prefix,
            { x: laneX, y: branch.y },
            { x: laneX, y: join.y },
            ...suffix,
          ]);
          const changed = withDisplayComputedPath(edge, candidatePath);
          candidates.push(edges.map((candidate, index) => (
            index === edgeIndex
              ? { ...changed, sourceHandle: sibling.sourceHandle }
              : candidate
          )));
        }
      }
    }
  }
  return candidates;
};

/**
 * Final fail-closed transaction for the interaction between orthogonality,
 * obstacle avoidance, bidirectional port ordering, and dual-role true trunks.
 *
 * Expensive routing stages may time out after improving only one metric. This
 * bounded closure never commits a partial improvement: the whole rendered
 * graph must pass the hard gate and the final port-order audit in one result.
 */
export const repairBaseReactFlowFinalSafetyClosure = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: BaseReactFlowFinalSafetyClosureOptions = {},
): T => {
  if (edges.length === 0 || nodes.length === 0) return edges;
  const finalSafetyNoopCache = resolveFinalSafetyNoopCache(options.evaluation);
  if (finalSafetyNoopCache?.has(edges, nodes, options.eligibleEdgeIds)) {
    options.onNoopCacheHit?.();
    return edges;
  }
  const rememberNoop = (): T => {
    finalSafetyNoopCache?.remember(edges, nodes, options.eligibleEdgeIds);
    return edges;
  };
  let initialTrueTrunks: readonly SameSideEndpointTrunkIdentity[] | undefined;
  const getInitialTrueTrunks = (): readonly SameSideEndpointTrunkIdentity[] => {
    initialTrueTrunks ??= (
      options.evaluation?.endpointOrder(edges)
      ?? auditFinalSameSideEndpointOrder(edges, nodes)
    ).legalSharedTrunks;
    return initialTrueTrunks;
  };
  const candidateIsAccepted = (candidate: Edge[]): boolean => (
    finalSafetyCandidateIsAccepted(
      edges,
      candidate,
      nodes,
      options,
      getInitialTrueTrunks,
    )
  );
  const startRepairStage = (phase: BaseReactFlowFinalSafetyRepairPhase) => (
    startBaseReactFlowFinalSafetyRepairStage(edges, options, phase)
  );
  const baselineStage = startRepairStage('final-safety-repair-baseline');
  if (candidateIsAccepted(edges)) {
    baselineStage.finish('skip', 1);
    return rememberNoop();
  }

  const baselineReport = options.evaluation?.hardReport(edges)
    ?? getDisplayHardQualityGateReport(edges, nodes, 'polished');
  const baselineEndpointOrder = options.evaluation?.endpointOrder(edges)
    ?? auditFinalSameSideEndpointOrder(edges, nodes);
  const baselinePassageOrder = options.evaluation?.passageOrder(edges)
    ?? auditFinalSameSidePassageOrder(edges, nodes);
  const onlyNearTrunkOpportunityRemains = baselineReport.hardClean
    && countRenderUnsafeEndpointStubs(edges) === 0
    && baselineEndpointOrder.inversions === 0
    && baselineEndpointOrder.ambiguousLaneTies === 0
    && baselineEndpointOrder.collapsedLanePairs === 0
    && baselinePassageOrder.passageDefects === 0
    && baselinePassageOrder.nearTrunkOpportunities > 0;
  if (onlyNearTrunkOpportunityRemains) {
    const nearTrunkCandidate = repairFinalSameSidePassageOrder(edges, nodes, {
      validateCandidate: ({ candidateEdges, changedEdgeIndexes }) => (
        changedEdgeIndexes.every(index => (
          !options.eligibleEdgeIds || options.eligibleEdgeIds.has(candidateEdges[index]?.id ?? '')
        ))
        && (
          options.evaluation?.hardReport(candidateEdges).hardClean
          ?? getDisplayHardQualityGateReport([...candidateEdges], nodes, 'polished').hardClean
        )
      ),
    });
    if (sameEdgeReferences(edges, nearTrunkCandidate)) {
      baselineStage.finish('skip', 2);
      return rememberNoop();
    }
    if (candidateIsAccepted(nearTrunkCandidate)) {
      baselineStage.finish('accepted', 2, nearTrunkCandidate);
      return nearTrunkCandidate as T;
    }
  }
  baselineStage.finish('fallback', onlyNearTrunkOpportunityRemains ? 2 : 1);

  const clearanceStage = startRepairStage('final-safety-repair-clearance');
  // Commercial clearance is closed by the surrounding Worker transaction.
  // Inside the atomic hard-safety fallback this broad candidate generator is
  // useful only when the signed baseline proves an actual node obstacle hit.
  const needsBusinessObstacleRepair = baselineReport.obstacleHits > 0;
  const businessNodeSafe = needsBusinessObstacleRepair
    ? repairBusinessNodeClearanceRisks(edges, nodes)
    : edges;
  if (
    !sameEdgeReferences(edges, businessNodeSafe)
    && candidateIsAccepted(businessNodeSafe)
  ) {
    clearanceStage.finish('accepted', 1, businessNodeSafe);
    return businessNodeSafe as T;
  }
  clearanceStage.finish(
    sameEdgeReferences(edges, businessNodeSafe) ? 'skip' : 'fallback',
    needsBusinessObstacleRepair ? 1 : 0,
    businessNodeSafe,
  );

  const hardStage = startRepairStage('final-safety-repair-hard');
  const hardSafe = repairFastDisplayHardSafety(edges, nodes);
  if (
    !sameEdgeReferences(edges, hardSafe)
    && candidateIsAccepted(hardSafe)
  ) {
    hardStage.finish('accepted', 1, hardSafe);
    return hardSafe as T;
  }
  hardStage.finish(
    sameEdgeReferences(edges, hardSafe) ? 'skip' : 'fallback',
    1,
    hardSafe,
  );
  const hardSafeReport = sameEdgeReferences(edges, hardSafe)
    ? baselineReport
    : options.evaluation?.hardReport(hardSafe)
      ?? getDisplayHardQualityGateReport(hardSafe, nodes, 'polished');

  const trunkStage = startRepairStage('final-safety-repair-trunks');
  let trunkCandidateCount = 0;
  for (const targetTrunk of buildPerpendicularSharedTargetTrunkCandidates(
    hardSafe,
    nodes,
    options.eligibleEdgeIds,
  )) {
    trunkCandidateCount += 1;
    if (candidateIsAccepted(targetTrunk)) {
      trunkStage.finish('accepted', trunkCandidateCount, targetTrunk);
      return targetTrunk as T;
    }
    for (const outerPair of buildForwardReverseOuterPairCandidates(
      targetTrunk,
      nodes,
      options.eligibleEdgeIds,
    )) {
      trunkCandidateCount += 1;
      if (candidateIsAccepted(outerPair)) {
        trunkStage.finish('accepted', trunkCandidateCount, outerPair);
        return outerPair as T;
      }
      const orderedOuterPair = repairBaseReactFlowFinalEndpointOrder(outerPair, nodes, {
        eligibleEdgeIds: options.eligibleEdgeIds,
        evaluation: options.evaluation,
        onPhaseTrace: options.onPhaseTrace,
        traceParentPhase: 'final-safety-repair-order',
      });
      for (const reversePassage of buildReversePassageTargetTrunkCandidates(
        orderedOuterPair,
        nodes,
        options.eligibleEdgeIds,
      )) {
        trunkCandidateCount += 1;
        if (candidateIsAccepted(reversePassage)) {
          trunkStage.finish('accepted', trunkCandidateCount, reversePassage);
          return reversePassage as T;
        }
      }
      const passageClosedOuterPair = repairFinalSameSidePassageOrder(
        orderedOuterPair,
        nodes,
        {
          validateCandidate: ({ candidateEdges }) => getDisplayHardQualityGateReport(
            [...candidateEdges],
            nodes,
            'polished',
          ).hardClean,
        },
      );
      trunkCandidateCount += 1;
      if (candidateIsAccepted(passageClosedOuterPair)) {
        trunkStage.finish('accepted', trunkCandidateCount, passageClosedOuterPair);
        return passageClosedOuterPair as T;
      }
      const safeOrderedOuterPair = repairFastDisplayHardSafety(orderedOuterPair, nodes);
      trunkCandidateCount += 1;
      if (candidateIsAccepted(safeOrderedOuterPair)) {
        trunkStage.finish('accepted', trunkCandidateCount, safeOrderedOuterPair);
        return safeOrderedOuterPair as T;
      }
    }
  }
  trunkStage.finish('skip', trunkCandidateCount);

  const bundleStage = startRepairStage('final-safety-repair-bundles');
  let bundleCandidateCount = 0;
  for (const bundle of buildBidirectionalPortBundleTransactionCandidates(
    hardSafe,
    nodes,
    options.eligibleEdgeIds,
  )) {
    bundleCandidateCount += 1;
    if (candidateIsAccepted(bundle)) {
      bundleStage.finish('accepted', bundleCandidateCount, bundle);
      return bundle as T;
    }
    const strictBundle = repairFinalResidualStrictCrossings(bundle, nodes);
    bundleCandidateCount += 1;
    if (candidateIsAccepted(strictBundle)) {
      bundleStage.finish('accepted', bundleCandidateCount, strictBundle);
      return strictBundle as T;
    }
    const orderedBundle = repairBaseReactFlowFinalEndpointOrder(strictBundle, nodes, {
      eligibleEdgeIds: options.eligibleEdgeIds,
      evaluation: options.evaluation,
      onPhaseTrace: options.onPhaseTrace,
      traceParentPhase: 'final-safety-repair-order',
    });
    const safeOrderedBundle = repairFastDisplayHardSafety(orderedBundle, nodes);
    bundleCandidateCount += 1;
    if (candidateIsAccepted(safeOrderedBundle)) {
      bundleStage.finish('accepted', bundleCandidateCount, safeOrderedBundle);
      return safeOrderedBundle as T;
    }
  }
  bundleStage.finish('skip', bundleCandidateCount);

  const corridorStage = startRepairStage('final-safety-repair-corridors');
  let corridorCandidateCount = 0;
  for (const corridor of buildAlternateSourceCorridorCandidates(
    hardSafe,
    options.eligibleEdgeIds,
  )) {
    corridorCandidateCount += 1;
    const corridorReport = getDisplayHardQualityGateReport(corridor, nodes, 'polished');
    const corridorOrder = corridorReport.hardClean
      ? auditFinalSameSideEndpointOrder(corridor, nodes)
      : null;
    if (
      !corridorReport.hardClean
      || countRenderUnsafeEndpointStubs(corridor) !== 0
      || !corridorOrder
      || !preservesInitialTrueTrunks(
        getInitialTrueTrunks(),
        corridorOrder.legalSharedTrunks,
      )
    ) continue;
    const orderedCorridor = repairBaseReactFlowFinalEndpointOrder(corridor, nodes, {
      eligibleEdgeIds: options.eligibleEdgeIds,
      evaluation: options.evaluation,
      onPhaseTrace: options.onPhaseTrace,
      traceParentPhase: 'final-safety-repair-order',
    });
    const safeOrderedCorridor = repairFastDisplayHardSafety(orderedCorridor, nodes);
    if (candidateIsAccepted(safeOrderedCorridor)) {
      corridorStage.finish('accepted', corridorCandidateCount, safeOrderedCorridor);
      return safeOrderedCorridor as T;
    }
  }
  corridorStage.finish('skip', corridorCandidateCount);

  const skirtStage = startRepairStage('final-safety-repair-skirts');
  let skirtCandidateCount = 0;
  for (const skirt of buildTrueTrunkCrossingSkirtCandidates(hardSafe, nodes, options.eligibleEdgeIds)) {
    skirtCandidateCount += 1;
    const orderedSkirt = repairBaseReactFlowFinalEndpointOrder(skirt, nodes, {
      eligibleEdgeIds: options.eligibleEdgeIds,
      evaluation: options.evaluation,
      onPhaseTrace: options.onPhaseTrace,
      traceParentPhase: 'final-safety-repair-order',
    });
    const safeOrderedSkirt = repairFastDisplayHardSafety(orderedSkirt, nodes);
    if (candidateIsAccepted(safeOrderedSkirt)) {
      skirtStage.finish('accepted', skirtCandidateCount, safeOrderedSkirt);
      return safeOrderedSkirt as T;
    }
  }
  skirtStage.finish('skip', skirtCandidateCount);

  const strictStage = startRepairStage('final-safety-repair-strict');
  const needsStrictRepair = hardSafeReport.quality.strictCrossings > 0;
  const strictCandidateCount = needsStrictRepair ? 1 : 0;
  const strictClosed = needsStrictRepair
    ? repairFinalResidualStrictCrossings(hardSafe, nodes)
    : hardSafe;
  if (
    !sameEdgeReferences(hardSafe, strictClosed)
    && candidateIsAccepted(strictClosed)
  ) {
    strictStage.finish('accepted', strictCandidateCount, strictClosed);
    return strictClosed as T;
  }
  strictStage.finish('skip', strictCandidateCount);

  const microStage = startRepairStage('final-safety-repair-micro');
  const microClosed = repairDisplayMicroArtifacts(strictClosed);
  if (
    !sameEdgeReferences(strictClosed, microClosed)
    && candidateIsAccepted(microClosed)
  ) {
    microStage.finish('accepted', 1, microClosed);
    return microClosed as T;
  }
  microStage.finish(
    sameEdgeReferences(strictClosed, microClosed) ? 'skip' : 'fallback',
    1,
    microClosed,
  );

  const stubStage = startRepairStage('final-safety-repair-stubs');
  const renderSafe = options.evaluation
    ? options.evaluation.repairRenderSafeEndpointStubs(microClosed, 32)
    : repairRenderSafeEndpointStubs(microClosed, nodes, 32);
  if (
    !sameEdgeReferences(microClosed, renderSafe)
    && candidateIsAccepted(renderSafe)
  ) {
    stubStage.finish('accepted', 1, renderSafe);
    return renderSafe as T;
  }
  stubStage.finish(
    sameEdgeReferences(microClosed, renderSafe) ? 'skip' : 'fallback',
    1,
    renderSafe,
  );

  const orderStage = startRepairStage('final-safety-repair-order');
  const ordered = repairBaseReactFlowFinalEndpointOrder(renderSafe, nodes, {
    eligibleEdgeIds: options.eligibleEdgeIds,
    evaluation: options.evaluation,
    onPhaseTrace: options.onPhaseTrace,
    traceParentPhase: 'final-safety-repair-order',
  });
  orderStage.finish(
    sameEdgeReferences(renderSafe, ordered) ? 'skip' : 'accepted',
    1,
    ordered,
  );
  const orderHardStage = startRepairStage('final-safety-repair-order-hard');
  const orderedHardSafe = repairFastDisplayHardSafety(ordered, nodes);
  orderHardStage.finish(
    sameEdgeReferences(ordered, orderedHardSafe) ? 'skip' : 'accepted',
    1,
    orderedHardSafe,
  );
  const orderStrictStage = startRepairStage('final-safety-repair-order-strict');
  const orderedStrictClosed = repairFinalResidualStrictCrossings(orderedHardSafe, nodes);
  orderStrictStage.finish(
    sameEdgeReferences(orderedHardSafe, orderedStrictClosed) ? 'skip' : 'accepted',
    1,
    orderedStrictClosed,
  );
  const orderFinishStage = startRepairStage('final-safety-repair-order-finish');
  const orderedMicroClosed = repairDisplayMicroArtifacts(orderedStrictClosed);
  const orderedRenderSafe = options.evaluation
    ? options.evaluation.repairRenderSafeEndpointStubs(orderedMicroClosed, 32)
    : repairRenderSafeEndpointStubs(orderedMicroClosed, nodes, 32);
  orderFinishStage.finish(
    sameEdgeReferences(orderedStrictClosed, orderedRenderSafe) ? 'skip' : 'accepted',
    1,
    orderedRenderSafe,
  );
  const terminalStage = startRepairStage('final-safety-repair-terminal');
  let terminalCandidateCount = 0;
  const checkedCandidates: Edge[][] = [];
  for (const candidate of [ordered, orderedHardSafe, orderedStrictClosed, orderedRenderSafe]) {
    if (checkedCandidates.some(previous => sameEdgeReferences(previous, candidate))) continue;
    checkedCandidates.push(candidate);
    terminalCandidateCount += 1;
    if (candidateIsAccepted(candidate)) {
      terminalStage.finish('accepted', terminalCandidateCount, candidate);
      return candidate as T;
    }
  }

  terminalStage.finish('fallback', terminalCandidateCount);
  return rememberNoop();
};
