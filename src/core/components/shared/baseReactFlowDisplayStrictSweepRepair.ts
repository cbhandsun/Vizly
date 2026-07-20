import type { Edge, Node } from '@xyflow/react';

import { repairDetachedStrictCrossingBypasses } from '../../strategies/shared/edgeDetachedStrictCrossingRepair';
import { repairEndpointOrthogonalPaths } from '../../strategies/shared/edgeEndpointPathRepair';
import { countUnrelatedObstacleHits } from '../../strategies/shared/edgeWaypointCandidateRepair';
import {
  countStrictEdgeCrossings,
  createEdgePathQualityEvaluationContext,
} from '../../strategies/shared/edgeStrictCrossingGuard';
import {
  buildDisplayRoutingObstacles,
  candidateStrictCrossingsForEdge,
  candidateUnrelatedOverlapForEdge,
  displayAxisOf,
  displayPathLength,
  extractDisplaySegments,
  findDisplayStrictCrossingHits,
  getDisplayComputedPath,
  getDisplayNodeRect,
  OBSTACLE_REPAIR_NODE_PADDING,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';
import {
  buildDirectionalStrictOuterLaneCandidates,
  buildStrictCompanionAroundTerminalCandidates,
  buildStrictTerminalEscapeCandidates,
  STRICT_OUTER_LANE_MAX_CANDIDATES,
  STRICT_OUTER_LANE_MAX_REPAIRED_EDGES,
  STRICT_OUTER_LANE_MIN_SPAN,
  STRICT_TERMINAL_MAX_CANDIDATES,
  STRICT_TERMINAL_MAX_CROSSINGS,
} from './baseReactFlowDisplayLaneCandidates';
import {
  chooseDisplayStrictPolishCandidate,
  countDisplayObstacleHits,
  countDisplayStrictCrossings,
  createDisplayObstacleEvaluationContext,
  displayStrictRepairHardQualityIsAcceptable,
  evaluateDisplayObstacleCandidate,
  evaluateDisplayQualityCandidate,
  finalVisualPolishScoreFromQuality,
  obstacleRepairScore,
  visualPolishHardQualityDoesNotRegress,
  visualPolishHardQualityWithoutStrictDoesNotRegress,
} from './baseReactFlowDisplayEvaluation';
import { repairInternalStrictCrossingLanes } from './baseReactFlowDisplayStrictResidualRepair';
import { displayStrictCrossingsFromKnownQuality } from './baseReactFlowDisplayStrictCrossingCount';

const directionalOuterLanePenalty = (path: DisplayPoint[]): number => {
  if (path.length < 4) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  const startAxis = displayAxisOf(start, path[1]);
  const endAxis = displayAxisOf(path[path.length - 2], end);
  if (!startAxis || startAxis !== endAxis) return 0;
  const verticalSpan = Math.abs(start.y - end.y);
  const horizontalSpan = Math.abs(start.x - end.x);
  if (Math.max(verticalSpan, horizontalSpan) < STRICT_OUTER_LANE_MIN_SPAN) return 0;

  if (startAxis === 'v') {
    const targetDirection = Math.sign(end.x - start.x);
    if (targetDirection === 0) return 0;
    const internalX = path.slice(1, -1).map(point => point.x);
    if (targetDirection < 0) {
      return Math.max(0, Math.max(...internalX) - start.x - OBSTACLE_REPAIR_NODE_PADDING);
    }
    return Math.max(0, start.x - Math.min(...internalX) - OBSTACLE_REPAIR_NODE_PADDING);
  }

  const targetDirection = Math.sign(end.y - start.y);
  if (targetDirection === 0) return 0;
  const internalY = path.slice(1, -1).map(point => point.y);
  if (targetDirection < 0) {
    return Math.max(0, Math.max(...internalY) - start.y - OBSTACLE_REPAIR_NODE_PADDING);
  }
  return Math.max(0, start.y - Math.min(...internalY) - OBSTACLE_REPAIR_NODE_PADDING);
};

const endpointHalfDirection = (value: number, min: number, span: number): -1 | 0 | 1 => {
  if (span <= 1) return 0;
  const center = min + span / 2;
  const deadZone = Math.min(48, Math.max(16, span * 0.12));
  if (value < center - deadZone) return -1;
  if (value > center + deadZone) return 1;
  return 0;
};

const endpointSameHalfBypassPenalty = (
  path: DisplayPoint[],
  edge: Edge,
  nodes: Node[],
): number => {
  if (path.length < 4) return 0;
  const start = path[0];
  const end = path[path.length - 1];
  const startAxis = displayAxisOf(start, path[1]);
  const endAxis = displayAxisOf(path[path.length - 2], end);
  if (!startAxis || startAxis !== endAxis) return 0;
  const verticalSpan = Math.abs(start.y - end.y);
  const horizontalSpan = Math.abs(start.x - end.x);
  if (Math.max(verticalSpan, horizontalSpan) < STRICT_OUTER_LANE_MIN_SPAN) return 0;

  const sourceRect = nodes.find(node => node.id === edge.source);
  const targetRect = nodes.find(node => node.id === edge.target);
  const sourceBox = sourceRect ? getDisplayNodeRect(sourceRect) : null;
  const targetBox = targetRect ? getDisplayNodeRect(targetRect) : null;
  if (!sourceBox || !targetBox) return 0;

  if (startAxis === 'v') {
    const sourceHalf = endpointHalfDirection(start.x, sourceBox.x, sourceBox.width);
    const targetHalf = endpointHalfDirection(end.x, targetBox.x, targetBox.width);
    const preferredHalf = sourceHalf !== 0 && sourceHalf === targetHalf ? sourceHalf : 0;
    if (preferredHalf === 0) return 0;
    const internalX = path.slice(1, -1).map(point => point.x);
    if (internalX.length === 0) return 0;
    const anchorMin = Math.min(start.x, end.x);
    const anchorMax = Math.max(start.x, end.x);
    return preferredHalf < 0
      ? Math.max(0, Math.max(...internalX) - anchorMax - OBSTACLE_REPAIR_NODE_PADDING)
      : Math.max(0, anchorMin - Math.min(...internalX) - OBSTACLE_REPAIR_NODE_PADDING);
  }

  const sourceHalf = endpointHalfDirection(start.y, sourceBox.y, sourceBox.height);
  const targetHalf = endpointHalfDirection(end.y, targetBox.y, targetBox.height);
  const preferredHalf = sourceHalf !== 0 && sourceHalf === targetHalf ? sourceHalf : 0;
  if (preferredHalf === 0) return 0;
  const internalY = path.slice(1, -1).map(point => point.y);
  if (internalY.length === 0) return 0;
  const anchorMin = Math.min(start.y, end.y);
  const anchorMax = Math.max(start.y, end.y);
  return preferredHalf < 0
    ? Math.max(0, Math.max(...internalY) - anchorMax - OBSTACLE_REPAIR_NODE_PADDING)
    : Math.max(0, anchorMin - Math.min(...internalY) - OBSTACLE_REPAIR_NODE_PADDING);
};

const totalDirectionalOuterLanePenalty = (edges: Edge[]): number => (
  edges.reduce((total, edge) => total + directionalOuterLanePenalty(getDisplayComputedPath(edge)), 0)
);

const totalEndpointSameHalfBypassPenalty = (edges: Edge[], nodes: Node[]): number => (
  edges.reduce((total, edge) => total + endpointSameHalfBypassPenalty(getDisplayComputedPath(edge), edge, nodes), 0)
);

export const chooseDirectionalOuterLaneCandidate = <T extends Edge[]>(
  nodes: Node[],
  baseline: T,
  candidate: T,
): T => {
  const qualityContext = createEdgePathQualityEvaluationContext(baseline);
  const obstacleContext = createDisplayObstacleEvaluationContext(baseline, nodes);
  const baselineQuality = qualityContext.evaluate(baseline);
  const candidateQuality = evaluateDisplayQualityCandidate(qualityContext, baseline, candidate);
  if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) return baseline;
  const baselineObstacleHits = obstacleContext.evaluate(baseline);
  const candidateObstacleHits = evaluateDisplayObstacleCandidate(obstacleContext, baseline, candidate);
  if (candidateObstacleHits > baselineObstacleHits) return baseline;
  const baselineDirectionalPenalty = totalDirectionalOuterLanePenalty(baseline);
  const candidateDirectionalPenalty = totalDirectionalOuterLanePenalty(candidate);
  const baselineEndpointHalfPenalty = totalEndpointSameHalfBypassPenalty(baseline, nodes);
  const candidateEndpointHalfPenalty = totalEndpointSameHalfBypassPenalty(candidate, nodes);
  const allowEndpointHalfPolish = baselineQuality.strictCrossings === 0 && baselineObstacleHits === 0;
  if (
    candidateQuality.strictCrossings < baselineQuality.strictCrossings
    || candidateObstacleHits < baselineObstacleHits
    || candidateDirectionalPenalty < baselineDirectionalPenalty
    || (
      allowEndpointHalfPolish
      && candidateQuality.strictCrossings === 0
      && candidateObstacleHits === 0
      && candidateEndpointHalfPenalty < baselineEndpointHalfPenalty
      && candidateDirectionalPenalty <= baselineDirectionalPenalty
    )
  ) return candidate;
  return baseline;
};

export const repairTerminalStrictCrossingsWithEndpointLanes = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  let current = edges;
  for (let pass = 0; pass < 3; pass += 1) {
    const qualityContext = createEdgePathQualityEvaluationContext(current);
    const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
    const baselineQuality = qualityContext.evaluate(current);
    const baselineDisplayStrictCrossings = displayStrictCrossingsFromKnownQuality(current, baselineQuality);
    if (baselineQuality.strictCrossings === 0 && baselineDisplayStrictCrossings === 0) break;
    const baselineObstacleHits = obstacleContext.evaluate(current);
    const paths = current.map(edge => getDisplayComputedPath(edge));
    const allSegments = extractDisplaySegments(current);
    const routingObstacles = buildDisplayRoutingObstacles(nodes);
    const crossings = findDisplayStrictCrossingHits(current).slice(0, STRICT_TERMINAL_MAX_CROSSINGS);
    if (crossings.length === 0) break;

    let bestEdges = current;
    let bestQuality = baselineQuality;
    let bestDisplayStrictCrossings = baselineDisplayStrictCrossings;
    let bestObstacleHits = baselineObstacleHits;
    let bestScore = obstacleRepairScore(baselineQuality, baselineObstacleHits);
    let relaxedBestEdges: T | null = null;
    let relaxedBestDisplayStrictCrossings = baselineDisplayStrictCrossings;
    let relaxedBestScore = Number.POSITIVE_INFINITY;

    for (const crossing of crossings) {
      for (const [segment, other] of [[crossing.a, crossing.b], [crossing.b, crossing.a]] as const) {
        const path = paths[segment.edgeIndex];
        if (!path || path.length < 4) continue;
        const segmentLike = { ...segment, segIdx: segment.segmentIndex };
        const otherLike = { ...other, segIdx: other.segmentIndex };
        const otherPath = paths[other.edgeIndex];
        const otherIsTerminal = !!otherPath
          && (other.segmentIndex === 0 || other.segmentIndex === otherPath.length - 2);
        const otherSegments = allSegments.filter(item => item.edgeIndex !== segment.edgeIndex);
        const baselineEdgeDisplayStrictCrossings = candidateStrictCrossingsForEdge(
          segment.edgeIndex,
          path,
          otherSegments,
        );
        const baselinePathObstacleHits = countUnrelatedObstacleHits(
          path,
          current[segment.edgeIndex],
          routingObstacles,
        );
        const candidates = [
          ...buildStrictTerminalEscapeCandidates(path, segmentLike, otherLike, otherSegments),
          ...(otherIsTerminal
            ? buildStrictCompanionAroundTerminalCandidates(path, segmentLike, otherLike, nodes)
            : []),
        ].slice(0, STRICT_TERMINAL_MAX_CANDIDATES);
        for (const candidatePath of candidates) {
          const candidateEdgeDisplayStrictCrossings = candidateStrictCrossingsForEdge(
            segment.edgeIndex,
            candidatePath,
            otherSegments,
          );
          if (candidateEdgeDisplayStrictCrossings > baselineEdgeDisplayStrictCrossings) continue;
          const candidatePathObstacleHits = countUnrelatedObstacleHits(
            candidatePath,
            current[segment.edgeIndex],
            routingObstacles,
          );
          if (
            candidatePathObstacleHits > baselinePathObstacleHits
            && candidateEdgeDisplayStrictCrossings >= baselineEdgeDisplayStrictCrossings
          ) continue;
          const candidateEdges = current.map((edge, edgeIndex) => (
            edgeIndex === segment.edgeIndex ? withDisplayComputedPath(edge, candidatePath) : edge
          )) as T;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [segment.edgeIndex]);
          const candidateDisplayStrictCrossings = displayStrictCrossingsFromKnownQuality(
            candidateEdges,
            candidateQuality,
          );
          if (candidateDisplayStrictCrossings >= baselineDisplayStrictCrossings) continue;
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [segment.edgeIndex]);
          const candidateScore = obstacleRepairScore(candidateQuality, candidateObstacleHits);
          if (
            candidateObstacleHits <= baselineObstacleHits
            && (
              candidateDisplayStrictCrossings < relaxedBestDisplayStrictCrossings
              || (
                candidateDisplayStrictCrossings === relaxedBestDisplayStrictCrossings
                && candidateScore < relaxedBestScore - 1
              )
            )
          ) {
            relaxedBestEdges = candidateEdges;
            relaxedBestDisplayStrictCrossings = candidateDisplayStrictCrossings;
            relaxedBestScore = candidateScore;
          }
          const reducesDisplayStrict = candidateDisplayStrictCrossings < baselineDisplayStrictCrossings;
          if (
            reducesDisplayStrict
              ? !displayStrictRepairHardQualityIsAcceptable(baselineQuality, candidateQuality)
              : !visualPolishHardQualityWithoutStrictDoesNotRegress(baselineQuality, candidateQuality)
          ) continue;
          if (
            candidateQuality.strictCrossings >= bestQuality.strictCrossings
            && candidateDisplayStrictCrossings >= bestDisplayStrictCrossings
          ) continue;
          if (candidateObstacleHits > baselineObstacleHits) continue;
          if (
            candidateQuality.strictCrossings < bestQuality.strictCrossings
            || candidateDisplayStrictCrossings < bestDisplayStrictCrossings
            || candidateObstacleHits < bestObstacleHits
            || candidateScore < bestScore - 1
          ) {
            bestEdges = candidateEdges;
            bestQuality = candidateQuality;
            bestDisplayStrictCrossings = candidateDisplayStrictCrossings;
            bestObstacleHits = candidateObstacleHits;
            bestScore = candidateScore;
          }
        }
      }
    }

    if (bestEdges === current && relaxedBestEdges && relaxedBestDisplayStrictCrossings < baselineDisplayStrictCrossings) {
      bestEdges = relaxedBestEdges;
    }
    if (bestEdges === current) break;
    current = bestEdges;
  }
  return current;
};

export const finalStrictDisplaySweep = <T extends Edge[]>(edges: T, nodes: Node[]): T => {
  if (countStrictEdgeCrossings(edges) === 0 && countDisplayStrictCrossings(edges) === 0) return edges;
  const strictBypassRaw = repairDetachedStrictCrossingBypasses(edges, nodes) as T;
  const strictBypassOrthogonal = repairEndpointOrthogonalPaths(strictBypassRaw, nodes) as T;
  const terminalLaneRaw = repairTerminalStrictCrossingsWithEndpointLanes(strictBypassOrthogonal, nodes);
  const terminalLaneOrthogonal = repairEndpointOrthogonalPaths(terminalLaneRaw, nodes) as T;
  const internalLaneRaw = repairInternalStrictCrossingLanes(terminalLaneOrthogonal, nodes);
  const internalLaneOrthogonal = repairEndpointOrthogonalPaths(internalLaneRaw, nodes) as T;
  return chooseDisplayStrictPolishCandidate(
    nodes,
    edges,
    strictBypassRaw,
    strictBypassOrthogonal,
    terminalLaneRaw,
    terminalLaneOrthogonal,
    internalLaneRaw,
    internalLaneOrthogonal,
  );
};

export const repairStrictCrossingsWithDirectionalOuterLanes = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
): T => {
  let current = edges;
  for (let pass = 0; pass < 2; pass += 1) {
    const baselineStrictCrossings = countStrictEdgeCrossings(current);
    const baselineObstacleHits = countDisplayObstacleHits(current, nodes);
    const baselineEndpointHalfPenalty = totalEndpointSameHalfBypassPenalty(current, nodes);
    const allowEndpointHalfPolish = baselineStrictCrossings === 0 && baselineObstacleHits === 0;
    if (
      baselineStrictCrossings === 0
      && baselineObstacleHits === 0
      && baselineEndpointHalfPenalty === 0
      && current.every(edge => directionalOuterLanePenalty(getDisplayComputedPath(edge)) === 0)
    ) break;

    const segments = extractDisplaySegments(current);
    const obstacles = buildDisplayRoutingObstacles(nodes);
    const entries = current
      .map((edge, edgeIndex) => {
        const path = getDisplayComputedPath(edge);
        const otherSegments = segments.filter(segment => segment.edgeIndex !== edgeIndex);
        const edgeStrictCrossings = path.length >= 2
          ? candidateStrictCrossingsForEdge(edgeIndex, path, otherSegments)
          : 0;
        const edgeObstacleHits = path.length >= 2
          ? countUnrelatedObstacleHits(path, edge, obstacles)
          : 0;
        return {
          edge,
          edgeIndex,
          path,
          edgeStrictCrossings,
          edgeObstacleHits,
          directionalPenalty: directionalOuterLanePenalty(path),
          endpointHalfPenalty: allowEndpointHalfPolish
            ? endpointSameHalfBypassPenalty(path, edge, nodes)
            : 0,
        };
      })
      .filter(entry => entry.path.length >= 4 && (
        entry.edgeStrictCrossings > 0
        || entry.edgeObstacleHits > 0
        || entry.directionalPenalty > 0
        || (allowEndpointHalfPolish && entry.endpointHalfPenalty > 0)
      ))
      .sort((first, second) => (
        second.edgeStrictCrossings - first.edgeStrictCrossings
        || second.edgeObstacleHits - first.edgeObstacleHits
        || second.directionalPenalty - first.directionalPenalty
        || second.endpointHalfPenalty - first.endpointHalfPenalty
        || displayPathLength(second.path) - displayPathLength(first.path)
      ))
      .slice(0, STRICT_OUTER_LANE_MAX_REPAIRED_EDGES);
    if (entries.length === 0) break;

    let changed = false;
    for (const entry of entries) {
      const latestEdge = current[entry.edgeIndex];
      if (!latestEdge) continue;
      const latestPath = getDisplayComputedPath(latestEdge);
      if (latestPath.length < 4) continue;
      const otherSegments = extractDisplaySegments(current)
        .filter(segment => segment.edgeIndex !== entry.edgeIndex);
      const latestEdgeStrictCrossings = candidateStrictCrossingsForEdge(
        entry.edgeIndex,
        latestPath,
        otherSegments,
      );
      const latestObstacles = buildDisplayRoutingObstacles(nodes);
      const latestEdgeObstacleHits = countUnrelatedObstacleHits(latestPath, latestEdge, latestObstacles);
      const latestDirectionalPenalty = directionalOuterLanePenalty(latestPath);
      const latestEndpointHalfPenalty = allowEndpointHalfPolish
        ? endpointSameHalfBypassPenalty(latestPath, latestEdge, nodes)
        : 0;
      if (
        latestEdgeStrictCrossings === 0
        && latestEdgeObstacleHits === 0
        && latestDirectionalPenalty === 0
        && latestEndpointHalfPenalty === 0
      ) continue;

      const qualityContext = createEdgePathQualityEvaluationContext(current);
      const obstacleContext = createDisplayObstacleEvaluationContext(current, nodes);
      const baselineQuality = qualityContext.evaluate(current);
      const latestGlobalObstacleHits = obstacleContext.evaluate(current);
      let bestEdges = current;
      let bestQuality = baselineQuality;
      let bestObstacleHits = latestGlobalObstacleHits;
      let bestDirectionalPenalty = latestDirectionalPenalty;
      let bestEndpointHalfPenalty = latestEndpointHalfPenalty;
      let bestScore = finalVisualPolishScoreFromQuality(baselineQuality);
      type RankedDirectionalCandidate = {
        path: DisplayPoint[];
        strictCrossings: number;
        obstacleHits: number;
        directionalPenalty: number;
        endpointHalfPenalty: number;
        unrelatedOverlap: number;
        length: number;
      };
      const compare = (first: RankedDirectionalCandidate, second: RankedDirectionalCandidate): number => (
        first.strictCrossings - second.strictCrossings
        || first.obstacleHits - second.obstacleHits
        || first.directionalPenalty - second.directionalPenalty
        || first.endpointHalfPenalty - second.endpointHalfPenalty
        || first.unrelatedOverlap - second.unrelatedOverlap
        || first.length - second.length
      );
      const keyOf = (candidate: RankedDirectionalCandidate): string => (
        candidate.path.map(point => `${Math.round(point.x)},${Math.round(point.y)}`).join('|')
      );
      const evaluated = new Set<string>();
      let topCandidates: RankedDirectionalCandidate[] = [];
      const evaluateTop = (): boolean => {
        for (const candidate of topCandidates) {
          const key = keyOf(candidate);
          if (evaluated.has(key)) continue;
          evaluated.add(key);
          const candidateEdges = current.map((edge, edgeIndex) => (
            edgeIndex === entry.edgeIndex ? withDisplayComputedPath(edge, candidate.path) : edge
          )) as T;
          const candidateQuality = qualityContext.evaluateChanged(candidateEdges, [entry.edgeIndex]);
          if (!visualPolishHardQualityDoesNotRegress(baselineQuality, candidateQuality)) continue;
          const candidateObstacleHits = obstacleContext.evaluateKnownChanges(candidateEdges, [entry.edgeIndex]);
          if (candidateObstacleHits > latestGlobalObstacleHits) continue;
          const keepsPrimary = candidateQuality.strictCrossings <= bestQuality.strictCrossings
            && candidateObstacleHits <= bestObstacleHits
            && candidate.directionalPenalty <= bestDirectionalPenalty;
          if (!keepsPrimary) continue;
          if (
            candidateQuality.strictCrossings === bestQuality.strictCrossings
            && candidateObstacleHits === bestObstacleHits
            && candidate.directionalPenalty === bestDirectionalPenalty
            && candidate.endpointHalfPenalty >= bestEndpointHalfPenalty
          ) continue;
          const candidateScore = finalVisualPolishScoreFromQuality(candidateQuality);
          const improvesPrimary = candidateQuality.strictCrossings < bestQuality.strictCrossings
            || candidateObstacleHits < bestObstacleHits
            || candidate.directionalPenalty < bestDirectionalPenalty;
          const tiesPrimary = candidateQuality.strictCrossings === bestQuality.strictCrossings
            && candidateObstacleHits === bestObstacleHits
            && candidate.directionalPenalty === bestDirectionalPenalty;
          if (
            improvesPrimary
            || (allowEndpointHalfPolish && tiesPrimary && candidate.endpointHalfPenalty < bestEndpointHalfPenalty)
            || (
              tiesPrimary
              && (!allowEndpointHalfPolish || candidate.endpointHalfPenalty <= bestEndpointHalfPenalty)
              && candidateScore < bestScore - 1
            )
          ) {
            bestEdges = candidateEdges;
            bestQuality = candidateQuality;
            bestObstacleHits = candidateObstacleHits;
            bestDirectionalPenalty = candidate.directionalPenalty;
            bestEndpointHalfPenalty = candidate.endpointHalfPenalty;
            bestScore = candidateScore;
            if (
              candidate.strictCrossings === 0
              && candidate.obstacleHits === 0
              && candidate.directionalPenalty === 0
              && candidate.endpointHalfPenalty === 0
            ) return true;
          }
        }
        return false;
      };

      let activeTier = -1;
      let foundLocallyCleanCandidate = false;
      for (const batch of buildDirectionalStrictOuterLaneCandidates(latestPath, nodes, latestEdge)) {
        if (activeTier >= 0 && batch.tier !== activeTier) {
          foundLocallyCleanCandidate = evaluateTop();
          if (foundLocallyCleanCandidate) break;
        }
        activeTier = batch.tier;
        const candidates = batch.candidates
          .map(candidatePath => ({
            path: candidatePath,
            strictCrossings: candidateStrictCrossingsForEdge(entry.edgeIndex, candidatePath, otherSegments),
            obstacleHits: countUnrelatedObstacleHits(candidatePath, latestEdge, latestObstacles),
            directionalPenalty: directionalOuterLanePenalty(candidatePath),
            endpointHalfPenalty: allowEndpointHalfPolish
              ? endpointSameHalfBypassPenalty(candidatePath, latestEdge, nodes)
              : 0,
            unrelatedOverlap: candidateUnrelatedOverlapForEdge(
              entry.edgeIndex,
              candidatePath,
              current,
              otherSegments,
            ),
            length: displayPathLength(candidatePath),
          }))
          .filter(candidate => (
            candidate.strictCrossings < latestEdgeStrictCrossings
            || candidate.obstacleHits < latestEdgeObstacleHits
            || candidate.directionalPenalty < latestDirectionalPenalty
            || (allowEndpointHalfPolish && candidate.endpointHalfPenalty < latestEndpointHalfPenalty)
          ))
          .sort(compare);
        if (candidates.length === 0) continue;
        topCandidates = [...topCandidates, ...candidates]
          .sort(compare)
          .slice(0, STRICT_OUTER_LANE_MAX_CANDIDATES);
      }
      if (!foundLocallyCleanCandidate) evaluateTop();

      if (bestEdges !== current) {
        current = bestEdges;
        changed = true;
        if (countStrictEdgeCrossings(current) === 0) break;
      }
    }
    if (!changed) break;
  }
  return current;
};
