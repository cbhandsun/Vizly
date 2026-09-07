import type { Edge } from '@xyflow/react';

export type RoutingPatchData = Readonly<{
  computedPath?: unknown;
  elkPath?: unknown;
  treeRouting?: unknown;
  h?: unknown;
  sharedTrunkAware?: unknown;
  sharedTrunkSynthesized?: unknown;
  isTreeBus?: unknown;
  overextendedTargetTrunkCorridorReclaimed?: unknown;
}>;

export const ROUTING_PATCH_DATA_KEYS = [
  'computedPath', 'elkPath', 'treeRouting', 'h', 'sharedTrunkAware',
  'sharedTrunkSynthesized', 'isTreeBus', 'overextendedTargetTrunkCorridorReclaimed',
] as const satisfies readonly (keyof RoutingPatchData)[];

/**
 * Routing-owned edge delta. Presentation and business fields are deliberately
 * absent; runtime boundary parsers further constrain the data keys and values.
 */
export type RoutingPatch = Readonly<{
  id: Edge['id'];
  source: Edge['source'];
  target: Edge['target'];
  type?: Edge['type'];
  sourceHandle?: Edge['sourceHandle'];
  targetHandle?: Edge['targetHandle'];
  data?: RoutingPatchData;
}>;
