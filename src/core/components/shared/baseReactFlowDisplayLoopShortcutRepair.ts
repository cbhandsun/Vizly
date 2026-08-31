import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { edgeTerminalPositionIsFixed } from '../../routing/utils/edgeTerminalPolicy';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  calculateEdgePathQualityScore,
  createEdgePathQualityEvaluationContext,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import { buildStrictLoopShortcutCandidates } from './baseReactFlowDisplayStrictLoopShortcutCandidates';
import {
  buildFacingPortPathCandidates,
  buildNearTerminalSideCandidates,
  buildSharedNodeTerminalSideCandidates,
} from './baseReactFlowSharedNodePortRoleRepair';
import {
  countDisplayObstacleHits,
  createDisplayObstacleEvaluationContext,
} from './baseReactFlowDisplayEvaluation';
import { buildObstacleSkirtCandidates } from './baseReactFlowDisplayObstacleCandidates';
import {
  buildDisplayRoutingObstacles,
  collectPathHitObstacleRects,
  displayEdgesRelated,
  displayPathLength,
  displaySegmentOverlap,
  extractDisplaySegments,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import {
  createDisplayTerminalValidationSnapshot,
  getDisplayTerminalValidationReport,
} from './baseReactFlowTerminalAxisRepair';
import {
  buildBlockingEdgeLaneNudgeVariants,
  buildLoopLaneNudgeVariants,
  buildStrictBlockingTerminalLaneShiftVariants,
} from './baseReactFlowDisplayLoopShortcutCandidates';
import {
  hardLoopDefectsDoNotRegress,
  hasCommerciallyExcessiveDetour,
  loopDefectScore,
  type DisplayLoopShortcutRepairDiagnostics,
} from './baseReactFlowDisplayLoopShortcutQuality';

export { buildStrictBlockingTerminalLaneShiftVariants } from './baseReactFlowDisplayLoopShortcutCandidates';
export {
  createDisplayLoopShortcutRepairDiagnostics,
} from './baseReactFlowDisplayLoopShortcutQuality';
export type {
  DisplayLoopShortcutRepairDiagnostics,
} from './baseReactFlowDisplayLoopShortcutQuality';

export const buildTerminalPreservingDirectShortcutCandidates = (
  path: DisplayPoint[],
): DisplayPoint[][] => {
  if (path.length < 5) return [];
  const source = path[0];
  const sourceStubEnd = path[1];
  const targetStubStart = path[path.length - 2];
  const target = path[path.length - 1];
  const candidates = [
    compactOrthogonalPath([
      source,
      sourceStubEnd,
      { x: targetStubStart.x, y: sourceStubEnd.y },
      targetStubStart,
      target,
    ]),
    compactOrthogonalPath([
      source,
      sourceStubEnd,
      { x: sourceStubEnd.x, y: targetStubStart.y },
      targetStubStart,
      target,
    ]),
  ];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const signature = candidate.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return candidate.length >= 2;
  });
};

const buildTerminalPreservingObstacleShortcutSeeds = (
  path: DisplayPoint[],
): DisplayPoint[][] => {
  if (path.length < 5) return [];
  const source = path[0];
  const sourceStubEnd = path[1];
  const targetStubStart = path[path.length - 2];
  const target = path[path.length - 1];
  return [
    [
      source,
      sourceStubEnd,
      { x: targetStubStart.x, y: sourceStubEnd.y },
      targetStubStart,
      target,
    ],
    [
      source,
      sourceStubEnd,
      { x: sourceStubEnd.x, y: targetStubStart.y },
      targetStubStart,
      target,
    ],
  ];
};

const dedupeDisplayPaths = (paths: DisplayPoint[][]): DisplayPoint[][] => {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const signature = path.map(point => `${point.x}:${point.y}`).join('|');
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
};

const preservesLoopShortcutTrueTrunks = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
  nodes: Node[],
  allowCommercialStemReduction = false,
): boolean => {
  const before = auditFinalSameSideEndpointOrder(baseline, nodes).legalSharedTrunks;
  const after = auditFinalSameSideEndpointOrder(candidate, nodes).legalSharedTrunks;
  return before.every(trunk => after.some(next => (
    next.nodeId === trunk.nodeId
    && next.role === trunk.role
    && next.side === trunk.side
    && trunk.edgeIds.every(edgeId => next.edgeIds.includes(edgeId))
    && next.commonStemLength + 1e-6 >= (
      allowCommercialStemReduction ? 48 : trunk.commonStemLength
    )
  )));
};

const preservesLoopShortcutFixedTerminals = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
): boolean => {
  const byId = new Map(candidate.map(edge => [edge.id, edge] as const));
  const samePoint = (first: DisplayPoint | undefined, second: DisplayPoint | undefined): boolean => (
    Boolean(first && second)
    && Math.abs(first!.x - second!.x) <= 0.5
    && Math.abs(first!.y - second!.y) <= 0.5
  );
  return baseline.every((edge, index) => {
    const next = candidate[index]?.id === edge.id ? candidate[index] : byId.get(edge.id);
    if (!next) return false;
    const beforePath = getDisplayComputedPath(edge);
    const afterPath = getDisplayComputedPath(next);
    return (!edgeTerminalPositionIsFixed(edge, 'source') || (
      samePoint(beforePath[0], afterPath[0])
      && Object.is(edge.sourceHandle, next.sourceHandle)
    )) && (!edgeTerminalPositionIsFixed(edge, 'target') || (
      samePoint(beforePath.at(-1), afterPath.at(-1))
      && Object.is(edge.targetHandle, next.targetHandle)
    ));
  });
};

/**
 * Removes a bounded interior loop before the more expensive residual searches.
 * Endpoint stubs are structurally preserved by the candidate builder; the
 * transaction is still accepted only after exact whole-graph quality,
 * obstacle, and terminal validation.
 */
export const repairDisplayLoopShortcuts = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 32,
  closeStrictCandidate?: (candidate: T) => T,
  diagnostics?: DisplayLoopShortcutRepairDiagnostics,
): T => {
  if (diagnostics) {
    diagnostics.candidateEdgeCount = 0;
    diagnostics.qualityEvaluationCount = 0;
  }
  if (maxQualityEvaluations <= 0 || edges.length === 0) return edges;
  const qualityContext = createEdgePathQualityEvaluationContext(edges);
  const obstacleContext = createDisplayObstacleEvaluationContext(edges, nodes);
  const terminalSnapshot = createDisplayTerminalValidationSnapshot(nodes);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const baselineQuality = qualityContext.evaluate(edges);
  if (diagnostics) diagnostics.qualityEvaluationCount += 1;
  const hasExcessiveDetour = hasCommerciallyExcessiveDetour(edges);
  const detourPolishMode = hasExcessiveDetour
    && baselineQuality.nonOrthogonalSegments === 0
    && baselineQuality.strictCrossings === 0
    && baselineQuality.reverseOverlap === 0
    && baselineQuality.unrelatedOverlap === 0
    && baselineQuality.unexplainedRelatedOverlap === 0
    && baselineQuality.shortEndpointStubs === 0
    && baselineQuality.tinyInteriorDoglegs === 0
    && baselineQuality.hairpins === 0;
  if (
    baselineQuality.hairpins === 0
    && baselineQuality.reverseOverlap === 0
    && baselineQuality.unrelatedOverlap === 0
    && baselineQuality.unexplainedRelatedOverlap === 0
    && baselineQuality.strictCrossings === 0
    && !hasExcessiveDetour
  ) return edges;

  const baselineObstacleHits = obstacleContext.evaluate(edges);
  const baselineExactObstacleHits = countDisplayObstacleHits(edges, nodes);
  const baselineTerminalReport = getDisplayTerminalValidationReport(edges, terminalSnapshot);
  const overlapHitsByEdge = new Map<number, number>();
  const graphSegments = extractDisplaySegments(edges);
  for (let firstIndex = 0; firstIndex < graphSegments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < graphSegments.length; secondIndex += 1) {
      const first = graphSegments[firstIndex];
      const second = graphSegments[secondIndex];
      if (first.edgeIndex === second.edgeIndex || first.axis !== second.axis) continue;
      const oppositeDirection = first.direction !== 0
        && second.direction !== 0
        && first.direction === -second.direction;
      if (!oppositeDirection && displayEdgesRelated(edges[first.edgeIndex], edges[second.edgeIndex])) {
        continue;
      }
      if (displaySegmentOverlap(first, second) < 16) continue;
      overlapHitsByEdge.set(first.edgeIndex, (overlapHitsByEdge.get(first.edgeIndex) ?? 0) + 1);
      overlapHitsByEdge.set(second.edgeIndex, (overlapHitsByEdge.get(second.edgeIndex) ?? 0) + 1);
    }
  }
  const rankedEdgeIndexes = edges
    .map((edge, edgeIndex) => {
      const path = getDisplayComputedPath(edge);
      if (path.length < 5) return null;
      const first = path[0];
      const last = path[path.length - 1];
      const manhattan = Math.abs(last.x - first.x) + Math.abs(last.y - first.y);
      return {
        edgeIndex,
        hairpins: calculateEdgePathQualityScore([edge]).hairpins,
        overlapHits: overlapHitsByEdge.get(edgeIndex) ?? 0,
        pointCount: path.length,
        excessLength: displayPathLength(path) - manhattan,
      };
    })
    .filter((entry): entry is {
      edgeIndex: number;
      hairpins: number;
      overlapHits: number;
      pointCount: number;
      excessLength: number;
    } => Boolean(entry))
    .sort((first, second) => (
      second.hairpins - first.hairpins
      || second.overlapHits - first.overlapHits
      || second.excessLength - first.excessLength
      || second.pointCount - first.pointCount
      || first.edgeIndex - second.edgeIndex
    ));
  if (diagnostics) diagnostics.candidateEdgeCount = rankedEdgeIndexes.length;

  let best = edges;
  let bestQuality = baselineQuality;
  let bestScore = loopDefectScore(baselineQuality, edges);
  let evaluations = 0;
  let strictClosureEvaluations = 0;
  const collectChangedIndexes = (candidate: T, requestedIndexes: number[]): number[] => (
    [...new Set([
      ...requestedIndexes,
      ...candidate.flatMap((candidateEdge, index) => (
        candidateEdge !== edges[index] ? [index] : []
      )),
    ])]
  );
  const considerCandidate = (candidate: T, changedIndexes: number[]): boolean => {
    if (evaluations >= maxQualityEvaluations) return false;
    evaluations += 1;
    if (diagnostics) diagnostics.qualityEvaluationCount += 1;
    const allChangedIndexes = collectChangedIndexes(candidate, changedIndexes);
    const candidateQuality = qualityContext.evaluateChanged(candidate, allChangedIndexes);
    if (!hardLoopDefectsDoNotRegress(baselineQuality, candidateQuality)) return false;
    const candidateScore = loopDefectScore(candidateQuality, candidate);
    if (candidateScore >= bestScore) return false;
    if (
      !preservesLoopShortcutTrueTrunks(edges, candidate, nodes, detourPolishMode)
      || !preservesLoopShortcutFixedTerminals(edges, candidate)
    ) return false;
    if (obstacleContext.evaluateKnownChanges(candidate, allChangedIndexes) > baselineObstacleHits) return false;
    if (countDisplayObstacleHits(candidate, nodes) > baselineExactObstacleHits) return false;
    const candidateTerminalReport = getDisplayTerminalValidationReport(candidate, terminalSnapshot);
    if (
      candidateTerminalReport.allAttached !== baselineTerminalReport.allAttached
      || candidateTerminalReport.allAnchored !== baselineTerminalReport.allAnchored
    ) return false;
    if (allChangedIndexes.some((index) => {
      const edge = candidate[index];
      if (!edge) return true;
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
      const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
      if (!sourceRect || !targetRect) return true;
      const path = getDisplayComputedPath(edge);
      return displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'source', sourceRect)
        || displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'target', targetRect);
    })) return false;
    best = candidate;
    bestQuality = candidateQuality;
    bestScore = candidateScore;
    const hardClean = bestQuality.hairpins === 0
      && bestQuality.strictCrossings === 0
      && bestQuality.reverseOverlap === 0
      && bestQuality.unrelatedOverlap === 0
      && bestQuality.unexplainedRelatedOverlap === 0;
    return hardClean && (!detourPolishMode || !hasCommerciallyExcessiveDetour(best));
  };
  const considerStrictClosedShortcut = (
    candidate: T,
    changedIndexes: number[],
  ): boolean => {
    if (
      !detourPolishMode
      || !closeStrictCandidate
      || strictClosureEvaluations >= 2
      || evaluations >= maxQualityEvaluations
    ) return false;
    const allChangedIndexes = collectChangedIndexes(candidate, changedIndexes);
    const candidateQuality = qualityContext.evaluateChanged(candidate, allChangedIndexes);
    if (diagnostics) diagnostics.qualityEvaluationCount += 1;
    if (
      candidateQuality.strictCrossings <= baselineQuality.strictCrossings
      || candidateQuality.strictCrossings > baselineQuality.strictCrossings + 2
      || candidateQuality.detourPenalty >= baselineQuality.detourPenalty
      || candidateQuality.nonOrthogonalSegments > baselineQuality.nonOrthogonalSegments
      || candidateQuality.reverseOverlap > baselineQuality.reverseOverlap
      || candidateQuality.unrelatedOverlap > baselineQuality.unrelatedOverlap
      || candidateQuality.unexplainedRelatedOverlap > baselineQuality.unexplainedRelatedOverlap
      || candidateQuality.shortEndpointStubs > baselineQuality.shortEndpointStubs
      || candidateQuality.tinyInteriorDoglegs > baselineQuality.tinyInteriorDoglegs
      || candidateQuality.hairpins > baselineQuality.hairpins
    ) return false;
    strictClosureEvaluations += 1;
    const renderClosed = closeStrictCandidate(candidate);
    if (
      !preservesLoopShortcutTrueTrunks(edges, renderClosed, nodes, detourPolishMode)
      || !preservesLoopShortcutFixedTerminals(edges, renderClosed)
    ) return false;
    const closedChangedIndexes = renderClosed.flatMap((edge, index) => (
      edge !== edges[index] ? [index] : []
    ));
    return closedChangedIndexes.length > 0
      && considerCandidate(renderClosed, closedChangedIndexes);
  };

  const reservedPortEvaluations = Math.min(16, Math.max(4, maxQualityEvaluations / 2));
  const loopEvaluationLimit = Math.max(1, maxQualityEvaluations - reservedPortEvaluations);
  loopSearch: for (const { edgeIndex } of rankedEdgeIndexes) {
    if (evaluations >= loopEvaluationLimit) break;
    const perEdgeEvaluationBudget = Math.max(
      12,
      Math.floor(loopEvaluationLimit / Math.max(1, rankedEdgeIndexes.length)),
    );
    const edgeEvaluationLimit = Math.min(
      loopEvaluationLimit,
      evaluations + perEdgeEvaluationBudget,
    );
    const edge = best[edgeIndex];
    const path = getDisplayComputedPath(edge);
    const directShortcutPaths = detourPolishMode
      ? buildTerminalPreservingDirectShortcutCandidates(path)
      : [];
    const edgeObstacleRects = [...buildDisplayRoutingObstacles(nodes)]
      .filter(([nodeId]) => nodeId !== edge.source && nodeId !== edge.target)
      .map(([, rect]) => rect);
    const obstacleSafeShortcutPaths = detourPolishMode
      ? dedupeDisplayPaths(buildTerminalPreservingObstacleShortcutSeeds(path)
        .flatMap(seedPath => {
          const seedEdges = best.map((candidateEdge, candidateIndex) => (
            candidateIndex === edgeIndex
              ? withDisplayComputedPath(candidateEdge, seedPath)
              : candidateEdge
          ));
          return buildObstacleSkirtCandidates(
            seedPath,
            nodes,
            withDisplayComputedPath(edge, seedPath),
            seedEdges,
          );
        }))
        .map((candidatePath, originalIndex) => ({
          candidatePath,
          obstacleHits: collectPathHitObstacleRects(candidatePath, edgeObstacleRects).length,
          length: displayPathLength(candidatePath),
          originalIndex,
        }))
        .sort((first, second) => (
          first.obstacleHits - second.obstacleHits
          || first.length - second.length
          || first.candidatePath.length - second.candidatePath.length
          || first.originalIndex - second.originalIndex
        ))
        // Clearance scoring checks every path against every business node.
        // Pre-rank by exact obstacle safety and length so the expensive stage
        // stays bounded without letting an unsafe short path crowd out a
        // commercial-clearance lane.
        .slice(0, 24)
        .map(entry => ({
          ...entry,
          clearanceRisk: scoreNodeClearanceRisk(
            entry.candidatePath,
            nodes,
            withDisplayComputedPath(edge, entry.candidatePath),
          ),
        }))
        .sort((first, second) => (
          first.obstacleHits - second.obstacleHits
          || first.clearanceRisk - second.clearanceRisk
          || first.length - second.length
          || first.candidatePath.length - second.candidatePath.length
          || first.originalIndex - second.originalIndex
        ))
        .slice(0, 12)
        .map(entry => entry.candidatePath)
      : [];
    const shortcutCandidates = [
      ...directShortcutPaths,
      ...obstacleSafeShortcutPaths,
      ...buildStrictLoopShortcutCandidates(path, 16),
    ];
    const edgeEvaluationStart = evaluations;
    const primaryEvaluationLimit = Math.min(
      edgeEvaluationLimit,
      edgeEvaluationStart + (
        // Tiny atomic repairs rely on paired terminal-lane variants; let that
        // search keep the whole edge budget instead of accepting a merely
        // adequate single-edge port switch first.
        rankedEdgeIndexes.length <= 2
          ? 0
          : Math.max(4, Math.ceil(perEdgeEvaluationBudget * 0.75))
      ),
    );
    for (const candidatePath of shortcutCandidates) {
      if (evaluations >= loopEvaluationLimit) break loopSearch;
      if (evaluations >= primaryEvaluationLimit) break;
      const candidate = best.map((candidateEdge, candidateIndex) => (
        candidateIndex === edgeIndex
          ? withDisplayComputedPath(candidateEdge, candidatePath)
          : candidateEdge
      )) as T;
      if (considerStrictClosedShortcut(candidate, [edgeIndex])) return best;
      if (considerCandidate(candidate, [edgeIndex])) return best;
    }
    edgeCandidateSearch: for (const candidatePath of shortcutCandidates) {
      // All batches use the same immutable baseline as the former eager array,
      // even if an earlier evaluated variant updates `best`.
      const variantBaseline = best;
      const variantBatches = [
        () => detourPolishMode
          ? buildStrictBlockingTerminalLaneShiftVariants(
            candidatePath,
            edgeIndex,
            variantBaseline,
            nodes,
          ).map(paired => ({ mainPath: candidatePath, paired }))
          : [],
        () => buildLoopLaneNudgeVariants(candidatePath, edgeIndex, variantBaseline)
          .map(nudgedPath => ({ mainPath: nudgedPath, paired: null })),
        () => buildBlockingEdgeLaneNudgeVariants(candidatePath, edgeIndex, variantBaseline, nodes)
          .map(paired => ({ mainPath: candidatePath, paired })),
      ];
      for (const buildVariants of variantBatches) {
        if (evaluations >= loopEvaluationLimit) break loopSearch;
        if (evaluations >= edgeEvaluationLimit) break edgeCandidateSearch;
        for (const { mainPath, paired } of buildVariants()) {
          if (evaluations >= loopEvaluationLimit) break loopSearch;
          if (evaluations >= edgeEvaluationLimit) break edgeCandidateSearch;
          const candidate = best.map((edge, index) => (
            index === edgeIndex
              ? withDisplayComputedPath(edge, mainPath)
              : index === paired?.edgeIndex
                ? paired.sourceSide && paired.targetSide
                  ? withDisplayPortBridge(
                    edge,
                    paired.path,
                    paired.sourceSide,
                    paired.targetSide,
                  )
                  : withDisplayComputedPath(edge, paired.path)
                : edge
          )) as T;
          const changedIndexes = paired ? [edgeIndex, paired.edgeIndex] : [edgeIndex];
          if (considerStrictClosedShortcut(candidate, changedIndexes)) return best;
          if (considerCandidate(candidate, changedIndexes)) return best;
        }
      }
    }
  }

  const routingObstacleRects = [...buildDisplayRoutingObstacles(nodes).values()];
  const outerBounds = routingObstacleRects.length > 0
    ? {
      left: Math.min(...routingObstacleRects.map(rect => rect.x)),
      right: Math.max(...routingObstacleRects.map(rect => rect.x + rect.width)),
      top: Math.min(...routingObstacleRects.map(rect => rect.y)),
      bottom: Math.max(...routingObstacleRects.map(rect => rect.y + rect.height)),
    }
    : null;
  for (const { edgeIndex } of rankedEdgeIndexes) {
    if (evaluations >= maxQualityEvaluations) return best;
    const edge = edges[edgeIndex];
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (!sourceRect || !targetRect) continue;
    const currentSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
    const currentTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    const sides = ['top', 'bottom', 'left', 'right'] as const;
    const sourceSides = sides
      .filter(side => displayTerminalSideCanSwitch(edge, 'source', side))
      .sort((first, second) => Number(first !== currentSourceSide) - Number(second !== currentSourceSide));
    const targetSides = sides
      .filter(side => displayTerminalSideCanSwitch(edge, 'target', side))
      .sort((first, second) => Number(first !== currentTargetSide) - Number(second !== currentTargetSide));
    if (outerBounds) {
      const endpointForSide = (
        rect: NonNullable<ReturnType<typeof getDisplayNodeRect>>,
        side: typeof sides[number],
      ): DisplayPoint => (
        side === 'left'
          ? { x: rect.x, y: rect.y + rect.height / 2 }
          : side === 'right'
            ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
            : side === 'top'
              ? { x: rect.x + rect.width / 2, y: rect.y }
              : { x: rect.x + rect.width / 2, y: rect.y + rect.height }
      );
      for (const side of sides) {
        if (!sourceSides.includes(side) || !targetSides.includes(side)) continue;
        const sourcePoint = endpointForSide(sourceRect, side);
        const targetPoint = endpointForSide(targetRect, side);
        const lane = side === 'top'
          ? outerBounds.top - 96
          : side === 'bottom'
            ? outerBounds.bottom + 96
            : side === 'left'
              ? outerBounds.left - 96
              : outerBounds.right + 96;
        const candidatePath = side === 'top' || side === 'bottom'
          ? [
            sourcePoint,
            { x: sourcePoint.x, y: lane },
            { x: targetPoint.x, y: lane },
            targetPoint,
          ]
          : [
            sourcePoint,
            { x: lane, y: sourcePoint.y },
            { x: lane, y: targetPoint.y },
            targetPoint,
          ];
        const candidate = edges.map((candidateEdge, candidateIndex) => (
          candidateIndex === edgeIndex
            ? withDisplayPortBridge(edge, candidatePath, side, side)
            : candidateEdge
        )) as T;
        if (considerCandidate(candidate, [edgeIndex])) return best;
      }
    }
    for (const sourceSide of sourceSides) {
      for (const targetSide of targetSides) {
        if (evaluations >= maxQualityEvaluations) return best;
        if (sourceSide === currentSourceSide && targetSide === currentTargetSide) continue;
        const originalPath = getDisplayComputedPath(edge);
        const preservedLanePaths = [
          ...(targetSide === currentTargetSide
            ? [
              ...buildNearTerminalSideCandidates(
                originalPath,
                'source',
                sourceRect,
                sourceSide,
                48,
                2,
              ),
              ...buildSharedNodeTerminalSideCandidates(
                originalPath,
                'source',
                sourceRect,
                sourceSide,
                48,
                4,
              ),
            ]
            : []),
          ...(sourceSide === currentSourceSide
            ? [
              ...buildNearTerminalSideCandidates(
                originalPath,
                'target',
                targetRect,
                targetSide,
                48,
                2,
              ),
              ...buildSharedNodeTerminalSideCandidates(
                originalPath,
                'target',
                targetRect,
                targetSide,
                48,
                4,
              ),
            ]
            : []),
        ];
        const candidatePaths = [
          ...preservedLanePaths,
          ...buildFacingPortPathCandidates(
            sourceRect,
            targetRect,
            sourceSide,
            targetSide,
            48,
          ),
        ];
        for (const candidatePath of candidatePaths) {
          if (evaluations >= maxQualityEvaluations) return best;
          const candidateEdge = withDisplayPortBridge(
            edge,
            candidatePath,
            sourceSide,
            targetSide,
          );
          const directCandidate = edges.map((item, index) => (
            index === edgeIndex ? candidateEdge : item
          )) as T;
          const pathVariants = [
            candidatePath,
            ...buildObstacleSkirtCandidates(candidatePath, nodes, candidateEdge, directCandidate)
              .slice(0, 2),
          ];
          for (const pathVariant of pathVariants) {
            if (evaluations >= maxQualityEvaluations) return best;
            const candidate = edges.map((item, index) => (
              index === edgeIndex
                ? withDisplayPortBridge(item, pathVariant, sourceSide, targetSide)
                : item
            )) as T;
            if (considerCandidate(candidate, [edgeIndex])) return best;
          }
        }
      }
    }
  }
  return best;
};
