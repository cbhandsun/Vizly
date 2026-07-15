import type { Edge } from '@xyflow/react';

import { isFinitePoint } from './baseReactFlowDisplayCache';

const preserveSmartEdgeTypes = new Set([
  'mindmapedge',
  'editable',
  'domain',
  'stablepath',
  'elk',
  'canvas-ref',
]);

const hasTrustedComputedPath = (edge: Edge): boolean => {
  const data = ((edge.data || {}) as Record<string, any>);
  const isStablePath = String(edge.type || '').toLowerCase() === 'stablepath';
  return (data.layoutPathLocked === true || data._layoutPathLocked === true || isStablePath)
    && Array.isArray(data.computedPath)
    && data.computedPath.length >= 2
    && data.computedPath.every(isFinitePoint);
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

  const data = (edge as any).data;
  const dataObj = (data && typeof data === 'object') ? data : {};
  const edgeConfig = (dataObj as any).edgeConfig;
  const edgeCfgObj = (edgeConfig && typeof edgeConfig === 'object') ? edgeConfig : {};
  const nextLabel = (edge as any).label ?? (dataObj as any).label;

  if (hasTrustedComputedPath(edge)) {
    if (edge.type === 'stablePath' && nextLabel === (edge as any).label && edge === rawEdge) return edge;
    return { ...edge, type: 'stablePath', label: nextLabel } as Edge;
  }

  const hasDataPad = (dataObj as any).obstaclePadding !== undefined && (dataObj as any).obstaclePadding !== null;
  const hasCfgPad = (edgeCfgObj as any).obstaclePadding !== undefined && (edgeCfgObj as any).obstaclePadding !== null;
  const needsPadPatch = !(hasDataPad && hasCfgPad);

  const dataWithPad = needsPadPatch
    ? {
      ...dataObj,
      obstaclePadding: hasDataPad ? (dataObj as any).obstaclePadding : smartEdgePadding,
      edgeConfig: {
        ...edgeCfgObj,
        obstaclePadding: hasCfgPad ? (edgeCfgObj as any).obstaclePadding : smartEdgePadding,
      },
    }
    : dataObj;

  const needsLabelPatch = typeof nextLabel !== 'undefined'
    && ((edge as any).label !== nextLabel || (dataWithPad as any).label !== nextLabel);
  const needsTypePatch = targetType !== edge.type;
  if (!needsPadPatch && !needsLabelPatch && !needsTypePatch && edge === rawEdge) return edge;

  const finalData = needsLabelPatch ? { ...dataWithPad, label: nextLabel } : dataWithPad;
  return { ...edge, type: targetType, data: finalData, label: nextLabel } as Edge;
};

export const toBasicDisplayEdge = ({
  edge,
  rawEdge,
}: {
  edge: Edge;
  rawEdge: Edge;
}): Edge => {
  if (hasTrustedComputedPath(edge)) {
    const nextLabel = (edge as any).label ?? ((edge.data && typeof edge.data === 'object') ? (edge.data as any).label : undefined);
    if (edge.type === 'stablePath' && nextLabel === (edge as any).label && edge === rawEdge) return edge;
    return { ...edge, type: 'stablePath', label: nextLabel } as Edge;
  }

  const type = String(edge.type || '');
  const lower = type.toLowerCase();
  const nextType = (() => {
    if (lower === 'advanced-smart-step' || lower === 'smart-step') return 'step';
    if (lower === 'advanced-smart-straight' || lower === 'smart-straight') return 'straight';
    if (lower === 'advanced-smart-bezier' || lower === 'smart-bezier' || lower === 'advanced-smart' || lower === 'smart') return 'bezier';
    return edge.type;
  })();
  const nextLabel = (edge as any).label ?? ((edge.data && typeof edge.data === 'object') ? (edge.data as any).label : undefined);
  if (nextType === edge.type && nextLabel === (edge as any).label && edge === rawEdge) return edge;
  return { ...edge, type: nextType as any, label: nextLabel } as Edge;
};
