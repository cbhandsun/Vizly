// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MindMapNoteEditorPanel } from '../MindMapNoteEditorPanel';
import { MINDMAP_MAX_NOTE_LENGTH } from '../mindmapTreeSanitizer';

const translations: Record<string, string> = {
    'plugins.mindmap.noteEditor.title': 'Node note',
    'plugins.mindmap.noteEditor.markdown': 'Markdown supported',
    'plugins.mindmap.noteEditor.textareaLabel': 'Node note',
    'plugins.mindmap.noteEditor.placeholder': 'Add a note…',
    'plugins.mindmap.noteEditor.shortcuts': 'Esc cancel · Ctrl/Cmd+Enter save',
    'plugins.mindmap.noteEditor.clear': 'Clear',
    'plugins.mindmap.noteEditor.clearing': 'Clearing…',
    'plugins.mindmap.noteEditor.cancel': 'Cancel',
    'plugins.mindmap.noteEditor.save': 'Save',
    'plugins.mindmap.noteEditor.saving': 'Saving…',
    'plugins.mindmap.noteEditor.saveLabel': 'Save node note (Ctrl/Cmd+Enter)',
    'plugins.mindmap.noteEditor.clearFailed': 'The note could not be cleared. Try again',
    'plugins.mindmap.noteEditor.saveFailed': 'The note could not be saved. Try again',
};

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => translations[key] ?? key,
    }),
}));

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

        const textarea = screen.getByRole('textbox', { name: 'Node note' });
        const clear = screen.getByRole('button', { name: 'Clear' });
        const save = screen.getByRole('button', { name: 'Save node note (Ctrl/Cmd+Enter)' });
        expect(document.activeElement).toBe(textarea);
        expect(clear.hasAttribute('disabled')).toBe(true);
        expect(save.hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
        expect(textarea.getAttribute('maxlength')).toBe(String(MINDMAP_MAX_NOTE_LENGTH));

        fireEvent.change(textarea, { target: { value: 'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 50) } });
        expect((textarea as HTMLTextAreaElement).value).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    });

    it('saves a sanitized draft with Ctrl+Enter and clears an existing note', async () => {
        const { onClear, onSave } = renderPanel('existing');
        const textarea = screen.getByRole('textbox', { name: 'Node note' });

        fireEvent.change(textarea, { target: { value: '  updated note  ' } });
        fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
        expect(onSave).toHaveBeenCalledWith('updated note');
        await waitFor(() => expect(
            screen.getByRole('button', { name: 'Save node note (Ctrl/Cmd+Enter)' }).hasAttribute('disabled'),
        ).toBe(false));

        fireEvent.change(textarea, { target: { value: '  pointer save  ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save node note (Ctrl/Cmd+Enter)' }));
        await waitFor(() => expect(onSave).toHaveBeenNthCalledWith(2, 'pointer save'));

        fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
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
        const textarea = screen.getByRole('textbox', { name: 'Node note' });

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

    it('keeps a failed save open, reports a generic error, and restores editing focus', async () => {
        const onSave = vi.fn(async () => {
            throw new Error('provider token should not be rendered');
        });
        render(
            <MindMapNoteEditorPanel
                onCancel={vi.fn()}
                onClear={vi.fn()}
                onSave={onSave}
            />,
        );
        const textarea = screen.getByRole('textbox', { name: 'Node note' });
        fireEvent.change(textarea, { target: { value: 'retryable note' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save node note (Ctrl/Cmd+Enter)' }));

        expect((await screen.findByRole('alert')).textContent).toBe('The note could not be saved. Try again');
        await waitFor(() => expect(document.activeElement).toBe(textarea));
        expect(screen.queryByText('provider token should not be rendered')).toBeNull();
        expect((textarea as HTMLTextAreaElement).disabled).toBe(false);
    });

    it('locks a pending save so rapid activation cannot submit twice', async () => {
        let resolveSave: (() => void) | undefined;
        const onSave = vi.fn(() => new Promise<void>(resolve => {
            resolveSave = resolve;
        }));
        render(
            <MindMapNoteEditorPanel
                onCancel={vi.fn()}
                onClear={vi.fn()}
                onSave={onSave}
            />,
        );
        const textarea = screen.getByRole('textbox', { name: 'Node note' });
        fireEvent.change(textarea, { target: { value: 'single flight' } });
        const save = screen.getByRole('button', { name: 'Save node note (Ctrl/Cmd+Enter)' });
        fireEvent.click(save);
        fireEvent.click(save);

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        const pendingSave = screen.getByRole('button', { name: 'Save node note (Ctrl/Cmd+Enter)' });
        expect(pendingSave.textContent).toBe('Saving…');
        expect(pendingSave.hasAttribute('disabled')).toBe(true);
        expect((textarea as HTMLTextAreaElement).disabled).toBe(true);

        resolveSave?.();
        await waitFor(() => expect((textarea as HTMLTextAreaElement).disabled).toBe(false));
    });
});
