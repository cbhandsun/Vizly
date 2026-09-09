import type { Edge, Node } from '@xyflow/react';
import { LayoutType, type LayoutOptions } from '../../../types/layout';
import type { LayoutCalculationContext } from '../../../types/layout-strategy';
import { prepareDomainDagreInteractiveEdges } from '../../../strategies/domainDagreInteractiveEdgePreparation';
import { resolveDomainElkMainFlowOptions } from '../../../strategies/domainElkLayoutProfile';
import { withDisplayAbsolutePositions } from '../../shared/baseReactFlowAbsolutePositions';
import { projectBaseReactFlowDisplayWorkerInput } from '../../shared/baseReactFlowDisplayWorkerProjection';
import { measureRoutedLayoutQuality } from '../../shared/routedLayoutQuality';
import { prepareLayeredLayoutEdges } from './layeredLayoutEdgePreparation';
import { calculateLayeredLayoutWithReverse } from './reverseLayeredLayoutGeometry';
import { stripHiddenGeneratedLayoutNodes } from './layoutStrategyInputBoundary';
import type { RoutedLayoutCandidate } from './layoutCandidateSelection';
import type { FlowchartLayoutDirection } from '../flowchartLayoutStrategyMode';

export const compactGroupInnerDirection = (direction: FlowchartLayoutDirection): FlowchartLayoutDirection =>
  direction === 'LR' || direction === 'RL' ? 'TB' : 'LR';

/** One-level semantic groups only. Other compound topologies keep their native
 * baseline until a candidate supports their constraints, without flattening. */
export const canCompareCompactGroups = (nodes: Node[], edges: Edge[], options: LayoutOptions): boolean =>
  options.generateDomainGroups === false && options.generateSubDomainGroups === true
  && nodes.length > 1 && nodes.length <= 64 && edges.length > 0 && edges.length <= 128
  && nodes.some(node => typeof node.data.subDomain === 'string' && node.data.subDomain.trim().length > 0)
  && !nodes.some(node => node.type === 'titleGroup' || node.type === 'group'
    || node.type === 'domain' || (node.type === 'subGroup' && Boolean(node.parentId)))
  && !edges.some(edge => edge.data?.waypoints !== undefined
    && (!Array.isArray(edge.data.waypoints) || edge.data.waypoints.length > 0));

export async function createCompactGroupedLayout(
  nodes: Node[], edges: Edge[], options: LayoutOptions,
  direction: FlowchartLayoutDirection, context: LayoutCalculationContext,
) {
  if (!canCompareCompactGroups(nodes, edges, options)) return null;
  const { DomainDagreLayoutStrategy } = await import('../../../strategies/DomainDagreLayoutStrategy');
  const inner = compactGroupInnerDirection(direction);
  const result = await calculateLayeredLayoutWithReverse(new DomainDagreLayoutStrategy(), nodes, edges, {
    ...options, nodeLayout: LayoutType.DAGRE, spacing: { horizontal: 50, vertical: 50 },
    domainPlacement: 'topology', domainSubGroupDirection: direction,
    subDomainNodeDirection: inner, edgeRoutingQuality: 'interactive',
  }, direction, true, context);
  const finalNodes = stripHiddenGeneratedLayoutNodes(result.nodes, {
    generateDomainGroups: false, generateSubDomainGroups: true,
    domainWhitelist: options.domainWhitelist, subDomainWhitelist: options.subDomainWhitelist,
  });
  const absoluteNodes = withDisplayAbsolutePositions(finalNodes, new Map(finalNodes.map(node => [node.id, node])));
  const prepared = prepareDomainDagreInteractiveEdges({ nodes: absoluteNodes,
    edges: result.edges, nodeById: new Map(absoluteNodes.map(node => [node.id, node])),
    options: { ...options, direction: inner, domainPlacement: 'topology' },
  });
  return { nodes: finalNodes, edges: prepareLayeredLayoutEdges(finalNodes, prepared, direction) };
}

const reversedMainEdges = (candidate: RoutedLayoutCandidate, direction: FlowchartLayoutDirection,
  inner: FlowchartLayoutDirection): number => {
  const { nodes } = projectBaseReactFlowDisplayWorkerInput({ nodes: candidate.geometry.nodes, edges: [] });
  const byId = new Map(nodes.map(node => [node.id, node]));
  let reversed = 0;
  for (const edge of candidate.geometry.edges) {
    if (!resolveDomainElkMainFlowOptions(edge, candidate.geometry.edges.length)) continue;
    const source = byId.get(edge.source), target = byId.get(edge.target);
    if (!source || !target) return Infinity;
    const flow = source.parentId && source.parentId === target.parentId ? inner : direction;
    const horizontal = flow === 'LR' || flow === 'RL';
    const axis = horizontal ? 'x' : 'y', dimension = horizontal ? 'width' : 'height';
    const sourceSize = source.measured?.[dimension] ?? source[dimension];
    const targetSize = target.measured?.[dimension] ?? target[dimension];
    if (typeof sourceSize !== 'number' || typeof targetSize !== 'number') return Infinity;
    const delta = target.positionAbsolute[axis] + targetSize / 2 - source.positionAbsolute[axis] - sourceSize / 2;
    if (!Number.isFinite(delta)) return Infinity;
    if (delta * (flow === 'BT' || flow === 'RL' ? -1 : 1) < -0.01) reversed++;
  }
  return reversed;
};

/** Compactness never buys extra crossings or longer routes. Bends are reported
 * separately: a shorter orthogonal connection may legitimately turn more often. */
export function preferCompactGroupedLayout(baseline: RoutedLayoutCandidate, candidate: RoutedLayoutCandidate,
  direction: FlowchartLayoutDirection): boolean {
  // Dropping a dependency or business node must never look like shorter routing.
  const edgeIdentity = (edges: Edge[]) => edges.map(edge => JSON.stringify([
    edge.id, edge.source, edge.target, edge.hidden === true,
    resolveDomainElkMainFlowOptions(edge, edges.length) !== undefined,
  ])).sort();
  const text = (value: unknown) => typeof value === 'string' ? value.trim() || null : null;
  const businessIdentity = (nodes: Node[]) => nodes.filter(node => !['titleGroup', 'subGroup'].includes(node.type ?? ''))
    .map(node => {
      const domain = text(node.data.domain), subDomain = text(node.data.subDomain);
      // Compound ELK may fill a free node's absent subgroup with its domain.
      // That alias creates no subgroup membership; do not mistake it for one.
      const subgroup = !node.parentId && subDomain === domain ? null : subDomain;
      return JSON.stringify([node.id, node.type, domain, subgroup, node.parentId ?? null, node.hidden === true]);
    }).sort();
  if (JSON.stringify(edgeIdentity(baseline.geometry.edges)) !== JSON.stringify(edgeIdentity(candidate.geometry.edges))
    || JSON.stringify(businessIdentity(baseline.geometry.nodes)) !== JSON.stringify(businessIdentity(candidate.geometry.nodes))) return false;
  const before = measureRoutedLayoutQuality(baseline.geometry.nodes, baseline.staged.routedEdges, direction);
  const after = measureRoutedLayoutQuality(candidate.geometry.nodes, candidate.staged.routedEdges, direction);
  if (!before || !after) return false;
  const mainBefore = reversedMainEdges(baseline, direction, direction);
  const mainAfter = reversedMainEdges(candidate, direction, compactGroupInnerDirection(direction));
  return Number.isFinite(mainBefore) && Number.isFinite(mainAfter) && mainAfter <= mainBefore
    && after.crossings <= before.crossings && after.pathLength <= before.pathLength + 0.01
    && after.flowOrthogonalDrift <= before.flowOrthogonalDrift + 0.01
    && Math.max(after.width, after.height) < Math.max(before.width, before.height) - 0.01;
}
