import type { NodeObj } from 'mind-elixir';

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

export function tagText(tag: unknown): string {
    if (typeof tag === 'string') return tag;
    if (tag && typeof tag === 'object' && 'text' in tag) {
        return String((tag as { text?: unknown }).text ?? '');
    }
    return '';
}

export function normalizeTags(tags: unknown[] | undefined): string[] {
    return (tags ?? []).map(tagText).filter(Boolean);
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
    return {
        status: task.status ?? inferStatusFromTags(tags),
        priority: task.priority ?? inferPriorityFromTags(tags),
        dueDate: task.dueDate ?? '',
        assignee: task.assignee ?? '',
        progress: typeof task.progress === 'number' ? Math.max(0, Math.min(100, task.progress)) : 0,
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
        status: patch.status ?? current.status,
        priority: patch.priority ?? current.priority,
        dueDate: patch.dueDate ?? current.dueDate,
        assignee: patch.assignee ?? current.assignee,
        progress: patch.progress ?? current.progress,
    };

    (node as TaskNode).task = next;
    if (syncTags) {
        node.tags = mergeTaskTags(node.tags as unknown[] | undefined, next.status ?? 'todo', next.priority ?? '无');
    }

    return next;
}
