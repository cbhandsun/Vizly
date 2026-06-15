import type { NodeObj } from 'mind-elixir';
import { cleanMindMapTags, cleanMindMapTopic } from './mindmapTreeSanitizer';

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = '高' | '中' | '低' | '无';

export interface MindMapTaskMeta {
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: string;
    assignee?: string;
    progress?: number;
}

export interface TaskNode extends NodeObj {
    task?: MindMapTaskMeta;
}

const STATUS_TAGS = ['待办', '进行中', '已完成', 'todo', 'doing', 'done'];
const PRIORITY_TAGS = ['高', '中', '低', '高优先级', '中优先级', '低优先级'];
const TASK_STATUS_VALUES = new Set<TaskStatus>(['todo', 'doing', 'done']);
const TASK_PRIORITY_VALUES = new Set<TaskPriority>(['高', '中', '低', '无']);
export const MINDMAP_TASK_ASSIGNEE_MAX_LENGTH = 120;
export const MINDMAP_TASK_DUE_DATE_MAX_LENGTH = 40;

function cleanTaskStatus(value: unknown, fallback: TaskStatus): TaskStatus {
    return TASK_STATUS_VALUES.has(value as TaskStatus) ? value as TaskStatus : fallback;
}

function cleanTaskPriority(value: unknown, fallback: TaskPriority): TaskPriority {
    return TASK_PRIORITY_VALUES.has(value as TaskPriority) ? value as TaskPriority : fallback;
}

function cleanTaskText(value: unknown, maxLength: number): string {
    return cleanMindMapTopic(value, '').slice(0, maxLength);
}

function cleanTaskDueDate(value: unknown): string {
    const text = cleanTaskText(value, MINDMAP_TASK_DUE_DATE_MAX_LENGTH);
    if (!text) return '';
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function cleanTaskProgress(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

export function tagText(tag: unknown): string {
    if (typeof tag === 'string') return tag;
    if (tag && typeof tag === 'object' && 'text' in tag) {
        return String((tag as { text?: unknown }).text ?? '');
    }
    return '';
}

export function normalizeTags(tags: unknown[] | undefined): string[] {
    return cleanMindMapTags((tags ?? []).map(tagText)) ?? [];
}

export function inferStatusFromTags(tags: string[]): TaskStatus {
    if (tags.includes('已完成') || tags.includes('done')) return 'done';
    if (tags.includes('进行中') || tags.includes('doing')) return 'doing';
    return 'todo';
}

export function inferPriorityFromTags(tags: string[]): TaskPriority {
    if (tags.includes('高') || tags.includes('高优先级')) return '高';
    if (tags.includes('中') || tags.includes('中优先级')) return '中';
    if (tags.includes('低') || tags.includes('低优先级')) return '低';
    return '无';
}

export function getTaskMeta(node: NodeObj): Required<Pick<MindMapTaskMeta, 'status' | 'priority'>> & MindMapTaskMeta {
    const task = (node as TaskNode).task ?? {};
    const tags = normalizeTags(node.tags as unknown[] | undefined);
    const inferredStatus = inferStatusFromTags(tags);
    const inferredPriority = inferPriorityFromTags(tags);
    return {
        status: cleanTaskStatus(task.status, inferredStatus),
        priority: cleanTaskPriority(task.priority, inferredPriority),
        dueDate: cleanTaskDueDate(task.dueDate),
        assignee: cleanTaskText(task.assignee, MINDMAP_TASK_ASSIGNEE_MAX_LENGTH),
        progress: cleanTaskProgress(task.progress),
    };
}

export function mergeTaskTags(
    existingTags: unknown[] | undefined,
    status: TaskStatus,
    priority: TaskPriority
): string[] {
    const tags = normalizeTags(existingTags)
        .filter(t => !STATUS_TAGS.includes(t) && !PRIORITY_TAGS.includes(t));

    if (status === 'done') tags.push('已完成');
    else if (status === 'doing') tags.push('进行中');
    else tags.push('待办');

    if (priority !== '无') tags.push(priority);

    return Array.from(new Set(tags));
}

export function applyTaskMeta(
    node: NodeObj,
    patch: Partial<MindMapTaskMeta>,
    syncTags = true
): MindMapTaskMeta {
    const current = getTaskMeta(node);
    const next: MindMapTaskMeta = {
        status: cleanTaskStatus(patch.status, current.status),
        priority: cleanTaskPriority(patch.priority, current.priority),
        dueDate: patch.dueDate === undefined ? current.dueDate : cleanTaskDueDate(patch.dueDate),
        assignee: patch.assignee === undefined
            ? current.assignee
            : cleanTaskText(patch.assignee, MINDMAP_TASK_ASSIGNEE_MAX_LENGTH),
        progress: patch.progress === undefined ? current.progress : cleanTaskProgress(patch.progress),
    };

    (node as TaskNode).task = next;
    if (syncTags) {
        node.tags = mergeTaskTags(node.tags as unknown[] | undefined, next.status ?? 'todo', next.priority ?? '无');
    }

    return next;
}
