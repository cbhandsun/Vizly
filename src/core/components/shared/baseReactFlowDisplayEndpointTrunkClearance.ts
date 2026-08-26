import type { Edge, Node } from '@xyflow/react';

import {
  COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  MINIMUM_BUSINESS_NODE_CLEARANCE,
} from '../../strategies/shared/edgeBusinessNodeClearanceRepair';
import { auditFinalSameSideEndpointOrder } from '../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';
import { createNodeClearanceGraphEvaluationContext } from '../../strategies/shared/edgeWaypointCandidateRepair';
import { createAtomicRouteTransactionEvaluation } from './baseReactFlowDisplayAtomicTransactionEvaluation';
import { createDisplayDeclaredAxisMismatchCounter } from './baseReactFlowDisplayDeclaredAxisTransaction';
import {
  getDisplayComputedPath,
  withDisplayComputedPath,
  type DisplayPoint,
} from './baseReactFlowDisplayGeometry';

const EPSILON = 0.5;
const MAX_EDGES = 256;
const MAX_NODES = 256;
const MAX_PATH_POINTS = 128;
const MAX_GROUPS = 8;

export type DisplayEndpointTrunkClearanceOptions = Readonly<{
  eligibleEdgeIds?: ReadonlySet<string>;
  maxGroups?: number;
}>;

const boundedGroupLimit = (value: number | undefined): number | null => {
  const parsed = value ?? 4;
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_GROUPS ? parsed : null;
};

const pathIsBounded = (path: readonly DisplayPoint[]): boolean => path.length >= 2
  && path.length <= MAX_PATH_POINTS
  && path.every(point => Number.isFinite(point.x) && Number.isFinite(point.y));

const normalCoordinate = (
  point: DisplayPoint,
  side: 'top' | 'right' | 'bottom' | 'left',
): number => side === 'left' || side === 'right' ? point.x : point.y;

const withNormalCoordinate = (
  point: DisplayPoint,
  side: 'top' | 'right' | 'bottom' | 'left',
  value: number,
): DisplayPoint => side === 'left' || side === 'right'
  ? { ...point, x: value }
  : { ...point, y: value };

const moveEndpointStem = (
  edge: Edge,
  role: 'source' | 'target',
  side: 'top' | 'right' | 'bottom' | 'left',
  coordinate: number,
): Edge | null => {
  const path = getDisplayComputedPath(edge);
  if (!pathIsBounded(path) || path.length < 3) return null;
  const oriented = role === 'source' ? path : [...path].reverse();
  const stubCoordinate = normalCoordinate(oriented[1], side);
  if (Math.abs(stubCoordinate - coordinate) <= EPSILON) return edge;
  const moved = oriented.map(point => ({ ...point }));
  for (let index = 1; index < moved.length; index += 1) {
    if (Math.abs(normalCoordinate(oriented[index], side) - stubCoordinate) > EPSILON) break;
    moved[index] = withNormalCoordinate(moved[index], side, coordinate);
  }
  const nextPath = role === 'source' ? moved : moved.reverse();
  return withDisplayComputedPath(edge, nextPath);
};

const totalClearanceRisk = (
  edges: readonly Edge[],
  score: ReturnType<typeof createNodeClearanceGraphEvaluationContext>,
  clearance: number,
): number => edges.reduce((total, edge) => (
  total + score.score(getDisplayComputedPath(edge), edge, clearance)
), 0);

/**
 * Builds bounded endpoint-group transactions that reuse an already safe
 * sibling stem. This lets a risky nested pair join an existing larger true
 * trunk without inventing a new lane or moving its anchored terminal.
 */
export const buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates = <
  T extends Edge[],
>(
  edges: T,
  nodes: Node[],
  options: DisplayEndpointTrunkClearanceOptions = {},
): T[] => {
  const maxGroups = boundedGroupLimit(options.maxGroups);
  if (
    maxGroups === null
    || edges.length === 0
    || nodes.length === 0
    || edges.length > MAX_EDGES
    || nodes.length > MAX_NODES
    || options.eligibleEdgeIds?.size === 0
  ) return [];
  const paths = edges.map(getDisplayComputedPath);
  if (paths.some(path => !pathIsBounded(path))) return [];

  const edgeIndexById = new Map(edges.map((edge, index) => [edge.id, index] as const));
  const clearance = createNodeClearanceGraphEvaluationContext(nodes);
  const commercialByIndex = paths.map((path, index) => clearance.score(
    path,
    edges[index],
    COMMERCIAL_BUSINESS_NODE_CLEARANCE,
  ));
  const baselineCommercial = commercialByIndex.reduce((total, risk) => total + risk, 0);
  if (baselineCommercial <= EPSILON) return [];
  const baselineMinimum = totalClearanceRisk(edges, clearance, MINIMUM_BUSINESS_NODE_CLEARANCE);
  const atomic = createAtomicRouteTransactionEvaluation(edges, nodes);
  const countAxisMismatches = createDisplayDeclaredAxisMismatchCounter(nodes);
  const baselineAxis = edges.map(countAxisMismatches);
  const audited = auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks;
  const groups = audited.filter(trunk => (
    trunk.edgeIds.length >= 3
    && !audited.some(other => other !== trunk
      && other.nodeId === trunk.nodeId
      && other.role === trunk.role
      && other.side === trunk.side
      && other.edgeIds.length > trunk.edgeIds.length
      && trunk.edgeIds.every(edgeId => other.edgeIds.includes(edgeId)))
  )).slice(0, maxGroups);
  const accepted: T[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    const memberIndexes = group.edgeIds.flatMap(edgeId => {
      const index = edgeIndexById.get(edgeId);
      return index === undefined ? [] : [index];
    });
    if (
      memberIndexes.length !== group.edgeIds.length
      || options.eligibleEdgeIds
        && memberIndexes.some(index => !options.eligibleEdgeIds?.has(edges[index].id))
    ) continue;
    const riskIndexes = memberIndexes.filter(index => commercialByIndex[index] > EPSILON);
    const safeIndexes = memberIndexes.filter(index => commercialByIndex[index] <= EPSILON);
    if (riskIndexes.length === 0 || safeIndexes.length === 0) continue;
    const safeCoordinates = safeIndexes.map(index => {
      const path = paths[index];
      const oriented = group.role === 'source' ? path : [...path].reverse();
      return normalCoordinate(oriented[1], group.side);
    }).filter((value, index, values) => values.findIndex(
      candidate => Math.abs(candidate - value) <= EPSILON,
    ) === index);

    for (const coordinate of safeCoordinates) {
      const candidate = edges.slice() as T;
      let complete = true;
      for (const index of memberIndexes) {
        const moved = moveEndpointStem(edges[index], group.role, group.side, coordinate);
        if (!moved) {
          complete = false;
          break;
        }
        candidate[index] = moved;
      }
      if (!complete) continue;
      const changedIndexes = memberIndexes.filter(index => candidate[index] !== edges[index]);
      if (changedIndexes.length === 0) continue;
      const commercial = totalClearanceRisk(
        candidate,
        clearance,
        COMMERCIAL_BUSINESS_NODE_CLEARANCE,
      );
      const minimum = totalClearanceRisk(candidate, clearance, MINIMUM_BUSINESS_NODE_CLEARANCE);
      if (commercial >= baselineCommercial - EPSILON || minimum > baselineMinimum + EPSILON) continue;
      if (changedIndexes.some(index => countAxisMismatches(candidate[index]) > baselineAxis[index])) {
        continue;
      }
      const evaluation = atomic.evaluate(candidate, changedIndexes);
      if (
        !evaluation.hardQualityDoesNotRegress
        || !evaluation.obstacleHitsDoNotRegress
        || !evaluation.terminalsAnchored
        || !evaluation.trunksPreserved
      ) continue;
      const signature = changedIndexes.map(index => (
        `${index}:${getDisplayComputedPath(candidate[index])
          .map(point => `${point.x}:${point.y}`).join('|')}`
      )).join('::');
      if (!seen.has(signature)) {
        seen.add(signature);
        accepted.push(candidate);
      }
    }
  }
  return accepted;
};

export const repairBaseReactFlowDisplayEndpointTrunkClearance = <T extends Edge[]>(
  edges: T,
  nodes: Node[],
  options: DisplayEndpointTrunkClearanceOptions = {},
): T => buildBaseReactFlowDisplayEndpointTrunkClearanceCandidates(edges, nodes, options)[0]
  ?? edges;
