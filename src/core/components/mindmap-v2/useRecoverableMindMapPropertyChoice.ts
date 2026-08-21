import { useCallback, useRef, useState } from 'react';

interface RecoverableMindMapPropertyChoiceOptions<Value> {
    failureMessage: string;
    initialValue: Value;
    onCommit: (value: Value) => Promise<boolean>;
    sourceKey: string;
}

interface RecoverableMindMapPropertyChoiceState<Value> {
    committedValue: Value;
    error: string;
    pending: boolean;
    sourceKey: string;
    value: Value;
}

interface PendingChoiceCommit {
    sourceKey: string;
    token: symbol;
}

export interface RecoverableMindMapPropertyChoice<Value> {
    error: string;
    pending: boolean;
    select: (value: Value) => void;
    value: Value;
}

export function useRecoverableMindMapPropertyChoice<Value>({
    failureMessage,
    initialValue,
    onCommit,
    sourceKey,
}: RecoverableMindMapPropertyChoiceOptions<Value>): RecoverableMindMapPropertyChoice<Value> {
    const [state, setState] = useState<RecoverableMindMapPropertyChoiceState<Value>>(() => ({
        committedValue: initialValue,
        error: '',
        pending: false,
        sourceKey,
        value: initialValue,
    }));
    const pendingCommitRef = useRef<PendingChoiceCommit | null>(null);

    if (state.sourceKey !== sourceKey) {
        setState({
            committedValue: initialValue,
            error: '',
            pending: false,
            sourceKey,
            value: initialValue,
        });
    }

    const select = useCallback((nextValue: Value): void => {
        const commitSourceKey = state.sourceKey;
        if (pendingCommitRef.current?.sourceKey === commitSourceKey) return;
        if (Object.is(nextValue, state.committedValue)) {
            setState(current => current.sourceKey === commitSourceKey
                ? { ...current, error: '', value: nextValue }
                : current);
            return;
        }

        const token = Symbol('mindmap-property-choice-commit');
        pendingCommitRef.current = { sourceKey: commitSourceKey, token };
        setState(current => current.sourceKey === commitSourceKey
            ? { ...current, error: '', pending: true, value: nextValue }
            : current);

        void (async () => {
            let succeeded = false;
            try {
                succeeded = await onCommit(nextValue);
            } catch {
                succeeded = false;
            }

            if (pendingCommitRef.current?.token === token) pendingCommitRef.current = null;
            setState(current => {
                if (current.sourceKey !== commitSourceKey) return current;
                if (!succeeded) {
                    return {
                        ...current,
                        error: failureMessage,
                        pending: false,
                        value: current.committedValue,
                    };
                }
                return {
                    committedValue: nextValue,
                    error: '',
                    pending: false,
                    sourceKey: commitSourceKey,
                    value: nextValue,
                };
            });
        })();
    }, [failureMessage, onCommit, state.committedValue, state.sourceKey]);

    return {
        error: state.error,
        pending: state.pending,
        select,
        value: state.value,
    };
}
