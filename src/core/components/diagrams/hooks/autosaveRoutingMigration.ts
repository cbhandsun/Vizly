import type { Edge } from '@xyflow/react';

import { stripRoutingOwnedDocumentEdge } from '../../../routing/routingDocumentSanitizer';

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
 * Persisted edge objects never own automatic display geometry. Retain authored
 * edge data and waypoints, but force Canvas to validate a separate routing-only
 * candidate (when present) or recompute the route.
 */
export const invalidateStalePresetEdgeAutomaticRoute = (
  edge: Edge,
  presetEdge: unknown,
  _savedRoutingVersion: unknown,
): Edge => {
  const type = restorePresetCanvasEdgeType(presetEdge, edge.type);
  return stripRoutingOwnedDocumentEdge(edge, type);
};
