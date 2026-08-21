import React, { useId, useRef, useState } from 'react';
import { Input } from 'antd';

import {
    cleanMindMapNote,
    MINDMAP_MAX_NOTE_LENGTH,
} from './mindmapTreeSanitizer';
import styles from './MindMapPropertyNoteField.module.css';

const { TextArea } = Input;

interface MindMapPropertyNoteFieldProps {
    failureMessage: string;
    initialValue?: string;
    label: string;
    onCommit: (note: string | undefined) => Promise<boolean>;
    placeholder: string;
    sourceKey: string;
}

interface MindMapPropertyNoteState {
    committedValue: string;
    draft: string;
    error: string;
    saving: boolean;
    sourceKey: string;
}

interface PendingNoteCommit {
    sourceKey: string;
    token: symbol;
}

const normalizeNote = (value: string | undefined): string => cleanMindMapNote(value) ?? '';

export const MindMapPropertyNoteField: React.FC<MindMapPropertyNoteFieldProps> = ({
    failureMessage,
    initialValue,
    label,
    onCommit,
    placeholder,
    sourceKey,
}) => {
    const normalizedInitialValue = normalizeNote(initialValue);
    const [state, setState] = useState<MindMapPropertyNoteState>(() => ({
        committedValue: normalizedInitialValue,
        draft: normalizedInitialValue,
        error: '',
        saving: false,
        sourceKey,
    }));
    const pendingCommitRef = useRef<PendingNoteCommit | null>(null);
    const errorId = useId();

    if (state.sourceKey !== sourceKey) {
        setState({
            committedValue: normalizedInitialValue,
            draft: normalizedInitialValue,
            error: '',
            saving: false,
            sourceKey,
        });
    }

    const commit = async (): Promise<void> => {
        const commitSourceKey = state.sourceKey;
        const normalizedDraft = normalizeNote(state.draft);
        if (normalizedDraft === state.committedValue) {
            setState(current => current.sourceKey === commitSourceKey
                ? { ...current, draft: normalizedDraft, error: '' }
                : current);
            return;
        }
        if (pendingCommitRef.current?.sourceKey === commitSourceKey) return;

        const token = Symbol('mindmap-property-note-commit');
        pendingCommitRef.current = { sourceKey: commitSourceKey, token };
        setState(current => current.sourceKey === commitSourceKey
            ? { ...current, saving: true, error: '' }
            : current);

        let succeeded = false;
        try {
            succeeded = await onCommit(normalizedDraft || undefined);
        } catch {
            succeeded = false;
        }

        if (pendingCommitRef.current?.token === token) pendingCommitRef.current = null;
        setState(current => {
            if (current.sourceKey !== commitSourceKey) return current;
            if (!succeeded) {
                return { ...current, saving: false, error: failureMessage };
            }
            return {
                committedValue: normalizedDraft,
                draft: normalizedDraft,
                error: '',
                saving: false,
                sourceKey: commitSourceKey,
            };
        });
    };

    return (
        <div>
            <TextArea
                aria-busy={state.saving}
                aria-describedby={state.error ? errorId : undefined}
                aria-invalid={Boolean(state.error)}
                aria-label={label}
                autoSize={{ minRows: 2, maxRows: 5 }}
                className={styles.input}
                disabled={state.saving}
                maxLength={MINDMAP_MAX_NOTE_LENGTH}
                onBlur={() => { void commit(); }}
                onChange={event => {
                    setState(current => ({
                        ...current,
                        draft: event.target.value.slice(0, MINDMAP_MAX_NOTE_LENGTH),
                        error: '',
                    }));
                }}
                placeholder={placeholder}
                value={state.draft}
            />
            {state.error && (
                <div id={errorId} className={styles.error} role="alert">
                    {state.error}
                </div>
            )}
        </div>
    );
};
