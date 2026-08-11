// @vitest-environment jsdom

import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    editingAllowed: true,
    handleUpdateData: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
    Handle: () => null,
    Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
    NodeResizer: () => null,
    useStore: (selector: (state: unknown) => unknown) => selector({
        connection: { inProgress: false },
        nodeLookup: new Map(),
        transform: [0, 0, 1],
    }),
}));

vi.mock('../../custom-nodes/hooks/useFlowchartNodeInteractions', () => ({
    useFlowchartNodeInteractions: () => ({
        isHovered: false,
        setIsHovered: vi.fn(),
        bounceAnimate: false,
        contentRef: { current: null },
        editStartRef: { current: null },
        handleUpdateData: mocks.handleUpdateData,
        handleQuickClone: vi.fn(),
    }),
}));

vi.mock('../../custom-nodes/hooks/useFlowchartNodeStyleResolution', () => ({
    useFlowchartNodeStyleResolution: () => ({
        preset: { name: 'standard' },
        shape: 'rectangle',
        computedRadius: 4,
        mainColor: '#3b82f6',
        finalBorderColor: '#3b82f6',
        finalBgColor: '#ffffff',
        businessState: undefined,
        nodeStyle: {},
    }),
}));

vi.mock('../../custom-nodes/renderers/FlowchartNodeGraphics', () => ({
    FlowchartNodeGraphics: () => null,
}));

vi.mock('../DiagramEditingContext', () => ({
    useDiagramEditingAllowed: () => mocks.editingAllowed,
}));

vi.mock('../EditableLabel', () => ({
    EditableLabel: () => <div role="textbox" aria-label="Edit node text" />,
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, string>) => {
            if (key === 'designer.flowchart.nodeAriaLabel') {
                return `Node: ${options?.label ?? ''}${options?.selectedState ?? ''}${options?.lockedState ?? ''}${options?.editHintState ?? ''}`;
            }
            return ({
                'designer.flowchart.nodeSelectedState': ', selected',
                'designer.flowchart.nodeLockedState': ', locked',
                'designer.flowchart.nodeEditHintState': ', press Enter or F2 to edit',
                'designer.flowchart.inlineEditorLabel': 'Edit node text',
                'designer.flowchart.doubleClickToEdit': 'Double-click to edit',
            }[key] ?? key);
        },
    }),
}));

import FlowchartNode from '../../custom-nodes/FlowchartNode';

const createProps = (data: ComponentProps<typeof FlowchartNode>['data']): ComponentProps<typeof FlowchartNode> => ({
    id: 'node-1',
    data,
    type: 'vizly:flowchart',
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

describe('FlowchartNode keyboard editing', () => {
    beforeEach(() => {
        mocks.editingAllowed = true;
        mocks.handleUpdateData.mockReset();
    });

    it.each(['Enter', 'F2'])('starts inline editing with %s from the focused node', (key) => {
        render(<FlowchartNode {...createProps({ label: 'Review order' })} />);
        const node = screen.getByRole('treeitem', { name: 'Node: Review order, press Enter or F2 to edit' });

        expect(node.getAttribute('aria-keyshortcuts')).toBe('Enter F2');
        fireEvent.keyDown(node, { key });

        expect(mocks.handleUpdateData).toHaveBeenCalledWith({ isEditing: true });
    });

    it('does not start editing from nested controls or modified shortcuts', () => {
        render(<FlowchartNode {...createProps({ label: 'Review order' })} />);
        const node = screen.getByRole('treeitem');
        const nested = screen.getByTitle('Double-click to edit');

        fireEvent.keyDown(nested, { key: 'Enter' });
        fireEvent.keyDown(node, { key: 'Enter', ctrlKey: true });

        expect(mocks.handleUpdateData).not.toHaveBeenCalled();
    });

    it('withholds the edit shortcut for locked, active, and read-only nodes', () => {
        const { rerender } = render(<FlowchartNode {...createProps({ label: 'Locked', locked: true })} />);
        let node = screen.getByRole('treeitem');
        fireEvent.keyDown(node, { key: 'F2' });
        expect(node.hasAttribute('aria-keyshortcuts')).toBe(false);

        rerender(<FlowchartNode {...createProps({ label: 'Editing', isEditing: true })} />);
        node = screen.getByRole('treeitem');
        fireEvent.keyDown(node, { key: 'Enter' });
        expect(node.hasAttribute('aria-keyshortcuts')).toBe(false);

        mocks.editingAllowed = false;
        rerender(<FlowchartNode {...createProps({ label: 'Read only' })} />);
        node = screen.getByRole('treeitem');
        fireEvent.keyDown(node, { key: 'Enter' });

        expect(mocks.handleUpdateData).not.toHaveBeenCalled();
        expect(node.hasAttribute('aria-keyshortcuts')).toBe(false);
    });
});
