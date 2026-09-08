import { parseDisplayRoutingIdentifierList } from './baseReactFlowDisplayRoutingChangeProtocol';

/** Missing evidence remains unavailable; malformed evidence invalidates the message. */
export const parseDisplayWorkerEligibleScope = (
  response: Record<string, unknown>,
): string[] | null | undefined => {
  if (response.eligibleEdgeIds === undefined) return undefined;
  if (response.hardClean !== true || response.routeResolution !== 'incremental-route'
    || response.fallbackLevel !== 'none') return null;
  const edges = response.edges ?? response.routingPatches;
  if (!Array.isArray(edges) || edges.length > 10_000) return null;
  const eligible = parseDisplayRoutingIdentifierList(response.eligibleEdgeIds);
  if (!eligible) return null;
  const presentIds = new Set<string>();
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object' || !('id' in edge) || typeof edge.id !== 'string') return null;
    presentIds.add(edge.id);
  }
  return eligible.every(id => presentIds.has(id)) ? eligible : null;
};
