import type { Edge, Node } from '@xyflow/react';

import { findStrictCrossings } from '../../strategies/shared/edgeDetachedOverlapRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  collectPathHitObstacleRects,
  extractDisplaySegments,
  getDisplayComputedPath,
  getDisplayNodeRect,
  isDisplayContainerNode,
  RESIDUAL_PARALLEL_LANE_GAP,
  sortedUniqueNumbers,
  type DisplayPoint,
  type DisplayRect,
  type DisplaySegment,
} from './baseReactFlowDisplayGeometry';
import { displayTerminalSideCanSwitch } from './baseReactFlowDisplayTerminalPolicy';

const TERMINAL_STUB = 48;
const MAX_RETURNED_CANDIDATES = 4;

type VerticalSide = 'top' | 'bottom';
type PortSide = VerticalSide | 'left' | 'right';

type BridgeEdge = (
  edge: Edge,
  path: DisplayPoint[],
  sourceSide: PortSide,
  targetSide: PortSide,
) => Edge;

interface BuildMixedTerminalBridgeOptions<T extends Edge[]> {
  edges: T;
  primary: DisplaySegment;
  companion: DisplaySegment;
  nodes: Node[];
  bridgeEdge: BridgeEdge;
}

interface RankedBridgeCandidate<T extends Edge[]> {
  edges: T;
  strictCrossings: number;
  length: number;
}

const verticalTerminal = (rect: DisplayRect, side: VerticalSide): DisplayPoint => ({
  x: rect.x + rect.width / 2,
  y: side === 'top' ? rect.y : rect.y + rect.height,
});

const verticalStub = (
  terminal: DisplayPoint,
  side: VerticalSide,
  laneX: number,
  graphSegments: DisplaySegment[],
  companionEdgeIndex: number,
): DisplayPoint => {
  let y = terminal.y + (side === 'top' ? -TERMINAL_STUB : TERMINAL_STUB);
  const minX = Math.min(terminal.x, laneX);
  const maxX = Math.max(terminal.x, laneX);
  for (let pass = 0; pass < 4; pass += 1) {
    const blockers = graphSegments.filter(segment => (
      segment.edgeIndex !== companionEdgeIndex
      && segment.axis === 'v'
      && segment.a.x > minX + 2
      && segment.a.x < maxX - 2
      && y > Math.min(segment.a.y, segment.b.y) + 2
      && y < Math.max(segment.a.y, segment.b.y) - 2
    ));
    if (blockers.length === 0) break;
    const nextY = side === 'top'
      ? Math.min(...blockers.map(segment => Math.min(segment.a.y, segment.b.y))) - TERMINAL_STUB
      : Math.max(...blockers.map(segment => Math.max(segment.a.y, segment.b.y))) + TERMINAL_STUB;
    if (side === 'top' ? nextY >= y : nextY <= y) break;
    y = nextY;
  }
  return { x: terminal.x, y };
};

const pathLength = (path: DisplayPoint[]): number => path.slice(0, -1).reduce(
  (length, point, index) => (
    length
    + Math.abs(path[index + 1].x - point.x)
    + Math.abs(path[index + 1].y - point.y)
  ),
  0,
);

/**
 * Builds an H-V-H bridge when a horizontal terminal is trapped by a vertical
 * spine. Both terminals move to vertical ports so the horizontal breakouts can
 * pass above or below adjacent spines before the long vertical leg begins.
 */
export const buildCrossedHorizontalMixedTerminalBridgeVariants = <T extends Edge[]>(
  options: BuildMixedTerminalBridgeOptions<T>,
): T[] => {
  const { edges, primary, companion, nodes, bridgeEdge } = options;
  if (primary.axis !== 'v' || companion.axis !== 'h') return [];
  const edge = edges[companion.edgeIndex];
  if (!edge) return [];
  const path = getDisplayComputedPath(edge);
  const companionAtSource = companion.segmentIndex === 0;
  const companionAtTarget = companion.segmentIndex === path.length - 2;
  if (path.length < 4 || companionAtSource === companionAtTarget) return [];

  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  if (!sourceNode || !targetNode) return [];
  const sourceRect = getDisplayNodeRect(sourceNode);
  const targetRect = getDisplayNodeRect(targetNode);
  if (!sourceRect || !targetRect) return [];

  const obstacleRects = nodes.flatMap(node => {
    if (
      node.id === edge.source
      || node.id === edge.target
      || isDisplayContainerNode(node)
    ) return [];
    const rect = getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  const routingRects = nodes.flatMap(node => {
    if (isDisplayContainerNode(node)) return [];
    const rect = getDisplayNodeRect(node);
    return rect ? [rect] : [];
  });
  const graphSegments = extractDisplaySegments(edges);
  const graphPoints = edges.flatMap(candidate => getDisplayComputedPath(candidate));
  const laneXs = sortedUniqueNumbers([
    primary.a.x - RESIDUAL_PARALLEL_LANE_GAP,
    primary.a.x + RESIDUAL_PARALLEL_LANE_GAP,
    ...routingRects.flatMap(rect => [
      rect.x - RESIDUAL_PARALLEL_LANE_GAP,
      rect.x + rect.width + RESIDUAL_PARALLEL_LANE_GAP,
    ]),
    ...graphSegments.flatMap(segment => segment.axis === 'h' ? [
      Math.min(segment.a.x, segment.b.x) - RESIDUAL_PARALLEL_LANE_GAP,
      Math.max(segment.a.x, segment.b.x) + RESIDUAL_PARALLEL_LANE_GAP,
    ] : []),
    Math.min(...graphPoints.map(point => point.x)) - TERMINAL_STUB,
    Math.max(...graphPoints.map(point => point.x)) + TERMINAL_STUB,
  ], (sourceRect.x + targetRect.x) / 2);
  const baselineStrictCrossings = findStrictCrossings(
    edges.map(candidate => getDisplayComputedPath(candidate)),
    edges,
  ).length;
  const ranked: RankedBridgeCandidate<T>[] = [];
  const pairSeeds: RankedBridgeCandidate<T>[] = [];

  for (const sourceSide of ['top', 'bottom'] as const) {
    if (!displayTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
    const source = verticalTerminal(sourceRect, sourceSide);
    for (const targetSide of ['top', 'bottom'] as const) {
      if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
      const target = verticalTerminal(targetRect, targetSide);
      for (const laneX of laneXs) {
        const baseSourceStub = {
          x: source.x,
          y: source.y + (sourceSide === 'top' ? -TERMINAL_STUB : TERMINAL_STUB),
        };
        const baseTargetStub = {
          x: target.x,
          y: target.y + (targetSide === 'top' ? -TERMINAL_STUB : TERMINAL_STUB),
        };
        const basePairPath = compactOrthogonalPath([
          source,
          baseSourceStub,
          { x: laneX, y: baseSourceStub.y },
          { x: laneX, y: baseTargetStub.y },
          baseTargetStub,
          target,
        ]);
        if (collectPathHitObstacleRects(basePairPath, obstacleRects).length === 0) {
          const baseBridged = bridgeEdge(edge, basePairPath, sourceSide, targetSide);
          const baseCandidateEdges = edges.map((candidate, edgeIndex) => (
            edgeIndex === companion.edgeIndex ? baseBridged : candidate
          )) as T;
          const baseStrictCrossings = findStrictCrossings(
            baseCandidateEdges.map(candidate => getDisplayComputedPath(candidate)),
            baseCandidateEdges,
          ).length;
          if (baseStrictCrossings <= baselineStrictCrossings + 3) {
            pairSeeds.push({
              edges: baseCandidateEdges,
              strictCrossings: baseStrictCrossings,
              length: pathLength(basePairPath),
            });
          }
        }
        const sourceStub = verticalStub(
          source,
          sourceSide,
          laneX,
          graphSegments,
          companion.edgeIndex,
        );
        const targetStub = verticalStub(
          target,
          targetSide,
          laneX,
          graphSegments,
          companion.edgeIndex,
        );
        const candidatePath = compactOrthogonalPath([
          source,
          sourceStub,
          { x: laneX, y: sourceStub.y },
          { x: laneX, y: targetStub.y },
          targetStub,
          target,
        ]);
        if (
          candidatePath.length < 4
          || collectPathHitObstacleRects(candidatePath, obstacleRects).length > 0
        ) continue;
        const bridged = bridgeEdge(edge, candidatePath, sourceSide, targetSide);
        const candidateEdges = edges.map((candidate, edgeIndex) => (
          edgeIndex === companion.edgeIndex ? bridged : candidate
        )) as T;
        const strictCrossings = findStrictCrossings(
          candidateEdges.map(candidate => getDisplayComputedPath(candidate)),
          candidateEdges,
        ).length;
        if (strictCrossings <= baselineStrictCrossings + 2) {
          pairSeeds.push({
            edges: candidateEdges,
            strictCrossings,
            length: pathLength(candidatePath),
          });
        }
        if (strictCrossings > baselineStrictCrossings) continue;
        ranked.push({
          edges: candidateEdges,
          strictCrossings,
          length: pathLength(candidatePath),
        });
      }
    }
  }

  const candidatesByPortPair = new Map<string, RankedBridgeCandidate<T>[]>();
  for (const candidate of pairSeeds
    .slice()
    .sort((first, second) => (
      first.strictCrossings - second.strictCrossings
      || first.length - second.length
    ))) {
    const candidateEdge = candidate.edges[companion.edgeIndex];
    if (!candidateEdge) continue;
    const key = `${candidateEdge.sourceHandle ?? ''}:${candidateEdge.targetHandle ?? ''}`;
    const bucket = candidatesByPortPair.get(key) ?? [];
    if (bucket.length >= 12) {
      const centerX = (sourceRect.x + sourceRect.width / 2 + targetRect.x + targetRect.width / 2) / 2;
      const extent = (item: RankedBridgeCandidate<T>) => Math.max(
        ...getDisplayComputedPath(item.edges[companion.edgeIndex])
          .map(point => Math.abs(point.x - centerX)),
      );
      const smallestExtentIndex = bucket.reduce((smallestIndex, item, index) => (
        extent(item) < extent(bucket[smallestIndex]) ? index : smallestIndex
      ), 0);
      if (extent(candidate) > extent(bucket[smallestExtentIndex])) {
        bucket[smallestExtentIndex] = candidate;
      }
      continue;
    }
    bucket.push(candidate);
    candidatesByPortPair.set(key, bucket);
  }
  const singleEdgeCandidates = [...candidatesByPortPair.values()].flat();
  for (const singleEdgeCandidate of singleEdgeCandidates) {
    const candidatePaths = singleEdgeCandidate.edges.map(candidate => getDisplayComputedPath(candidate));
    const blockerIndexes = [...new Set(findStrictCrossings(
      candidatePaths,
      singleEdgeCandidate.edges,
    ).flatMap(hit => {
      if (hit.a.edgeIndex === companion.edgeIndex) return [hit.b.edgeIndex];
      if (hit.b.edgeIndex === companion.edgeIndex) return [hit.a.edgeIndex];
      return [];
    }))];
    for (const blockerIndex of blockerIndexes) {
      const blocker = singleEdgeCandidate.edges[blockerIndex];
      if (!blocker) continue;
      const blockerSourceNode = nodeById.get(blocker.source);
      const blockerTargetNode = nodeById.get(blocker.target);
      if (!blockerSourceNode || !blockerTargetNode) continue;
      const blockerSourceRect = getDisplayNodeRect(blockerSourceNode);
      const blockerTargetRect = getDisplayNodeRect(blockerTargetNode);
      if (!blockerSourceRect || !blockerTargetRect) continue;
      const blockerObstacles = nodes.flatMap(node => {
        if (
          node.id === blocker.source
          || node.id === blocker.target
          || isDisplayContainerNode(node)
        ) return [];
        const rect = getDisplayNodeRect(node);
        return rect ? [rect] : [];
      });
      for (const side of ['left', 'right'] as const) {
        if (
          !displayTerminalSideCanSwitch(blocker, 'source', side)
          || !displayTerminalSideCanSwitch(blocker, 'target', side)
        ) continue;
        const source = {
          x: side === 'left'
            ? blockerSourceRect.x
            : blockerSourceRect.x + blockerSourceRect.width,
          y: blockerSourceRect.y + blockerSourceRect.height / 2,
        };
        const target = {
          x: side === 'left'
            ? blockerTargetRect.x
            : blockerTargetRect.x + blockerTargetRect.width,
          y: blockerTargetRect.y + blockerTargetRect.height / 2,
        };
        const trunkX = side === 'left'
          ? Math.min(
            source.x,
            target.x,
            ...routingRects.map(rect => rect.x),
            ...graphPoints.map(point => point.x),
            ...candidatePaths.flatMap(pathPoints => pathPoints.map(point => point.x)),
          ) - TERMINAL_STUB
          : Math.max(
            source.x,
            target.x,
            ...routingRects.map(rect => rect.x + rect.width),
            ...graphPoints.map(point => point.x),
            ...candidatePaths.flatMap(pathPoints => pathPoints.map(point => point.x)),
          ) + TERMINAL_STUB;
        const blockerPath = compactOrthogonalPath([
          source,
          { x: trunkX, y: source.y },
          { x: trunkX, y: target.y },
          target,
        ]);
        if (collectPathHitObstacleRects(blockerPath, blockerObstacles).length > 0) continue;
        const bridgedBlocker = bridgeEdge(blocker, blockerPath, side, side);
        const pairedEdges = singleEdgeCandidate.edges.map((candidate, edgeIndex) => (
          edgeIndex === blockerIndex ? bridgedBlocker : candidate
        )) as T;
        const pairedStrictCrossings = findStrictCrossings(
          pairedEdges.map(candidate => getDisplayComputedPath(candidate)),
          pairedEdges,
        ).length;
        if (pairedStrictCrossings > baselineStrictCrossings) continue;
        ranked.push({
          edges: pairedEdges,
          strictCrossings: pairedStrictCrossings,
          length: singleEdgeCandidate.length + pathLength(blockerPath),
        });
      }
    }
  }

  return ranked
    .sort((first, second) => (
      first.strictCrossings - second.strictCrossings
      || first.length - second.length
    ))
    .slice(0, MAX_RETURNED_CANDIDATES)
    .map(candidate => candidate.edges);
};
