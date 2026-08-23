import type { Edge, Node } from '@xyflow/react';

import { BoundedEvaluationLruCache } from '../../strategies/shared/boundedEvaluationLruCache';
import { computeBaseReactFlowDisplayOutputRouteSignature } from './baseReactFlowDisplayCache';
import { displayRoutingObstaclesSignature } from './baseReactFlowDisplayGeometry';

const FINAL_SAFETY_NOOP_CACHE_LIMITS = {
  entries: 64,
  edgeSlots: 4_096,
  segmentSlots: 0,
  pairSlots: 0,
};

export const createBaseReactFlowFinalSafetyNoopCacheKey = (
  edges: Edge[],
  nodes: Node[],
  eligibleEdgeIds?: ReadonlySet<string>,
): string | null => {
  const routeSignature = computeBaseReactFlowDisplayOutputRouteSignature(edges);
  if (!routeSignature || nodes.length > 2_000) return null;
  const eligibleIds = eligibleEdgeIds ? [...eligibleEdgeIds] : [];
  if (
    eligibleIds.length > 2_000
    || eligibleIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 500)
  ) return null;
  eligibleIds.sort();
  return JSON.stringify([
    routeSignature,
    displayRoutingObstaclesSignature(nodes),
    eligibleEdgeIds ? eligibleIds : null,
  ]);
};

export const createBaseReactFlowFinalSafetyNoopCache = () => {
  const cache = new BoundedEvaluationLruCache<true>(FINAL_SAFETY_NOOP_CACHE_LIMITS);
  return {
    has(edges: Edge[], nodes: Node[], eligibleEdgeIds?: ReadonlySet<string>): boolean {
      const key = createBaseReactFlowFinalSafetyNoopCacheKey(edges, nodes, eligibleEdgeIds);
      return key !== null && cache.get(key) === true;
    },
    remember(edges: Edge[], nodes: Node[], eligibleEdgeIds?: ReadonlySet<string>): boolean {
      const key = createBaseReactFlowFinalSafetyNoopCacheKey(edges, nodes, eligibleEdgeIds);
      return key !== null && cache.set(key, true, {
        edges: edges.length,
        segments: 0,
        pairs: 0,
      });
    },
  };
};
