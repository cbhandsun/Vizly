// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { HoverToolbarsOverlay } from '../HoverToolbarsOverlay';

vi.mock('../../../store/useDiagramStore', () => ({
    useDiagramStore: (selector: (state: { contextMenu: null }) => unknown) => (
        selector({ contextMenu: null })
    ),
}));

vi.mock('../FloatingContextToolbar', async () => {
    const React = await import('react');
    return {
        FloatingContextToolbar: (props: {
            onBringToFront: () => void;
            onSendToBack: () => void;
        }) => React.createElement(
            React.Fragment,
            null,
            React.createElement('button', {
                type: 'button',
                'aria-label': 'mock-bring-front',
                onClick: props.onBringToFront,
            }),
            React.createElement('button', {
                type: 'button',
                'aria-label': 'mock-send-back',
                onClick: props.onSendToBack,
            }),
        ),
    };
});

vi.mock('../ContextualEdgeToolbar', () => ({
    ContextualEdgeToolbar: () => null,
}));

const node = (id: string): Node => ({
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { label: id },
    selected: true,
});

describe('HoverToolbarsOverlay layer actions', () => {
    it('forwards the complete selected-node target to both layer actions', () => {
        const handleBringToFront = vi.fn();
        const handleSendToBack = vi.fn();

        render(<HoverToolbarsOverlay
            selectedNodes={[node('node-1'), node('node-2')]}
            selectedEdges={[]}
            quickAddMenuVisible={false}
            isContextToolbarHidden={false}
            isDragging={false}
            isConnecting={false}
            nodeTypes={{}}
            updateNodesBatch={vi.fn()}
            updateEdgesBatch={vi.fn()}
            handleDeleteWithToast={vi.fn()}
            handleDuplicateWithToast={vi.fn()}
            handleGroupWithToast={vi.fn()}
            handleUngroupWithToast={vi.fn()}
            handleLock={vi.fn()}
            handleOpacity={vi.fn()}
            handleBringToFront={handleBringToFront}
            handleSendToBack={handleSendToBack}
            copyStyle={vi.fn()}
            pasteStyle={vi.fn()}
            hasCopiedStyle={false}
        />);

        fireEvent.click(screen.getByRole('button', { name: 'mock-bring-front' }));
        fireEvent.click(screen.getByRole('button', { name: 'mock-send-back' }));

        expect(handleBringToFront).toHaveBeenCalledWith(['node-1', 'node-2']);
        expect(handleSendToBack).toHaveBeenCalledWith(['node-1', 'node-2']);
    });
});
