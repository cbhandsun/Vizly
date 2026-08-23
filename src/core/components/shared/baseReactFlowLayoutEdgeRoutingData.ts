import type { Edge } from '@xyflow/react';

/** Remove display-only route state before a fresh layout transaction. */
export const clearBaseReactFlowLayoutEdgeRoutingData = (
  data: Edge['data'],
): Edge['data'] => ({
  ...data,
  waypoints: [],
  computedPath: undefined,
  elkPath: undefined,
  treeRouting: undefined,
  algorithm: undefined,
  auto: undefined,
  autoSource: undefined,
  autoTarget: undefined,
  _layoutEpoch: undefined,
  layoutPathLocked: undefined,
  _layoutPathLocked: undefined,
  runtimeHandleLock: undefined,
  _runtimeHandleLock: undefined,
  __baseDisplayFinalizedSignature: undefined,
  stablePathQuality: undefined,
  isTreeBus: undefined,
  sharedTrunkAware: undefined,
  sharedTrunkSynthesized: undefined,
  overextendedTargetTrunkCorridorReclaimed: undefined,
  useElkRouting: undefined,
  layoutRoutingCandidate: undefined,
  h: undefined,
});
