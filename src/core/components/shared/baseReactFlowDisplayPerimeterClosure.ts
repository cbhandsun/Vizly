import type { Edge, Node } from '@xyflow/react';
import { handleToAnchor, getEdgePath } from '../../strategies/shared/edgeRoutingPathGeometry';
import { lockComputedPathOnEdge } from '../../strategies/shared/edgeFallbackPath';
import { getDisplayHardQualityGateReport } from './baseReactFlowDisplayQualityGates';
import { compareEdgePathQualityScores } from '../../strategies/shared/edgePathQualityGeometry';
import { readEdgeTerminalPolicy } from '../../routing/utils/edgeTerminalPolicy';
import { countDisplayBusinessNodeCommercialClearanceViolations, repairBaseReactFlowDisplayBusinessNodeClearance } from './baseReactFlowDisplayBusinessNodeClearance';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { getDisplayNodeRect, isDisplayContainerNode } from './baseReactFlowDisplayGeometry';
import { getExactDisplayHardReport } from './baseReactFlowDisplayWorkerResponse';
import { segmentIntersectsClearanceRect } from '../../strategies/shared/edgeNodeClearanceGeometry';

const MAX_EDGES = 48;
const MAX_NODES = 128;
type ClosureNode = Node & { width: number; height: number };
const businessNodes = <T extends Node>(nodes: T[]): T[] => nodes.filter(node => !isDisplayContainerNode(node) && !node.hidden);

const preservesSharedBuddies = (baseline: Edge[], candidate: Edge[], nodes: Node[]): boolean => {
  const retained = new Set(auditFinalSameSideEndpointOrder(candidate, nodes).legalSharedTrunks.map(trunk => trunk.id));
  return auditFinalSameSideEndpointOrder(baseline, nodes).legalSharedTrunks.every(trunk => retained.has(trunk.id));
};

/** Use a full perimeter when local trunks form a separator. Worker-owned only. */
const repairPerimeter = (edges: Edge[], nodes: ClosureNode[]): Edge[] => {
  const leaves = businessNodes(nodes);
  const byId = new Map(leaves.map(node => [node.id, node]));
  const left = Math.min(...leaves.map(node => node.position.x)) - 64;
  const right = Math.max(...leaves.map(node => node.position.x + node.width)) + 64;
  const top = Math.min(...leaves.map(node => node.position.y)) - 64;
  const bottom = Math.max(...leaves.map(node => node.position.y + node.height)) + 64;
  let current = edges;
  const evaluate = (candidate: Edge[]) => {
    const report = getDisplayHardQualityGateReport(candidate, nodes, 'polished');
    return { ...report, minimumClearanceViolations: report.minimumClearanceViolations ?? Infinity,
      commercialClearanceViolations: countDisplayBusinessNodeCommercialClearanceViolations(candidate, nodes) };
  };
  let report = evaluate(current);
  for (let index = 0; index < edges.length; index += 1) {
    const edge = current[index];
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    for (const sourceSide of ['left', 'right'] as const) {
      for (const targetSide of ['left', 'right'] as const) {
        if (readEdgeTerminalPolicy(edge, 'source').sideFixed || readEdgeTerminalPolicy(edge, 'target').sideFixed) continue;
        const start = handleToAnchor(source.position, source.width, source.height, sourceSide);
        const end = handleToAnchor(target.position, target.width, target.height, targetSide);
        const sx = sourceSide === 'left' ? left : right;
        const tx = targetSide === 'left' ? left : right;
        for (const y of [top, bottom]) {
          if (sx === tx) continue;
          const next = { ...edge, sourceHandle: sourceSide, targetHandle: targetSide, data: { ...edge.data } };
          lockComputedPathOnEdge(next, [start, { x: sx, y: start.y }, { x: sx, y }, { x: tx, y }, { x: tx, y: end.y }, end]);
          // Graph obstacle scores exclude endpoint nodes. A perimeter escape
          // must nevertheless never cut through either endpoint's interior.
          const path = getEdgePath(next);
          if ([source, target].some(node => {
            const rect = getDisplayNodeRect(node);
            return !rect || path.slice(0, -1).some((a, i) => segmentIntersectsClearanceRect({ a, b: path[i + 1] }, rect, 0));
          })) continue;
          const candidate = current.map((item, candidateIndex) => candidateIndex === index ? next : item);
          if (!preservesSharedBuddies(current, candidate, nodes)) continue;
          const score = evaluate(candidate);
          if (!score.terminalsAnchored || !score.terminalsAttached) continue;
          if (score.obstacleHits > report.obstacleHits || score.minimumClearanceViolations > report.minimumClearanceViolations
            || score.commercialClearanceViolations > report.commercialClearanceViolations) continue;
          const geometricImprovement = score.obstacleHits < report.obstacleHits
            || score.minimumClearanceViolations < report.minimumClearanceViolations
            || score.commercialClearanceViolations < report.commercialClearanceViolations;
          if (compareEdgePathQualityScores(score.quality, report.quality) <= 0 || (geometricImprovement
            && score.quality.strictCrossings <= report.quality.strictCrossings
            && score.quality.reverseOverlap <= report.quality.reverseOverlap
            && score.quality.unrelatedOverlap <= report.quality.unrelatedOverlap)) {
            current = candidate;
            report = score;
          }
        }
      }
    }
  }
  return current;
};

const repairSharedLaneClearance = (edges: Edge[], nodes: ClosureNode[]): Edge[] => {
  let current = edges;
  let violations = countDisplayBusinessNodeCommercialClearanceViolations(edges, nodes);
  for (const group of auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks.slice(0, 8)) {
    if (group.edgeIds.length < 2) continue;
    const axis = group.side === 'left' || group.side === 'right' ? 'x' : 'y';
    const groupEdge = current.find(edge => group.edgeIds.includes(edge.id));
    if (!groupEdge) continue;
    const groupPath = getEdgePath(groupEdge);
    const oldCoordinate = (group.role === 'source' ? groupPath[1] : groupPath[groupPath.length - 2])?.[axis];
    if (oldCoordinate === undefined) continue;
    const coordinates = [...new Set(businessNodes(nodes).flatMap(node => {
      return [node.position[axis] - 48, node.position[axis] + (axis === 'x' ? node.width : node.height) + 48];
    }))].filter(coordinate => Math.abs(coordinate - oldCoordinate) <= 192)
      .sort((a, b) => Math.abs(a - oldCoordinate) - Math.abs(b - oldCoordinate)).slice(0, 32);
    for (const coordinate of coordinates) {
      let blocked = false;
      const candidate = current.map(edge => {
        if (!group.edgeIds.includes(edge.id)) return edge;
        if (readEdgeTerminalPolicy(edge, 'source').forbidden || readEdgeTerminalPolicy(edge, 'target').forbidden) {
          blocked = true;
          return edge;
        }
        const path = getEdgePath(edge);
        const oriented = group.role === 'source' ? path : path.toReversed();
        if (oriented.length < 3) return edge;
        const old = oriented[1][axis];
        let contiguous = true;
        const moved = oriented.map((point, index) => {
          if (index === 0) return point;
          if (Math.abs(point[axis] - old) > 0.5) contiguous = false;
          return contiguous ? { ...point, [axis]: coordinate } : point;
        });
        const next = { ...edge, data: { ...edge.data } };
        const nextPath = group.role === 'source' ? moved : moved.toReversed();
        for (const [role, index] of [['source', 0], ['target', path.length - 1]] as const) {
          if (readEdgeTerminalPolicy(edge, role).positionFixed
            && (Math.abs(nextPath[index].x - path[index].x) > 0.5 || Math.abs(nextPath[index].y - path[index].y) > 0.5)) {
            blocked = true;
            return edge;
          }
        }
        lockComputedPathOnEdge(next, nextPath);
        return next;
      });
      if (blocked) continue;
      const count = countDisplayBusinessNodeCommercialClearanceViolations(candidate, nodes);
      if (count < violations && preservesSharedBuddies(current, candidate, nodes)
        && getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean) {
        current = candidate;
        violations = count;
      }
    }
  }
  return current;
};

/** Last bounded geometric closure; publish nothing unless every exact gate passes. */
export const repairBaseReactFlowDisplayPerimeterClosure = (edges: Edge[], nodes: Node[]): Edge[] => {
  if (edges.length === 0 || edges.length > MAX_EDGES || nodes.length === 0 || nodes.length > MAX_NODES) return edges;
  if (businessNodes(nodes).length === 0 || nodes.some(node => !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))) return edges;
  if (edges.some(edge => { const path = getEdgePath(edge); return path.length > 128 || path.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)); })) return edges;
  if (getExactDisplayHardReport(edges, nodes).hardClean) return edges;
  const absoluteNodes = nodes.flatMap(node => {
    const rect = getDisplayNodeRect(node);
    if (!rect) return [];
    const position = { x: rect.x, y: rect.y };
    return [{ ...node, width: rect.width, height: rect.height, position, positionAbsolute: position, parentId: undefined, extent: undefined }];
  });
  if (absoluteNodes.length !== nodes.length) return edges;
  if (absoluteNodes.some(node => Math.abs(node.position.x) + node.width + 64 > 1_000_000
    || Math.abs(node.position.y) + node.height + 64 > 1_000_000)) return edges;
  const shared = repairSharedLaneClearance(edges, absoluteNodes);
  if (getExactDisplayHardReport(shared, nodes).hardClean) return shared;
  const perimeter = repairPerimeter(shared, absoluteNodes);
  const clearance = repairBaseReactFlowDisplayBusinessNodeClearance(perimeter, absoluteNodes);
  const candidate = repairSharedLaneClearance(clearance, absoluteNodes);
  return preservesSharedBuddies(edges, candidate, absoluteNodes)
    && getExactDisplayHardReport(candidate, nodes).hardClean ? candidate : edges;
};
