import { useCallback, useRef, useState } from 'react';

import {
    cleanMindMapTopic,
    MINDMAP_MAX_TOPIC_LENGTH,
} from './mindmapTreeSanitizer';

export const normalizeMindMapPropertyTopic = (value: unknown): string => (
    cleanMindMapTopic(value, '')
);

export interface RecoverableMindMapPropertyTopicOptions {
    failureMessage: string;
    initialValue: unknown;
    onCommit: (topic: string) => Promise<boolean>;
    requiredMessage: string;
    sourceKey: string;
}

interface RecoverableMindMapPropertyTopicState {
    committedValue: string;
    draft: string;
    error: string;
    saving: boolean;
    sourceKey: string;
}

interface PendingTopicCommit {
    sourceKey: string;
    token: symbol;
}

export interface RecoverableMindMapPropertyTopic {
    commit: () => void;
    draft: string;
    error: string;
    saving: boolean;
    setDraft: (value: string) => void;
}

export function useRecoverableMindMapPropertyTopic({
    failureMessage,
    initialValue,
    onCommit,
    requiredMessage,
    sourceKey,
}: RecoverableMindMapPropertyTopicOptions): RecoverableMindMapPropertyTopic {
    const normalizedInitialValue = normalizeMindMapPropertyTopic(initialValue);
    const [state, setState] = useState<RecoverableMindMapPropertyTopicState>(() => ({
        committedValue: normalizedInitialValue,
        draft: normalizedInitialValue,
        error: '',
        saving: false,
        sourceKey,
    }));
    const pendingCommitRef = useRef<PendingTopicCommit | null>(null);

    if (state.sourceKey !== sourceKey) {
        setState({
            committedValue: normalizedInitialValue,
            draft: normalizedInitialValue,
            error: '',
            saving: false,
            sourceKey,
        });
    }

    const setDraft = useCallback((value: string): void => {
        setState(current => current.saving
            ? current
            : {
                ...current,
                draft: value.slice(0, MINDMAP_MAX_TOPIC_LENGTH),
                error: '',
            });
    }, []);

    const commit = useCallback((): void => {
        const commitSourceKey = state.sourceKey;
        if (pendingCommitRef.current?.sourceKey === commitSourceKey) return;

        const normalizedDraft = normalizeMindMapPropertyTopic(state.draft);
        if (!normalizedDraft) {
            setState(current => current.sourceKey === commitSourceKey
                ? { ...current, error: requiredMessage }
                : current);
            return;
        }
        if (normalizedDraft === state.committedValue) {
            setState(current => current.sourceKey === commitSourceKey
                ? { ...current, draft: normalizedDraft, error: '' }
                : current);
            return;
        }

        const token = Symbol('mindmap-property-topic-commit');
        pendingCommitRef.current = { sourceKey: commitSourceKey, token };
        setState(current => current.sourceKey === commitSourceKey
            ? { ...current, draft: normalizedDraft, error: '', saving: true }
            : current);

        void (async () => {
            let succeeded = false;
            try {
                succeeded = await onCommit(normalizedDraft);
            } catch {
                succeeded = false;
            }

            if (pendingCommitRef.current?.token === token) pendingCommitRef.current = null;
            setState(current => {
                if (current.sourceKey !== commitSourceKey) return current;
                if (!succeeded) {
                    return {
                        ...current,
                        draft: normalizedDraft,
                        error: failureMessage,
                        saving: false,
                    };
                }
                return {
                    committedValue: normalizedDraft,
                    draft: normalizedDraft,
                    error: '',
                    saving: false,
                    sourceKey: commitSourceKey,
                };
            });
        })();
    }, [failureMessage, onCommit, requiredMessage, state.committedValue, state.draft, state.sourceKey]);

    return {
        commit,
        draft: state.draft,
        error: state.error,
        saving: state.saving,
        setDraft,
    };
}
