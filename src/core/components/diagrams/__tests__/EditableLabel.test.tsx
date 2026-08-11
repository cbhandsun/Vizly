// @vitest-environment jsdom

import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => ({
            'designer.flowchart.inlineEditorLabel': 'Edit node text',
            'designer.flowchart.inlineEditorToolbar': 'Text formatting',
            'designer.flowchart.inlineEditorBold': 'Bold',
            'designer.flowchart.inlineEditorBoldShortcut': 'Bold (Ctrl+B)',
            'designer.flowchart.inlineEditorItalic': 'Italic',
            'designer.flowchart.inlineEditorItalicShortcut': 'Italic (Ctrl+I)',
            'designer.flowchart.inlineEditorUnderline': 'Underline',
            'designer.flowchart.inlineEditorUnderlineShortcut': 'Underline (Ctrl+U)',
            'designer.flowchart.inlineEditorLarger': 'Increase text size',
            'designer.flowchart.inlineEditorSmaller': 'Decrease text size',
        }[key] ?? key),
    }),
}));

import { EditableLabel } from '../EditableLabel';

interface EditableLabelHarnessProps {
    value?: string;
    onChange?: (value: string) => void;
}

const EditableLabelHarness = ({ value = 'Original', onChange = () => undefined }: EditableLabelHarnessProps) => {
    const [editing, setEditing] = useState(true);
    return (
        <div role="treeitem" aria-label="Node: Original" tabIndex={-1}>
            <EditableLabel
                value={value}
                onChange={onChange}
                isEditing={editing}
                onEditingChange={setEditing}
            />
        </div>
    );
};

describe('EditableLabel', () => {
    it('exposes a named multiline textbox and a named formatting toolbar', () => {
        render(<EditableLabelHarness />);

        const editor = screen.getByRole('textbox', { name: 'Edit node text' });
        expect(editor.getAttribute('aria-multiline')).toBe('true');
        expect(editor.getAttribute('aria-keyshortcuts')).toContain('Escape');

        const toolbar = screen.getByRole('toolbar', { name: 'Text formatting' });
        for (const name of ['Bold', 'Italic', 'Underline', 'Increase text size', 'Decrease text size']) {
            expect(within(toolbar).getByRole('button', { name }).getAttribute('type')).toBe('button');
        }
    });

    it('commits sanitized content with Enter and returns focus to the node', async () => {
        const onChange = vi.fn();
        render(<EditableLabelHarness onChange={onChange} />);
        const editor = screen.getByRole('textbox', { name: 'Edit node text' });
        editor.innerHTML = '<b>Approved</b><img src=x onerror=alert(1)>';

        fireEvent.keyDown(editor, { key: 'Enter' });

        expect(onChange).toHaveBeenCalledWith('<b>Approved</b>');
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('treeitem')));
        expect(screen.queryByRole('textbox', { name: 'Edit node text' })).toBeNull();
    });

    it('cancels with Escape without saving and returns focus to the node', async () => {
        const onChange = vi.fn();
        render(<EditableLabelHarness onChange={onChange} />);
        const editor = screen.getByRole('textbox', { name: 'Edit node text' });
        editor.innerHTML = 'Discard me';

        fireEvent.keyDown(editor, { key: 'Escape' });

        expect(onChange).not.toHaveBeenCalled();
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('treeitem')));
        expect(screen.queryByRole('textbox', { name: 'Edit node text' })).toBeNull();
    });

    it('keeps Shift+Enter inside the multiline editor', () => {
        const onChange = vi.fn();
        render(<EditableLabelHarness onChange={onChange} />);
        const editor = screen.getByRole('textbox', { name: 'Edit node text' });

        fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });

        expect(onChange).not.toHaveBeenCalled();
        expect(screen.getByRole('textbox', { name: 'Edit node text' })).toBe(editor);
    });

    it('sanitizes unsafe initial markup before it reaches the editor DOM', () => {
        const { container } = render(
            <EditableLabelHarness value={'Safe<script>alert(1)</script><span style="color:red;position:fixed">Text</span>'} />,
        );

        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('[onerror]')).toBeNull();
        expect(screen.getByRole('textbox', { name: 'Edit node text' }).innerHTML).toContain('color: red');
        expect(screen.getByRole('textbox', { name: 'Edit node text' }).innerHTML).not.toContain('position');
    });
});
