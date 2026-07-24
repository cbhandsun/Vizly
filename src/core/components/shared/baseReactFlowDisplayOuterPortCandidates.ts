import type { Edge, Node } from '@xyflow/react';

import { normalizeHandle } from '../../routing/utils/handleUtils';
import { MIN_EDGE_PATH_PENALIZED_OVERLAP } from '../../strategies/shared/edgeStrictCrossingGuard';
import { countRoutingObstacleHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { compactOrthogonalPath } from './baseReactFlowDisplayEdgeCore';
import {
  buildDisplayRoutingObstacles,
  candidateUnrelatedOverlapForEdge,
  candidateStrictCrossingsForEdge,
  displayEdgesRelated,
  displaySegmentsForPath,
  extractDisplaySegments,
  fullDisplayPortSide,
  getDisplayComputedPath,
  getDisplayNodeRect,
  type DisplayPoint,
  type DisplayRect,
} from './baseReactFlowDisplayGeometry';
import {
  displayTerminalSideCanSwitch,
  withDisplayPortBridge,
} from './baseReactFlowDisplayTerminalPortCandidates';
import { buildDiverseFacingPortPathCandidates } from './baseReactFlowDisplayOuterFacingPortCandidates';
import { selectDiverseOuterPortPairSeeds } from './baseReactFlowDisplayOuterPortSeedSelection';
import {
  buildOuterPortTerminalStubPlan,
  type OuterPortTerminalStubProfile,
} from './baseReactFlowDisplayOuterPortStubProfiles';

export type OuterPortSide = 'top' | 'right' | 'bottom' | 'left';

export type OuterPortTransactionCandidate<T extends Edge[]> = {
  edges: T;
  movingEdgeIndex: number;
  ringAxis: 'x' | 'y';
  ringLane: number;
  transitionLane: number;
  quickScore: number;
};

export type OuterPortCandidateOptions = {
  minStub?: number;
  maxSeedCandidates?: number;
  maxCandidates?: number;
  maxPortCandidatesPerEdge?: number;
};

type PortCandidate = {
  edge: Edge;
  sourceSide: OuterPortSide;
  targetSide: OuterPortSide;
  path: DisplayPoint[];
  length: number;
  profileRank: number;
  sourceStub: number;
  targetStub: number;
};

type ResidualPair = {
  firstIndex: number;
  secondIndex: number;
  overlapLength: number;
};

const SIDES: OuterPortSide[] = ['top', 'right', 'bottom', 'left'];
const DEFAULT_MIN_STUB = 48;

const pathLength = (path: DisplayPoint[]): number => path.reduce((total, point, index) => (
  index === 0
    ? 0
    : total
      + Math.abs(point.x - path[index - 1].x)
      + Math.abs(point.y - path[index - 1].y)
), 0);

const pathSignature = (path: DisplayPoint[]): string => path
  .map(point => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
  .join('|');

const pathTangentSignature = (path: DisplayPoint[]): string => path.slice(1).map((point, index) => {
  const previous = path[index];
  if (Math.abs(point.x - previous.x) >= Math.abs(point.y - previous.y)) {
    return `h${Math.sign(point.x - previous.x)}`;
  }
  return `v${Math.sign(point.y - previous.y)}`;
}).join(':');

export const interleaveOuterPortCandidateBuckets = <T>(buckets: T[][], limit: number): T[] => {
  const result: T[] = [];
  const maxDepth = buckets.reduce((maximum, bucket) => Math.max(maximum, bucket.length), 0);
  for (let depth = 0; depth < maxDepth && result.length < limit; depth += 1) {
    for (const bucket of buckets) {
      const candidate = bucket[depth];
      if (!candidate) continue;
      result.push(candidate);
      if (result.length >= limit) break;
    }
  }
  return result;
};

const findLargestDetachedOverlap = (edges: Edge[]): ResidualPair | null => {
  const segmentsByEdge = edges.map((edge, edgeIndex) => (
    displaySegmentsForPath(getDisplayComputedPath(edge), edgeIndex)
  ));
  let best: ResidualPair | null = null;
  for (let firstIndex = 0; firstIndex < edges.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < edges.length; secondIndex += 1) {
      if (displayEdgesRelated(edges[firstIndex], edges[secondIndex])) continue;
      const overlapLength = candidateUnrelatedOverlapForEdge(
        firstIndex,
        getDisplayComputedPath(edges[firstIndex]),
        edges,
        segmentsByEdge[secondIndex],
      );
      if (
        overlapLength <= MIN_EDGE_PATH_PENALIZED_OVERLAP
        || (best && best.overlapLength >= overlapLength)
      ) continue;
      best = { firstIndex, secondIndex, overlapLength };
    }
  }
  return best;
};

const endpoint = (rect: DisplayRect, side: OuterPortSide): DisplayPoint => {
  if (side === 'top') return { x: rect.x + rect.width / 2, y: rect.y };
  if (side === 'bottom') return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  if (side === 'left') return { x: rect.x, y: rect.y + rect.height / 2 };
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
};

const outward = (point: DisplayPoint, side: OuterPortSide, stub: number): DisplayPoint => {
  if (side === 'top') return { x: point.x, y: point.y - stub };
  if (side === 'bottom') return { x: point.x, y: point.y + stub };
  if (side === 'left') return { x: point.x - stub, y: point.y };
  return { x: point.x + stub, y: point.y };
};

const unionRect = (rects: DisplayRect[]): DisplayRect => {
  const minX = Math.min(...rects.map(rect => rect.x));
  const minY = Math.min(...rects.map(rect => rect.y));
  const maxX = Math.max(...rects.map(rect => rect.x + rect.width));
  const maxY = Math.max(...rects.map(rect => rect.y + rect.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

const uniqueNumbers = (values: number[]): number[] => Array.from(
  new Map(values.filter(Number.isFinite).map(value => [value.toFixed(3), value])).values(),
);

const buildPortCandidates = (
  edges: Edge[],
  edgeIndex: number,
  pairIndex: number,
  nodes: Node[],
  nodeById: Map<string, Node>,
  obstacles: ReturnType<typeof buildDisplayRoutingObstacles>,
  baselineSegments: ReturnType<typeof extractDisplaySegments>,
  minStub: number,
  maxCandidates: number,
): PortCandidate[] => {
  const edge = edges[edgeIndex];
  const sourceNode = nodeById.get(edge.source);
  const targetNode = nodeById.get(edge.target);
  const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
  const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
  if (!sourceRect || !targetRect) return [];
  const externalSegments = baselineSegments
    .filter(segment => segment.edgeIndex !== edgeIndex && segment.edgeIndex !== pairIndex);
  const declaredSourceSide = fullDisplayPortSide(normalizeHandle(edge.sourceHandle)) ?? null;
  const declaredTargetSide = fullDisplayPortSide(normalizeHandle(edge.targetHandle)) ?? null;
  const sidePairBuckets: PortCandidate[][] = [];
  for (const sourceSide of SIDES) {
    if (!displayTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
    for (const targetSide of SIDES) {
      if (!displayTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
      const stubPlan = buildOuterPortTerminalStubPlan(
        minStub,
        sourceSide,
        targetSide,
        declaredSourceSide,
        declaredTargetSide,
      );
      const buildProfileCandidates = (
        profiles: OuterPortTerminalStubProfile[],
        rankOffset: number,
      ): PortCandidate[] => profiles.flatMap((profile, profileIndex) => (
        buildDiverseFacingPortPathCandidates(
          sourceRect,
          targetRect,
          sourceSide,
          targetSide,
          profile,
        ).map(path => {
          const compactPath = compactOrthogonalPath(path);
          return {
            edge: withDisplayPortBridge(edge, compactPath, sourceSide, targetSide),
            sourceSide,
            targetSide,
            path: compactPath,
            length: pathLength(compactPath),
            profileRank: rankOffset + profileIndex,
            sourceStub: profile.sourceStub,
            targetStub: profile.targetStub,
          };
        })
      )).filter(candidate => (
        countRoutingObstacleHits(candidate.path, candidate.edge, obstacles) === 0
        && candidateStrictCrossingsForEdge(edgeIndex, candidate.path, externalSegments) === 0
        && candidateUnrelatedOverlapForEdge(
          edgeIndex,
          candidate.path,
          edges,
          externalSegments,
        ) <= MIN_EDGE_PATH_PENALIZED_OVERLAP
      ));
      let sideCandidates = buildProfileCandidates(stubPlan.preferred, 0);
      if (sideCandidates.length === 0 && stubPlan.fallback.length > 0) {
        sideCandidates = buildProfileCandidates(stubPlan.fallback, stubPlan.preferred.length);
      }
      sideCandidates.sort((first, second) => (
        first.profileRank - second.profileRank || first.length - second.length
      ));
      const seenPaths = new Set<string>();
      const topologyBuckets = new Map<string, PortCandidate[]>();
      for (const candidate of sideCandidates) {
        const signature = pathSignature(candidate.path);
        if (seenPaths.has(signature)) continue;
        seenPaths.add(signature);
        const topology = pathTangentSignature(candidate.path);
        const bucket = topologyBuckets.get(topology) ?? [];
        bucket.push(candidate);
        topologyBuckets.set(topology, bucket);
      }
      const interleavedTopologies = interleaveOuterPortCandidateBuckets(
        Array.from(topologyBuckets.values()).map(bucket => (
          bucket.sort((first, second) => (
            first.profileRank - second.profileRank || first.length - second.length
          ))
        )),
        maxCandidates,
      );
      if (interleavedTopologies.length > 0) sidePairBuckets.push(interleavedTopologies);
    }
  }
  return interleaveOuterPortCandidateBuckets(sidePairBuckets, maxCandidates);
};

const segmentLaneBounds = (path: DisplayPoint[]) => {
  const horizontal: Array<{ lane: number; min: number; max: number }> = [];
  const vertical: Array<{ lane: number; min: number; max: number }> = [];
  for (let index = 1; index < path.length; index += 1) {
    const first = path[index - 1];
    const second = path[index];
    if (Math.abs(first.y - second.y) < 0.5) {
      horizontal.push({ lane: first.y, min: Math.min(first.x, second.x), max: Math.max(first.x, second.x) });
    } else if (Math.abs(first.x - second.x) < 0.5) {
      vertical.push({ lane: first.x, min: Math.min(first.y, second.y), max: Math.max(first.y, second.y) });
    }
  }
  return { horizontal, vertical };
};

export const buildBoundedOuterPortTransactionCandidates = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: OuterPortCandidateOptions = {},
): Array<OuterPortTransactionCandidate<T>> => {
  const minStub = Math.max(DEFAULT_MIN_STUB, options.minStub ?? DEFAULT_MIN_STUB);
  const maxSeedCandidates = Math.max(1, Math.min(32, options.maxSeedCandidates ?? 32));
  const maxCandidates = Math.max(1, Math.min(128, options.maxCandidates ?? 64));
  const maxPortCandidates = Math.max(4, Math.min(16, options.maxPortCandidatesPerEdge ?? 16));
  const pair = findLargestDetachedOverlap(edges);
  if (!pair) return [];
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const obstacles = buildDisplayRoutingObstacles(nodes);
  const baselineSegments = extractDisplaySegments(edges);
  const firstPorts = buildPortCandidates(
    edges,
    pair.firstIndex,
    pair.secondIndex,
    nodes,
    nodeById,
    obstacles,
    baselineSegments,
    minStub,
    maxPortCandidates,
  );
  const secondPorts = buildPortCandidates(
    edges,
    pair.secondIndex,
    pair.firstIndex,
    nodes,
    nodeById,
    obstacles,
    baselineSegments,
    minStub,
    maxPortCandidates,
  );
  if (firstPorts.length === 0 || secondPorts.length === 0) return [];

  const rankedSeeds = firstPorts.flatMap((first, firstIndex) => (
    secondPorts.map((second, secondIndex) => {
      const secondSegments = displaySegmentsForPath(second.path, pair.secondIndex);
      const pairStrict = candidateStrictCrossingsForEdge(
        pair.firstIndex,
        first.path,
        secondSegments,
      );
      const overlap = candidateUnrelatedOverlapForEdge(
        pair.firstIndex,
        first.path,
        edges,
        secondSegments,
      );
      const quickScore = pairStrict * 10_000_000 + overlap * 100_000 + first.length + second.length;
      return {
        firstIndex,
        secondIndex,
        quickScore,
        value: {
          first,
          second,
          quickScore,
        },
      };
    })
  ));
  const selectedPortPairs = selectDiverseOuterPortPairSeeds(
    rankedSeeds,
    firstPorts.length,
    secondPorts.length,
    maxSeedCandidates,
  );
  const seeds = selectedPortPairs.map(({ first, second, quickScore }) => ({
    edges: edges.map((edge, index) => (
      index === pair.firstIndex ? first.edge : index === pair.secondIndex ? second.edge : edge
    )) as T,
    ports: new Map<number, PortCandidate>([
      [pair.firstIndex, first],
      [pair.secondIndex, second],
    ]),
    quickScore,
  }));

  const nodeRects = nodes.map(getDisplayNodeRect).filter((rect): rect is DisplayRect => Boolean(rect));
  if (nodeRects.length === 0) return [];
  const graphBounds = unionRect(nodeRects);
  const generated: Array<OuterPortTransactionCandidate<T>> = [];
  for (const seed of seeds) {
    for (const movingEdgeIndex of [pair.firstIndex, pair.secondIndex]) {
      const fixedEdgeIndex = movingEdgeIndex === pair.firstIndex ? pair.secondIndex : pair.firstIndex;
      const movingPort = seed.ports.get(movingEdgeIndex);
      const movingEdge = seed.edges[movingEdgeIndex];
      const fixedEdge = seed.edges[fixedEdgeIndex];
      if (!movingPort || !movingEdge || !fixedEdge) continue;
      const sourceNode = nodeById.get(movingEdge.source);
      const targetNode = nodeById.get(movingEdge.target);
      const sourceRect = sourceNode ? getDisplayNodeRect(sourceNode) : null;
      const targetRect = targetNode ? getDisplayNodeRect(targetNode) : null;
      if (!sourceRect || !targetRect) continue;
      const source = endpoint(sourceRect, movingPort.sourceSide);
      const target = endpoint(targetRect, movingPort.targetSide);
      const sourceStub = outward(source, movingPort.sourceSide, movingPort.sourceStub);
      const targetStub = outward(target, movingPort.targetSide, movingPort.targetStub);
      const relevantBounds = [graphBounds, unionRect([sourceRect, targetRect])];
      for (const node of [sourceNode, targetNode]) {
        if (!node?.parentId) continue;
        const parentNode = nodeById.get(node.parentId);
        const parentRect = parentNode ? getDisplayNodeRect(parentNode) : null;
        if (parentRect) relevantBounds.push(parentRect);
      }
      const fixedPath = compactOrthogonalPath(getDisplayComputedPath(fixedEdge));
      const bounds = segmentLaneBounds(fixedPath);
      const outerXLanes = uniqueNumbers([
        ...relevantBounds.flatMap(rect => [rect.x - minStub, rect.x + rect.width + minStub]),
        ...bounds.vertical.flatMap(segment => [
          segment.lane - minStub,
          segment.lane - minStub / 2,
          segment.lane + minStub / 2,
          segment.lane + minStub,
        ]),
      ]);
      const outerYLanes = uniqueNumbers([
        ...relevantBounds.flatMap(rect => [rect.y - minStub, rect.y + rect.height + minStub]),
        ...bounds.horizontal.flatMap(segment => [
          segment.lane - minStub,
          segment.lane - minStub / 2,
          segment.lane + minStub / 2,
          segment.lane + minStub,
        ]),
      ]);
      const transitionXLanes = uniqueNumbers(bounds.horizontal.flatMap(segment => [
        segment.min - minStub,
        segment.max + minStub,
      ]).concat(bounds.vertical.flatMap(segment => [
        segment.lane - minStub,
        segment.lane - minStub / 2,
        segment.lane + minStub / 2,
        segment.lane + minStub,
      ])));
      const transitionYLanes = uniqueNumbers(bounds.vertical.flatMap(segment => [
        segment.min - minStub,
        segment.max + minStub,
      ]).concat(bounds.horizontal.flatMap(segment => [
        segment.lane - minStub,
        segment.lane - minStub / 2,
        segment.lane + minStub / 2,
        segment.lane + minStub,
      ])));
      const currentSignature = pathSignature(getDisplayComputedPath(movingEdge));
      const paths = [
        ...outerYLanes.flatMap(ringLane => transitionXLanes.map(transitionLane => ({
          ringAxis: 'y' as const,
          ringLane,
          transitionLane,
          path: compactOrthogonalPath([
            source,
            sourceStub,
            { x: sourceStub.x, y: ringLane },
            { x: transitionLane, y: ringLane },
            { x: transitionLane, y: targetStub.y },
            targetStub,
            target,
          ]),
        }))),
        ...outerXLanes.flatMap(ringLane => transitionYLanes.map(transitionLane => ({
          ringAxis: 'x' as const,
          ringLane,
          transitionLane,
          path: compactOrthogonalPath([
            source,
            sourceStub,
            { x: ringLane, y: sourceStub.y },
            { x: ringLane, y: transitionLane },
            { x: targetStub.x, y: transitionLane },
            targetStub,
            target,
          ]),
        }))),
      ];
      const otherSegments = extractDisplaySegments(seed.edges)
        .filter(segment => segment.edgeIndex !== movingEdgeIndex);
      for (const item of paths) {
        const degenerate = (
          (item.ringAxis === 'x'
            && (Math.abs(item.transitionLane - sourceStub.y) < 0.5
              || Math.abs(item.transitionLane - targetStub.y) < 0.5))
          || (item.ringAxis === 'y'
            && (Math.abs(item.transitionLane - sourceStub.x) < 0.5
              || Math.abs(item.transitionLane - targetStub.x) < 0.5))
        );
        if (degenerate) continue;
        const candidateEdge = withDisplayPortBridge(
          movingEdge,
          item.path,
          movingPort.sourceSide,
          movingPort.targetSide,
        );
        const path = compactOrthogonalPath(getDisplayComputedPath(candidateEdge));
        if (pathSignature(path) === currentSignature) continue;
        if (countRoutingObstacleHits(path, candidateEdge, obstacles) > 0) continue;
        if (candidateStrictCrossingsForEdge(movingEdgeIndex, path, otherSegments) > 0) continue;
        if (candidateUnrelatedOverlapForEdge(
          movingEdgeIndex,
          path,
          seed.edges,
          otherSegments,
        ) > MIN_EDGE_PATH_PENALIZED_OVERLAP) continue;
        generated.push({
          edges: seed.edges.map((edge, index) => (
            index === movingEdgeIndex ? candidateEdge : edge
          )) as T,
          movingEdgeIndex,
          ringAxis: item.ringAxis,
          ringLane: item.ringLane,
          transitionLane: item.transitionLane,
          quickScore: pathLength(path),
        });
      }
    }
  }

  const groups = new Map<string, Array<OuterPortTransactionCandidate<T>>>();
  for (const candidate of generated) {
    const key = `${candidate.movingEdgeIndex}:${candidate.ringAxis}`;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .flatMap(group => group.sort((first, second) => first.quickScore - second.quickScore).slice(0, 16))
    .sort((first, second) => first.quickScore - second.quickScore)
    .slice(0, maxCandidates);
};
