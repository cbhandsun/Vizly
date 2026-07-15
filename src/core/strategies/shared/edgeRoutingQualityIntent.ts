import type { Edge } from '@xyflow/react';

export type EdgeRoutingQualityIntent = Readonly<{
  sharedTrunkSynthesized: boolean;
  sharedTrunkAware: boolean;
  isTreeBus: boolean;
  hasTreeRouting: boolean;
}>;

const edgeDataRecord = (edge: Edge): Record<string, unknown> => (
  edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
    ? edge.data as Record<string, unknown>
    : {}
);

/**
 * Parses only the routing flags consumed by hard-quality scoring. Keeping this
 * boundary explicit prevents unrelated business metadata from entering cache
 * identities while ensuring every exact-report signature uses scorer semantics.
 */
export const parseEdgeRoutingQualityIntent = (edge: Edge): EdgeRoutingQualityIntent => {
  const data = edgeDataRecord(edge);
  return {
    sharedTrunkSynthesized: data.sharedTrunkSynthesized === true,
    sharedTrunkAware: data.sharedTrunkAware === true,
    isTreeBus: data.isTreeBus === true,
    hasTreeRouting: Boolean(data.treeRouting),
  };
};

export const edgeRoutingQualityIntentToken = (edge: Edge): string => {
  const intent = parseEdgeRoutingQualityIntent(edge);
  return [
    intent.sharedTrunkSynthesized,
    intent.sharedTrunkAware,
    intent.isTreeBus,
    intent.hasTreeRouting,
  ].map(value => value ? '1' : '0').join('');
};

export const edgeHasExplicitSharedTrunkIntent = (edge: Edge): boolean => {
  const intent = parseEdgeRoutingQualityIntent(edge);
  return intent.sharedTrunkSynthesized
    || intent.sharedTrunkAware
    || intent.isTreeBus
    || intent.hasTreeRouting;
};
