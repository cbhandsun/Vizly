import type { NodeObj } from 'mind-elixir';
import { getTaskMeta, type MindMapTaskMeta, type TaskPriority, type TaskStatus } from './mindmapTaskModel';

export interface KanbanTask {
    id: string;
    topic: string;
    note?: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string;
    assignee?: string;
    progress?: number;
    ancestors: string[];
}

type TaskNode = NodeObj & { task?: MindMapTaskMeta };

export const extractKanbanTasks = (
    node: NodeObj,
    ancestors: string[] = [],
    untitledTopic = 'Untitled node',
): KanbanTask[] => {
    const currentAncestors = [...ancestors, node.topic || untitledTopic];
    const hasTaskMeta = Boolean((node as TaskNode).task);
    const isLeaf = !node.children || node.children.length === 0;

    if (isLeaf || hasTaskMeta) {
        const task = getTaskMeta(node);
        return [{
            id: node.id,
            topic: node.topic || untitledTopic,
            note: node.note,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            assignee: task.assignee,
            progress: task.progress,
            ancestors,
        }];
    }

    return (node.children ?? []).flatMap(child => (
        extractKanbanTasks(child, currentAncestors, untitledTopic)
    ));
};
