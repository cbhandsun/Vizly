import React, { useEffect, useId, useRef, useState } from 'react';
import {
    cleanMindMapNote,
    MINDMAP_MAX_NOTE_LENGTH,
} from './mindmapTreeSanitizer';
import styles from './FloatingBar.module.css';

interface MindMapNoteEditorPanelProps {
    initialNote?: string;
    onCancel: () => void;
    onClear: () => void;
    onSave: (note: string | undefined) => void;
}

export const MindMapNoteEditorPanel: React.FC<MindMapNoteEditorPanelProps> = ({
    initialNote,
    onCancel,
    onClear,
    onSave,
}) => {
    const initialValue = cleanMindMapNote(initialNote) ?? '';
    const [draft, setDraft] = useState(initialValue);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const titleId = useId();
    const helpId = useId();
    const isDirty = draft !== initialValue;
    const canClear = Boolean(initialValue || draft);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(draft.length, draft.length);
    }, []);

    const saveDraft = () => {
        if (!isDirty) return;
        onSave(cleanMindMapNote(draft));
    };

    const runAfterPointerInteraction = (action: () => void) => {
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => action());
            return;
        }
        queueMicrotask(action);
    };

    return (
        <div
            className={styles.notePopover}
            role="dialog"
            aria-labelledby={titleId}
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
                <strong id={titleId}>节点备注</strong>
                <span>支持 Markdown</span>
            </div>
            <textarea
                ref={textareaRef}
                className={styles.noteTextarea}
                aria-label="节点备注"
                aria-describedby={helpId}
                value={draft}
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
                placeholder="输入备注…"
                rows={5}
            />
            <div id={helpId} className={styles.noteMeta}>
                <span>Esc 取消 · Ctrl/Cmd+Enter 保存</span>
                <span>{draft.length} / {MINDMAP_MAX_NOTE_LENGTH}</span>
            </div>
            <div className={styles.noteActions}>
                <button
                    type="button"
                    className={styles.noteBtnClear}
                    disabled={!canClear}
                    onClick={() => runAfterPointerInteraction(onClear)}
                >清除</button>
                <button
                    type="button"
                    className={styles.noteBtnSave}
                    disabled={!isDirty}
                    aria-label="保存节点备注 (Ctrl/Cmd+Enter)"
                    onClick={() => runAfterPointerInteraction(saveDraft)}
                >保存</button>
            </div>
        </div>
    );
};
