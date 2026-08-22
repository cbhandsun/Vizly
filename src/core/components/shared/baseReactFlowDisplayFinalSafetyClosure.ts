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
  extractDisplaySegments,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  type DisplaySegment,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';

export type BaseReactFlowFinalSafetyClosureOptions = Readonly<{
  eligibleEdgeIds?: ReadonlySet<string>;
  evaluation?: BaseReactFlowFinalEndpointEvaluation;
}>;

const sameEdgeReferences = (first: readonly Edge[], second: readonly Edge[]): boolean => (
  first === second
  || (
    first.length === second.length
    && first.every((edge, index) => edge === second[index])
  )
);

const changedEdgesStayEligible = (
  baseline: readonly Edge[],
  candidate: readonly Edge[],
  eligibleEdgeIds?: ReadonlySet<string>,
): boolean => !eligibleEdgeIds || candidate.every((edge, index) => (
  edge === baseline[index] || eligibleEdgeIds.has(edge.id)
));

const finalCommercialOrderIsClean = (
  edges: readonly Edge[],
  nodes: Node[],
  endpointOrder: ReturnType<typeof auditFinalSameSideEndpointOrder>,
  evaluation?: BaseReactFlowFinalEndpointEvaluation,
): boolean => {
  const passageOrder = evaluation?.passageOrder(edges)
    ?? auditFinalSameSidePassageOrder(edges, nodes);
  return endpointOrder.inversions === 0
    && endpointOrder.ambiguousLaneTies === 0
    && endpointOrder.collapsedLanePairs === 0
    && passageOrder.passageDefects === 0
    && passageOrder.nearTrunkOpportunities === 0;
};

const preservesInitialTrueTrunks = (
  initial: readonly SameSideEndpointTrunkIdentity[],
  next: readonly SameSideEndpointTrunkIdentity[],
): boolean => initial.every(trunk => next.some(candidateTrunk => (
    candidateTrunk.nodeId === trunk.nodeId
    && candidateTrunk.role === trunk.role
    && trunk.edgeIds.every(edgeId => candidateTrunk.edgeIds.includes(edgeId))
    && candidateTrunk.commonStemLength + 1e-6 >= trunk.commonStemLength
  )));

const finalSafetyCandidateIsAccepted = (
  baseline: readonly Edge[],
  candidate: Edge[],
  nodes: Node[],
  options: BaseReactFlowFinalSafetyClosureOptions,
  getInitialTrueTrunks: () => readonly SameSideEndpointTrunkIdentity[],
): boolean => {
  if (!changedEdgesStayEligible(baseline, candidate, options.eligibleEdgeIds)) return false;
  if (countRenderUnsafeEndpointStubs(candidate) !== 0) return false;
  const endpointOrder = options.evaluation?.endpointOrder(candidate)
    ?? auditFinalSameSideEndpointOrder(candidate, nodes);
  if (!finalCommercialOrderIsClean(candidate, nodes, endpointOrder, options.evaluation)) return false;
  const report = options.evaluation?.hardReport(candidate)
    ?? getDisplayHardQualityGateReport(candidate, nodes, 'polished');
  if (!report.hardClean) return false;
  const initialTrueTrunks = sameEdgeReferences(baseline, candidate)
    ? endpointOrder.legalSharedTrunks
    : getInitialTrueTrunks();
  return preservesInitialTrueTrunks(initialTrueTrunks, endpointOrder.legalSharedTrunks);
};

type CrossingSegmentGroup = {
  segment: DisplaySegment;
  perpendicular: DisplaySegment[];
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

export const buildTrueTrunkCrossingSkirtCandidates = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[][] => {
  const groups = new Map<string, CrossingSegmentGroup>();
  const append = (segment: DisplaySegment, perpendicular: DisplaySegment): void => {
    const key = `${segment.edgeIndex}:${segment.segmentIndex}`;
    const group = groups.get(key);
    if (group) group.perpendicular.push(perpendicular);
    else groups.set(key, { segment, perpendicular: [perpendicular] });
  };
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    append(hit.a, hit.b);
    append(hit.b, hit.a);
  }

  const trueTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
  const candidates: Edge[][] = [];
  const gap = 12;
  for (const group of groups.values()) {
    if (group.perpendicular.length < 2 || candidates.length >= 8) continue;
    const movingEdge = edges[group.segment.edgeIndex];
    if (!movingEdge || (eligibleEdgeIds && !eligibleEdgeIds.has(movingEdge.id))) continue;
    const otherIndexes = [...new Set(group.perpendicular.map(segment => segment.edgeIndex))];
    const otherEdges = otherIndexes.flatMap(index => edges[index] ? [edges[index]] : []);
    if (otherEdges.length < 2) continue;
    const otherIds = otherEdges.map(edge => edge.id);
    if (!trueTrunks.some(trunk => otherIds.every(edgeId => trunk.edgeIds.includes(edgeId)))) continue;

    const otherPoints = otherEdges.flatMap(getDisplayComputedPath);
    const otherSegments = extractDisplaySegments(otherEdges);
    if (otherPoints.length === 0) continue;
    const path = getDisplayComputedPath(movingEdge);
    const segment = group.segment;
    if (path.length < 3 || segment.segmentIndex < 1 || segment.segmentIndex >= path.length - 2) continue;
    const before = path.slice(0, segment.segmentIndex + 1);
    const reconnectIndex = segment.segmentIndex + 2;
    const reconnect = path[reconnectIndex];
    const after = path.slice(reconnectIndex);
    if (!reconnect) continue;
    const detours = segment.axis === 'h'
      ? [
        Math.min(...group.perpendicular.flatMap(item => [item.a.y, item.b.y])) - gap,
        Math.max(...group.perpendicular.flatMap(item => [item.a.y, item.b.y])) + gap,
      ].map(laneY => {
        const lowY = Math.min(laneY, reconnect.y);
        const highY = Math.max(laneY, reconnect.y);
        const localHorizontal = otherSegments.filter(item => (
          item.axis === 'h' && item.a.y >= lowY && item.a.y <= highY
        ));
        const localX = localHorizontal.flatMap(item => [item.a.x, item.b.x]);
        const exitX = segment.b.x >= segment.a.x
          ? Math.max(...localX, ...group.perpendicular.map(item => item.a.x)) + gap
          : Math.min(...localX, ...group.perpendicular.map(item => item.a.x)) - gap;
        return compactOrthogonalPath([
          ...before,
          { x: segment.a.x, y: laneY },
          { x: exitX, y: laneY },
          { x: exitX, y: reconnect.y },
          ...after,
        ]);
      })
      : [
        Math.min(...group.perpendicular.flatMap(item => [item.a.x, item.b.x])) - gap,
        Math.max(...group.perpendicular.flatMap(item => [item.a.x, item.b.x])) + gap,
      ].map(laneX => {
        const lowX = Math.min(laneX, reconnect.x);
        const highX = Math.max(laneX, reconnect.x);
        const localVertical = otherSegments.filter(item => (
          item.axis === 'v' && item.a.x >= lowX && item.a.x <= highX
        ));
        const localY = localVertical.flatMap(item => [item.a.y, item.b.y]);
        const exitY = segment.b.y >= segment.a.y
          ? Math.max(...localY, ...group.perpendicular.map(item => item.a.y)) + gap
          : Math.min(...localY, ...group.perpendicular.map(item => item.a.y)) - gap;
        return compactOrthogonalPath([
          ...before,
          { x: laneX, y: segment.a.y },
          { x: laneX, y: exitY },
          { x: reconnect.x, y: exitY },
          ...after,
        ]);
      });
    for (const detour of detours) {
      candidates.push(edges.map((edge, index) => (
        index === segment.edgeIndex ? withDisplayComputedPath(edge, detour) : edge
      )));
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
  if (candidateIsAccepted(edges)) return edges;

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
    if (sameEdgeReferences(edges, nearTrunkCandidate)) return edges;
    if (candidateIsAccepted(nearTrunkCandidate)) return nearTrunkCandidate as T;
  }

  const businessNodeSafe = repairBusinessNodeClearanceRisks(edges, nodes);
  if (
    !sameEdgeReferences(edges, businessNodeSafe)
    && candidateIsAccepted(businessNodeSafe)
  ) return businessNodeSafe as T;

  const hardSafe = repairFastDisplayHardSafety(edges, nodes);
  if (
    !sameEdgeReferences(edges, hardSafe)
    && candidateIsAccepted(hardSafe)
  ) return hardSafe as T;

  for (const targetTrunk of buildPerpendicularSharedTargetTrunkCandidates(
    hardSafe,
    nodes,
    options.eligibleEdgeIds,
  )) {
    if (candidateIsAccepted(targetTrunk)) return targetTrunk as T;
    for (const outerPair of buildForwardReverseOuterPairCandidates(
      targetTrunk,
      nodes,
      options.eligibleEdgeIds,
    )) {
      if (candidateIsAccepted(outerPair)) return outerPair as T;
      const orderedOuterPair = repairBaseReactFlowFinalEndpointOrder(outerPair, nodes, {
        eligibleEdgeIds: options.eligibleEdgeIds,
      });
      for (const reversePassage of buildReversePassageTargetTrunkCandidates(
        orderedOuterPair,
        nodes,
        options.eligibleEdgeIds,
      )) {
        if (candidateIsAccepted(reversePassage)) return reversePassage as T;
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
      if (candidateIsAccepted(passageClosedOuterPair)) return passageClosedOuterPair as T;
      const safeOrderedOuterPair = repairFastDisplayHardSafety(orderedOuterPair, nodes);
      if (candidateIsAccepted(safeOrderedOuterPair)) return safeOrderedOuterPair as T;
    }
  }

  for (const bundle of buildBidirectionalPortBundleTransactionCandidates(
    hardSafe,
    nodes,
    options.eligibleEdgeIds,
  )) {
    if (candidateIsAccepted(bundle)) return bundle as T;
    const strictBundle = repairFinalResidualStrictCrossings(bundle, nodes);
    if (candidateIsAccepted(strictBundle)) return strictBundle as T;
    const orderedBundle = repairBaseReactFlowFinalEndpointOrder(strictBundle, nodes, {
      eligibleEdgeIds: options.eligibleEdgeIds,
    });
    const safeOrderedBundle = repairFastDisplayHardSafety(orderedBundle, nodes);
    if (candidateIsAccepted(safeOrderedBundle)) return safeOrderedBundle as T;
  }

  for (const corridor of buildAlternateSourceCorridorCandidates(
    hardSafe,
    options.eligibleEdgeIds,
  )) {
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
    });
    const safeOrderedCorridor = repairFastDisplayHardSafety(orderedCorridor, nodes);
    if (candidateIsAccepted(safeOrderedCorridor)) {
      return safeOrderedCorridor as T;
    }
  }

  for (const skirt of buildTrueTrunkCrossingSkirtCandidates(hardSafe, nodes, options.eligibleEdgeIds)) {
    const orderedSkirt = repairBaseReactFlowFinalEndpointOrder(skirt, nodes, {
      eligibleEdgeIds: options.eligibleEdgeIds,
    });
    const safeOrderedSkirt = repairFastDisplayHardSafety(orderedSkirt, nodes);
    if (candidateIsAccepted(safeOrderedSkirt)) {
      return safeOrderedSkirt as T;
    }
  }

  const strictClosed = repairFinalResidualStrictCrossings(hardSafe, nodes);
  if (
    !sameEdgeReferences(hardSafe, strictClosed)
    && candidateIsAccepted(strictClosed)
  ) return strictClosed as T;

  const microClosed = repairDisplayMicroArtifacts(strictClosed);
  if (
    !sameEdgeReferences(strictClosed, microClosed)
    && candidateIsAccepted(microClosed)
  ) return microClosed as T;

  const renderSafe = repairRenderSafeEndpointStubs(microClosed, nodes, 32);
  if (
    !sameEdgeReferences(microClosed, renderSafe)
    && candidateIsAccepted(renderSafe)
  ) return renderSafe as T;

  const ordered = repairBaseReactFlowFinalEndpointOrder(renderSafe, nodes, {
    eligibleEdgeIds: options.eligibleEdgeIds,
  });
  const orderedHardSafe = repairFastDisplayHardSafety(ordered, nodes);
  const orderedStrictClosed = repairFinalResidualStrictCrossings(orderedHardSafe, nodes);
  const orderedRenderSafe = repairRenderSafeEndpointStubs(
    repairDisplayMicroArtifacts(orderedStrictClosed),
    nodes,
    32,
  );
  const checkedCandidates: Edge[][] = [];
  for (const candidate of [ordered, orderedHardSafe, orderedStrictClosed, orderedRenderSafe]) {
    if (checkedCandidates.some(previous => sameEdgeReferences(previous, candidate))) continue;
    checkedCandidates.push(candidate);
    if (candidateIsAccepted(candidate)) {
      return candidate as T;
    }
  }

  return edges;
};
