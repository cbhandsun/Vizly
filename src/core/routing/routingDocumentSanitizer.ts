import type { Edge } from '@xyflow/react';

const ROUTING_OWNED_EDGE_DATA_KEYS = [
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
  '__baseDisplayFinalizedSignature',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
);

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

export const stripRoutingOwnedDocumentEdge = (
  edge: Edge,
  fallbackType?: Edge['type'],
): Edge => {
  const data = isRecord(edge.data) ? { ...edge.data } : {};
  const preserveSourceHandle = hasManualHandleRole(data, 'source');
  const preserveTargetHandle = hasManualHandleRole(data, 'target');
  let changed = false;
  for (const key of ROUTING_OWNED_EDGE_DATA_KEYS) {
    if (!(key in data)) continue;
    delete data[key];
    changed = true;
  }

  const type = fallbackType ?? (
    String(edge.type ?? '').toLowerCase() === 'stablepath'
      ? 'advanced-smart-step'
      : edge.type
  );
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

export const stripRoutingOwnedDocumentEdges = (edges: Edge[]): Edge[] => {
  let changed = false;
  const sanitized = edges.map((edge) => {
    const next = stripRoutingOwnedDocumentEdge(edge);
    if (next !== edge) changed = true;
    return next;
  });
  return changed ? sanitized : edges;
};
