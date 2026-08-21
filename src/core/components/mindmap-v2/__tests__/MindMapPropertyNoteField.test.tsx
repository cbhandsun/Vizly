// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MindMapPropertyNoteField } from '../MindMapPropertyNoteField';
import { MINDMAP_MAX_NOTE_LENGTH } from '../mindmapTreeSanitizer';

vi.stubGlobal('ResizeObserver', class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
});

const renderField = (
    initialValue = '',
    onCommit: (note: string | undefined) => Promise<boolean> = vi.fn(async () => true),
) => render(
    <MindMapPropertyNoteField
        failureMessage="The note could not be saved."
        initialValue={initialValue}
        label="Note"
        onCommit={onCommit}
        placeholder="Add a note…"
        sourceKey="node-1"
    />,
);

describe('MindMapPropertyNoteField', () => {
    it('commits a normalized draft once and skips unchanged blur events', async () => {
        const onCommit = vi.fn(async () => true);
        renderField('Current note', onCommit);
        const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });

        fireEvent.change(input, { target: { value: '  Updated note  ' } });
        fireEvent.blur(input);
        await act(async () => undefined);
        fireEvent.blur(input);

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith('Updated note');
        expect(input.value).toBe('Updated note');
    });

    it('converts blank notes into an explicit clear', async () => {
        const onCommit = vi.fn(async () => true);
        renderField('Current note', onCommit);
        const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.blur(input);
        await act(async () => undefined);

        expect(onCommit).toHaveBeenCalledWith(undefined);
        expect(input.value).toBe('');
    });

    it('retains a failed draft, exposes an alert, and succeeds on retry', async () => {
        const onCommit = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        renderField('Current note', onCommit);
        const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });

        fireEvent.change(input, { target: { value: 'Retryable note' } });
        fireEvent.blur(input);
        await act(async () => undefined);

        expect(input.value).toBe('Retryable note');
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(screen.getByRole('alert').textContent).toBe('The note could not be saved.');

        fireEvent.focus(input);
        fireEvent.blur(input);
        await act(async () => undefined);

        expect(onCommit).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(input.getAttribute('aria-invalid')).toBe('false');
    });

    it('blocks duplicate blur commits while a save is pending', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        renderField('', onCommit);
        const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });

        fireEvent.change(input, { target: { value: 'Pending note' } });
        fireEvent.blur(input);
        fireEvent.blur(input);

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(input.disabled).toBe(true);
        await act(async () => { finish?.(true); });
        expect(input.disabled).toBe(false);
    });

    it('ignores a stale failure after the selected node changes', async () => {
        let finish: ((value: boolean) => void) | undefined;
        const onCommit = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
        const view = renderField('Shared note', onCommit);
        const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });

        fireEvent.change(input, { target: { value: 'First draft' } });
        fireEvent.blur(input);
        view.rerender(
            <MindMapPropertyNoteField
                failureMessage="The note could not be saved."
                initialValue="Shared note"
                label="Note"
                onCommit={vi.fn(async () => true)}
                placeholder="Add a note…"
                sourceKey="node-2"
            />,
        );
        await act(async () => { finish?.(false); });

        expect(input.value).toBe('Shared note');
        expect(screen.queryByRole('alert')).toBeNull();
        expect(input.disabled).toBe(false);
    });

    it('enforces the shared note length limit before committing', async () => {
        const onCommit = vi.fn(async (_note: string | undefined) => true);
        renderField('', onCommit);
        const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Note' });

        fireEvent.change(input, { target: { value: 'x'.repeat(MINDMAP_MAX_NOTE_LENGTH + 50) } });
        fireEvent.blur(input);
        await act(async () => undefined);

        expect(input.value).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
        expect(onCommit.mock.calls[0]?.[0]).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
    });
});
