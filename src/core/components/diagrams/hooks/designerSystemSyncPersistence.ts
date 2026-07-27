import type { Edge, Node } from '@xyflow/react';

import { expandHandle } from '../../../routing/utils/handleUtils';
import { parseAutoSavePayload } from '../../../utils/autoSaveStorage';
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

interface NodeSizeOptimizer {
  calculateNodeWidth: (description: string) => number;
  calculateNodeHeight: (description: string) => number;
}

const CONTAINER_NODE_TYPES = new Set(['titleGroup', 'subGroup', 'swimlane', 'group']);
const MAX_NODE_DIMENSION = 1_000_000;
const MAX_DESCRIPTION_LENGTH = 10_000;
const GLOBAL_PERFORMANCE_MODE_NODE_THRESHOLD = 300;

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

export const mergePresetExplicitEdgeHandles = <T>(saved: T, preset: unknown): T => {
  if (!isRecord(saved) || !Array.isArray((saved as DiagramRecord).edges)) return saved;
  const savedRecord = saved as DiagramRecord;
  const presetById = new Map<string, Record<string, unknown>>();
  if (isRecord(preset) && Array.isArray((preset as DiagramRecord).edges)) {
    for (const rawEdge of (preset as DiagramRecord).edges as unknown[]) {
      if (!isRecord(rawEdge)) continue;
      const id = readBoundedId(rawEdge.id);
      if (id && (rawEdge.sourceHandle || rawEdge.targetHandle)) presetById.set(id, rawEdge);
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
    const edge = rawEdge as unknown as Edge<DiagramEdgeData>;
    const presetEdge = presetById.get(String(edge.id));
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
    if (!presetEdge && !crossSubDomain) {
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
 * High-density canvases already keep document performance styles active.
 * Toggling the scoped class as well would invalidate every visible node and
 * edge at drag start/stop, which is more expensive than the styles it saves.
 */
export const shouldUseScopedDesignerDragPerformanceMode = (
  nodeCount: number,
  isDragging: boolean,
): boolean => isDragging && !shouldUseGlobalDesignerPerformanceMode(nodeCount);
