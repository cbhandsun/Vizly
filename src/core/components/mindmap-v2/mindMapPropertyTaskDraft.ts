import type { NodeObj } from 'mind-elixir';

import {
    applyTaskMeta,
    type MindMapTaskMeta,
    type TaskNode,
} from './mindmapTaskModel';

export type MindMapPropertyTaskDraft = NodeObj & TaskNode;

export interface MindMapPropertyTaskDraftUpdate {
    draft: MindMapPropertyTaskDraft;
    meta: MindMapTaskMeta;
    mutation: Pick<MindMapPropertyTaskDraft, 'tags' | 'task'>;
}

export function createMindMapPropertyTaskDraft(node: NodeObj): MindMapPropertyTaskDraft {
    const taskNode = node as MindMapPropertyTaskDraft;
    return {
        ...taskNode,
        tags: taskNode.tags ? [...taskNode.tags] : undefined,
        task: taskNode.task ? { ...taskNode.task } : undefined,
    };
}

export function syncMindMapPropertyTaskDraftTags(
    draft: MindMapPropertyTaskDraft,
    tags: NodeObj['tags'],
): MindMapPropertyTaskDraft {
    return {
        ...draft,
        tags: tags ? [...tags] : undefined,
    };
}

export function applyMindMapPropertyTaskDraftPatch(
    current: MindMapPropertyTaskDraft,
    patch: Partial<MindMapTaskMeta>,
): MindMapPropertyTaskDraftUpdate {
    const draft = createMindMapPropertyTaskDraft(current);
    const meta = applyTaskMeta(draft, patch);
    return {
        draft,
        meta,
        mutation: {
            tags: draft.tags ? [...draft.tags] : undefined,
            task: { ...meta },
        },
    };
}
