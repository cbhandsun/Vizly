import { parseDateOnlyTime } from '../../../utils/dateOnly';

export type ProTimelineDependencyFailureCode =
    | 'missing-dependency'
    | 'missing-task'
    | 'self-dependency'
    | 'duplicate-dependency'
    | 'invalid-source-date'
    | 'invalid-target-date'
    | 'reverse-time'
    | 'cyclic-dependency';

export type ProTimelineDependencyConnectionResult =
    | { ok: true }
    | { ok: false; code: ProTimelineDependencyFailureCode; message: string };

export interface ProTimelineDependencyTaskInput {
    id: string;
    startDate?: unknown;
    endDate?: unknown;
}

export interface ProTimelineDependencyEdgeInput {
    source?: unknown;
    target?: unknown;
}

export interface ValidateProTimelineDependencyOptions {
    sourceId: string;
    targetId: string;
    tasks: readonly ProTimelineDependencyTaskInput[];
    edges: readonly ProTimelineDependencyEdgeInput[];
}

export interface ValidateProTimelineDependencyUpdateOptions extends ValidateProTimelineDependencyOptions {
    oldSourceId: string;
    oldTargetId: string;
}

const failure = (
    code: ProTimelineDependencyFailureCode,
    message: string,
): ProTimelineDependencyConnectionResult => ({ ok: false, code, message });

const hasPath = (
    startId: string,
    destinationId: string,
    edges: readonly ProTimelineDependencyEdgeInput[],
): boolean => {
    const adjacency = new Map<string, string[]>();
    edges.forEach((edge) => {
        if (typeof edge.source !== 'string' || typeof edge.target !== 'string') return;
        const targets = adjacency.get(edge.source);
        if (targets) targets.push(edge.target);
        else adjacency.set(edge.source, [edge.target]);
    });

    const pending = [startId];
    const visited = new Set<string>();
    while (pending.length > 0) {
        const current = pending.pop();
        if (!current) continue;
        if (current === destinationId) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        adjacency.get(current)?.forEach((target) => {
            if (!visited.has(target)) pending.push(target);
        });
    }
    return false;
};

export function validateProTimelineDependencyConnection({
    sourceId,
    targetId,
    tasks,
    edges,
}: ValidateProTimelineDependencyOptions): ProTimelineDependencyConnectionResult {
    const sourceTask = tasks.find((task) => task.id === sourceId);
    const targetTask = tasks.find((task) => task.id === targetId);
    if (!sourceTask || !targetTask) {
        return failure('missing-task', '依赖校验失败：源任务或目标任务已不存在，请重新选择。');
    }
    if (sourceId === targetId) {
        return failure('self-dependency', '依赖校验失败：任务不能依赖自身。');
    }
    if (edges.some((edge) => edge.source === sourceId && edge.target === targetId)) {
        return failure('duplicate-dependency', '依赖校验失败：这两个任务之间已存在相同依赖。');
    }

    const sourceEndTime = parseDateOnlyTime(sourceTask.endDate ?? sourceTask.startDate);
    if (sourceEndTime === null) {
        return failure('invalid-source-date', '依赖校验失败：前置任务缺少有效的结束日期。');
    }
    const targetStartTime = parseDateOnlyTime(targetTask.startDate);
    if (targetStartTime === null) {
        return failure('invalid-target-date', '依赖校验失败：后置任务缺少有效的开始日期。');
    }
    if (sourceEndTime > targetStartTime) {
        return failure('reverse-time', '依赖校验失败：前置任务的结束时间不能晚于后置任务的开始时间。');
    }
    if (hasPath(targetId, sourceId, edges)) {
        return failure('cyclic-dependency', '依赖校验失败：该连接会形成循环依赖。');
    }
    return { ok: true };
}

export function validateProTimelineDependencyUpdate({
    oldSourceId,
    oldTargetId,
    sourceId,
    targetId,
    tasks,
    edges,
}: ValidateProTimelineDependencyUpdateOptions): ProTimelineDependencyConnectionResult {
    const existingIndex = edges.findIndex((edge) => (
        edge.source === oldSourceId && edge.target === oldTargetId
    ));
    if (existingIndex < 0) {
        return failure('missing-dependency', '依赖操作失败：原依赖已不存在，请重新选择。');
    }
    if (sourceId === oldSourceId && targetId === oldTargetId) return { ok: true };

    const remainingEdges = edges.filter((_, index) => index !== existingIndex);
    return validateProTimelineDependencyConnection({ sourceId, targetId, tasks, edges: remainingEdges });
}
