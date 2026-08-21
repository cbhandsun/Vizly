import { useCallback, useRef, useState } from 'react';

import { cleanMindMapFontSize } from './mindmapTreeSanitizer';

export const MIND_MAP_PROPERTY_FONT_SIZE_MIN = 10;
export const MIND_MAP_PROPERTY_FONT_SIZE_MAX = 48;
export const MIND_MAP_PROPERTY_FONT_SIZE_DEFAULT = 14;

export function coerceMindMapPropertyFontSize(
    value: unknown,
    fallback = MIND_MAP_PROPERTY_FONT_SIZE_DEFAULT,
): number {
    const safeFallback = cleanMindMapFontSize(fallback)
        ?? `${MIND_MAP_PROPERTY_FONT_SIZE_DEFAULT}px`;
    const safeValue = cleanMindMapFontSize(value) ?? safeFallback;
    return Number.parseInt(safeValue, 10);
}

interface RecoverableMindMapPropertyFontSizeOptions {
    failureMessage: string;
    initialValue: unknown;
    onCommit: (value: number) => Promise<boolean>;
    sourceKey: string;
}

interface RecoverableMindMapPropertyFontSizeState {
    committedValue: number;
    error: string;
    pending: boolean;
    sourceKey: string;
    value: number | null;
}

interface PendingFontSizeCommit {
    sourceKey: string;
    token: symbol;
}

export interface RecoverableMindMapPropertyFontSize {
    commit: () => void;
    error: string;
    pending: boolean;
    setValue: (value: number | null) => void;
    value: number | null;
}

export function useRecoverableMindMapPropertyFontSize({
    failureMessage,
    initialValue,
    onCommit,
    sourceKey,
}: RecoverableMindMapPropertyFontSizeOptions): RecoverableMindMapPropertyFontSize {
    const normalizedInitialValue = coerceMindMapPropertyFontSize(initialValue);
    const [state, setState] = useState<RecoverableMindMapPropertyFontSizeState>(() => ({
        committedValue: normalizedInitialValue,
        error: '',
        pending: false,
        sourceKey,
        value: normalizedInitialValue,
    }));
    const pendingCommitRef = useRef<PendingFontSizeCommit | null>(null);

    if (state.sourceKey !== sourceKey) {
        setState({
            committedValue: normalizedInitialValue,
            error: '',
            pending: false,
            sourceKey,
            value: normalizedInitialValue,
        });
    }

    const setValue = useCallback((value: number | null): void => {
        setState(current => current.pending
            ? current
            : { ...current, error: '', value });
    }, []);

    const commit = useCallback((): void => {
        const commitSourceKey = state.sourceKey;
        if (pendingCommitRef.current?.sourceKey === commitSourceKey) return;

        const nextValue = coerceMindMapPropertyFontSize(state.value, state.committedValue);
        if (nextValue === state.committedValue) {
            setState(current => current.sourceKey === commitSourceKey
                ? { ...current, error: '', value: current.committedValue }
                : current);
            return;
        }

        const token = Symbol('mindmap-property-font-size-commit');
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
    }, [failureMessage, onCommit, state.committedValue, state.sourceKey, state.value]);

    return {
        commit,
        error: state.error,
        pending: state.pending,
        setValue,
        value: state.value,
    };
}
