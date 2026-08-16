import type { Edge, Node } from '@xyflow/react';

import { getDisplayHardQualityGateReport } from '../../shared/baseReactFlowDisplayQualityGates';
import { getDisplayComputedPath } from '../../shared/baseReactFlowDisplayGeometry';
import { isDirectedForestLayoutGraph } from './treeLayoutTopology';

interface GeneratedGroupLayoutOptions {
  generateDomainGroups?: boolean;
  generateSubDomainGroups?: boolean;
}

const hasMeaningfulSemanticGrouping = (nodes: Node[]): boolean => nodes.some((node) => {
  const data = node.data && typeof node.data === 'object' && !Array.isArray(node.data)
    ? node.data as Record<string, unknown>
    : {};
  const domain = typeof data.domain === 'string' ? data.domain.trim() : '';
  const subDomain = typeof data.subDomain === 'string' ? data.subDomain.trim() : '';
  return Boolean(
    (domain && domain !== 'default' && domain !== '默认域')
    || subDomain,
  );
});

/**
 * The flat ELK engine cannot recreate generated domain/sub-domain containers.
 * It is therefore a valid legacy-layout fallback only when the diagram has
 * explicitly disabled both semantic container layers.
 */
export const canUseFlatElkSafetyFallback = (
  options: GeneratedGroupLayoutOptions,
  nodes: Node[] = [],
): boolean => (
  (
    options.generateDomainGroups === false
    && options.generateSubDomainGroups === false
  )
  || (nodes.length > 0 && !hasMeaningfulSemanticGrouping(nodes))
);

export type LegacyDomainQualityFallback = 'flat-elk' | 'domain-compound-elk';

export const isLayoutRoutingHardQualityRejection = (error: unknown): boolean => (
  error instanceof Error && error.message === 'layout-routing-hard-quality-rejected'
);

export const resolveLegacyDomainTopologyFallback = (
  options: GeneratedGroupLayoutOptions,
  nodes: Node[],
  edges: Edge[],
): LegacyDomainQualityFallback | null => {
  if (!shouldPreferElkForLegacyDomainTopology(nodes, edges)) return null;
  return canUseFlatElkSafetyFallback(options, nodes)
    ? 'flat-elk'
    : 'domain-compound-elk';
};

/**
 * A hard-defective domain candidate must not silently discard semantic
 * containers. Flat diagrams may use ELK; grouped diagrams fall back to the
 * domain-preserving layered engine.
 */
export const resolveLegacyDomainQualityFallback = (
  options: GeneratedGroupLayoutOptions,
  nodes: Node[],
  edges: Edge[],
): LegacyDomainQualityFallback | null => {
  if (!shouldUseElkSafetyFallback(nodes, edges)) return null;
  return canUseFlatElkSafetyFallback(options, nodes)
    ? 'flat-elk'
    : 'domain-compound-elk';
};

export const shouldPreferElkForLegacyDomainTopology = (
  nodes: Node[],
  edges: Edge[],
): boolean => (
  nodes.length > 0
  && edges.length > 0
  && !isDirectedForestLayoutGraph(nodes, edges)
);

/**
 * Legacy domain layouts remain useful for simple trees and already-clean
 * business graphs. Dense DAGs and feedback graphs can, however, place a long
 * same-rank edge through an unrelated sibling port or node. When the legacy
 * engine has supplied a complete route candidate, use its hard-quality report
 * as a cheap preflight and let ELK own ranking before the expensive Worker
 * transaction starts.
 */
export const shouldUseElkSafetyFallback = (
  nodes: Node[],
  edges: Edge[],
): boolean => {
  if (nodes.length === 0 || edges.length === 0) return false;

  const routedEdges = edges.filter(edge => String(edge.type ?? '').toLowerCase() !== 'canvas-ref');
  if (
    routedEdges.length === 0
    || routedEdges.some(edge => getDisplayComputedPath(edge).length < 2)
  ) return false;

  return !getDisplayHardQualityGateReport(routedEdges, nodes, 'polished').hardClean;
};
