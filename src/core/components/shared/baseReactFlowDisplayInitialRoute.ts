import type { Edge, Node } from '@xyflow/react';
import { edgeTerminalSideCanSwitch, readEdgeTerminalPolicy, resolveEdgeTerminalHandleForSide } from '../../routing/utils/edgeTerminalPolicy';
import { COMMERCIAL_BUSINESS_NODE_CLEARANCE } from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { segmentIntersectsClearanceRect, segmentToClearanceRectDistance } from '../../strategies/shared/edgeNodeClearanceGeometry';
import { buildFacingPortPathCandidates, type SharedNodePortSide } from './baseReactFlowSharedNodePortRoleRepair';
import { withDisplayAbsolutePositions } from './baseReactFlowAbsolutePositions';
import { buildDisplayRoutingObstacles, getDisplayComputedPath, getDisplayNodeRect, isDisplayContainerNode } from './baseReactFlowDisplayGeometry';
import { MIN_RENDER_SAFE_ENDPOINT_STUB } from './baseReactFlowDisplayEndpointStubMetrics';
import { anchorForHandle, compactOrthogonalPath, type NodeRect } from './baseReactFlowDisplayEdgeGeometry';
import { fastDisplayHardSafetyIsClean } from './baseReactFlowFastEdgeSafety';
import { getInteractiveGlobalCandidateEdgeBudget } from './baseReactFlowDisplayBoundedSeedPolicy';
import { scoreNodeClearanceRisk } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { chooseCommercialRouteCandidate } from '../../strategies/shared/edgeCommercialRouteGuard';

const SIDES: readonly SharedNodePortSide[] = ['bottom', 'top', 'right', 'left'];
const MAX_SEED_NODES = 96;
const MAX_SEED_EDGE_NODE_PAIRS = 5_000;
const MAX_COORDINATE = 10_000_000;
const GENERATED_LAYOUT_ALGORITHMS = new Set(['domain-dagre-interactive', 'domain-dagre-simplified']);
const MIN_CLEAR_FACING_REBUILD_SAVINGS = MIN_RENDER_SAFE_ENDPOINT_STUB * 2;
const isBoundedNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE
);

const outward = (p: { x: number; y: number }, side: SharedNodePortSide, distance: number) => ({
  x: p.x + (side === 'left' ? -distance : side === 'right' ? distance : 0),
  y: p.y + (side === 'top' ? -distance : side === 'bottom' ? distance : 0),
});

const corridorCandidates = (
  source: NodeRect, target: NodeRect, sourceSide: SharedNodePortSide, targetSide: SharedNodePortSide,
  xLanes: readonly number[], yLanes: readonly number[],
): Array<Array<{ x: number; y: number }>> => {
  const start = anchorForHandle(source, sourceSide);
  const end = anchorForHandle(target, targetSide);
  const a = outward(start, sourceSide, MIN_RENDER_SAFE_ENDPOINT_STUB);
  const b = outward(end, targetSide, MIN_RENDER_SAFE_ENDPOINT_STUB);
  const sourceVertical = sourceSide === 'top' || sourceSide === 'bottom';
  const targetVertical = targetSide === 'top' || targetSide === 'bottom';
  const paths = buildFacingPortPathCandidates(source, target, sourceSide, targetSide, MIN_RENDER_SAFE_ENDPOINT_STUB);
  for (const x of xLanes) paths.push(sourceVertical
    ? targetVertical
      ? [start, a, { x, y: a.y }, { x, y: b.y }, b, end]
      : [start, a, { x, y: a.y }, { x, y: end.y }, end]
    : targetVertical
      ? [start, { x, y: start.y }, { x, y: b.y }, b, end]
      : [start, { x, y: start.y }, { x, y: end.y }, end]);
  for (const y of yLanes) paths.push(sourceVertical
    ? targetVertical
      ? [start, { x: start.x, y }, { x: end.x, y }, end]
      : [start, { x: start.x, y }, { x: b.x, y }, b, end]
    : targetVertical
      ? [start, a, { x: a.x, y }, { x: end.x, y }, end]
      : [start, a, { x: a.x, y }, { x: b.x, y }, b, end]);
  return paths.map(compactOrthogonalPath).filter(path => {
    if (path.length < 2) return false;
    const escapes = (p: { x: number; y: number }, q: { x: number; y: number }, side: SharedNodePortSide) => {
      const delta = side === 'left' ? p.x - q.x : side === 'right' ? q.x - p.x : side === 'top' ? p.y - q.y : q.y - p.y;
      return delta >= (path.length === 2 ? 0.5 : MIN_RENDER_SAFE_ENDPOINT_STUB)
        && Math.abs(side === 'top' || side === 'bottom' ? p.x - q.x : p.y - q.y) < 0.5;
    };
    return escapes(path[0], path[1], sourceSide) && escapes(path[path.length - 1], path[path.length - 2], targetSide);
  });
};

const pathLength = (path: readonly { x: number; y: number }[]): number => (
  path.slice(1).reduce((sum, point, index) => (
    sum + Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y)
  ), 0)
);

const pathTurnCount = (path: readonly { x: number; y: number }[]): number => {
  let previousAxis: 'h' | 'v' | null = null;
  let turns = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    const axis = Math.abs(previous.y - current.y) <= 0.5
      ? 'h'
      : Math.abs(previous.x - current.x) <= 0.5
        ? 'v'
        : null;
    if (!axis) continue;
    if (previousAxis && previousAxis !== axis) turns += 1;
    previousAxis = axis;
  }
  return turns;
};

const sideAxis = (handle: unknown): 'horizontal' | 'vertical' | null => {
  const value = String(handle ?? '').toLowerCase();
  if (value.includes('left') || value.includes('right')) return 'horizontal';
  if (value.includes('top') || value.includes('bottom')) return 'vertical';
  return null;
};

const generatedGroupedTopologyAlreadyMatchesFlow = (
  edges: readonly Edge[],
  nodes: readonly Node[],
  nodeById: ReadonlyMap<string, Node>,
): boolean => {
  const hasGroupedTopology = nodes.some(node => node.parentId || isDisplayContainerNode(node));
  if (!hasGroupedTopology || edges.length <= 1) return false;
  if (!edges.every(edge => edge.data?.algorithm === 'domain-dagre-simplified')) return false;

  let comparable = 0;
  let matching = 0;
  let verticalMatching = 0;
  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const sourceRect = source ? getDisplayNodeRect(source) : null;
    const targetRect = target ? getDisplayNodeRect(target) : null;
    const sourceAxis = sideAxis(edge.sourceHandle);
    const targetAxis = sideAxis(edge.targetHandle);
    if (!sourceRect || !targetRect || !sourceAxis || !targetAxis || sourceAxis !== targetAxis) continue;
    const sourceCenter = {
      x: sourceRect.x + sourceRect.width / 2,
      y: sourceRect.y + sourceRect.height / 2,
    };
    const targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2,
    };
    const flowAxis = Math.abs(targetCenter.x - sourceCenter.x) >= Math.abs(targetCenter.y - sourceCenter.y)
      ? 'horizontal'
      : 'vertical';
    comparable += 1;
    if (sourceAxis === flowAxis) {
      matching += 1;
      if (sourceAxis === 'vertical') verticalMatching += 1;
    }
  }
  return comparable >= Math.max(3, Math.ceil(edges.length * 0.75))
    && matching / comparable >= 0.75
    && verticalMatching / comparable >= 0.75;
};

const clearFacingAxisRouteIsAvailable = (
  edge: Edge,
  source: NodeRect,
  target: NodeRect,
  baselinePath: readonly { x: number; y: number }[],
  obstacles: ReadonlyMap<string, NodeRect>,
): boolean => {
  if (
    baselinePath.length <= 2
    || !GENERATED_LAYOUT_ALGORITHMS.has(String(edge.data?.algorithm ?? ''))
  ) return false;
  const sourceCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const targetCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const horizontalGap = Math.max(
    target.x - (source.x + source.width),
    source.x - (target.x + target.width),
  );
  const verticalGap = Math.max(
    target.y - (source.y + source.height),
    source.y - (target.y + target.height),
  );
  const sameRow = horizontalGap > 0
    && Math.abs(sourceCenter.y - targetCenter.y) <= Math.min(source.height, target.height) / 2;
  const sameColumn = verticalGap > 0
    && Math.abs(sourceCenter.x - targetCenter.x) <= Math.min(source.width, target.width) / 2;
  if (!sameRow && !sameColumn) return false;
  const sourceSide: SharedNodePortSide = sameRow
    ? (targetCenter.x >= sourceCenter.x ? 'right' : 'left')
    : (targetCenter.y >= sourceCenter.y ? 'bottom' : 'top');
  const targetSide: SharedNodePortSide = sameRow
    ? (targetCenter.x >= sourceCenter.x ? 'left' : 'right')
    : (targetCenter.y >= sourceCenter.y ? 'top' : 'bottom');
  if (
    !edgeTerminalSideCanSwitch(edge, 'source', sourceSide)
    || !edgeTerminalSideCanSwitch(edge, 'target', targetSide)
  ) return false;
  const baselineLength = pathLength(baselinePath);
  const baselineTurns = pathTurnCount(compactOrthogonalPath([...baselinePath]));
  return corridorCandidates(source, target, sourceSide, targetSide, [], []).some((candidate) => {
    const candidateLength = pathLength(candidate);
    const candidateTurns = pathTurnCount(candidate);
    const hasMeaningfulLengthGain = baselineLength - candidateLength >= MIN_CLEAR_FACING_REBUILD_SAVINGS;
    const hasMeaningfulClarityGain = candidateTurns + 1 < baselineTurns;
    if (!hasMeaningfulLengthGain && !hasMeaningfulClarityGain) return false;
    for (let index = 0; index < candidate.length - 1; index += 1) {
      const segment = { a: candidate[index], b: candidate[index + 1] };
      if ([source, target].some(rect => segmentIntersectsClearanceRect(segment, rect, 0))) {
        return false;
      }
      for (const [id, rect] of obstacles) {
        if (id === edge.source || id === edge.target) continue;
        if (segmentToClearanceRectDistance(segment, rect) < COMMERCIAL_BUSINESS_NODE_CLEARANCE) {
          return false;
        }
      }
    }
    return true;
  });
};

/** Ports and their outward corridors are one initial routing decision. */
export const seedObstacleAwareDisplayRoutes = (edges: Edge[], inputNodes: Node[]): Edge[] => {
  if (!edges.length || !inputNodes.length || inputNodes.length > MAX_SEED_NODES
    || edges.length * inputNodes.length > MAX_SEED_EDGE_NODE_PAIRS) return edges;
  if (!inputNodes.every(node => isBoundedNumber(node.position?.x) && isBoundedNumber(node.position?.y))) return edges;
  const nodes = withDisplayAbsolutePositions(inputNodes, new Map(inputNodes.map(node => [node.id, node])));
  // Unknown obstacle geometry cannot be treated as free space. The existing
  // measured-geometry pipeline retains ownership until all obstacles are ready.
  if (!nodes.every(node => {
    const rect = getDisplayNodeRect(node);
    return rect
      ? Object.values(rect).every(isBoundedNumber)
      : isDisplayContainerNode(node);
  })) return edges;
  // The fast Dagre preparation explicitly declares provisional endpoint-only
  // paths. Runtime locks alone do not identify this capability: other engines
  // supply valuable route topology that their existing repair pipeline retains.
  const provisionalLayoutPaths = edges.every(edge => (
    edge.data?.algorithm === 'domain-dagre-interactive'
    && getDisplayComputedPath(edge).length >= 2
    && readEdgeTerminalPolicy(edge, 'source').runtimeFixed
    && readEdgeTerminalPolicy(edge, 'target').runtimeFixed
  ));
  // A local defect must not discard a mostly useful layout. Restart only when
  // the defects dominate a small graph or exceed the existing interactive
  // candidate capacity. A large graph can exhaust that capacity well before
  // half its paths are damaged. Sparse damage retains the existing topology.
  const repairCapacity = getInteractiveGlobalCandidateEdgeBudget(edges.length, true)
    ?? edges.length / 2;
  const rebuildRuntimePaths = provisionalLayoutPaths && edges.filter(edge => (
    !fastDisplayHardSafetyIsClean([edge], nodes)
  )).length > Math.min(edges.length / 2, repairCapacity);
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (generatedGroupedTopologyAlreadyMatchesFlow(edges, nodes, byId)) return edges;
  const obstacles = buildDisplayRoutingObstacles(nodes);
  const xLanes = [...new Set([...obstacles.values()].flatMap(r => [r.x - COMMERCIAL_BUSINESS_NODE_CLEARANCE, r.x + r.width + COMMERCIAL_BUSINESS_NODE_CLEARANCE]))];
  const yLanes = [...new Set([...obstacles.values()].flatMap(r => [r.y - COMMERCIAL_BUSINESS_NODE_CLEARANCE, r.y + r.height + COMMERCIAL_BUSINESS_NODE_CLEARANCE]))];
  let changed = false;
  // Comparing complete generated routes preserves their shared topology. Bound
  // this optional comparison separately from obstacle candidate construction.
  const canCompareGeneratedRoutes = edges.length <= 128
    && edges.every(edge => {
      const path = getDisplayComputedPath(edge);
      return path.length >= 2 && path.length <= 128;
    })
    && edges.reduce((count, edge) => count + getDisplayComputedPath(edge).length, 0) <= 1024;
  let rebuiltSimplifiedRoute = false;
  const seeded = edges.map(edge => {
    const path = getDisplayComputedPath(edge);
    const waypoints = edge.data?.waypoints;
    const preservesAuthoredPath = waypoints !== undefined
      && (!Array.isArray(waypoints) || waypoints.length > 0);
    const sourceNode = byId.get(edge.source);
    const targetNode = byId.get(edge.target);
    const source = sourceNode ? getDisplayNodeRect(sourceNode) : null;
    const target = targetNode ? getDisplayNodeRect(targetNode) : null;
    // Simplified Dagre paths have not passed the full generator's joint repair.
    // Reconstruct only a proposal that violates the display clearance contract;
    // unknown provenance and authored waypoints retain their existing ownership.
    const rebuildSimplifiedLayoutPath = edge.data?.algorithm === 'domain-dagre-simplified'
      && canCompareGeneratedRoutes
      && path.length >= 2 && path.length <= 128 && !preservesAuthoredPath
      && scoreNodeClearanceRisk(path, nodes, edge, COMMERCIAL_BUSINESS_NODE_CLEARANCE) > 0.5;
    const rebuildClearFacingLayoutPath = canCompareGeneratedRoutes
      && path.length >= 2 && path.length <= 128 && !preservesAuthoredPath
      && source && target
      && clearFacingAxisRouteIsAvailable(edge, source, target, path, obstacles);
    if (preservesAuthoredPath) return edge;
    if (path.length >= 2 && (
      (!rebuildRuntimePaths && !rebuildSimplifiedLayoutPath && !rebuildClearFacingLayoutPath)
      || readEdgeTerminalPolicy(edge, 'source').sourceExactFixed
      || readEdgeTerminalPolicy(edge, 'target').sourceExactFixed
    )) return edge;
    if (!['', 'stablepath', 'advanced-smart-step', 'default', 'smoothstep'].includes(String(edge.type ?? '').toLowerCase())) return edge;
    if (!source || !target || edge.source === edge.target) return edge;
    type Candidate = { path: Array<{ x: number; y: number }>; sourceSide: SharedNodePortSide; targetSide: SharedNodePortSide; risk: number; cost: number };
    let best: Candidate | undefined;
    // Prefer a clear corridor with at most three bends. Add a four-bend bypass
    // only when those choices cannot clear the obstacles (e.g. fixed ports).
    for (const maxPoints of [5, 6]) {
      if (best?.risk === 0) break;
      for (const sourceSide of SIDES) {
        if (!edgeTerminalSideCanSwitch(edge, 'source', sourceSide)) continue;
        for (const targetSide of SIDES) {
          if (!edgeTerminalSideCanSwitch(edge, 'target', targetSide)) continue;
          for (const path of corridorCandidates(source, target, sourceSide, targetSide, xLanes, yLanes)) {
            if (path.length > maxPoints) continue;
            const length = path.slice(1).reduce((sum, point, index) => (
              sum + Math.abs(point.x - path[index].x) + Math.abs(point.y - path[index].y)
            ), 0);
            const cost = length + Math.max(0, path.length - 2) * 120;
            if (best?.risk === 0 && cost >= best.cost) continue;
            let risk = 0;
            let ownNodeHit = false;
            for (let index = 0; index < path.length - 1; index++) {
              const segment = { a: path[index], b: path[index + 1] };
              if ([source, target].some(rect => segmentIntersectsClearanceRect(segment, rect, 0))) { ownNodeHit = true; break; }
              for (const [id, rect] of obstacles) {
                if (id === edge.source || id === edge.target) continue;
                risk += Math.max(0, COMMERCIAL_BUSINESS_NODE_CLEARANCE - segmentToClearanceRectDistance(segment, rect));
              }
            }
            if (ownNodeHit) continue;
            if (!best || risk < best.risk || (risk === best.risk && cost < best.cost)) best = { path, sourceSide, targetSide, risk, cost };
          }
        }
      }
    }
    if (!best) return edge;
    changed = true;
    rebuiltSimplifiedRoute ||= rebuildSimplifiedLayoutPath;
    return {
      ...edge,
      sourceHandle: resolveEdgeTerminalHandleForSide(edge, 'source', best.sourceSide),
      targetHandle: resolveEdgeTerminalHandleForSide(edge, 'target', best.targetSide),
      data: { ...edge.data, computedPath: best.path, layoutPathLocked: true, _layoutPathLocked: true, algorithm: 'display-obstacle-seed' },
    };
  });
  if (!changed) return edges;
  return rebuiltSimplifiedRoute
    ? chooseCommercialRouteCandidate(nodes, edges, seeded)
    : seeded;
};
