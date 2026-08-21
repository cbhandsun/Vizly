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

export interface ProTimelineDeletionImpact {
  childTaskNames: string[];
  dependencyCount: number;
  hiddenChildTaskCount: number;
  taskCount: number;
}

export type ProTimelineTaskReparentFailureReason =
  | 'invalid-target'
  | 'missing-target'
  | 'missing-parent'
  | 'self-parent'
  | 'descendant-parent'
  | 'unchanged';

export type ProTimelineTaskReparentTransaction =
  | {
    changed: true;
    parentId: string | null;
    nodes: Node[];
  }
  | {
    changed: false;
    parentId: string | null;
    reason: ProTimelineTaskReparentFailureReason;
    nodes: Node[];
  };

type TimelineHierarchyItem = {
  id: string;
  label?: unknown;
  name?: unknown;
  parentId?: string;
};

const normalizedText = (value: unknown, maxLength: number): string => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const normalizedImpactLabel = (value: unknown): string => Array.from(normalizedText(value, 80))
  .map(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159) ? ' ' : character;
  })
  .join('')
  .replace(/\s+/g, ' ')
  .trim();

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

export const buildProTimelineDeletionImpact = (
  items: readonly TimelineHierarchyItem[],
  edges: readonly Pick<Edge, 'source' | 'target'>[],
  targetId: string,
  maximumVisibleNames = 4,
): ProTimelineDeletionImpact => {
  const deletionIds = collectProTimelineDeletionIds(items, targetId);
  if (deletionIds.size === 0) {
    return { childTaskNames: [], dependencyCount: 0, hiddenChildTaskCount: 0, taskCount: 0 };
  }

  const visibleNameLimit = Number.isFinite(maximumVisibleNames)
    ? Math.min(8, Math.max(0, Math.trunc(maximumVisibleNames)))
    : 4;
  const childTaskNames = items
    .filter(item => item.id !== targetId && deletionIds.has(item.id))
    .map(item => normalizedImpactLabel(item.name ?? item.label))
    .filter(Boolean);
  const dependencyCount = edges.filter(edge => (
    deletionIds.has(edge.source) || deletionIds.has(edge.target)
  )).length;
  const visibleChildTaskNames = childTaskNames.slice(0, visibleNameLimit);

  return {
    childTaskNames: visibleChildTaskNames,
    dependencyCount,
    hiddenChildTaskCount: Math.max(0, deletionIds.size - 1 - visibleChildTaskNames.length),
    taskCount: deletionIds.size,
  };
};

export const getProTimelineAvailableParentIds = (
  nodes: readonly Node[],
  targetId: unknown,
): Set<string> => {
  const normalizedTargetId = normalizedText(targetId, 200);
  if (!normalizedTargetId) return new Set<string>();

  const hierarchy = nodes.map(node => ({ id: node.id, parentId: getNodeParentId(node) }));
  const excludedIds = collectProTimelineDeletionIds(hierarchy, normalizedTargetId);
  if (excludedIds.size === 0) return new Set<string>();

  return new Set(nodes
    .map(node => normalizedText(node.id, 200))
    .filter(id => id && !excludedIds.has(id)));
};

export const createProTimelineTaskReparenting = (
  nodes: readonly Node[],
  targetId: unknown,
  requestedParentId: unknown,
): ProTimelineTaskReparentTransaction => {
  const normalizedTargetId = normalizedText(targetId, 200);
  const parentCandidate = requestedParentId === null
    ? ''
    : normalizedText(requestedParentId, 200);
  const parentId = parentCandidate || null;
  if (!normalizedTargetId) {
    return { changed: false, parentId, reason: 'invalid-target', nodes: [...nodes] };
  }

  const target = nodes.find(node => node.id === normalizedTargetId);
  if (!target) {
    return { changed: false, parentId, reason: 'missing-target', nodes: [...nodes] };
  }
  if (parentId === normalizedTargetId) {
    return { changed: false, parentId, reason: 'self-parent', nodes: [...nodes] };
  }
  if (parentId && !nodes.some(node => node.id === parentId)) {
    return { changed: false, parentId, reason: 'missing-parent', nodes: [...nodes] };
  }

  const availableParentIds = getProTimelineAvailableParentIds(nodes, normalizedTargetId);
  if (parentId && !availableParentIds.has(parentId)) {
    return { changed: false, parentId, reason: 'descendant-parent', nodes: [...nodes] };
  }

  const currentParentId = getNodeParentId(target) ?? null;
  if (currentParentId === parentId) {
    return { changed: false, parentId, reason: 'unchanged', nodes: [...nodes] };
  }

  const nextNodes = nodes.map(node => {
    if (node.id === normalizedTargetId) {
      const nextData = { ...node.data };
      if (parentId) nextData.parentId = parentId;
      else delete nextData.parentId;
      return { ...node, data: nextData };
    }
    if (parentId && node.id === parentId && node.data.isExpanded === false) {
      return { ...node, data: { ...node.data, isExpanded: true } };
    }
    return node;
  });

  return { changed: true, parentId, nodes: nextNodes };
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
