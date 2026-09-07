// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildChildrenMap, getDescendantIds, createGroupCollapseTogglePlan, useCollapsibleGroups } from '../useCollapsibleGroups';
import { normalizeBaseReactFlowLayoutVisibility } from '../../../shared/baseReactFlowLayoutVisibility';

const group = (overrides: Partial<Node> = {}): Node => ({
    id: 'group',
    type: 'titleGroup',
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
});

describe('shared explicit layout visibility', () => {
    it('uses the same semantic and actual descendants as rendered container collapse', () => {
        const nodes: Node[] = [
            group({ data: { domain: 'D', collapsed: true } }),
            group({ id: 'sub', type: 'subGroup', data: { domain: 'D', subDomain: 'S' } }),
            group({ id: 'semantic-child', type: 'custom', data: { domain: 'D', subDomain: 'S' } }),
            group({ id: 'actual-child', type: 'custom', parentId: 'sub' }),
        ];
        expect(getDescendantIds(nodes, 'group')).toEqual(['sub', 'actual-child', 'semantic-child']);
        const normalized = normalizeBaseReactFlowLayoutVisibility(nodes);
        const { result } = renderHook(() => useCollapsibleGroups({ nodes, edges: [], setNodes: vi.fn() }));
        expect(normalized.map(node => [node.id, !!node.hidden])).toEqual(
            result.current.nodesWithCollapseState.map(node => [node.id, !!node.hidden]),
        );
        expect(normalizeBaseReactFlowLayoutVisibility(normalized)).toBe(normalized);
        expect(nodes.every(node => node.hidden === undefined)).toBe(true);
    });

    it('handles empty, missing, duplicate paths and cyclic ancestry without infinite traversal', () => {
        expect(buildChildrenMap([]).size).toBe(0);
        expect(getDescendantIds([], 'missing')).toEqual([]);
        const cyclic = [group({ id: 'a', parentId: 'b' }), group({ id: 'b', parentId: 'a' })];
        expect(getDescendantIds(cyclic, 'a')).toEqual(['b']);
        const duplicatePath = [group({ data: { domain: 'D' } }),
            group({ id: 'child', type: 'custom', parentId: 'group', data: { domain: 'D' } })];
        expect(getDescendantIds(duplicatePath, 'group')).toEqual(['child']);
        expect(normalizeBaseReactFlowLayoutVisibility(cyclic)).toBe(cyclic);
        expect(normalizeBaseReactFlowLayoutVisibility([{ ...cyclic[0], data: { collapsed: true } }, cyclic[1]]))
            .toHaveLength(2);
    });

    it('keeps visible structural children and ignores untrusted nonboolean collapse flags', () => {
        const nodes = [group({ hidden: true, data: { collapsed: '<script>private</script>' } }),
            group({ id: 'child', type: 'custom', parentId: 'group' })];
        expect(normalizeBaseReactFlowLayoutVisibility(nodes)).toBe(nodes);
        expect(nodes[1].hidden).toBeUndefined();
    });
});

describe('useCollapsibleGroups transactions', () => {
    const createSetNodesHarness = (initialNodes: Node[]) => {
        let currentNodes = initialNodes;
        const setNodes: React.Dispatch<React.SetStateAction<Node[]>> = vi.fn((next) => {
            currentNodes = typeof next === 'function' ? next(currentNodes) : next;
        });
        return { setNodes, getCurrentNodes: () => currentNodes };
    };

    it('returns no plan for missing or locked targets', () => {
        expect(createGroupCollapseTogglePlan([group()], 'missing')).toBeNull();
        expect(createGroupCollapseTogglePlan([group({ data: { locked: true } })], 'group')).toBeNull();
    });

    it('snapshots and applies an unlocked collapse toggle once', () => {
        const nodes = [group({ style: { width: 420, height: 280 } })];
        const edges: Edge[] = [];
        const nodesRef = { current: [] as Node[] };
        const { setNodes, getCurrentNodes } = createSetNodesHarness(nodes);
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useCollapsibleGroups({
            nodes,
            edges,
            nodesRef,
            setNodes,
            takeSnapshot,
        }));

        act(() => result.current.toggleGroupCollapse('group'));

        expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
        expect(setNodes).toHaveBeenCalledOnce();
        expect(getCurrentNodes()).toEqual([
            expect.objectContaining({
                data: expect.objectContaining({
                    collapsed: true,
                    expandedSize: { width: 420, height: 280 },
                }),
                style: { width: 420, height: 120 },
            }),
        ]);
        expect(nodesRef.current[0]?.data?.collapsed).toBe(true);
    });

    it('does not snapshot a locked collapse target', () => {
        const nodes = [group({ data: { locked: true } })];
        const { setNodes, getCurrentNodes } = createSetNodesHarness(nodes);
        const takeSnapshot = vi.fn();
        const { result } = renderHook(() => useCollapsibleGroups({
            nodes,
            edges: [],
            setNodes,
            takeSnapshot,
        }));

        act(() => result.current.toggleGroupCollapse('group'));

        expect(takeSnapshot).not.toHaveBeenCalled();
        expect(setNodes).toHaveBeenCalledOnce();
        expect(getCurrentNodes()).toBe(nodes);
    });

    it('keeps container relationships intact while hiding descendants by presentation class', () => {
        const container = group({ data: { collapsed: true } });
        const child: Node = {
            id: 'child',
            parentId: container.id,
            position: { x: 20, y: 80 },
            data: {},
        };
        const { result } = renderHook(() => useCollapsibleGroups({
            nodes: [container, child],
            edges: [],
            setNodes: vi.fn() as unknown as React.Dispatch<React.SetStateAction<Node[]>>,
        }));

        expect(result.current.nodesWithCollapseState[0]?.id).toBe('group');
        expect(result.current.nodesWithCollapseState[0]?.hidden).toBeFalsy();
        expect(result.current.nodesWithCollapseState[0]?.className).toBeUndefined();
        expect(result.current.nodesWithCollapseState[1]).toMatchObject({
            id: 'child',
            hidden: true,
            className: 'vizly-collapse-hidden',
            parentId: 'group',
        });
    });

    it('uses the live store state when the rendered hook props are temporarily stale', () => {
        const liveGroup = group({ style: { width: 420, height: 280 } });
        const { setNodes, getCurrentNodes } = createSetNodesHarness([liveGroup]);
        const takeSnapshot = vi.fn();
        const nodesRef = { current: [] as Node[] };
        const { result } = renderHook(() => useCollapsibleGroups({
            nodes: [],
            edges: [],
            nodesRef,
            setNodes,
            takeSnapshot,
        }));

        act(() => result.current.toggleGroupCollapse('group'));

        expect(takeSnapshot).toHaveBeenCalledWith([liveGroup], []);
        expect(getCurrentNodes()).toEqual([
            expect.objectContaining({
                id: 'group',
                data: expect.objectContaining({ collapsed: true }),
            }),
        ]);
        expect(nodesRef.current).toHaveLength(1);
    });
});
