import type { Edge, Node as ReactFlowNode } from '@xyflow/react';
import {
  edgeTerminalSideCanSwitch,
  resolveEdgeTerminalHandleForSide,
} from '../../routing/utils/edgeTerminalPolicy';
import {
  buildHemisphereTargetCandidatePaths,
  compactPath,
  EPS,
  expectedTargetSideFromGeometry,
  firstStepBacktracksFromTarget,
  MIN_ENDPOINT_TAIL,
  nodeRect,
  oppositeSide,
  pathHitsUnrelatedNode,
  rectCenter,
  type Point,
  type Side,
} from './edgeSharedTrunkSynthesisUtils';
import {
  HEMISPHERE_ESCAPE_MIN,
  HEMISPHERE_ESCAPE_RATIO,
  MIN_DIRECTIONAL_TARGET_ANCHOR_SPAN,
  MIN_GROUP_SIZE,
  TARGET_ENTRY_CROSSING_WINDOW,
  branchSegment,
  branchValue,
  buildTargetEntryJoinCandidate,
  crossingScore,
  distanceFromSegmentEnd,
  endpointAnchorMain,
  getEdgePath,
  median,
  normalizeSharedTrunkEdges,
  normalizeSharedTrunkOptions,
  oppositeGeometrySide,
  pathLength,
  samePath,
  sharedBranchValue,
  sourceSide,
  strictCrossPoint,
  synthesizeSourcePath,
  targetAnchorHalfDirection,
  targetApproachDirection,
  targetSide,
  totalStrictCrossings,
  withComputedPath,
  type EndpointKind,
  type SharedTrunkSynthesisOptions,
} from './edgeSharedTrunkSynthesisCore';
import { refineSourceBranchLanesByDirection } from './edgeSharedTrunkSourceLaneRefinement';

function splitNodeGeometryHemisphereGroups(
  edges: Edge[],
  indices: number[],
  endpoint: EndpointKind,
  nodes: ReactFlowNode[] | undefined,
): number[][] | null {
  if (!nodes || indices.length < MIN_GROUP_SIZE) return null;
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const hubId = endpoint === 'source' ? edges[indices[0]]?.source : edges[indices[0]]?.target;
  const hubRect = nodeRect(nodeById.get(hubId), nodeById);
  if (!hubRect) return null;
  const hubCenter = rectCenter(hubRect);

  const entries: Array<{ index: number; peerCenter: Point; dx: number; dy: number }> = [];
  for (const index of indices) {
    const edge = edges[index];
    const peerId = endpoint === 'source' ? edge?.target : edge?.source;
    const peerRect = nodeRect(nodeById.get(peerId), nodeById);
    if (!peerRect) continue;
    const peerCenter = rectCenter(peerRect);
    entries.push({
      index,
      peerCenter,
      dx: peerCenter.x - hubCenter.x,
      dy: peerCenter.y - hubCenter.y,
    });
  }
  if (entries.length < MIN_GROUP_SIZE) return null;

  const centroid = entries.reduce(
    (acc, entry) => ({ x: acc.x + entry.peerCenter.x, y: acc.y + entry.peerCenter.y }),
    { x: 0, y: 0 },
  );
  centroid.x /= entries.length;
  centroid.y /= entries.length;
  const flowDx = centroid.x - hubCenter.x;
  const flowDy = centroid.y - hubCenter.y;
  const isVerticalFlow = Math.abs(flowDy) >= Math.abs(flowDx);

  const sideGroups = new Map<string, number[]>();
  for (const entry of entries) {
    let side: string;
    if (isVerticalFlow) {
      side = Math.abs(entry.dx) > Math.abs(entry.dy) * HEMISPHERE_ESCAPE_RATIO
        && Math.abs(entry.dx) > HEMISPHERE_ESCAPE_MIN
        ? (entry.dx < 0 ? 'left' : 'right')
        : (entry.dy < 0 ? 'top' : 'bottom');
    } else {
      side = Math.abs(entry.dy) > Math.abs(entry.dx) * HEMISPHERE_ESCAPE_RATIO
        && Math.abs(entry.dy) > HEMISPHERE_ESCAPE_MIN
        ? (entry.dy < 0 ? 'top' : 'bottom')
        : (entry.dx < 0 ? 'left' : 'right');
    }
    if (!sideGroups.has(side)) sideGroups.set(side, []);
    sideGroups.get(side)?.push(entry.index);
  }

  if (sideGroups.size < 2) return null;

  let largestSide = '';
  let largestCount = 0;
  for (const [side, group] of sideGroups) {
    if (group.length > largestCount) {
      largestSide = side;
      largestCount = group.length;
    }
  }

  if (largestCount >= MIN_GROUP_SIZE) {
    const singletonKeys: string[] = [];
    for (const [side, group] of sideGroups) {
      if (side === largestSide || group.length !== 1) continue;
      if (!oppositeGeometrySide(side, largestSide)) {
        sideGroups.get(largestSide)?.push(...group);
        singletonKeys.push(side);
      }
    }
    for (const key of singletonKeys) sideGroups.delete(key);
  }

  return sideGroups.size >= 2 ? [...sideGroups.values()] : null;
}

function splitTargetDirectionGroups(paths: Point[][], indices: number[], side: Side): number[][] {
  if (indices.length < MIN_GROUP_SIZE) return [indices];
  const anchorByIndex = new Map<number, number>();
  for (const index of indices) {
    const anchor = endpointAnchorMain(paths[index], side, 'target');
    if (typeof anchor === 'number' && Number.isFinite(anchor)) {
      anchorByIndex.set(index, anchor);
    }
  }
  const anchorValues = [...anchorByIndex.values()];
  if (anchorValues.length < MIN_GROUP_SIZE) return [indices];
  const anchorSpan = Math.max(...anchorValues) - Math.min(...anchorValues);
  if (anchorSpan < MIN_DIRECTIONAL_TARGET_ANCHOR_SPAN) return [indices];
  const anchorCenter = median(anchorValues);

  const directionGroups = new Map<number, number[]>();
  const neutralIndices: number[] = [];
  const neutralSingletonGroups: number[][] = [];
  for (const index of indices) {
    const direction = targetApproachDirection(paths[index], side);
    if (direction === 0) {
      neutralIndices.push(index);
      continue;
    }
    if (!directionGroups.has(direction)) directionGroups.set(direction, []);
    directionGroups.get(direction)?.push(index);
  }

  for (const index of neutralIndices) {
    const anchor = anchorByIndex.get(index);
    const anchorDirection = typeof anchor === 'number'
      ? targetAnchorHalfDirection(anchor, anchorCenter)
      : 0;
    if (anchorDirection === 0) {
      neutralSingletonGroups.push([index]);
      continue;
    }
    if (!directionGroups.has(anchorDirection)) directionGroups.set(anchorDirection, []);
    directionGroups.get(anchorDirection)?.push(index);
  }

  if (directionGroups.size + neutralSingletonGroups.length < 2) return [indices];
  return [...directionGroups.values(), ...neutralSingletonGroups];
}

function synthesizeTargetPath(path: Point[], side: Side, anchorMain: number, branchValue: number): Point[] {
  const end = path[path.length - 1];
  const branch = branchSegment(path, side, 'target');
  if (!branch) {
    const beforeEnd = path[path.length - 2];
    const prefix = path.slice(0, -1);
    if (!beforeEnd) return path;

    if (side === 'top' || side === 'bottom') {
      const anchor = { x: anchorMain, y: end.y };
      return compactPath([
        ...prefix,
        { x: beforeEnd.x, y: branchValue },
        { x: anchorMain, y: branchValue },
        anchor,
      ]);
    }

    const anchor = { x: end.x, y: anchorMain };
    return compactPath([
      ...prefix,
      { x: branchValue, y: beforeEnd.y },
      { x: branchValue, y: anchorMain },
      anchor,
    ]);
  }

  if (side === 'top' || side === 'bottom') {
    const anchor = { x: anchorMain, y: end.y };
    const prefix = path.slice(0, branch.index + 2);
    if (Math.abs(branch.a.y - branchValue) <= EPS) {
      return compactPath([
        ...prefix,
        { x: anchorMain, y: branchValue },
        anchor,
      ]);
    }
    return compactPath([
      ...prefix,
      { x: branch.b.x, y: branchValue },
      { x: anchorMain, y: branchValue },
      anchor,
    ]);
  }

  const anchor = { x: end.x, y: anchorMain };
  const prefix = path.slice(0, branch.index + 2);
  if (Math.abs(branch.a.x - branchValue) <= EPS) {
    return compactPath([
      ...prefix,
      { x: branchValue, y: anchorMain },
      anchor,
    ]);
  }
  return compactPath([
    ...prefix,
    { x: branchValue, y: branch.b.y },
    { x: branchValue, y: anchorMain },
    anchor,
  ]);
}

export function repairSharedTargetEntryCrossings(edges: Edge[]): Edge[] {
  edges = normalizeSharedTrunkEdges(edges);
  let paths = edges.map(edge => getEdgePath(edge));
  if (paths.filter(path => path.length >= 2).length < 2) return edges;

  const nextEdges = [...edges];
  let changed = false;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const currentScore = totalStrictCrossings(nextEdges, paths);
    let bestScore = currentScore;
    let bestIndex = -1;
    let bestPath: Point[] | null = null;

    for (let firstIndex = 0; firstIndex < paths.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < paths.length; secondIndex += 1) {
        if (!nextEdges[firstIndex]?.target || nextEdges[firstIndex]?.target !== nextEdges[secondIndex]?.target) continue;
        const firstPath = paths[firstIndex];
        const secondPath = paths[secondIndex];
        for (let i = 0; i < firstPath.length - 1; i += 1) {
          for (let j = 0; j < secondPath.length - 1; j += 1) {
            const crossing = strictCrossPoint(firstPath[i], firstPath[i + 1], secondPath[j], secondPath[j + 1]);
            if (!crossing) continue;

            const candidates: Array<{ edgeIndex: number; path: Point[] | null }> = [];
            if (distanceFromSegmentEnd(firstPath, i) <= TARGET_ENTRY_CROSSING_WINDOW) {
              candidates.push({ edgeIndex: firstIndex, path: buildTargetEntryJoinCandidate(firstPath, i, crossing) });
            }
            if (distanceFromSegmentEnd(secondPath, j) <= TARGET_ENTRY_CROSSING_WINDOW) {
              candidates.push({ edgeIndex: secondIndex, path: buildTargetEntryJoinCandidate(secondPath, j, crossing) });
            }

            for (const candidate of candidates) {
              if (!candidate.path || samePath(paths[candidate.edgeIndex], candidate.path)) continue;
              const candidatePaths = paths.map((path, index) => (index === candidate.edgeIndex ? candidate.path as Point[] : path));
              const candidateScore = totalStrictCrossings(nextEdges, candidatePaths);
              const currentLength = pathLength(paths[candidate.edgeIndex]);
              const candidateLength = pathLength(candidate.path);
              if (candidateScore < bestScore || (candidateScore === bestScore && candidateLength + 32 < currentLength)) {
                bestScore = candidateScore;
                bestIndex = candidate.edgeIndex;
                bestPath = candidate.path;
              }
            }
          }
        }
      }
    }

    if (bestIndex < 0 || !bestPath) break;
    paths = paths.map((path, index) => (index === bestIndex ? bestPath as Point[] : path));
    nextEdges[bestIndex] = withComputedPath(nextEdges[bestIndex], bestPath);
    changed = true;
  }

  return changed ? nextEdges : edges;
}

function applySharedEndpointTrunks(
  edges: Edge[],
  endpoint: EndpointKind,
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  const paths = edges.map(edge => getEdgePath(edge));
  const groups = new Map<string, number[]>();

  edges.forEach((edge, index) => {
    const path = paths[index];
    const side = endpoint === 'source' ? sourceSide(path) : targetSide(path);
    const currentBranchValue = side ? branchValue(path, side, endpoint) : null;
    if (!side || currentBranchValue === null) return;
    const endpointId = endpoint === 'source' ? edge.source : edge.target;
    const key = `${endpointId}:${side}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(index);
  });

  const nextEdges = [...edges];
  for (const [, indices] of groups) {
    if (indices.length < MIN_GROUP_SIZE) continue;
    const side = endpoint === 'source' ? sourceSide(paths[indices[0]]) : targetSide(paths[indices[0]]);
    if (!side) continue;
    const nodeGeometryGroups = endpoint === 'target'
      ? splitNodeGeometryHemisphereGroups(edges, indices, endpoint, options.nodes)
      : null;
    const subgroupList = nodeGeometryGroups
      ?? (endpoint === 'target' ? splitTargetDirectionGroups(paths, indices, side) : [indices]);

    for (const subgroup of subgroupList) {
      if (subgroup.length < MIN_GROUP_SIZE) continue;
      const branchValues = subgroup
        .map(index => branchValue(paths[index], side, endpoint))
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (branchValues.length < MIN_GROUP_SIZE) continue;
      const anchorMain = median(subgroup.map(index => (
        side === 'top' || side === 'bottom'
          ? paths[index][endpoint === 'source' ? 0 : paths[index].length - 1].x
          : paths[index][endpoint === 'source' ? 0 : paths[index].length - 1].y
      )));
      const nextBranchValue = sharedBranchValue(branchValues, side);
      const groupSet = new Set(subgroup);
      const candidatePaths = paths.map(path => path);
      for (const index of subgroup) {
        candidatePaths[index] = endpoint === 'source'
          ? synthesizeSourcePath(paths[index], side, anchorMain, nextBranchValue)
          : synthesizeTargetPath(paths[index], side, anchorMain, nextBranchValue);
      }
      if (crossingScore(edges, candidatePaths, groupSet) > crossingScore(edges, paths, groupSet)) continue;

      for (const index of subgroup) {
        const path = paths[index];
        const candidate = candidatePaths[index];
        if (!samePath(path, candidate)) nextEdges[index] = withComputedPath(nextEdges[index], candidate);
      }
    }
  }

  return nextEdges;
}

function repairOppositeHemisphereTargetBacktracks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  if (!options.nodes || edges.length === 0) return edges;
  const nodeById = new Map(options.nodes.map(node => [node.id, node] as const));
  let paths = edges.map(edge => getEdgePath(edge));
  const nextEdges = [...edges];
  let changed = false;

  for (let index = 0; index < nextEdges.length; index += 1) {
    const edge = nextEdges[index];
    const path = paths[index];
    if (!edge || path.length < 4) continue;
    const sourceRect = nodeRect(nodeById.get(edge.source), nodeById);
    const targetRect = nodeRect(nodeById.get(edge.target), nodeById);
    if (!sourceRect || !targetRect) continue;

    const expectedTargetSide = expectedTargetSideFromGeometry(sourceRect, targetRect);
    const currentTargetSide = targetSide(path);
    if (currentTargetSide === expectedTargetSide) continue;
    if (!firstStepBacktracksFromTarget(path, sourceRect, targetRect)) continue;

    const sourceSide = oppositeSide(expectedTargetSide);
    if (
      !edgeTerminalSideCanSwitch(edge, 'source', sourceSide)
      || !edgeTerminalSideCanSwitch(edge, 'target', expectedTargetSide)
    ) continue;
    const candidates = buildHemisphereTargetCandidatePaths(
      path,
      sourceRect,
      targetRect,
      sourceSide,
      expectedTargetSide,
    ).filter(candidate => (
      pathLength(candidate) + MIN_ENDPOINT_TAIL < pathLength(path)
      && !pathHitsUnrelatedNode(candidate, edge, nodeById)
    ));
    if (candidates.length === 0) continue;

    let bestPath: Point[] | null = null;
    let bestScore = totalStrictCrossings(nextEdges, paths);
    let bestLength = pathLength(path);
    for (const candidate of candidates) {
      const candidatePaths = paths.map((existingPath, pathIndex) => (
        pathIndex === index ? candidate : existingPath
      ));
      const candidateScore = totalStrictCrossings(nextEdges, candidatePaths);
      const candidateLength = pathLength(candidate);
      if (
        candidateScore < bestScore
        || (candidateScore === bestScore && candidateLength < bestLength)
      ) {
        bestPath = candidate;
        bestScore = candidateScore;
        bestLength = candidateLength;
      }
    }
    if (!bestPath) continue;

    const repairedEdge = withComputedPath(edge, bestPath);
    nextEdges[index] = {
      ...repairedEdge,
      sourceHandle: resolveEdgeTerminalHandleForSide(edge, 'source', sourceSide),
      targetHandle: resolveEdgeTerminalHandleForSide(edge, 'target', expectedTargetSide),
      data: {
        ...(repairedEdge.data || {}),
        targetHemisphereBacktrackRepaired: true,
      },
    };
    paths = paths.map((existingPath, pathIndex) => (pathIndex === index ? bestPath as Point[] : existingPath));
    changed = true;
  }

  return changed ? nextEdges : edges;
}

/**
 * Repairs a route that leaves the source on the far hemisphere and returns to
 * the target from the opposite far hemisphere. This is useful even for a
 * single reverse-flow edge, so expose it independently from trunk synthesis.
 */
export function repairOppositeHemisphereTerminalBacktracks(
  edges: Edge[],
  nodes: ReactFlowNode[],
): Edge[] {
  return repairOppositeHemisphereTargetBacktracks(edges, { nodes });
}

export function synthesizeSharedEndpointTrunks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  edges = normalizeSharedTrunkEdges(edges);
  options = normalizeSharedTrunkOptions(options);
  return refineSourceBranchLanesByDirection(
    repairOppositeHemisphereTargetBacktracks(
      applySharedEndpointTrunks(
        applySharedEndpointTrunks(edges, 'source', options),
        'target',
        options,
      ),
      options,
    ),
  );
}

export function synthesizeSharedTargetTrunks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  edges = normalizeSharedTrunkEdges(edges);
  options = normalizeSharedTrunkOptions(options);
  return repairOppositeHemisphereTargetBacktracks(
    applySharedEndpointTrunks(edges, 'target', options),
    options,
  );
}

export function synthesizeSharedSourceTrunks(
  edges: Edge[],
  options: SharedTrunkSynthesisOptions = {},
): Edge[] {
  edges = normalizeSharedTrunkEdges(edges);
  options = normalizeSharedTrunkOptions(options);
  return refineSourceBranchLanesByDirection(
    applySharedEndpointTrunks(edges, 'source', options),
  );
}
