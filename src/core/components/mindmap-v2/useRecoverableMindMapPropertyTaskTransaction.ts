import { useCallback, useEffect, useRef, useState } from 'react';
import type { NodeObj, TagObj } from 'mind-elixir';

import { cleanMindMapTagObjects } from './mindmapNodePatchSecurity';
import {
    beginMindMapPropertyTagsTransaction,
    beginMindMapPropertyTaskPatchTransaction,
    createMindMapPropertyTaskTransactionState,
    settleMindMapPropertyTaskTransaction,
    type MindMapPropertyTaskTransactionBegin,
    type MindMapPropertyTaskTransactionState,
} from './mindMapPropertyTaskDraft';
import { getTaskMeta, type MindMapTaskMeta } from './mindmapTaskModel';

interface RecoverableMindMapPropertyTaskTransactionOptions {
    failureMessage: string;
    node: NodeObj;
    onCommit: (mutation: Pick<NodeObj, 'tags'> & { task?: MindMapTaskMeta }) => Promise<boolean>;
}

export interface RecoverableMindMapPropertyTaskTransaction {
    error: string;
    meta: MindMapTaskMeta;
    pending: boolean;
    tags: TagObj[];
    updateTags: (tags: TagObj[]) => void;
    updateTask: (patch: Partial<MindMapTaskMeta>) => void;
}

export function useRecoverableMindMapPropertyTaskTransaction({
    failureMessage,
    node,
    onCommit,
}: RecoverableMindMapPropertyTaskTransactionOptions): RecoverableMindMapPropertyTaskTransaction {
    const [state, setState] = useState<MindMapPropertyTaskTransactionState>(() => (
        createMindMapPropertyTaskTransactionState(node)
    ));
    const stateRef = useRef(state);
    const activeSourceKeyRef = useRef(node.id);

    useEffect(() => {
        activeSourceKeyRef.current = node.id;
    }, [node.id]);

    const publish = useCallback((nextState: MindMapPropertyTaskTransactionState): void => {
        stateRef.current = nextState;
        setState(nextState);
    }, []);

    const run = useCallback((begin: MindMapPropertyTaskTransactionBegin): void => {
        publish(begin.state);
        if (!begin.entry) return;
        const { mutation, sequence } = begin.entry;
        const sourceKey = begin.state.sourceKey;
        void (async () => {
            let succeeded: boolean;
            try {
                succeeded = await onCommit(mutation);
            } catch {
                succeeded = false;
            }
            if (activeSourceKeyRef.current !== sourceKey) return;
            const current = stateRef.current;
            if (current.sourceKey !== sourceKey) return;
            publish(settleMindMapPropertyTaskTransaction(
                current,
                sequence,
                succeeded,
                failureMessage,
            ));
        })();
    }, [failureMessage, onCommit, publish]);

    const updateTask = useCallback((patch: Partial<MindMapTaskMeta>): void => {
        const current = stateRef.current.sourceKey === node.id
            ? stateRef.current
            : createMindMapPropertyTaskTransactionState(node);
        run(beginMindMapPropertyTaskPatchTransaction(current, patch));
    }, [node, run]);

    const updateTags = useCallback((tags: TagObj[]): void => {
        const cleanTags = cleanMindMapTagObjects(tags) ?? [];
        const current = stateRef.current.sourceKey === node.id
            ? stateRef.current
            : createMindMapPropertyTaskTransactionState(node);
        run(beginMindMapPropertyTagsTransaction(current, cleanTags));
    }, [node, run]);

    const visibleState = state.sourceKey === node.id
        ? state
        : createMindMapPropertyTaskTransactionState(node);

    return {
        error: visibleState.error,
        meta: getTaskMeta(visibleState.optimisticDraft),
        pending: visibleState.pendingEntries.length > 0,
        tags: cleanMindMapTagObjects(visibleState.optimisticDraft.tags) ?? [],
        updateTags,
        updateTask,
    };
}
