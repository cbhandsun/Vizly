import type { Edge, Node } from '@xyflow/react';
import type { LayoutOptions } from '../../../types/layout';
import type { LaneRankDecision } from '../../../types/domainLaneRank';
import type { LayoutCalculationContext } from '../../../types/layout-strategy';
import { resolveDomainElkMainFlowOptions } from '../../../strategies/domainElkLayoutProfile';
import {
  measureRoutedLayoutQuality,
  routedEdgesWithSourceLabelsForQuality,
  routedLayoutDominates,
} from '../../shared/routedLayoutQuality';
import { projectBaseReactFlowDisplayWorkerInput } from '../../shared/baseReactFlowDisplayWorkerProjection';
import { prepareLayeredLayoutEdges } from './layeredLayoutEdgePreparation';
import { calculateLayeredLayoutWithReverse } from './reverseLayeredLayoutGeometry';
import { stripHiddenGeneratedLayoutNodes } from './layoutStrategyInputBoundary';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';
import type { LayoutCandidate, RoutedLayoutCandidate } from './layoutCandidateSelection';

const identity = ({ nodes, edges }: LayoutCandidate): string => JSON.stringify({
  nodes: nodes.map(node => JSON.stringify([node.id, node.type, node.parentId ?? null, node.hidden === true,
    typeof node.data.domain === 'string' ? node.data.domain : null,
    typeof node.data.subDomain === 'string' ? node.data.subDomain : null])).sort(),
  edges: edges.map(edge => JSON.stringify([edge.id, edge.source, edge.target, edge.hidden === true,
    resolveDomainElkMainFlowOptions(edge, edges.length) !== undefined])).sort(),
});

const mainReversals = (candidate: LayoutCandidate, direction: FlowchartLayoutDirection): number => {
  const { nodes } = projectBaseReactFlowDisplayWorkerInput({ nodes: candidate.nodes, edges: [] });
  const horizontal = direction === 'LR' || direction === 'RL';
  const axis = horizontal ? 'x' : 'y', dimension = horizontal ? 'width' : 'height';
  const centers = new Map(nodes.map(node => [node.id,
    node.positionAbsolute[axis] + (node.measured?.[dimension] ?? node[dimension] ?? NaN) / 2]));
  let count = 0;
  for (const edge of candidate.edges) {
    if (!resolveDomainElkMainFlowOptions(edge, candidate.edges.length)) continue;
    const delta = (centers.get(edge.target) ?? NaN) - (centers.get(edge.source) ?? NaN);
    if (!Number.isFinite(delta)) return Infinity;
    if (delta * (direction === 'BT' || direction === 'RL' ? -1 : 1) < -0.01) count++;
  }
  return count;
};

export const preferAlignedLaneLayout = (baseline: RoutedLayoutCandidate, candidate: RoutedLayoutCandidate,
  direction: FlowchartLayoutDirection): boolean => {
  if (identity(baseline.geometry) !== identity(candidate.geometry)) return false;
  const before = mainReversals(baseline.geometry, direction), after = mainReversals(candidate.geometry, direction);
  return Number.isFinite(before) && Number.isFinite(after) && after <= before && routedLayoutDominates(
    measureRoutedLayoutQuality(baseline.geometry.nodes,
      routedEdgesWithSourceLabelsForQuality(baseline.geometry.edges, baseline.staged.routedEdges), direction),
    measureRoutedLayoutQuality(candidate.geometry.nodes,
      routedEdgesWithSourceLabelsForQuality(candidate.geometry.edges, candidate.staged.routedEdges), direction),
  );
};

const tiedLaneRankMetrics = (decision: LaneRankDecision): boolean => {
  if (decision.requested !== 'auto' || decision.applied !== 'global') return false;
  const global = decision.metrics.global, compact = decision.metrics.compact;
  if (!global || !compact) return false;
  const fields = ['flowLength', 'whitespaceRatio', 'backwardTravel', 'backwardEdgeCount'] as const;
  return fields.every(key => Number.isFinite(global[key]) && Number.isFinite(compact[key])
    && Math.abs(global[key] - compact[key]) <= 0.01);
};

/** One optional candidate for an already-selected global phase model. Failed
 * geometry/routing stays with the existing transaction's validated baseline. */
export function createAlignedLaneComparison({ nodes, edges, options, direction, context, decision, onSelectedDecision }: {
  nodes: Node[]; edges: Edge[]; options: LayoutOptions; direction: FlowchartLayoutDirection;
  context: LayoutCalculationContext; decision: LaneRankDecision;
  onSelectedDecision: (decision: LaneRankDecision) => void;
}) {
  if (decision.applied !== 'global' || options.domainPlacement !== 'ordered-lanes'
    || options.generateDomainGroups !== true || nodes.length < 2 || nodes.length > 64
    || edges.length === 0 || edges.length > 128
    || edges.some(edge => edge.data?.waypoints !== undefined
      && (!Array.isArray(edge.data.waypoints) || edge.data.waypoints.length > 0))) return undefined;
  let alternativeDecision: LaneRankDecision | undefined;
  const compareCompactRank = tiedLaneRankMetrics(decision);
  return {
    create: async (): Promise<LayoutCandidate | null> => {
      const { DomainDagreLayoutStrategy } = await import('../../../strategies/DomainDagreLayoutStrategy');
      const result = await calculateLayeredLayoutWithReverse(new DomainDagreLayoutStrategy(), nodes, edges, {
        ...options,
        ...(compareCompactRank ? { laneRankPreference: 'compact' as const } : { alignGlobalLanePeers: true }),
        previousLaneRankDecision: decision,
      }, direction, true, context);
      const generatedDecision = result.metadata?.laneRankDecision;
      const expectedMode = compareCompactRank ? 'compact' : 'global';
      if (generatedDecision?.applied !== expectedMode) { alternativeDecision = undefined; return null; }
      alternativeDecision = compareCompactRank ? {
        ...decision,
        applied: 'compact',
        reason: 'routed-quality',
        previousApplied: decision.applied,
      } : generatedDecision;
      const finalNodes = stripHiddenGeneratedLayoutNodes(result.nodes, {
        generateDomainGroups: true, generateSubDomainGroups: options.generateSubDomainGroups !== false,
        domainWhitelist: options.domainWhitelist, subDomainWhitelist: options.subDomainWhitelist,
      });
      return { nodes: finalNodes, edges: prepareLayeredLayoutEdges(finalNodes, result.edges, direction,
        { promoteLockedComputedPath: true }) };
    },
    prefer: (baseline: RoutedLayoutCandidate, alternative: RoutedLayoutCandidate): boolean => {
      if (!alternativeDecision || !preferAlignedLaneLayout(baseline, alternative, direction)) return false;
      onSelectedDecision(alternativeDecision);
      return true;
    },
  };
}
