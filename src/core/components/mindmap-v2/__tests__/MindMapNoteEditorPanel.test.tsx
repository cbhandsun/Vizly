// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MindMapNoteEditorPanel } from '../MindMapNoteEditorPanel';
import { MINDMAP_MAX_NOTE_LENGTH } from '../mindmapTreeSanitizer';

const renderPanel = (initialNote?: string) => {
    const onCancel = vi.fn();
    const onClear = vi.fn();
    const onSave = vi.fn();
    render(
        <MindMapNoteEditorPanel
            initialNote={initialNote}
            onCancel={onCancel}
            onClear={onClear}
            onSave={onSave}
        />,
    );
    return { onCancel, onClear, onSave };
};

describe('MindMapNoteEditorPanel', () => {
    it('opens focused with explicit empty-state actions and bounded input', () => {
        renderPanel();

        const textarea = screen.getByRole('textbox', { name: '节点备注' });
        const clear = screen.getByRole('button', { name: '清除' });
        const save = screen.getByRole('button', { name: '保存节点备注 (Ctrl/Cmd+Enter)' });
        expect(document.activeElement).toBe(textarea);
        expect(clear.hasAttribute('disabled')).toBe(true);
        expect(save.hasAttribute('disabled')).toBe(true);
        expect(textarea.getAttribute('maxlength')).toBe(String(MINDMAP_MAX_NOTE_LENGTH));

        fireEvent.change(textarea, { target: { value: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 50) } });
        expect((textarea as HTMLTextAreaElement).value).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    });

    it('saves a sanitized draft with Ctrl+Enter and clears an existing note', async () => {
        const { onClear, onSave } = renderPanel('existing');
        const textarea = screen.getByRole('textbox', { name: '节点备注' });

        fireEvent.change(textarea, { target: { value: '  updated note  ' } });
        fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
        expect(onSave).toHaveBeenCalledWith('updated note');

        fireEvent.change(textarea, { target: { value: '  pointer save  ' } });
        fireEvent.click(screen.getByRole('button', { name: '保存节点备注 (Ctrl/Cmd+Enter)' }));
        await waitFor(() => expect(onSave).toHaveBeenNthCalledWith(2, 'pointer save'));

        fireEvent.click(screen.getByRole('button', { name: '清除' }));
        await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
    });

    it('contains pointer and keyboard events so the canvas cannot deselect the node', () => {
        const parentMouseDown = vi.fn();
        const parentMouseUp = vi.fn();
        const parentPointerUp = vi.fn();
        const parentTouchEnd = vi.fn();
        const parentClick = vi.fn();
        const parentKeyDown = vi.fn();
        const onCancel = vi.fn();
        render(
            <div
                onMouseDown={parentMouseDown}
                onMouseUp={parentMouseUp}
                onPointerUp={parentPointerUp}
                onTouchEnd={parentTouchEnd}
                onClick={parentClick}
                onKeyDown={parentKeyDown}
            >
                <MindMapNoteEditorPanel
                    onCancel={onCancel}
                    onClear={vi.fn()}
                    onSave={vi.fn()}
                />
            </div>,
        );
        const textarea = screen.getByRole('textbox', { name: '节点备注' });

        fireEvent.mouseDown(textarea);
        fireEvent.mouseUp(textarea);
        fireEvent.pointerUp(textarea);
        fireEvent.touchEnd(textarea);
        fireEvent.click(textarea);
        fireEvent.keyDown(textarea, { key: 'Escape' });

        expect(parentMouseDown).not.toHaveBeenCalled();
        expect(parentMouseUp).not.toHaveBeenCalled();
        expect(parentPointerUp).not.toHaveBeenCalled();
        expect(parentTouchEnd).not.toHaveBeenCalled();
        expect(parentClick).not.toHaveBeenCalled();
        expect(parentKeyDown).not.toHaveBeenCalled();
        expect(onCancel).toHaveBeenCalledTimes(1);
    });
});
