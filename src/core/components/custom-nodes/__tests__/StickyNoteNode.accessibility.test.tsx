// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    updateNodeData: vi.fn(),
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string) => key === 'designer.toolbar.stickyNote'
            ? '便签 (S)'
            : (typeof fallback === 'string' ? fallback : key),
    }),
}));

vi.mock('../../diagrams/useNodeUpdate', () => ({
    useNodeUpdate: () => mocks.updateNodeData,
}));

vi.mock('../../../hooks/useDiagramStylePreset_v2', () => ({
    useDiagramStylePreset_v2: () => ({ name: 'default' }),
}));

import StickyNoteNode, { MAX_STICKY_NOTE_LENGTH } from '../StickyNoteNode';

const createProps = (
    data: ComponentProps<typeof StickyNoteNode>['data'],
): ComponentProps<typeof StickyNoteNode> => ({
    id: 'sticky-1',
    data,
    type: 'sticky-note',
    selected: false,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
});

describe('StickyNoteNode accessibility', () => {
    it('names and focuses a bounded localized editor', async () => {
        render(<StickyNoteNode {...createProps({ label: '', isEditing: true })} />);

        const editor = screen.getByRole('textbox', { name: '便签 (S)' });
        expect(editor.getAttribute('placeholder')).toBe('便签 (S)');
        expect(editor.getAttribute('maxlength')).toBe(String(MAX_STICKY_NOTE_LENGTH));
        await waitFor(() => expect(document.activeElement).toBe(editor));
        expect(screen.getByRole('group', { name: '便签 (S)' })).toBeTruthy();
    });

    it('bounds editor updates before sending them to node state', () => {
        mocks.updateNodeData.mockReset();
        render(<StickyNoteNode {...createProps({ label: '', isEditing: true })} />);
        const editor = screen.getByRole('textbox', { name: '便签 (S)' });
        const oversized = 'x'.repeat(MAX_STICKY_NOTE_LENGTH + 50);

        fireEvent.change(editor, { target: { value: oversized } });

        expect(mocks.updateNodeData).toHaveBeenCalledTimes(1);
        const update = mocks.updateNodeData.mock.calls[0]?.[1];
        expect(update?.data?.label).toHaveLength(MAX_STICKY_NOTE_LENGTH);
    });

    it('renders non-string imported labels safely', () => {
        const importedData: ComponentProps<typeof StickyNoteNode>['data'] = { isEditing: false };
        Object.defineProperty(importedData, 'label', {
            configurable: true,
            enumerable: true,
            value: { unsafe: true },
        });

        render(<StickyNoteNode {...createProps(importedData)} />);

        expect(screen.getByRole('group', { name: '便签 (S)' })).toBeTruthy();
        expect(screen.getByText('便签 (S)')).toBeTruthy();
    });
});
