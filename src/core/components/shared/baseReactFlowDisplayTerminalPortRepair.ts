import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { countRoutingObstacleHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  createEdgePathQualityEvaluationContext,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  buildFacingPortPathCandidates,
  buildNearTerminalSideCandidates,
  buildSharedSourceTrunkAdoptionCandidates,
  buildSharedNodeTerminalSideCandidates,
} from './baseReactFlowSharedNodePortRoleRepair';
import { anchorComputedDisplayEdgeEndpoints } from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayPointsCoincide,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  oppositeDisplayPortSide,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import { createDisplayObstacleEvaluationContext } from './baseReactFlowDisplayEvaluation';
import {
  buildDeclaredTerminalAxisStubCandidates,
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import {
  createDisplayTerminalValidationSnapshot,
} from './baseReactFlowTerminalAxisRepair';
import {
  adaptiveDetachedTerminalStub,
  buildDeclaredTerminalInsetNudgeCandidates,
  buildShortTerminalStaircaseTranslationCandidate,
  detachedTerminalConnectorLanes,
  inferTerminalGeometrySide,
  MIN_DISPLAY_ENDPOINT_STUB,
} from './baseReactFlowDisplayTerminalGeometry';
import { buildSingleEdgeZipperCandidates } from './baseReactFlowDisplayTerminalPortZipperCandidates';
import {
  createDisplayDeclaredAxisMismatchCounter,
  rollbackIncompleteDeclaredAxisTransactions,
} from './baseReactFlowDisplayDeclaredAxisTransaction';
import {
  createDisplayTerminalPortCandidateBuckets,
  displayTerminalPortCandidateIsBetter,
  displayTerminalPortCandidateIsComplete,
  rankDisplayTerminalPortCandidates,
} from './baseReactFlowDisplayTerminalPortCandidateRanking';
import { buildPairedTerminalPortRoleCandidates } from './baseReactFlowDisplayPairedPortRoleCandidates';
import { repairResidualSharedSourceTrunkAxisMismatches } from './baseReactFlowDisplaySharedTrunkAxisRepair';
import {
  buildApproachSideTerminalCandidate,
  detachedTerminalQualityDoesNotRegress,
} from './baseReactFlowDisplayTerminalPortQuality';

export { repairTerminalHandleHemisphereHairpins } from './baseReactFlowDisplayHemisphereHairpinRepair';

export {
  buildCrossingCompanionOuterPortVariants,
  buildOppositeRoleSharedNodeCandidates,
  buildStrictCrossingCompanionShiftVariants,
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';

export const repairDetachedTerminalsWithBoundedPortRoles = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 12,
): T => {
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  if (edges.every(edge => terminalValidation.validateEdge(edge).attached)) return edges;
  let current = edges;
  let qualityEvaluations = 0;
  const skippedEdgeIds = new Set<string>();
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));

  for (let pass = 0; pass < edges.length && qualityEvaluations < maxQualityEvaluations; pass += 1) {
    const detachedEdgeIndex = current.findIndex(edge => (
      !skippedEdgeIds.has(edge.id)
      && !terminalValidation.validateEdge(edge).attached
    ));
    if (detachedEdgeIndex < 0) break;
    const edge = current[detachedEdgeIndex];
    const path = getDisplayComputedPath(edge);
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (path.length < 2 || !sourceRect || !targetRect) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    const anchoredEdge = anchorComputedDisplayEdgeEndpoints([edge], nodes)[0] ?? edge;
    const anchoredPath = getDisplayComputedPath(anchoredEdge);
    const sourceDetached = !displayPointsCoincide(path[0], anchoredPath[0]);
    const targetDetached = !displayPointsCoincide(path[path.length - 1], anchoredPath[anchoredPath.length - 1]);
    const anchoredCandidates: T[] = [];
    const attachedCandidates: T[] = [];
    const appendCandidate = (candidate: T) => {
      const validation = terminalValidation.validateEdge(candidate[detachedEdgeIndex]);
      if (!validation.attached) return;
      (validation.anchored ? anchoredCandidates : attachedCandidates).push(candidate);
    };
    const appendEdgeCandidate = (candidateEdge: Edge) => {
      appendCandidate(current.map((item, index) => (
        index === detachedEdgeIndex ? candidateEdge : item
      )) as T);
    };
    appendEdgeCandidate(anchoredEdge);

    const sourceCenter = {
      x: sourceRect.x + sourceRect.width / 2,
      y: sourceRect.y + sourceRect.height / 2,
    };
    const targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2,
    };
    const deltaX = targetCenter.x - sourceCenter.x;
    const deltaY = targetCenter.y - sourceCenter.y;
    const facingSourceSide: 'top' | 'bottom' | 'left' | 'right' = Math.abs(deltaX) >= Math.abs(deltaY)
      ? (deltaX >= 0 ? 'right' : 'left')
      : (deltaY >= 0 ? 'bottom' : 'top');
    const facingTargetSide: 'top' | 'bottom' | 'left' | 'right' = facingSourceSide === 'right'
      ? 'left'
      : facingSourceSide === 'left'
        ? 'right'
        : facingSourceSide === 'bottom'
          ? 'top'
          : 'bottom';
    if (
      displayTerminalSideCanSwitch(edge, 'source', facingSourceSide)
      && displayTerminalSideCanSwitch(edge, 'target', facingTargetSide)
    ) {
      for (const candidatePath of buildFacingPortPathCandidates(
        sourceRect,
        targetRect,
        facingSourceSide,
        facingTargetSide,
        MIN_DISPLAY_ENDPOINT_STUB,
      )) {
        appendEdgeCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          facingSourceSide,
          facingTargetSide,
        ));
      }
    }

    for (const role of ['source', 'target'] as const) {
      if ((role === 'source' && !sourceDetached) || (role === 'target' && !targetDetached)) continue;
      const currentSide = normalizeHandle(role === 'source' ? edge.sourceHandle : edge.targetHandle);
      const otherSide = fullDisplayPortSide(normalizeHandle(role === 'source' ? edge.targetHandle : edge.sourceHandle));
      if (!currentSide || !otherSide) continue;
      const opposite = oppositeDisplayPortSide(currentSide);
      const sideOrder = [
        opposite,
        ...(currentSide === 'l' || currentSide === 'r'
          ? ['top', 'bottom'] as const
          : ['left', 'right'] as const),
      ];
      const rect = role === 'source' ? sourceRect : targetRect;
      for (const side of sideOrder) {
        if (!displayTerminalSideCanSwitch(edge, role, side)) continue;
        const adaptiveStub = adaptiveDetachedTerminalStub(
          current,
          nodes,
          detachedEdgeIndex,
          path,
          role,
          rect,
          side,
        );
        const stubLengths = adaptiveStub > MIN_DISPLAY_ENDPOINT_STUB + 0.5
          ? [adaptiveStub, MIN_DISPLAY_ENDPOINT_STUB]
          : [MIN_DISPLAY_ENDPOINT_STUB];
        for (const stubLength of stubLengths) {
          const connectorLanes = detachedTerminalConnectorLanes(
            edge,
            nodes,
            path,
            role,
            rect,
            side,
            stubLength,
          );
          for (const candidatePath of buildSharedNodeTerminalSideCandidates(
            path,
            role,
            rect,
            side,
            stubLength,
            2,
            connectorLanes,
          )) {
            const candidateEdge = role === 'source'
              ? withDisplayPortBridge(edge, candidatePath, side, otherSide)
              : withDisplayPortBridge(edge, candidatePath, otherSide, side);
            appendEdgeCandidate(candidateEdge);
          }
        }
      }
    }

    const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
    const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    if (declaredTargetSide) {
      for (const peer of current) {
        if (peer.id === edge.id || peer.source !== edge.source) continue;
        const peerValidation = terminalValidation.validateEdge(peer);
        const peerSourceSide = fullDisplayPortSide(normalizeHandle(peer.sourceHandle));
        if (
          !peerValidation.sourceAnchored
          || !peerSourceSide
          || !displayTerminalSideCanSwitch(edge, 'source', peerSourceSide)
        ) continue;
        for (const candidatePath of buildSharedSourceTrunkAdoptionCandidates(
          path,
          getDisplayComputedPath(peer),
          MIN_DISPLAY_ENDPOINT_STUB,
          3,
        )) {
          appendEdgeCandidate(withDisplayPortBridge(
            edge,
            candidatePath,
            peerSourceSide,
            declaredTargetSide,
          ));
        }
      }
    }
    if (declaredSourceSide && declaredTargetSide) {
      for (const directPath of buildFacingPortPathCandidates(
        sourceRect,
        targetRect,
        declaredSourceSide,
        declaredTargetSide,
        MIN_DISPLAY_ENDPOINT_STUB,
      )) {
        const directEdge = withDisplayPortBridge(
          edge,
          directPath,
          declaredSourceSide,
          declaredTargetSide,
        );
        const directCandidate = current.map((item, index) => (
          index === detachedEdgeIndex ? directEdge : item
        )) as T;
        for (const zipperCandidate of buildSingleEdgeZipperCandidates(
          directCandidate,
          detachedEdgeIndex,
          2,
        )) {
          appendCandidate(zipperCandidate);
        }
        appendEdgeCandidate(directEdge);
      }
    }

    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = obstacleContext.evaluate(current);
    let accepted: T | null = null;
    for (const candidate of [...anchoredCandidates, ...attachedCandidates]) {
      if (qualityEvaluations >= maxQualityEvaluations) return current;
      qualityEvaluations += 1;
      const candidateQuality = qualityContext.evaluateChanged(candidate, [detachedEdgeIndex]);
      if (!detachedTerminalQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
      if (obstacleContext.evaluateKnownChanges(candidate, [detachedEdgeIndex]) > baselineObstacleHits) continue;
      accepted = candidate;
      break;
    }
    if (!accepted) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    current = accepted;
  }
  return current;
};

export const repairAxisMismatchedTerminalsWithBoundedPortRoles = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 16,
): T => {
  let current = edges;
  let qualityEvaluations = 0;
  const skippedEdgeIds = new Set<string>();
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const routingObstacles = buildDisplayRoutingObstacles(nodes);
  const terminalValidation = createDisplayTerminalValidationSnapshot(nodes);
  const countDeclaredAxisMismatches = createDisplayDeclaredAxisMismatchCounter(nodes);
  for (
    let pass = 0;
    pass < edges.length * 2 && qualityEvaluations < maxQualityEvaluations;
    pass += 1
  ) {
    const edgeIndex = current
      .map((edge, index) => {
        if (skippedEdgeIds.has(edge.id)) return null;
        const path = getDisplayComputedPath(edge);
        const sourceNode = nodeById.get(edge.source);
        const targetNode = nodeById.get(edge.target);
        const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
        const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
        const sourceAxisMismatch = Boolean(
          sourceRect
          && displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'source', sourceRect)
        );
        const targetAxisMismatch = Boolean(
          targetRect
          && displayTerminalRoleNeedsDeclaredAxisRepair(edge, path, 'target', targetRect)
        );
        const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
        const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
        const numericalStaircaseTranslations = Number(Boolean(
          declaredSourceSide
          && buildShortTerminalStaircaseTranslationCandidate(
            path,
            'source',
            declaredSourceSide,
          )
        )) + Number(Boolean(
          declaredTargetSide
          && buildShortTerminalStaircaseTranslationCandidate(
            path,
            'target',
            declaredTargetSide,
          )
        ));
        const needsRepair = !terminalValidation.validateEdge(edge).anchored
          || !sourceRect
          || !targetRect
          || sourceAxisMismatch
          || targetAxisMismatch;
        if (!needsRepair) return null;
        return {
          index,
          nodeAnchorMismatches: Number(!terminalValidation.validateEdge(edge).anchored),
          numericalStaircaseTranslations,
          declaredAxisMismatches: Number(sourceAxisMismatch) + Number(targetAxisMismatch),
          obstacleHits: path.length >= 2
            ? countRoutingObstacleHits(path, edge, routingObstacles)
            : 0,
        };
      })
      .filter((entry): entry is {
        index: number;
        nodeAnchorMismatches: number;
        numericalStaircaseTranslations: number;
        declaredAxisMismatches: number;
        obstacleHits: number;
      } => Boolean(entry))
      .sort((first, second) => (
        second.nodeAnchorMismatches - first.nodeAnchorMismatches
        || second.numericalStaircaseTranslations - first.numericalStaircaseTranslations
        || second.declaredAxisMismatches - first.declaredAxisMismatches
        || second.obstacleHits - first.obstacleHits
        || first.index - second.index
      ))[0]?.index
      ?? -1;
    if (edgeIndex < 0) break;
    const edge = current[edgeIndex];
    const path = getDisplayComputedPath(edge);
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (path.length < 2 || !sourceRect || !targetRect) {
      skippedEdgeIds.add(edge.id);
      continue;
    }

    const {
      candidateEdges, handleOnlyCandidateEdges, insetNudgeCandidateEdges,
      appendCandidate, appendPriorityCandidate, appendInsetNudgeCandidate,
    } = createDisplayTerminalPortCandidateBuckets(
      candidateEdge => terminalValidation.validateEdge(candidateEdge).anchored,
    );
    appendCandidate(anchorComputedDisplayEdgeEndpoints([edge], nodes)[0] ?? edge);
    const geometrySourceSide = inferTerminalGeometrySide(path, 'source', sourceRect);
    const geometryTargetSide = inferTerminalGeometrySide(path, 'target', targetRect);
    const approachSource = buildApproachSideTerminalCandidate(path, 'source', sourceRect);
    const approachTarget = buildApproachSideTerminalCandidate(path, 'target', targetRect);
    if (
      geometrySourceSide
      && geometryTargetSide
      && displayTerminalSideCanSwitch(edge, 'source', geometrySourceSide)
      && displayTerminalSideCanSwitch(edge, 'target', geometryTargetSide)
    ) {
      appendPriorityCandidate(withDisplayPortBridge(
        edge,
        path,
        geometrySourceSide,
        geometryTargetSide,
      ));
    }
    if (
      approachSource
      && approachTarget
      && displayTerminalSideCanSwitch(edge, 'source', approachSource.side)
      && displayTerminalSideCanSwitch(edge, 'target', approachTarget.side)
    ) {
      const approachPath = approachSource.path.map(point => ({ ...point }));
      approachPath[approachPath.length - 1] = approachTarget.path[approachTarget.path.length - 1];
      appendPriorityCandidate(withDisplayPortBridge(
        edge,
        approachPath,
        approachSource.side,
        approachTarget.side,
      ));
    }

    const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle));
    const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle));
    if (declaredSourceSide && declaredTargetSide) {
      const sourceStaircaseCandidate = buildShortTerminalStaircaseTranslationCandidate(
        path,
        'source',
        declaredSourceSide,
      );
      if (sourceStaircaseCandidate) {
        appendPriorityCandidate(withDisplayPortBridge(
          edge,
          sourceStaircaseCandidate,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
      const targetStaircaseCandidate = buildShortTerminalStaircaseTranslationCandidate(
        path,
        'target',
        declaredTargetSide,
      );
      if (targetStaircaseCandidate) {
        appendPriorityCandidate(withDisplayPortBridge(
          edge,
          targetStaircaseCandidate,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
      if (countRoutingObstacleHits(path, edge, routingObstacles) === 0) {
        for (const candidatePath of buildDeclaredTerminalAxisStubCandidates(
          path,
          'source',
          sourceRect,
          declaredSourceSide,
        )) {
          appendPriorityCandidate(withDisplayPortBridge(
            edge,
            candidatePath,
            declaredSourceSide,
            declaredTargetSide,
          ));
        }
        for (const candidatePath of buildDeclaredTerminalAxisStubCandidates(
          path,
          'target',
          targetRect,
          declaredTargetSide,
        )) {
          appendPriorityCandidate(withDisplayPortBridge(
            edge,
            candidatePath,
            declaredSourceSide,
            declaredTargetSide,
          ));
        }
      }
      for (const candidatePath of buildFacingPortPathCandidates(
        sourceRect,
        targetRect,
        declaredSourceSide,
        declaredTargetSide,
        MIN_DISPLAY_ENDPOINT_STUB,
      )) {
        appendCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
    }

    const roles = (['source', 'target'] as const).filter(role => (
      displayTerminalRoleNeedsDeclaredAxisRepair(
        edge,
        path,
        role,
        role === 'source' ? sourceRect : targetRect,
      )
    ));
    if (roles.length === 2) {
      for (const candidateEdge of buildPairedTerminalPortRoleCandidates({
        edge,
        path,
        sourceRect,
        targetRect,
      })) {
        appendPriorityCandidate(candidateEdge);
      }
    }
    for (const role of roles.length > 0 ? roles : (['source', 'target'] as const)) {
      const rect = role === 'source' ? sourceRect : targetRect;
      const neighbor = role === 'source' ? path[1] : path[path.length - 2];
      const otherSide = fullDisplayPortSide(normalizeHandle(
        role === 'source' ? edge.targetHandle : edge.sourceHandle,
      ));
      if (!neighbor || !otherSide) continue;
      const sides = (['top', 'bottom', 'left', 'right'] as const)
        .filter(side => displayTerminalSideCanSwitch(edge, role, side))
        .sort((first, second) => {
          const endpoint = (side: typeof first): DisplayPoint => (
            side === 'left'
              ? { x: rect.x, y: rect.y + rect.height / 2 }
              : side === 'right'
                ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
                : side === 'top'
                  ? { x: rect.x + rect.width / 2, y: rect.y }
                  : { x: rect.x + rect.width / 2, y: rect.y + rect.height }
          );
          const firstEndpoint = endpoint(first);
          const secondEndpoint = endpoint(second);
          return Math.abs(firstEndpoint.x - neighbor.x) + Math.abs(firstEndpoint.y - neighbor.y)
            - Math.abs(secondEndpoint.x - neighbor.x) - Math.abs(secondEndpoint.y - neighbor.y);
        });
      for (const side of sides) {
        const endpoint = side === 'left'
          ? { x: rect.x, y: rect.y + rect.height / 2 }
          : side === 'right'
            ? { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
            : side === 'top'
              ? { x: rect.x + rect.width / 2, y: rect.y }
              : { x: rect.x + rect.width / 2, y: rect.y + rect.height };
        const directBoundaryPath = role === 'source'
          ? [{ ...endpoint }, ...path.slice(1)]
          : [...path.slice(0, -1), { ...endpoint }];
        appendCandidate(role === 'source'
          ? withDisplayPortBridge(edge, directBoundaryPath, side, otherSide)
          : withDisplayPortBridge(edge, directBoundaryPath, otherSide, side));
        const currentGeometrySide = role === 'source' ? geometrySourceSide : geometryTargetSide;
        if (!currentGeometrySide) {
          for (const candidatePath of buildNearTerminalSideCandidates(
            path,
            role,
            rect,
            side,
            MIN_DISPLAY_ENDPOINT_STUB,
            2,
          )) {
            appendCandidate(role === 'source'
              ? withDisplayPortBridge(edge, candidatePath, side, otherSide)
              : withDisplayPortBridge(edge, candidatePath, otherSide, side));
          }
        }
        const connectorLanes = detachedTerminalConnectorLanes(
          edge,
          nodes,
          path,
          role,
          rect,
          side,
          MIN_DISPLAY_ENDPOINT_STUB,
        );
        for (const candidatePath of buildSharedNodeTerminalSideCandidates(
          path,
          role,
          rect,
          side,
          MIN_DISPLAY_ENDPOINT_STUB,
          2,
          connectorLanes,
        )) {
          appendCandidate(role === 'source'
            ? withDisplayPortBridge(edge, candidatePath, side, otherSide)
            : withDisplayPortBridge(edge, candidatePath, otherSide, side));
        }
      }
    }

    if (declaredSourceSide && declaredTargetSide) {
      for (const candidatePath of buildDeclaredTerminalInsetNudgeCandidates(
        path,
        'source',
        sourceRect,
        declaredSourceSide,
      )) {
        appendInsetNudgeCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
      for (const candidatePath of buildDeclaredTerminalInsetNudgeCandidates(
        path,
        'target',
        targetRect,
        declaredTargetSide,
      )) {
        appendInsetNudgeCandidate(withDisplayPortBridge(
          edge,
          candidatePath,
          declaredSourceSide,
          declaredTargetSide,
        ));
      }
    }

    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineObstacleHits = obstacleContext.evaluate(current);
    let accepted: T | null = null;
    let acceptedDeclaredAxisMismatches = Number.POSITIVE_INFINITY;
    let acceptedObstacleHits = Number.POSITIVE_INFINITY;
    const prioritizeDeclaredAxisCompletion = edges.length === 1;
    const rankCandidateEdges = (edgesToRank: Edge[]) => rankDisplayTerminalPortCandidates(
      edgesToRank,
      countDeclaredAxisMismatches,
      candidateEdge => countRoutingObstacleHits(
          getDisplayComputedPath(candidateEdge),
          candidateEdge,
          routingObstacles,
      ),
      prioritizeDeclaredAxisCompletion,
    );
    const rankedCandidateEdges = baselineObstacleHits === 0
      ? [
        ...rankCandidateEdges(handleOnlyCandidateEdges),
        ...rankCandidateEdges(insetNudgeCandidateEdges),
        ...rankCandidateEdges(candidateEdges),
      ]
      : [
        ...rankCandidateEdges(handleOnlyCandidateEdges),
        ...rankCandidateEdges(candidateEdges),
        ...rankCandidateEdges(insetNudgeCandidateEdges),
      ];
    for (const { candidateEdge, declaredAxisMismatches } of rankedCandidateEdges) {
      if (qualityEvaluations >= maxQualityEvaluations) break;
      qualityEvaluations += 1;
      // This transaction is atomic: rollbackIncompleteDeclaredAxisTransactions
      // rejects partial repairs at the end, so accepting one here only burns the
      // bounded search budget and can prevent a later complete handle/stub
      // candidate from being considered.
      if (declaredAxisMismatches !== 0) continue;
      const candidate = current.map((item, index) => (
        index === edgeIndex ? candidateEdge : item
      )) as T;
      const candidateQuality = qualityContext.evaluateChanged(candidate, [edgeIndex]);
      if (!detachedTerminalQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
      const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidate, [edgeIndex]);
      if (candidateObstacleHits > baselineObstacleHits) continue;
      if (accepted && !displayTerminalPortCandidateIsBetter(
        { declaredAxisMismatches, obstacleHits: candidateObstacleHits },
        acceptedDeclaredAxisMismatches,
        acceptedObstacleHits,
        prioritizeDeclaredAxisCompletion,
      )) continue;
      accepted = candidate;
      acceptedDeclaredAxisMismatches = declaredAxisMismatches;
      acceptedObstacleHits = candidateObstacleHits;
      if (displayTerminalPortCandidateIsComplete(
        { declaredAxisMismatches, obstacleHits: candidateObstacleHits },
        prioritizeDeclaredAxisCompletion,
      )) break;
    }
    if (!accepted) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    current = accepted;
    // A completed peer can expose a safe shared source/target trunk for an edge
    // that failed earlier in this bounded transaction. Retry those edges after
    // the graph state changes instead of treating the first failure as final.
    skippedEdgeIds.clear();
  }
  const completed = rollbackIncompleteDeclaredAxisTransactions(
    edges,
    current,
    countDeclaredAxisMismatches,
  );
  return repairResidualSharedSourceTrunkAxisMismatches(completed, nodes, 24);
};
