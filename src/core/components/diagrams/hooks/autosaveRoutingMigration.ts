import type { Edge } from '@xyflow/react';

import { EDGE_ROUTING_CACHE_VERSION } from '../../../routing/routingVersion';

const TRANSIENT_AUTOMATIC_ROUTE_KEYS = [
  'computedPath',
  'elkPath',
  'treeRouting',
  'algorithm',
  'layoutPathLocked',
  '_layoutPathLocked',
  '_layoutEpoch',
  'runtimeHandleLock',
  '_runtimeHandleLock',
  'auto',
  'autoSource',
  'autoTarget',
  'sharedTrunkAware',
  'sharedTrunkSynthesized',
  'isTreeBus',
  'overextendedTargetTrunkCorridorReclaimed',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

const STANDARD_PRESET_SEMANTIC_EDGE_TYPES = new Set([
  'main',
  'data',
  'dependency',
  'feedback',
  'support',
  '反馈',
]);

const hasManualHandleRole = (
  data: Record<string, unknown>,
  role: 'source' | 'target',
): boolean => {
  const manualSides = Array.isArray(data.manualHandleSides)
    ? data.manualHandleSides.map(value => String(value).toLowerCase())
    : [];
  if (manualSides.includes(role)) return true;
  const manualHandles = data.manualHandles ?? data._manualHandles;
  return manualHandles === true || (isRecord(manualHandles) && Boolean(manualHandles[role]));
};

const restorePresetCanvasEdgeType = (presetEdge: unknown, savedType: Edge['type']): Edge['type'] => {
  if (!isRecord(presetEdge) || typeof presetEdge.type !== 'string') {
    return String(savedType ?? '').toLowerCase() === 'stablepath'
      ? 'advanced-smart-step'
      : savedType;
  }
  const presetType = presetEdge.type.trim();
  if (!presetType) return 'advanced-smart-step';
  return STANDARD_PRESET_SEMANTIC_EDGE_TYPES.has(presetType.toLowerCase())
    ? 'advanced-smart-step'
    : presetType;
};

/**
 * Automatic route geometry is an algorithm output, not durable user content.
 * When a saved standard preset was produced by another routing version, retain
 * authored edge data and waypoints but force the current router to recompute its
 * locked path and shared-trunk decomposition.
 */
export const invalidateStalePresetEdgeAutomaticRoute = (
  edge: Edge,
  presetEdge: unknown,
  savedRoutingVersion: unknown,
): Edge => {
  if (savedRoutingVersion === EDGE_ROUTING_CACHE_VERSION) return edge;

  const data = isRecord(edge.data) ? { ...edge.data } : {};
  const preserveSourceHandle = hasManualHandleRole(data, 'source');
  const preserveTargetHandle = hasManualHandleRole(data, 'target');
  let changed = false;
  for (const key of TRANSIENT_AUTOMATIC_ROUTE_KEYS) {
    if (!(key in data)) continue;
    delete data[key];
    changed = true;
  }

  const type = restorePresetCanvasEdgeType(presetEdge, edge.type);
  const sourceHandle = preserveSourceHandle ? edge.sourceHandle : undefined;
  const targetHandle = preserveTargetHandle ? edge.targetHandle : undefined;
  if (
    !changed
    && type === edge.type
    && sourceHandle === edge.sourceHandle
    && targetHandle === edge.targetHandle
  ) return edge;
  return {
    ...edge,
    type,
    sourceHandle,
    targetHandle,
    data,
  };
};
