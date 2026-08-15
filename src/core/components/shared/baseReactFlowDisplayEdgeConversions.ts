import type { Edge, Node } from '@xyflow/react';

import { isFinitePoint } from './baseReactFlowDisplayCache';
import { materializeDisplayTerminalHandles } from './baseReactFlowDisplayTerminalCommit';

const preserveSmartEdgeTypes = new Set([
  'mindmapedge',
  'editable',
  'domain',
  'stablepath',
  'elk',
  'canvas-ref',
]);

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const readDataLabel = (value: unknown): string | number | undefined => (
  typeof value === 'string' || typeof value === 'number' ? value : undefined
);

const hasTrustedComputedPath = (edge: Edge): boolean => {
  const data = asRecord(edge.data);
  const isStablePath = String(edge.type || '').toLowerCase() === 'stablepath';
  return (data.layoutPathLocked === true || data._layoutPathLocked === true || isStablePath)
    && Array.isArray(data.computedPath)
    && data.computedPath.length >= 2
    && data.computedPath.every(isFinitePoint);
};

/**
 * Commits worker-validated geometry to the renderer that consumes computedPath.
 * Callers must only pass an internally finalized transaction; arbitrary imported
 * paths intentionally remain subject to the normal trust checks above.
 */
export const lockFinalDisplayComputedPaths = <T extends Edge[]>(
  edges: T,
  nodes?: Node[],
): T => {
  const resolvedEdges = nodes ? materializeDisplayTerminalHandles(edges, nodes) : edges;
  return resolvedEdges.map((edge) => {
    const data = asRecord(edge.data);
    const hasRenderableComputedPath = Array.isArray(data.computedPath)
      && data.computedPath.length >= 2
      && data.computedPath.every(isFinitePoint);
    if (
      !hasRenderableComputedPath
      || String(edge.type || '').toLowerCase() === 'canvas-ref'
    ) return edge;
    if (
      edge.type === 'stablePath'
      && data.layoutPathLocked === true
      && data._layoutPathLocked === true
    ) return edge;
    return {
      ...edge,
      type: 'stablePath',
      data: {
        ...data,
        layoutPathLocked: true,
        _layoutPathLocked: true,
      },
    };
  }) as T;
};

export const toCanvasRefEdge = (edge: Edge): Edge => ({
  ...edge,
  type: 'canvas-ref',
  data: {
    ...((edge.data || {}) as Record<string, unknown>),
    originalType: edge.type || 'default',
  },
});

export const toSmartDisplayEdge = ({
  edge,
  rawEdge,
  smartEdgePadding,
}: {
  edge: Edge;
  rawEdge: Edge;
  smartEdgePadding: number;
}): Edge => {
  const type = String(edge.type || '');
  const lower = type.toLowerCase();
  const targetType = (lower.includes('smart') || preserveSmartEdgeTypes.has(lower))
    ? edge.type
    : 'advanced-smart-step';

  const dataObj = asRecord(edge.data);
  const edgeCfgObj = asRecord(dataObj.edgeConfig);
  const nextLabel = edge.label ?? readDataLabel(dataObj.label);

  if (hasTrustedComputedPath(edge)) {
    if (edge.type === 'stablePath' && nextLabel === edge.label && edge === rawEdge) return edge;
    return {
      ...edge,
      type: 'stablePath',
      ...(typeof nextLabel === 'undefined' ? {} : { label: nextLabel }),
    };
  }

  const hasDataPad = dataObj.obstaclePadding !== undefined && dataObj.obstaclePadding !== null;
  const hasCfgPad = edgeCfgObj.obstaclePadding !== undefined && edgeCfgObj.obstaclePadding !== null;
  const needsPadPatch = !(hasDataPad && hasCfgPad);

  const dataWithPad = needsPadPatch
    ? {
      ...dataObj,
      obstaclePadding: hasDataPad ? dataObj.obstaclePadding : smartEdgePadding,
      edgeConfig: {
        ...edgeCfgObj,
        obstaclePadding: hasCfgPad ? edgeCfgObj.obstaclePadding : smartEdgePadding,
      },
    }
    : dataObj;

  const needsLabelPatch = typeof nextLabel !== 'undefined'
    && (edge.label !== nextLabel || dataWithPad.label !== nextLabel);
  const needsTypePatch = targetType !== edge.type;
  if (!needsPadPatch && !needsLabelPatch && !needsTypePatch && edge === rawEdge) return edge;

  const finalData = needsLabelPatch ? { ...dataWithPad, label: nextLabel } : dataWithPad;
  return {
    ...edge,
    type: targetType,
    data: finalData,
    ...(typeof nextLabel === 'undefined' ? {} : { label: nextLabel }),
  };
};

export const toBasicDisplayEdge = ({
  edge,
  rawEdge,
}: {
  edge: Edge;
  rawEdge: Edge;
}): Edge => {
  if (hasTrustedComputedPath(edge)) {
    const nextLabel = edge.label ?? readDataLabel(asRecord(edge.data).label);
    if (edge.type === 'stablePath' && nextLabel === edge.label && edge === rawEdge) return edge;
    return {
      ...edge,
      type: 'stablePath',
      ...(typeof nextLabel === 'undefined' ? {} : { label: nextLabel }),
    };
  }

  const type = String(edge.type || '');
  const lower = type.toLowerCase();
  const nextType = (() => {
    if (lower === 'advanced-smart-step' || lower === 'smart-step') return 'step';
    if (lower === 'advanced-smart-straight' || lower === 'smart-straight') return 'straight';
    if (lower === 'advanced-smart-bezier' || lower === 'smart-bezier' || lower === 'advanced-smart' || lower === 'smart') return 'bezier';
    return edge.type;
  })();
  const nextLabel = edge.label ?? readDataLabel(asRecord(edge.data).label);
  if (nextType === edge.type && nextLabel === edge.label && edge === rawEdge) return edge;
  return {
    ...edge,
    type: nextType,
    ...(typeof nextLabel === 'undefined' ? {} : { label: nextLabel }),
  };
};
