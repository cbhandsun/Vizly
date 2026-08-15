import type { Edge, Node } from '@xyflow/react';

import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { auditFinalSameSidePassageOrder } from '../../strategies/shared/edgeFinalSameSidePassageOrderRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  withDisplayComputedPath,
} from './baseReactFlowDisplayGeometry';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';

const handleSide = (handle: Edge['sourceHandle']): string => {
  const normalized = String(handle ?? '').trim().toLowerCase();
  return ['top', 'right', 'bottom', 'left']
    .find(side => normalized === side || normalized.endsWith(`-${side}`)) ?? '';
};

const replacePath = (
  edge: Edge,
  path: ReturnType<typeof getDisplayComputedPath>,
  sourceHandle: Edge['sourceHandle'] = edge.sourceHandle,
  targetHandle: Edge['targetHandle'] = edge.targetHandle,
): Edge => ({
  ...withDisplayComputedPath(edge, compactOrthogonalPath(path)),
  sourceHandle,
  targetHandle,
});

const candidateScore = (candidate: Edge[], nodes: Node[]): number => {
  const report = getDisplayHardQualityGateReport(candidate, nodes, 'polished');
  const passage = auditFinalSameSidePassageOrder(candidate, nodes);
  return (report.terminalsAttached ? 0 : 1_000_000)
    + (report.terminalsAnchored ? 0 : 500_000)
    + report.obstacleHits * 100_000
    + report.quality.nonOrthogonalSegments * 100_000
    + report.quality.strictCrossings * 10_000
    + report.quality.shortEndpointStubs * 1_000
    + report.quality.tinyInteriorDoglegs * 500
    + passage.passageDefects * 100;
};

export const buildPerpendicularSharedTargetTrunkCandidates = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[][] => {
  const hits = findDisplayStrictCrossingHits(edges);
  if (hits.length === 0) return [];
  const crossedIndexes = new Set(hits.flatMap(hit => [hit.a.edgeIndex, hit.b.edgeIndex]));
  const edgeIndexById = new Map(edges.map((edge, index) => [edge.id, index] as const));
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacleRects = nodes.flatMap(node => {
    const rect = isDisplayContainerNode(node) ? null : getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  if (obstacleRects.length === 0) return [];
  const targetTrunks = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks
    .filter(trunk => trunk.role === 'target' && trunk.edgeIds.length >= 2);
  const maximalTargetTrunks = targetTrunks.filter(trunk => !targetTrunks.some(other => (
    other !== trunk
    && other.nodeId === trunk.nodeId
    && other.edgeIds.length > trunk.edgeIds.length
    && trunk.edgeIds.every(edgeId => other.edgeIds.includes(edgeId))
  )));
  const candidates: Edge[][] = [];

  for (const trunk of maximalTargetTrunks) {
    const memberIndexes = trunk.edgeIds.flatMap(edgeId => {
      const index = edgeIndexById.get(edgeId);
      return index === undefined ? [] : [index];
    });
    if (memberIndexes.length < 2 || !memberIndexes.some(index => crossedIndexes.has(index))) continue;
    if (eligibleEdgeIds && memberIndexes.some(index => !eligibleEdgeIds.has(edges[index].id))) {
      continue;
    }
    const targetNode = nodeById.get(trunk.nodeId);
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    const members = memberIndexes.map(index => ({
      edge: edges[index],
      index,
      path: getDisplayComputedPath(edges[index]),
    }));
    if (!targetRect || members.some(member => member.path.length < 3)) continue;
    const memberXs = members.flatMap(member => member.path.map(point => point.x));
    const outsides = [
      { side: 'left' as const, x: Math.min(...memberXs, ...obstacleRects.map(rect => rect.x - 12)) },
      { side: 'right' as const, x: Math.max(...memberXs, ...obstacleRects.map(rect => rect.x + rect.width + 12)) },
    ];

    for (const outside of outsides) {
      const targetEndpoint = {
        x: outside.side === 'left' ? targetRect.x : targetRect.x + targetRect.width,
        y: targetRect.y + targetRect.height / 2,
      };
      const prefixChoices = members.map(member => {
        const desiredDirection = outside.side === 'left' ? -1 : 1;
        const sibling = edges.flatMap(edge => {
          if (edge.id === member.edge.id || edge.source !== member.edge.source
            || handleSide(edge.sourceHandle) !== handleSide(member.edge.sourceHandle)) return [];
          const path = getDisplayComputedPath(edge);
          return path.length >= 3 && Math.sign(path[2].x - path[1].x) === desiredDirection
            ? [{ edge, path }]
            : [];
        }).sort((first, second) => (
          Math.abs(first.path[1].y - member.path[1].y)
          - Math.abs(second.path[1].y - member.path[1].y)
        ))[0];
        const own = { path: member.path.slice(0, 2), sourceHandle: member.edge.sourceHandle };
        if (!sibling) return [own];
        const shared = { path: sibling.path.slice(0, 2), sourceHandle: sibling.edge.sourceHandle };
        const matches = shared.path.every((point, index) => (
          Math.abs(point.x - own.path[index].x) <= 0.5
          && Math.abs(point.y - own.path[index].y) <= 0.5
        ));
        return matches ? [own] : [own, shared];
      });
      if (prefixChoices.length > 5) continue;
      const combinations = Math.min(32, prefixChoices.reduce((count, choices) => (
        count * choices.length
      ), 1));
      for (let combination = 0; combination < combinations; combination += 1) {
        let selector = combination;
        const next = edges.slice();
        const selectedSourcePrefixes = new Map<string, {
          side: string;
          first: Readonly<{ x: number; y: number }>;
          second: Readonly<{ x: number; y: number }>;
        }>();
        members.forEach((member, memberIndex) => {
          const choices = prefixChoices[memberIndex];
          const prefix = choices[selector % choices.length];
          selector = Math.floor(selector / choices.length);
          const branch = prefix.path[prefix.path.length - 1];
          const sourceSide = handleSide(prefix.sourceHandle);
          selectedSourcePrefixes.set(`${member.edge.source}\u001f${sourceSide}`, {
            side: sourceSide,
            first: prefix.path[0],
            second: prefix.path[1],
          });
          next[member.index] = replacePath(member.edge, [
            ...prefix.path,
            { x: outside.x, y: branch.y },
            { x: outside.x, y: targetEndpoint.y },
            targetEndpoint,
          ], prefix.sourceHandle, outside.side);
        });
        let sourceBundleEligible = true;
        next.forEach((edge, edgeIndex) => {
          if (members.some(member => member.index === edgeIndex)) return;
          const side = handleSide(edge.sourceHandle);
          const prefix = selectedSourcePrefixes.get(`${edge.source}\u001f${side}`);
          const path = getDisplayComputedPath(edge);
          if (!prefix || path.length < 2) return;
          const vertical = side === 'top' || side === 'bottom';
          const alreadyAligned = vertical
            ? Math.abs(path[0].x - prefix.first.x) <= 0.5
              && Math.abs(path[1].x - prefix.second.x) <= 0.5
            : Math.abs(path[0].y - prefix.first.y) <= 0.5
              && Math.abs(path[1].y - prefix.second.y) <= 0.5;
          if (alreadyAligned) return;
          if (eligibleEdgeIds && !eligibleEdgeIds.has(edge.id)) {
            sourceBundleEligible = false;
            return;
          }
          const alignedPath = path.map((point, pointIndex) => {
            if (pointIndex > 1) return point;
            return vertical
              ? { x: pointIndex === 0 ? prefix.first.x : prefix.second.x, y: point.y }
              : { x: point.x, y: pointIndex === 0 ? prefix.first.y : prefix.second.y };
          });
          next[edgeIndex] = replacePath(edge, alignedPath);
        });
        if (!sourceBundleEligible) continue;
        candidates.push(next);
      }
    }
  }
  return candidates.map(candidate => ({ candidate, score: candidateScore(candidate, nodes) }))
    .sort((first, second) => first.score - second.score)
    .slice(0, 2)
    .map(item => item.candidate);
};

export const buildForwardReverseOuterPairCandidates = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[][] => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacleRects = nodes.flatMap(node => {
    const rect = isDisplayContainerNode(node) ? null : getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  if (obstacleRects.length === 0) return [];
  const candidates: Edge[][] = [];
  for (const hit of findDisplayStrictCrossingHits(edges)) {
    const pair = [hit.a.edgeIndex, hit.b.edgeIndex].map(index => {
      const edge = edges[index];
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      return {
        edge,
        index,
        sourceRect: sourceNode ? getDisplayNodeRect(sourceNode) : null,
        targetRect: targetNode ? getDisplayNodeRect(targetNode) : null,
        path: getDisplayComputedPath(edge),
      };
    });
    const forward = pair.find(item => item.sourceRect && item.targetRect
      && item.sourceRect.y < item.targetRect.y && handleSide(item.edge.sourceHandle) === 'bottom');
    const reverse = pair.find(item => item.sourceRect && item.targetRect
      && item.sourceRect.y > item.targetRect.y && handleSide(item.edge.sourceHandle) === 'top');
    if (!forward?.sourceRect || !forward.targetRect || !reverse?.sourceRect || !reverse.targetRect
      || forward.path.length < 2 || reverse.path.length < 2) continue;
    if (eligibleEdgeIds && (!eligibleEdgeIds.has(forward.edge.id)
      || !eligibleEdgeIds.has(reverse.edge.id))) continue;
    const direction = forward.targetRect.x >= forward.sourceRect.x ? 1 : -1;
    const sourceEndpoint = {
      x: direction > 0 ? forward.sourceRect.x + forward.sourceRect.width : forward.sourceRect.x,
      y: forward.sourceRect.y + forward.sourceRect.height / 2,
    };
    const sourceStub = { x: sourceEndpoint.x + direction * 56, y: sourceEndpoint.y };
    const outerX = direction > 0
      ? Math.max(...obstacleRects.map(rect => rect.x + rect.width)) + 20
      : Math.min(...obstacleRects.map(rect => rect.x)) - 20;
    const outerY = Math.min(...obstacleRects.map(rect => rect.y)) - 20;
    const forwardTarget = {
      x: forward.targetRect.x + forward.targetRect.width / 2,
      y: forward.targetRect.y,
    };
    const reverseSource = reverse.path[0];
    const reverseTarget = reverse.path[reverse.path.length - 1];
    const reverseBranchY = Math.max(
      reverseTarget.y + 56,
      forward.sourceRect.y + forward.sourceRect.height + 48,
    );
    const next = edges.slice();
    next[forward.index] = replacePath(forward.edge, [
      sourceEndpoint,
      sourceStub,
      { x: sourceStub.x, y: outerY },
      { x: outerX, y: outerY },
      { x: outerX, y: forwardTarget.y - 56 },
      { x: forwardTarget.x, y: forwardTarget.y - 56 },
      forwardTarget,
    ], direction > 0 ? 'right' : 'left', 'top');
    next[reverse.index] = replacePath(reverse.edge, [
      reverseSource,
      { x: reverseSource.x, y: reverseBranchY },
      { x: reverseTarget.x, y: reverseBranchY },
      reverseTarget,
    ]);
    candidates.push(next);
  }
  return candidates;
};

const promoteCrossedForwardOuterSpines = (
  candidate: Edge[],
  nodes: Node[],
  primaryEdgeIndex: number,
  targetTrunkX: number,
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[] | null => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacleRects = nodes.flatMap(node => {
    const rect = isDisplayContainerNode(node) ? null : getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  if (obstacleRects.length === 0) return candidate;
  const next = candidate.slice();
  const promotedIndexes = new Set<number>();

  for (const hit of findDisplayStrictCrossingHits(candidate)) {
    const primarySegment = hit.a.edgeIndex === primaryEdgeIndex
      ? hit.a
      : hit.b.edgeIndex === primaryEdgeIndex ? hit.b : null;
    if (!primarySegment) continue;
    const barrierSegment = primarySegment === hit.a ? hit.b : hit.a;
    if (primarySegment.axis !== 'h' || barrierSegment.axis !== 'v') continue;
    if (promotedIndexes.has(barrierSegment.edgeIndex)) continue;
    const barrier = next[barrierSegment.edgeIndex];
    if (!barrier || (eligibleEdgeIds && !eligibleEdgeIds.has(barrier.id))) return null;
    const sourceNode = nodeById.get(barrier.source);
    const targetNode = nodeById.get(barrier.target);
    const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    const path = getDisplayComputedPath(barrier);
    if (!sourceRect || !targetRect || sourceRect.y >= targetRect.y
      || handleSide(barrier.targetHandle) !== 'top'
      || !['left', 'right'].includes(handleSide(barrier.sourceHandle))
      || barrierSegment.segmentIndex < 1
      || barrierSegment.segmentIndex >= path.length - 2) continue;
    const direction = targetRect.x + targetRect.width / 2
      >= sourceRect.x + sourceRect.width / 2 ? 1 : -1;
    const promotedX = direction > 0
      ? Math.max(
        targetTrunkX + 48,
        ...obstacleRects.map(rect => rect.x + rect.width + 48),
      )
      : Math.min(
        targetTrunkX - 48,
        ...obstacleRects.map(rect => rect.x - 48),
      );
    const currentX = barrierSegment.a.x;
    if ((direction > 0 && currentX >= promotedX - 0.5)
      || (direction < 0 && currentX <= promotedX + 0.5)) continue;
    const movedPath = path.map((point, pointIndex) => (
      pointIndex === barrierSegment.segmentIndex
        || pointIndex === barrierSegment.segmentIndex + 1
        ? { x: promotedX, y: point.y }
        : point
    ));
    next[barrierSegment.edgeIndex] = replacePath(barrier, movedPath);
    promotedIndexes.add(barrierSegment.edgeIndex);
  }
  return next;
};

const alignReversePassageWithPromotedOuterSpine = (
  candidate: Edge[],
  memberIndexes: readonly number[],
  primaryEdgeIndex: number,
  targetEndpoint: Readonly<{ x: number; y: number }>,
): Edge[] => {
  const memberIndexSet = new Set(memberIndexes);
  const closureHit = findDisplayStrictCrossingHits(candidate).find(hit => {
    const firstIsMember = memberIndexSet.has(hit.a.edgeIndex);
    const secondIsMember = memberIndexSet.has(hit.b.edgeIndex);
    if (firstIsMember === secondIsMember) return false;
    const passage = firstIsMember ? hit.a : hit.b;
    const barrier = firstIsMember ? hit.b : hit.a;
    return passage.edgeIndex !== primaryEdgeIndex
      && passage.axis === 'v'
      && barrier.axis === 'h';
  });
  if (!closureHit) return candidate;
  const firstIsMember = memberIndexSet.has(closureHit.a.edgeIndex);
  const barrier = firstIsMember ? closureHit.b : closureHit.a;
  const barrierPath = getDisplayComputedPath(candidate[barrier.edgeIndex]);
  const beforeLength = barrier.segmentIndex > 0
    && barrierPath[barrier.segmentIndex - 1]?.x === barrierPath[barrier.segmentIndex]?.x
    ? Math.abs(
      barrierPath[barrier.segmentIndex].y - barrierPath[barrier.segmentIndex - 1].y,
    )
    : -1;
  const afterLength = barrier.segmentIndex + 2 < barrierPath.length
    && barrierPath[barrier.segmentIndex + 1]?.x === barrierPath[barrier.segmentIndex + 2]?.x
    ? Math.abs(
      barrierPath[barrier.segmentIndex + 2].y - barrierPath[barrier.segmentIndex + 1].y,
    )
    : -1;
  const outsidePoint = beforeLength >= afterLength
    ? barrierPath[barrier.segmentIndex]
    : barrierPath[barrier.segmentIndex + 1];
  if (!outsidePoint) return candidate;
  const boundaryY = barrier.a.y;
  const directionToTarget = Math.sign(targetEndpoint.y - boundaryY);
  if (directionToTarget === 0) return candidate;
  // A sub-20px co-location at the outside elbow is rendered as one intentional
  // corridor, while keeping the unrelated paths free of a strict crossing.
  const joinY = boundaryY + directionToTarget * 19;
  const next = candidate.slice();
  for (const memberIndex of memberIndexes) {
    const member = next[memberIndex];
    const path = member ? getDisplayComputedPath(member) : [];
    if (!member || path.length < 4) continue;
    if (memberIndex === primaryEdgeIndex) {
      const changed = path.map((point, pointIndex) => (
        pointIndex === path.length - 3 || pointIndex === path.length - 2
          ? { x: point.x, y: joinY }
          : point
      ));
      next[memberIndex] = replacePath(member, changed);
      continue;
    }
    const outerJoinIndex = path.length - 3;
    const outerStartIndex = outerJoinIndex - 1;
    const targetJoinIndex = path.length - 2;
    const sameOutside = Math.sign(path[outerJoinIndex].x - targetEndpoint.x)
      === Math.sign(outsidePoint.x - targetEndpoint.x);
    const changed = path.map((point, pointIndex) => {
      if (pointIndex === outerJoinIndex || pointIndex === targetJoinIndex) {
        return {
          x: sameOutside && pointIndex === outerJoinIndex ? outsidePoint.x : point.x,
          y: joinY,
        };
      }
      if (sameOutside && pointIndex === outerStartIndex) {
        return { x: outsidePoint.x, y: point.y };
      }
      return point;
    });
    next[memberIndex] = replacePath(member, changed);
  }
  return next;
};

/**
 * Rebuilds an upward many-to-one passage as a dual-trunk transaction: the
 * nearest incoming edge retains/reuses its top source trunk, remote incoming
 * edges use one outside corridor, and all members share the final bottom-side
 * target trunk. This is the bounded mirror of the perpendicular target bundle
 * above and is only emitted for an audited reverse-passage defect.
 */
export const buildReversePassageTargetTrunkCandidates = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
): Edge[][] => {
  const audit = auditFinalSameSidePassageOrder(edges, nodes);
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacleRects = nodes.flatMap(node => {
    const rect = isDisplayContainerNode(node) ? null : getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  if (obstacleRects.length === 0) return [];
  const candidates: Edge[][] = [];

  for (const group of audit.groups) {
    if (group.role !== 'target' || group.side !== 'bottom' || group.reversePassageDefects === 0) {
      continue;
    }
    const targetNode = nodeById.get(group.nodeId);
    const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
    if (!targetRect) continue;
    const members = edges.flatMap((edge, index) => {
      if (edge.target !== group.nodeId || handleSide(edge.targetHandle) !== 'bottom') return [];
      const sourceNode = nodeById.get(edge.source);
      const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
      const path = getDisplayComputedPath(edge);
      return sourceRect && path.length >= 2 ? [{ edge, index, path, sourceRect }] : [];
    });
    if (members.length < 2 || members.some(member => member.sourceRect.y <= targetRect.y)) continue;
    if (eligibleEdgeIds && members.some(member => !eligibleEdgeIds.has(member.edge.id))) continue;
    const primary = [...members]
      .filter(member => handleSide(member.edge.sourceHandle) === 'top')
      .sort((first, second) => first.sourceRect.y - second.sourceRect.y)[0];
    if (!primary) continue;
    const targetEndpoint = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height,
    };
    const joinY = Math.max(targetEndpoint.y + 56, primary.sourceRect.y - 112);
    const primarySource = primary.path[0];
    const next = edges.slice();
    next[primary.index] = replacePath(primary.edge, [
      primarySource,
      { x: primarySource.x, y: joinY },
      { x: targetEndpoint.x, y: joinY },
      targetEndpoint,
    ], primary.edge.sourceHandle, 'bottom');

    for (const member of members) {
      if (member.index === primary.index) continue;
      const sourceCenterX = member.sourceRect.x + member.sourceRect.width / 2;
      const direction = targetEndpoint.x >= sourceCenterX ? 1 : -1;
      const sourceEndpoint = {
        x: direction > 0
          ? member.sourceRect.x + member.sourceRect.width
          : member.sourceRect.x,
        y: member.sourceRect.y + member.sourceRect.height / 2,
      };
      const sourceStub = { x: sourceEndpoint.x + direction * 56, y: sourceEndpoint.y };
      const detourY = member.sourceRect.y + member.sourceRect.height + 24;
      const outsideX = direction > 0
        ? Math.max(...obstacleRects.map(rect => rect.x + rect.width)) + 20
        : Math.min(...obstacleRects.map(rect => rect.x)) - 20;
      next[member.index] = replacePath(member.edge, [
        sourceEndpoint,
        sourceStub,
        { x: sourceStub.x, y: detourY },
        { x: outsideX, y: detourY },
        { x: outsideX, y: joinY },
        { x: targetEndpoint.x, y: joinY },
        targetEndpoint,
      ], direction > 0 ? 'right' : 'left', 'bottom');
    }
    const promoted = promoteCrossedForwardOuterSpines(
      next,
      nodes,
      primary.index,
      targetEndpoint.x,
      eligibleEdgeIds,
    );
    if (promoted) {
      candidates.push(alignReversePassageWithPromotedOuterSpine(
        promoted,
        members.map(member => member.index),
        primary.index,
        targetEndpoint,
      ));
    }
  }
  return candidates;
};
