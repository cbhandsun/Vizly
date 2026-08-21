import type { Edge, Node } from '@xyflow/react';

import { addDaysToDateOnly, parseDateOnlyTime } from '../../../utils/dateOnly';

export type ProTimelineCreatableTaskType = 'event' | 'phase' | 'milestone';

export interface ProTimelineTaskAdditionRequest {
  id: string;
  label: string;
  parentId: string | null;
  startDate: string;
  type: ProTimelineCreatableTaskType;
}

export interface ProTimelineTaskAdditionTransaction {
  changed: boolean;
  createdTaskId: string | null;
  nodes: Node[];
}

export interface ProTimelineTaskDeletionTransaction {
  changed: boolean;
  deletedEdgeCount: number;
  deletedNodeCount: number;
  fallbackTaskId: string | null;
  edges: Edge[];
  nodes: Node[];
}

type TimelineHierarchyItem = {
  id: string;
  parentId?: string;
};

const normalizedText = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const normalizedDateOnly = (value: unknown): string => {
  const candidate = normalizedText(value, 32);
  return candidate && parseDateOnlyTime(candidate) !== null ? candidate : '';
};

const getNodeParentId = (node: Node): string | undefined => {
  const parentId = normalizedText(node.data.parentId, 200);
  return parentId || undefined;
};

export const collectProTimelineDeletionIds = (
  items: readonly TimelineHierarchyItem[],
  targetId: string,
): Set<string> => {
  const normalizedTargetId = normalizedText(targetId, 200);
  if (!normalizedTargetId || !items.some(item => item.id === normalizedTargetId)) {
    return new Set<string>();
  }

  const childrenByParent = new Map<string, string[]>();
  for (const item of items) {
    if (!item.parentId) continue;
    const children = childrenByParent.get(item.parentId) ?? [];
    children.push(item.id);
    childrenByParent.set(item.parentId, children);
  }

  const deletionIds = new Set<string>();
  const pending = [normalizedTargetId];
  while (pending.length > 0) {
    const currentId = pending.shift();
    if (!currentId || deletionIds.has(currentId)) continue;
    deletionIds.add(currentId);
    pending.push(...(childrenByParent.get(currentId) ?? []));
  }
  return deletionIds;
};

export const getProTimelineDeletionFallbackId = (
  items: readonly TimelineHierarchyItem[],
  targetId: string,
): string | null => {
  const deletionIds = collectProTimelineDeletionIds(items, targetId);
  if (deletionIds.size === 0) return null;

  const targetIndex = items.findIndex(item => item.id === targetId);
  const target = items[targetIndex];
  if (target?.parentId && !deletionIds.has(target.parentId)) return target.parentId;

  const next = items.slice(targetIndex + 1).find(item => !deletionIds.has(item.id));
  if (next) return next.id;

  const previous = items.slice(0, targetIndex).reverse().find(item => !deletionIds.has(item.id));
  return previous?.id ?? null;
};

export const createProTimelineTaskAddition = (
  nodes: readonly Node[],
  request: ProTimelineTaskAdditionRequest,
): ProTimelineTaskAdditionTransaction => {
  const id = normalizedText(request.id, 200);
  const label = normalizedText(request.label, 500);
  const startDate = normalizedDateOnly(request.startDate);
  if (!id || !label || !startDate || nodes.some(node => node.id === id)) {
    return { changed: false, createdTaskId: null, nodes: [...nodes] };
  }

  const parent = request.parentId
    ? nodes.find(node => node.id === request.parentId)
    : undefined;
  const parentStartDate = normalizedDateOnly(parent?.data.date);
  const effectiveStartDate = parentStartDate || startDate;
  const isMilestone = request.type === 'milestone';

  const updatedNodes = nodes.map(node => {
    const expandedData = parent && node.id === parent.id
      ? { ...node.data, isExpanded: true }
      : node.data;
    return node.selected || expandedData !== node.data
      ? { ...node, selected: false, data: expandedData }
      : node;
  });

  updatedNodes.push({
    id,
    type: 'timelineNode',
    position: { x: 0, y: 0 },
    selected: true,
    data: {
      date: effectiveStartDate,
      endDate: isMilestone ? effectiveStartDate : addDaysToDateOnly(effectiveStartDate, 1),
      label,
      parentId: parent?.id,
      progress: 0,
      status: 'pending',
      type: request.type,
    },
  });

  return { changed: true, createdTaskId: id, nodes: updatedNodes };
};

export const createProTimelineTaskDeletion = (
  nodes: readonly Node[],
  edges: readonly Edge[],
  targetId: string,
): ProTimelineTaskDeletionTransaction => {
  const hierarchy = nodes.map(node => ({ id: node.id, parentId: getNodeParentId(node) }));
  const deletionIds = collectProTimelineDeletionIds(hierarchy, targetId);
  if (deletionIds.size === 0) {
    return {
      changed: false,
      deletedEdgeCount: 0,
      deletedNodeCount: 0,
      fallbackTaskId: null,
      edges: [...edges],
      nodes: [...nodes],
    };
  }

  const fallbackTaskId = getProTimelineDeletionFallbackId(hierarchy, targetId);
  const remainingNodes = nodes.filter(node => !deletionIds.has(node.id));
  const hasRemainingSelection = remainingNodes.some(node => node.selected);
  const nextNodes = hasRemainingSelection || !fallbackTaskId
    ? remainingNodes
    : remainingNodes.map(node => (
      node.id === fallbackTaskId ? { ...node, selected: true } : node
    ));
  const nextEdges = edges.filter(edge => (
    !deletionIds.has(edge.source) && !deletionIds.has(edge.target)
  ));

  return {
    changed: true,
    deletedEdgeCount: edges.length - nextEdges.length,
    deletedNodeCount: deletionIds.size,
    fallbackTaskId,
    edges: nextEdges,
    nodes: nextNodes,
  };
};
