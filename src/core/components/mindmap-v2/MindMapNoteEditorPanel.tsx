import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    cleanMindMapNote,
    MINDMAP_MAX_NOTE_LENGTH,
} from './mindmapTreeSanitizer';
import styles from './FloatingBar.module.css';

interface MindMapNoteEditorPanelProps {
    dialogId?: string;
    initialNote?: string;
    onCancel: () => void;
    onClear: () => Promise<void> | void;
    onDirtyChange?: (isDirty: boolean) => void;
    onSave: (note: string | undefined) => Promise<void> | void;
}

export const MindMapNoteEditorPanel: React.FC<MindMapNoteEditorPanelProps> = ({
    dialogId,
    initialNote,
    onCancel,
    onClear,
    onDirtyChange,
    onSave,
}) => {
    const { t } = useTranslation();
    const initialValue = cleanMindMapNote(initialNote) ?? '';
    const [draft, setDraft] = useState(initialValue);
    const [pendingAction, setPendingAction] = useState<'clear' | 'save' | null>(null);
    const [error, setError] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const initialSelectionPositionRef = useRef(initialValue.length);
    const mountedRef = useRef(true);
    const pendingRef = useRef(false);
    const titleId = useId();
    const helpId = useId();
    const errorId = useId();
    const cleanDraft = cleanMindMapNote(draft) ?? '';
    const isDirty = cleanDraft !== initialValue;
    const canClear = Boolean(initialValue || draft);
    const isPending = pendingAction !== null;

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        const initialSelectionPosition = initialSelectionPositionRef.current;
        textarea.setSelectionRange(initialSelectionPosition, initialSelectionPosition);
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

    const runAfterPointerInteraction = (action: () => void) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => action());
            return;
        }
        queueMicrotask(action);
    };

    const runMutation = async (
        action: 'clear' | 'save',
        mutation: () => Promise<void> | void,
    ) => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPendingAction(action);
        setError('');
        let failed = false;
        try {
            await mutation();
        } catch {
            if (!mountedRef.current) return;
            failed = true;
            setError(t(`plugins.mindmap.noteEditor.${action}Failed`));
        } finally {
            pendingRef.current = false;
            if (mountedRef.current) {
                setPendingAction(null);
                if (failed) runAfterPointerInteraction(() => textareaRef.current?.focus());
            }
        }
    };

    const saveDraft = () => {
        if (!isDirty || isPending) return;
        void runMutation('save', () => onSave(cleanMindMapNote(draft)));
    };

    return (
        <div
            id={dialogId}
            className={styles.notePopover}
            role="dialog"
            aria-labelledby={titleId}
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            aria-busy={isPending}
            onPointerDown={event => event.stopPropagation()}
            onPointerUp={event => event.stopPropagation()}
            onMouseDown={event => event.stopPropagation()}
            onMouseUp={event => event.stopPropagation()}
            onTouchStart={event => event.stopPropagation()}
            onTouchEnd={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
        >
            <div className={styles.noteHeader}>
                <strong id={titleId}>{t('plugins.mindmap.noteEditor.title')}</strong>
                <span>{t('plugins.mindmap.noteEditor.markdown')}</span>
            </div>
            <textarea
                ref={textareaRef}
                className={styles.noteTextarea}
                aria-label={t('plugins.mindmap.noteEditor.textareaLabel')}
                value={draft}
                disabled={isPending}
                maxLength={MINDMAP_MAX_NOTE_LENGTH}
                onChange={event => setDraft(event.target.value.slice(0, MINDMAP_MAX_NOTE_LENGTH))}
                onKeyDown={event => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        onCancel();
                        return;
                    }
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        saveDraft();
                    }
                }}
                placeholder={t('plugins.mindmap.noteEditor.placeholder')}
                rows={5}
            />
            <div id={helpId} className={styles.noteMeta}>
                <span>{t('plugins.mindmap.noteEditor.shortcuts')}</span>
                <span>{draft.length} / {MINDMAP_MAX_NOTE_LENGTH}</span>
            </div>
            {error && (
                <div id={errorId} className={styles.noteError} role="alert">
                    {error}
                </div>
            )}
            <div className={styles.noteActions}>
                <button
                    type="button"
                    className={styles.noteBtnClear}
                    disabled={!canClear || isPending}
                    onClick={() => runAfterPointerInteraction(() => {
                        void runMutation('clear', onClear);
                    })}
                >{pendingAction === 'clear'
                        ? t('plugins.mindmap.noteEditor.clearing')
                        : t('plugins.mindmap.noteEditor.clear')}</button>
                <button
                    type="button"
                    className={styles.noteBtnCancel}
                    disabled={isPending}
                    onClick={onCancel}
                >{t('plugins.mindmap.noteEditor.cancel')}</button>
                <button
                    type="button"
                    className={styles.noteBtnSave}
                    disabled={!isDirty || isPending}
                    aria-label={t('plugins.mindmap.noteEditor.saveLabel')}
                    onClick={() => runAfterPointerInteraction(saveDraft)}
                >{pendingAction === 'save'
                        ? t('plugins.mindmap.noteEditor.saving')
                        : t('plugins.mindmap.noteEditor.save')}</button>
            </div>
        </div>
    );
};
