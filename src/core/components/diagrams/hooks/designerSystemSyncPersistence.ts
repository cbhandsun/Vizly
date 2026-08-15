import { MarkerType, type Edge, type EdgeMarker, type EdgeMarkerType, type Node } from '@xyflow/react';
import type { CSSProperties } from 'react';

import { normalizeSvgStrokeDasharray } from '../../../rendering/styleTokens';
import { expandHandle } from '../../../routing/utils/handleUtils';
import { isSafeCssColor } from '../../../themes/themeImportSecurity';
import { parseAutoSavePayload } from '../../../utils/autoSaveStorage';
import { appendBaseReactFlowEdgeSemanticClassName } from '../../shared/baseReactFlowEdgePresentation';
import { logDesignerSystemSyncFreshSeedClearFailure } from './designerSystemSyncLogging';

type DiagramRecord = Record<string, unknown> & { nodes?: unknown; edges?: unknown };
type DiagramNodeRecord = Record<string, unknown> & {
  id?: unknown;
  domain?: unknown;
  subDomain?: unknown;
  data?: Record<string, unknown>;
};
type DiagramEdgeData = Record<string, unknown> & {
  auto?: unknown;
  autoSource?: unknown;
  autoTarget?: unknown;
  manualHandleSides?: unknown;
};
type DiagramEdgeRecord = Record<string, unknown> & {
  id?: unknown;
  type?: unknown;
  className?: unknown;
  sourceHandle?: unknown;
  targetHandle?: unknown;
  style?: unknown;
  markerEnd?: unknown;
};

interface NodeSizeOptimizer {
  calculateNodeWidth: (description: string) => number;
  calculateNodeHeight: (description: string) => number;
}

const CONTAINER_NODE_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane', 'group']);
const MAX_NODE_DIMENSION = 1_000_000;
const MAX_DESCRIPTION_LENGTH = 10_000;
const GLOBAL_PERFORMANCE_MODE_NODE_THRESHOLD = 300;
const SCOPED_PERFORMANCE_MODE_NODE_THRESHOLD = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readBoundedId = (value: unknown): string | null => {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) return null;
  const id = String(value);
  return id.length > 0 && id.length <= 1_024 ? id : null;
};

const finitePositiveNumber = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_NODE_DIMENSION ? parsed : 0;
};

const readNodeSize = (node: Node, dimension: 'width' | 'height'): number => {
  const measured = (node as Node & { measured?: Record<string, unknown> }).measured;
  const style = isRecord(node.style) ? node.style : undefined;
  return finitePositiveNumber(node[dimension])
    || finitePositiveNumber(measured?.[dimension])
    || finitePositiveNumber(style?.[dimension]);
};

const readSemanticStroke = (style: unknown): string | undefined => {
  if (!isRecord(style) || typeof style.stroke !== 'string') return undefined;
  const stroke = style.stroke.trim();
  return isSafeCssColor(stroke) ? stroke : undefined;
};

type SafeStrokeLinecap = 'butt' | 'round' | 'square';
type SafeStrokeLinejoin = 'miter' | 'round' | 'bevel';

const SAFE_STROKE_LINECAPS = new Set<string>([
  'butt',
  'round',
  'square',
]);
const SAFE_STROKE_LINEJOINS = new Set<string>([
  'miter',
  'round',
  'bevel',
]);
const SAFE_INTERNAL_MARKER_REFERENCE = /^url\(#[a-zA-Z][a-zA-Z0-9_.:-]{0,127}\)$/;

const isSafeStrokeLinecap = (value: unknown): value is SafeStrokeLinecap => (
  typeof value === 'string' && SAFE_STROKE_LINECAPS.has(value)
);

const isSafeStrokeLinejoin = (value: unknown): value is SafeStrokeLinejoin => (
  typeof value === 'string' && SAFE_STROKE_LINEJOINS.has(value)
);

const sanitizeEdgeStrokeDasharray = (value: unknown): string | undefined => {
  if (value === 'none') return value;
  const normalized = normalizeSvgStrokeDasharray(value);
  if (!normalized) return undefined;
  const parts = normalized.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 16) return undefined;
  const values = parts.map(Number);
  if (values.some(part => !Number.isFinite(part) || part < 0 || part > 10_000)) return undefined;
  return values.some(part => part > 0) ? normalized : undefined;
};

const sanitizeEdgePresentationStyle = (value: unknown): CSSProperties | undefined => {
  if (!isRecord(value)) return undefined;
  const style: CSSProperties = {};
  const stroke = readSemanticStroke(value);
  if (stroke) style.stroke = stroke;
  if (
    typeof value.strokeWidth === 'number'
    && Number.isFinite(value.strokeWidth)
    && value.strokeWidth >= 0.5
    && value.strokeWidth <= 24
  ) {
    style.strokeWidth = value.strokeWidth;
  }
  const strokeDasharray = sanitizeEdgeStrokeDasharray(value.strokeDasharray);
  if (strokeDasharray) style.strokeDasharray = strokeDasharray;
  if (
    typeof value.opacity === 'number'
    && Number.isFinite(value.opacity)
    && value.opacity >= 0
    && value.opacity <= 1
  ) {
    style.opacity = value.opacity;
  }
  if (isSafeStrokeLinecap(value.strokeLinecap)) {
    style.strokeLinecap = value.strokeLinecap;
  }
  if (isSafeStrokeLinejoin(value.strokeLinejoin)) {
    style.strokeLinejoin = value.strokeLinejoin;
  }
  return Object.keys(style).length > 0 ? style : undefined;
};

const coerceBuiltInMarker = (
  value: unknown,
  fallbackColor?: string,
  preserveCustomString = false,
): EdgeMarkerType | undefined => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === MarkerType.Arrow || normalized === MarkerType.ArrowClosed) {
      return {
        type: normalized,
        ...(fallbackColor ? { color: fallbackColor } : {}),
      };
    }
    return preserveCustomString && SAFE_INTERNAL_MARKER_REFERENCE.test(value) ? value : undefined;
  }
  if (!isRecord(value)) return undefined;
  const rawType = String(value.type ?? '').trim().toLowerCase();
  if (rawType !== MarkerType.Arrow && rawType !== MarkerType.ArrowClosed) return undefined;
  const marker: EdgeMarker = { type: rawType };
  const color = typeof value.color === 'string' && isSafeCssColor(value.color)
    ? value.color.trim()
    : fallbackColor;
  if (color) marker.color = color;
  if (typeof value.width === 'number' && Number.isFinite(value.width)) {
    marker.width = Math.min(128, Math.max(1, value.width));
  }
  if (typeof value.height === 'number' && Number.isFinite(value.height)) {
    marker.height = Math.min(128, Math.max(1, value.height));
  }
  if (typeof value.strokeWidth === 'number' && Number.isFinite(value.strokeWidth)) {
    marker.strokeWidth = Math.min(24, Math.max(0.5, value.strokeWidth));
  }
  return marker;
};

const mergePresetEdgePresentation = (
  edge: Edge<DiagramEdgeData>,
  presetEdge: DiagramEdgeRecord | undefined,
): Edge<DiagramEdgeData> => {
  const presetStyle = sanitizeEdgePresentationStyle(presetEdge?.style);
  const savedStyle = sanitizeEdgePresentationStyle(edge.style);
  const style = presetStyle
    ? { ...presetStyle, ...savedStyle }
    : savedStyle;
  const semanticStroke = readSemanticStroke(style) ?? readSemanticStroke(presetStyle);
  const presetMarker = coerceBuiltInMarker(presetEdge?.markerEnd, semanticStroke);
  const savedMarker = coerceBuiltInMarker(edge.markerEnd, undefined, true);
  const semanticMarker: EdgeMarker | undefined = presetEdge && semanticStroke
    ? { type: MarkerType.ArrowClosed, color: semanticStroke }
    : undefined;
  const markerSeed = typeof presetMarker === 'object'
    ? { ...semanticMarker, ...presetMarker }
    : semanticMarker;
  const markerEnd: EdgeMarkerType | undefined = markerSeed && typeof savedMarker === 'object'
    ? { ...markerSeed, ...savedMarker }
    : savedMarker ?? presetMarker ?? markerSeed;
  const className = appendBaseReactFlowEdgeSemanticClassName(edge.className, presetEdge?.type);

  if (style === edge.style && markerEnd === edge.markerEnd && className === edge.className) return edge;
  return {
    ...edge,
    className,
    style,
    markerEnd,
  };
};

const defaultOptimizerLoader = async (): Promise<NodeSizeOptimizer> => {
  const { LayoutOptimizer } = await import('../../layout/LayoutOptimizer');
  return LayoutOptimizer.getInstance();
};

export const clearDesignerFreshSeedFlag = (
  storageKey: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void => {
  if (typeof storageKey !== 'string' || storageKey.length === 0 || storageKey.length > 1_024) return;
  try {
    const parsed = parseAutoSavePayload(storage.getItem(storageKey));
    if (!parsed?.isFreshSeed) return;
    const next = { ...parsed };
    delete next.isFreshSeed;
    storage.setItem(storageKey, JSON.stringify(next));
  } catch (error) {
    logDesignerSystemSyncFreshSeedClearFailure(storageKey, error);
  }
};

/**
 * Reconciles external autosave edges with the active preset contract.
 * Presentation is sanitized for every saved edge; matching preset edges also
 * restore missing semantic styles, marker colors, and explicit handles.
 */
export const mergePresetExplicitEdgeHandles = <T>(saved: T, preset: unknown): T => {
  if (!isRecord(saved) || !Array.isArray((saved as DiagramRecord).edges)) return saved;
  const savedRecord = saved as DiagramRecord;
  const presetById = new Map<string, DiagramEdgeRecord>();
  if (isRecord(preset) && Array.isArray((preset as DiagramRecord).edges)) {
    for (const rawEdge of (preset as DiagramRecord).edges as unknown[]) {
      if (!isRecord(rawEdge)) continue;
      const id = readBoundedId(rawEdge.id);
      if (id) presetById.set(id, rawEdge);
    }
  }
  const nodeById = new Map<string, DiagramNodeRecord>();
  if (Array.isArray(savedRecord.nodes)) {
    for (const rawNode of savedRecord.nodes) {
      if (!isRecord(rawNode) || rawNode.id === undefined || rawNode.id === null) continue;
      nodeById.set(String(rawNode.id), rawNode as DiagramNodeRecord);
    }
  }

  const edges = (savedRecord.edges as unknown[]).map(rawEdge => {
    if (!isRecord(rawEdge)) return rawEdge;
    const savedEdge = rawEdge as unknown as Edge<DiagramEdgeData>;
    const presetEdge = presetById.get(String(savedEdge.id));
    const edge = mergePresetEdgePresentation(savedEdge, presetEdge);
    const hasPresetExplicitHandles = Boolean(presetEdge?.sourceHandle || presetEdge?.targetHandle);
    const existingSource = edge.sourceHandle ? expandHandle(String(edge.sourceHandle)) : edge.sourceHandle;
    const existingTarget = edge.targetHandle ? expandHandle(String(edge.targetHandle)) : edge.targetHandle;
    const sourceNode = nodeById.get(String(edge.source));
    const targetNode = nodeById.get(String(edge.target));
    const sourceDomain = sourceNode?.domain ?? sourceNode?.data?.domain;
    const targetDomain = targetNode?.domain ?? targetNode?.data?.domain;
    const sourceSubDomain = sourceNode?.subDomain ?? sourceNode?.data?.subDomain;
    const targetSubDomain = targetNode?.subDomain ?? targetNode?.data?.subDomain;
    const crossSubDomain = Boolean(
      sourceDomain && targetDomain && sourceDomain === targetDomain
      && sourceSubDomain && targetSubDomain && sourceSubDomain !== targetSubDomain
    );
    if (!hasPresetExplicitHandles && !crossSubDomain) {
      if (existingSource === edge.sourceHandle && existingTarget === edge.targetHandle) return edge;
      return { ...edge, sourceHandle: existingSource, targetHandle: existingTarget };
    }

    const sourceHandle = presetEdge?.sourceHandle
      ? expandHandle(String(presetEdge.sourceHandle))
      : crossSubDomain ? 'right' : existingSource;
    const targetHandle = presetEdge?.targetHandle
      ? expandHandle(String(presetEdge.targetHandle))
      : crossSubDomain ? 'left' : existingTarget;
    const manualHandleSides = [
      ...(sourceHandle ? ['source'] : []),
      ...(targetHandle ? ['target'] : []),
    ];
    const previousData = isRecord(edge.data) ? edge.data as DiagramEdgeData : {};
    const auto = Array.isArray(previousData.auto)
      ? previousData.auto.filter((side): side is string =>
          typeof side === 'string' && !manualHandleSides.includes(side))
      : [];
    return {
      ...edge,
      sourceHandle,
      targetHandle,
      data: {
        ...previousData,
        auto,
        autoSource: manualHandleSides.includes('source') ? false : previousData.autoSource,
        autoTarget: manualHandleSides.includes('target') ? false : previousData.autoTarget,
        manualHandleSides: manualHandleSides.length > 0
          ? manualHandleSides
          : previousData.manualHandleSides,
      },
    };
  });
  return { ...savedRecord, edges } as T;
};

export const recalculateAutosaveNodeSizes = async (
  nodes: readonly Node[],
  loadOptimizer: () => Promise<NodeSizeOptimizer> = defaultOptimizerLoader,
): Promise<Node[]> => {
  const hasUsableSize = (node: Node): boolean => CONTAINER_NODE_TYPES.has(node.type || '')
    || (readNodeSize(node, 'width') > 0 && readNodeSize(node, 'height') > 0);
  if (nodes.every(hasUsableSize)) return [...nodes];

  const optimizer = await loadOptimizer();
  return nodes.map(node => {
    if (CONTAINER_NODE_TYPES.has(node.type || '')) return node;
    const description = String(node.data?.description || node.data?.label || '')
      .slice(0, MAX_DESCRIPTION_LENGTH);
    if (!description) return node;
    const calculatedWidth = finitePositiveNumber(optimizer.calculateNodeWidth(description));
    const calculatedHeight = finitePositiveNumber(optimizer.calculateNodeHeight(description));
    if (!calculatedWidth || !calculatedHeight) return node;
    const width = Math.max(calculatedWidth, readNodeSize(node, 'width'));
    const height = Math.max(calculatedHeight, readNodeSize(node, 'height'));
    const measured = (node as Node & { measured?: Record<string, unknown> }).measured;
    return {
      ...node,
      width,
      height,
      style: { ...node.style, width, height },
      measured: { ...measured, width, height },
    };
  });
};

/**
 * Global performance CSS changes invalidate the entire document. Keep them for
 * genuinely high-density canvases; node dragging is handled by the scoped
 * `.react-flow.performance-mode` class instead.
 */
export const shouldUseGlobalDesignerPerformanceMode = (nodeCount: number): boolean => (
  Number.isFinite(nodeCount) && nodeCount > GLOBAL_PERFORMANCE_MODE_NODE_THRESHOLD
);

/**
 * Small and medium canvases are cheaper to paint normally than to invalidate
 * every visible node and edge by toggling the scoped performance class.
 * High-density canvases already keep document performance styles active.
 */
export const shouldUseScopedDesignerDragPerformanceMode = (
  nodeCount: number,
  isDragging: boolean,
): boolean => (
  isDragging
  && Number.isFinite(nodeCount)
  && nodeCount >= SCOPED_PERFORMANCE_MODE_NODE_THRESHOLD
  && !shouldUseGlobalDesignerPerformanceMode(nodeCount)
);
