import type { NodeObj } from 'mind-elixir';

import {
    applyTaskMeta,
    getTaskMeta,
    type MindMapTaskMeta,
    type TaskNode,
} from './mindmapTaskModel';

export type MindMapPropertyTaskDraft = NodeObj & TaskNode;

export interface MindMapPropertyTaskDraftUpdate {
    draft: MindMapPropertyTaskDraft;
    meta: MindMapTaskMeta;
    mutation: Pick<MindMapPropertyTaskDraft, 'tags' | 'task'>;
}

export interface MindMapPropertyTaskTransactionEntry {
    draft: MindMapPropertyTaskDraft;
    mutation: Pick<MindMapPropertyTaskDraft, 'tags' | 'task'>;
    sequence: number;
}

export interface MindMapPropertyTaskTransactionState {
    committedDraft: MindMapPropertyTaskDraft;
    committedSequence: number;
    error: string;
    nextSequence: number;
    optimisticDraft: MindMapPropertyTaskDraft;
    pendingEntries: MindMapPropertyTaskTransactionEntry[];
    sourceKey: string;
}

export interface MindMapPropertyTaskTransactionBegin {
    entry?: MindMapPropertyTaskTransactionEntry;
    state: MindMapPropertyTaskTransactionState;
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

function createMindMapPropertyTaskMutation(
    draft: MindMapPropertyTaskDraft,
): Pick<MindMapPropertyTaskDraft, 'tags' | 'task'> {
    return {
        tags: draft.tags ? [...draft.tags] : undefined,
        task: draft.task ? { ...draft.task } : undefined,
    };
}

function taskDraftContentSignature(draft: MindMapPropertyTaskDraft): string {
    return JSON.stringify(createMindMapPropertyTaskMutation(draft));
}

function beginMindMapPropertyTaskTransaction(
    state: MindMapPropertyTaskTransactionState,
    draft: MindMapPropertyTaskDraft,
): MindMapPropertyTaskTransactionBegin {
    if (taskDraftContentSignature(state.optimisticDraft) === taskDraftContentSignature(draft)) {
        return {
            state: state.error ? { ...state, error: '' } : state,
        };
    }

    const entry: MindMapPropertyTaskTransactionEntry = {
        draft: createMindMapPropertyTaskDraft(draft),
        mutation: createMindMapPropertyTaskMutation(draft),
        sequence: state.nextSequence,
    };
    return {
        entry,
        state: {
            ...state,
            error: '',
            nextSequence: state.nextSequence + 1,
            optimisticDraft: entry.draft,
            pendingEntries: [...state.pendingEntries, entry],
        },
    };
}

export function createMindMapPropertyTaskTransactionState(
    node: NodeObj,
): MindMapPropertyTaskTransactionState {
    const initialDraft = createMindMapPropertyTaskDraft(node);
    return {
        committedDraft: initialDraft,
        committedSequence: 0,
        error: '',
        nextSequence: 1,
        optimisticDraft: initialDraft,
        pendingEntries: [],
        sourceKey: node.id,
    };
}

export function beginMindMapPropertyTaskPatchTransaction(
    state: MindMapPropertyTaskTransactionState,
    patch: Partial<MindMapTaskMeta>,
): MindMapPropertyTaskTransactionBegin {
    const currentMeta = getTaskMeta(state.optimisticDraft);
    const { draft, meta } = applyMindMapPropertyTaskDraftPatch(state.optimisticDraft, patch);
    if (JSON.stringify(currentMeta) === JSON.stringify(meta)) {
        return {
            state: state.error ? { ...state, error: '' } : state,
        };
    }
    return beginMindMapPropertyTaskTransaction(state, draft);
}

export function beginMindMapPropertyTagsTransaction(
    state: MindMapPropertyTaskTransactionState,
    tags: NodeObj['tags'],
): MindMapPropertyTaskTransactionBegin {
    return beginMindMapPropertyTaskTransaction(
        state,
        syncMindMapPropertyTaskDraftTags(state.optimisticDraft, tags),
    );
}

export function settleMindMapPropertyTaskTransaction(
    state: MindMapPropertyTaskTransactionState,
    sequence: number,
    succeeded: boolean,
    failureMessage: string,
): MindMapPropertyTaskTransactionState {
    const entry = state.pendingEntries.find(candidate => candidate.sequence === sequence);
    if (!entry) return state;

    const pendingEntries = state.pendingEntries.filter(candidate => candidate.sequence !== sequence);
    const shouldCommit = succeeded && sequence > state.committedSequence;
    const committedDraft = shouldCommit ? entry.draft : state.committedDraft;
    const committedSequence = shouldCommit ? sequence : state.committedSequence;
    if (pendingEntries.length > 0) {
        return {
            ...state,
            committedDraft,
            committedSequence,
            pendingEntries,
        };
    }

    const latestSequence = state.nextSequence - 1;
    return {
        ...state,
        committedDraft,
        committedSequence,
        error: committedSequence === latestSequence ? '' : failureMessage,
        optimisticDraft: committedDraft,
        pendingEntries,
    };
}
