import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { countRoutingObstacleHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  createEdgePathQualityEvaluationContext,
  type EdgePathQualityScore,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  buildFacingPortPathCandidates,
  buildNearTerminalSideCandidates,
  buildSharedNodeTerminalSideCandidates,
} from './baseReactFlowSharedNodePortRoleRepair';
import { buildStrictCrossingZipperCandidates } from './baseReactFlowStrictCrossingZipperRepair';
import {
  anchorComputedDisplayEdgeEndpoints,
} from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  displayAxisOf,
  displayPointsCoincide,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  oppositeDisplayPortSide,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  createDisplayObstacleEvaluationContext,
} from './baseReactFlowDisplayEvaluation';
import {
  buildDeclaredTerminalAxisStubCandidates,
  buildOppositeRoleSharedNodeCandidates,
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import {
  repairBoundedReverseParallelOverlapsWithCandidates,
} from './baseReactFlowDisplayOverlapRepair';
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

export { repairTerminalHandleHemisphereHairpins } from './baseReactFlowDisplayHemisphereHairpinRepair';

export {
  buildCrossingCompanionOuterPortVariants,
  buildOppositeRoleSharedNodeCandidates,
  buildStrictCrossingCompanionShiftVariants,
  displayTerminalRoleNeedsDeclaredAxisRepair,
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';

const detachedTerminalQualityDoesNotRegress = (
  baseline: EdgePathQualityScore,
  candidate: EdgePathQualityScore,
): boolean => (
  candidate.nonOrthogonalSegments <= baseline.nonOrthogonalSegments
  && candidate.strictCrossings <= baseline.strictCrossings
  && candidate.reverseOverlap <= baseline.reverseOverlap
  && candidate.unrelatedOverlap <= baseline.unrelatedOverlap
  && candidate.unexplainedRelatedOverlap <= baseline.unexplainedRelatedOverlap
  && candidate.shortEndpointStubs <= baseline.shortEndpointStubs
  && candidate.tinyInteriorDoglegs <= baseline.tinyInteriorDoglegs
  && candidate.hairpins <= baseline.hairpins
);

const buildSingleEdgeZipperCandidates = <T extends Edge[]>(
  edges: T,
  moverEdgeIndex: number,
  maxCandidates = 4,
): T[] => {
  const paths = edges.map(edge => getDisplayComputedPath(edge));
  const crossings = findStrictCrossings(paths, edges)
    .filter(crossing => (
      crossing.a.edgeIndex === moverEdgeIndex || crossing.b.edgeIndex === moverEdgeIndex
    ));
  const candidates: T[] = [];

  for (const crossing of crossings) {
    const segment = crossing.a.edgeIndex === moverEdgeIndex ? crossing.a : crossing.b;
    const other = crossing.a.edgeIndex === moverEdgeIndex ? crossing.b : crossing.a;
    const path = paths[moverEdgeIndex];
    if (
      !path
      || segment.axis === other.axis
      || segment.segIdx <= 0
      || segment.segIdx >= path.length - 2
    ) continue;
    const blockers = paths.flatMap((blockerPath, edgeIndex) => {
      if (edgeIndex === moverEdgeIndex || blockerPath.length < 2) return [];
      return blockerPath.slice(0, -1).flatMap((point, segmentIndex) => {
        const next = blockerPath[segmentIndex + 1];
        const axis = displayAxisOf(point, next);
        if (!axis || axis === segment.axis) return [];
        return [{
          path: blockerPath,
          segment: { segmentIndex, axis, a: point, b: next },
        }];
      });
    });
    for (const candidatePath of buildStrictCrossingZipperCandidates(
      path,
      {
        segmentIndex: segment.segIdx,
        axis: segment.axis,
        a: segment.a,
        b: segment.b,
      },
      blockers,
    )) {
      candidates.push(edges.map((edge, edgeIndex) => (
        edgeIndex === moverEdgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
      )) as T);
      if (candidates.length >= maxCandidates) return candidates;
    }
  }
  return candidates;
};

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
  for (let pass = 0; pass < edges.length && qualityEvaluations < maxQualityEvaluations; pass += 1) {
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

    const candidateEdges: Edge[] = [];
    const handleOnlyCandidateEdges: Edge[] = [];
    const insetNudgeCandidateEdges: Edge[] = [];
    const appendCandidate = (candidateEdge: Edge) => {
      if (!terminalValidation.validateEdge(candidateEdge).anchored) return;
      candidateEdges.push(candidateEdge);
    };
    const appendPriorityCandidate = (candidateEdge: Edge) => {
      if (!terminalValidation.validateEdge(candidateEdge).anchored) return;
      handleOnlyCandidateEdges.push(candidateEdge);
    };
    const appendInsetNudgeCandidate = (candidateEdge: Edge) => {
      if (!terminalValidation.validateEdge(candidateEdge).anchored) return;
      insetNudgeCandidateEdges.push(candidateEdge);
    };
    appendCandidate(anchorComputedDisplayEdgeEndpoints([edge], nodes)[0] ?? edge);
    const geometrySourceSide = inferTerminalGeometrySide(path, 'source', sourceRect);
    const geometryTargetSide = inferTerminalGeometrySide(path, 'target', targetRect);
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
    let acceptedObstacleHits = Number.POSITIVE_INFINITY;
    const rankCandidateEdges = (edgesToRank: Edge[]) => edgesToRank
      .map((candidateEdge, order) => ({
        candidateEdge,
        order,
        obstacleHits: countRoutingObstacleHits(
          getDisplayComputedPath(candidateEdge),
          candidateEdge,
          routingObstacles,
        ),
      }))
      .sort((first, second) => first.obstacleHits - second.obstacleHits || first.order - second.order);
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
    for (const { candidateEdge } of rankedCandidateEdges) {
      if (qualityEvaluations >= maxQualityEvaluations) break;
      qualityEvaluations += 1;
      const candidate = current.map((item, index) => (
        index === edgeIndex ? candidateEdge : item
      )) as T;
      const candidateQuality = qualityContext.evaluateChanged(candidate, [edgeIndex]);
      if (!detachedTerminalQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
      const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidate, [edgeIndex]);
      if (candidateObstacleHits > baselineObstacleHits) continue;
      if (accepted && candidateObstacleHits >= acceptedObstacleHits) continue;
      accepted = candidate;
      acceptedObstacleHits = candidateObstacleHits;
      if (candidateObstacleHits === 0) break;
    }
    if (!accepted) {
      skippedEdgeIds.add(edge.id);
      continue;
    }
    current = accepted;
  }
  return current;
};

export const repairBoundedReverseParallelOverlaps = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  maxQualityEvaluations = 8,
): T => repairBoundedReverseParallelOverlapsWithCandidates(
  edges,
  nodes,
  maxQualityEvaluations,
  buildOppositeRoleSharedNodeCandidates,
);
