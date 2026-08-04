// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

const reactFlowMocks = vi.hoisted(() => ({
    getNodes: vi.fn<() => Node[]>(),
    getEdges: vi.fn<() => Edge[]>(),
    setNodes: vi.fn(),
}));

vi.mock('@xyflow/react', async () => {
    const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
    return {
        ...actual,
        useReactFlow: () => reactFlowMocks,
    };
});

import { createContainerAutoLayoutPlan, useContainerAutoLayout } from '../useContainerAutoLayout';

const node = (id: string, overrides: Partial<Node> = {}): Node => ({
    id,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
});

const containerWithChild = (childOverrides: Partial<Node> = {}): Node[] => [
    node('container', { type: 'titleGroup', style: { width: 400, height: 300 } }),
    node('child', { parentId: 'container', position: { x: 300, y: 220 }, ...childOverrides }),
];

describe('container auto-layout transactions', () => {
    it('rejects layouts that would mutate a locked container or child', () => {
        const lockedContainer = containerWithChild();
        lockedContainer[0] = { ...lockedContainer[0], data: { locked: true } };
        expect(createContainerAutoLayoutPlan({ nodes: lockedContainer, edges: [], containerId: 'container' })).toBeNull();

        const lockedChild = containerWithChild({ draggable: false });
        expect(createContainerAutoLayoutPlan({ nodes: lockedChild, edges: [], containerId: 'container' })).toBeNull();
    });

    it('records a snapshot before applying a changed layout', () => {
        const nodes = containerWithChild();
        reactFlowMocks.getNodes.mockReturnValue(nodes);
        reactFlowMocks.getEdges.mockReturnValue([]);
        reactFlowMocks.setNodes.mockClear();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useContainerAutoLayout(takeSnapshot));

        act(() => result.current.layoutContainer('container'));

        expect(takeSnapshot).toHaveBeenCalledWith(nodes, []);
        expect(reactFlowMocks.setNodes).toHaveBeenCalledWith([
            nodes[0],
            expect.objectContaining({ position: { x: 24, y: 72 } }),
        ]);
    });

    it('does not snapshot when there is no valid layout change', () => {
        const nodes = [node('container', { type: 'titleGroup' })];
        reactFlowMocks.getNodes.mockReturnValue(nodes);
        reactFlowMocks.getEdges.mockReturnValue([]);
        reactFlowMocks.setNodes.mockClear();
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useContainerAutoLayout(takeSnapshot));

        act(() => result.current.layoutContainer('container'));

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(reactFlowMocks.setNodes).not.toHaveBeenCalled();
    });
});
