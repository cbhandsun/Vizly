import type { Edge, Node } from '@xyflow/react';

import { isTimelinePointTaskType } from '../../../algorithms/timelineTaskSemantics';
import { formatDateOnly, parseDateOnlyTime } from '../../../utils/dateOnly';

export type TimelineDateField = 'date' | 'endDate';
export type TimelineTaskType = 'phase' | 'milestone' | 'summary' | 'event';
export type TimelineTaskStatus = 'pending' | 'active' | 'done';
export type TimelineTaskPriority = 'high' | 'medium' | 'low';
export type TimelineEditableTaskType = Exclude<TimelineTaskType, 'summary'>;

export const TIMELINE_TASK_NAME_MAX_LENGTH = 160;
export const TIMELINE_TASK_ASSIGNEE_MAX_LENGTH = 120;
export type TimelineDateUpdateResult =
    | { ok: true; updates: Partial<Record<TimelineDateField, string>> }
    | { ok: false; reason: 'invalid' | 'end-before-start' };

const normalizeCanonicalDate = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (trimmed.length !== 10) return null;
    const time = parseDateOnlyTime(trimmed);
    if (time === null || formatDateOnly(new Date(time)) !== trimmed) return null;
    return trimmed;
};

const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T => (
    typeof value === 'string' && options.includes(value as T)
);

export const readTimelineTaskType = (value: unknown): TimelineTaskType => (
    isOneOf(value, ['phase', 'milestone', 'summary', 'event'] as const) ? value : 'phase'
);

const readTimelineEditableTaskType = (value: unknown): TimelineEditableTaskType | null => (
    isOneOf(value, ['phase', 'milestone', 'event'] as const) ? value : null
);

export const hasTimelineTaskChildren = (
    nodes: readonly Node[],
    nodeId: unknown,
): boolean => (
    typeof nodeId === 'string'
    && nodeId.length > 0
    && nodes.some(node => node.data?.parentId === nodeId)
);

export const resolveTimelineTaskType = (
    value: unknown,
    hasChildren: boolean,
): TimelineTaskType => (
    hasChildren ? 'summary' : readTimelineTaskType(value)
);

export const readTimelineTaskStatus = (value: unknown): TimelineTaskStatus => (
    isOneOf(value, ['pending', 'active', 'done'] as const) ? value : 'pending'
);

export const readTimelineTaskPriority = (value: unknown): TimelineTaskPriority | undefined => (
    isOneOf(value, ['high', 'medium', 'low'] as const) ? value : undefined
);

export const readTimelineProgress = (value: unknown): number => {
    const numeric = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : Number.NaN;
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
};

export interface TimelineStatusProgressPatch {
    [key: string]: unknown;
    status: TimelineTaskStatus;
    progress?: number;
}

export const buildTimelineStatusUpdate = (
    data: Record<string, unknown>,
    value: unknown,
): TimelineStatusProgressPatch => {
    const status = readTimelineTaskStatus(value);
    if (readTimelineTaskType(data.type) !== 'phase') return { status };
    if (status === 'done') return { status, progress: 100 };
    if (status === 'pending') return { status, progress: 0 };

    const progress = readTimelineProgress(data.progress);
    return progress >= 100 ? { status, progress: 99 } : { status };
};

export const buildTimelineProgressUpdate = (value: unknown): TimelineStatusProgressPatch & {
    progress: number;
} => {
    const progress = readTimelineProgress(value);
    const status = progress <= 0 ? 'pending' : progress >= 100 ? 'done' : 'active';
    return { progress, status };
};

export interface TimelineTypePatch {
    [key: string]: unknown;
    type?: TimelineEditableTaskType;
    endDate?: string;
    progress?: number;
}

export const buildTimelineTypeUpdate = (
    data: Record<string, unknown>,
    value: unknown,
): TimelineTypePatch => {
    const type = readTimelineEditableTaskType(value);
    if (!type) return {};

    if (isTimelinePointTaskType(type)) {
        return {
            type,
            endDate: normalizeCanonicalDate(data.date) ?? undefined,
            progress: undefined,
        };
    }

    const startDate = normalizeCanonicalDate(data.date);
    const currentEndDate = normalizeCanonicalDate(data.endDate);
    const startTime = startDate ? parseDateOnlyTime(startDate) : null;
    const endTime = currentEndDate ? parseDateOnlyTime(currentEndDate) : null;
    const endDate = startDate && (endTime === null || (startTime !== null && endTime < startTime))
        ? startDate
        : currentEndDate ?? undefined;
    const status = readTimelineTaskStatus(data.status);
    const currentProgress = readTimelineProgress(data.progress);
    const progress = status === 'done'
        ? 100
        : status === 'pending'
            ? 0
            : Math.min(99, Math.max(1, currentProgress));
    return { type, endDate, progress };
};

export const sanitizeTimelineText = (value: unknown, maxLength: number): string => {
    if (typeof value !== 'string' || maxLength <= 0) return '';
    const sanitized = Array.from(value, character => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint < 32 || codePoint === 127 ? ' ' : character;
    }).join('');
    return Array.from(sanitized).slice(0, maxLength).join('');
};

export const buildTimelineDateUpdate = (
    data: Record<string, unknown>,
    field: TimelineDateField,
    candidate: unknown,
): TimelineDateUpdateResult => {
    const normalized = normalizeCanonicalDate(candidate);
    if (!normalized) return { ok: false, reason: 'invalid' };

    if (isTimelinePointTaskType(data.type)) {
        return { ok: true, updates: { date: normalized, endDate: normalized } };
    }

    const start = field === 'date' ? normalized : normalizeCanonicalDate(data.date);
    const end = field === 'endDate' ? normalized : normalizeCanonicalDate(data.endDate);
    if (start && end) {
        const startTime = parseDateOnlyTime(start);
        const endTime = parseDateOnlyTime(end);
        if (startTime !== null && endTime !== null && endTime < startTime) {
            return { ok: false, reason: 'end-before-start' };
        }
    }

    return { ok: true, updates: { [field]: normalized } };
};

export const readTimelineDate = (value: unknown): string | null => normalizeCanonicalDate(value);

export interface TimelineDeletionPlan {
    deletedNodeIds: ReadonlySet<string>;
    nodes: Node[];
    edges: Edge[];
}

export const buildTimelineDeletionPlan = (
    nodes: Node[],
    edges: Edge[],
    rootNodeId: string,
): TimelineDeletionPlan => {
    if (!nodes.some(node => node.id === rootNodeId)) {
        return { deletedNodeIds: new Set(), nodes, edges };
    }

    const childrenByParent = new Map<string, string[]>();
    for (const node of nodes) {
        const parentId = typeof node.data?.parentId === 'string' ? node.data.parentId : null;
        if (!parentId) continue;
        const children = childrenByParent.get(parentId) ?? [];
        children.push(node.id);
        childrenByParent.set(parentId, children);
    }

    const deletedNodeIds = new Set<string>();
    const queue = [rootNodeId];
    for (let index = 0; index < queue.length; index += 1) {
        const nodeId = queue[index];
        if (!nodeId || deletedNodeIds.has(nodeId)) continue;
        deletedNodeIds.add(nodeId);
        queue.push(...(childrenByParent.get(nodeId) ?? []));
    }

    return {
        deletedNodeIds,
        nodes: nodes.filter(node => !deletedNodeIds.has(node.id)),
        edges: edges.filter(edge => (
            !deletedNodeIds.has(edge.source) && !deletedNodeIds.has(edge.target)
        )),
    };
};
