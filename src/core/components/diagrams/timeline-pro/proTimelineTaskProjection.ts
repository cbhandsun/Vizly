import type { Edge, Node } from '@xyflow/react';

import type { ProGanttTask } from '../../../hooks/useProTimelineEngine';
import { isTimelinePointTaskType } from '../../../algorithms/timelineTaskSemantics';
import { parseDateOnlyTime } from '../../../utils/dateOnly';

export type ProjectedProTimelineTask = ProGanttTask & {
  _rawSelected?: boolean;
  status?: string;
};

const optionalString = (value: unknown, maxLength = 500): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const optionalCssColor = (value: unknown): string | undefined => {
  const color = optionalString(value, 64);
  if (!color) return undefined;
  if (/^#[\da-f]{3,4}$/i.test(color) || /^#[\da-f]{6}([\da-f]{2})?$/i.test(color)) return color;
  if (/^[a-z]+$/i.test(color)) return color;
  if (/^rgba?\([\d.%\s,]+\)$/i.test(color)) return color;
  if (/^hsla?\([\d.%+\-\s,]+\)$/i.test(color)) return color;
  return undefined;
};

const dateOnlyString = (value: unknown): string => {
  const candidate = optionalString(value);
  return candidate && parseDateOnlyTime(candidate) !== null ? candidate : '';
};

const optionalPriority = (value: unknown): ProGanttTask['priority'] => (
  value === 'high' || value === 'medium' || value === 'low' ? value : undefined
);

const optionalProgress = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : undefined;
};

export const projectProTimelineTasks = (
  nodes: Node[],
  edges: Edge[],
): ProjectedProTimelineTask[] => {
  const dependenciesByTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const dependencies = dependenciesByTarget.get(edge.target) ?? [];
    dependencies.push(edge.source);
    dependenciesByTarget.set(edge.target, dependencies);
  }

  return nodes.flatMap((node) => {
    const type = optionalString(node.data.type, 32);
    if (!['phase', 'event', 'milestone', 'summary'].includes(type ?? '') && node.type !== 'timelineNode') {
      return [];
    }

    const startDate = dateOnlyString(node.data.date);
    if (!startDate && type !== 'summary' && type !== 'phase') return [];
    const explicitEndDate = dateOnlyString(node.data.endDate);
    const isPointTask = isTimelinePointTaskType(type);
    return [{
      id: node.id,
      name: optionalString(node.data.label, 500) ?? '未命名',
      startDate,
      endDate: isPointTask ? startDate : explicitEndDate || startDate,
      progress: isPointTask ? undefined : optionalProgress(node.data.progress),
      dependencies: dependenciesByTarget.get(node.id) ?? [],
      type,
      color: optionalCssColor(node.data.color),
      _rawSelected: node.selected,
      status: optionalString(node.data.status, 64),
      parentId: optionalString(node.data.parentId, 200),
      isExpanded: typeof node.data.isExpanded === 'boolean' ? node.data.isExpanded : undefined,
      assignee: optionalString(node.data.assignee, 120),
      priority: optionalPriority(node.data.priority),
      baselineStartDate: dateOnlyString(node.data.baselineStartDate) || undefined,
      baselineEndDate: dateOnlyString(node.data.baselineEndDate) || undefined,
    }];
  });
};
