// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

const reactFlowMocks = vi.hoisted(() => ({
    setNodes: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
    const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
    return {
        ...actual,
        useReactFlow: () => reactFlowMocks,
    };
});

import { useDiagramStore } from '../../../store/useDiagramStore';
import { useContainerNode } from '../useContainerNode';

describe('useContainerNode collapse routing', () => {
    it('dispatches title-bar collapse to the scoped canvas boundary', () => {
        reactFlowMocks.setNodes.mockClear();
        const canvasRoot = document.createElement('div');
        const button = document.createElement('button');
        canvasRoot.appendChild(button);
        const listener = vi.fn();
        canvasRoot.addEventListener('vizly:container-collapse-request', listener);
        const { result } = renderHook(() => useContainerNode({
            id: 'group',
            data: { label: 'Group' },
        }));

        act(() => result.current.toggleCollapse(button));

        expect(listener).toHaveBeenCalledTimes(1);
        expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ nodeId: 'group' });
        expect(reactFlowMocks.setNodes).not.toHaveBeenCalled();
    });

    it('keeps the child count when collapsed descendants are hidden from React Flow', () => {
        const nodes: Node[] = [
            { id: 'group', position: { x: 0, y: 0 }, data: { collapsed: true } },
            {
                id: 'child',
                parentId: 'group',
                hidden: true,
                position: { x: 0, y: 40 },
                data: {},
            },
        ];
        useDiagramStore.setState({ nodes });

        const { result, unmount } = renderHook(() => useContainerNode({
            id: 'group',
            data: { collapsed: true, label: 'Group' },
        }));

        expect(result.current.childCount).toBe(1);
        unmount();
        useDiagramStore.setState({ nodes: [] });
    });
});
