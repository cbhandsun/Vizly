// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MindElixirData, MindElixirInstance, NodeObj } from 'mind-elixir';

import {
    getMindMapTreeExpansionAvailability,
    useMindMapTreeExpansionAvailability,
} from '../useMindMapTreeExpansionAvailability';

const createTree = (states: boolean[]): NodeObj => ({
    id: 'root',
    topic: 'Root',
    children: states.map((expanded, index) => ({
        id: `branch-${index}`,
        topic: `Branch ${index}`,
        expanded,
        children: [{ id: `leaf-${index}`, topic: `Leaf ${index}` }],
    })),
});

const asMind = (getData: () => MindElixirData): MindElixirInstance => ({
    getData,
} as unknown as MindElixirInstance);

describe('mind map tree expansion availability', () => {
    it('matches actions to fully expanded, fully collapsed, and mixed trees', () => {
        expect(getMindMapTreeExpansionAvailability(asMind(() => ({ nodeData: createTree([true, true]) })))).toEqual({
            canCollapse: true,
            canExpand: false,
        });
        expect(getMindMapTreeExpansionAvailability(asMind(() => ({ nodeData: createTree([false, false]) })))).toEqual({
            canCollapse: false,
            canExpand: true,
        });
        expect(getMindMapTreeExpansionAvailability(asMind(() => ({ nodeData: createTree([true, false]) })))).toEqual({
            canCollapse: true,
            canExpand: true,
        });
    });

    it('fails closed for missing, leaf-only, and invalid tree state', () => {
        expect(getMindMapTreeExpansionAvailability(null)).toEqual({ canCollapse: false, canExpand: false });
        expect(getMindMapTreeExpansionAvailability(asMind(() => ({
            nodeData: { id: 'root', topic: 'Root' },
        })))).toEqual({ canCollapse: false, canExpand: false });
        expect(getMindMapTreeExpansionAvailability(asMind(() => {
            throw new Error('unavailable');
        }))).toEqual({ canCollapse: false, canExpand: false });
    });

    it('updates for native branch toggles and transaction operations, then detaches listeners', () => {
        const listeners = new Map<string, Set<() => void>>();
        let data: MindElixirData = { nodeData: createTree([true]) };
        const addListener = vi.fn((event: string, listener: () => void) => {
            const eventListeners = listeners.get(event) ?? new Set<() => void>();
            eventListeners.add(listener);
            listeners.set(event, eventListeners);
        });
        const removeListener = vi.fn((event: string, listener: () => void) => {
            listeners.get(event)?.delete(listener);
        });
        const mind = {
            bus: { addListener, removeListener },
            getData: () => data,
        } as unknown as MindElixirInstance;
        const { result, unmount } = renderHook(() => useMindMapTreeExpansionAvailability(mind));

        expect(result.current).toEqual({ canCollapse: true, canExpand: false });

        act(() => {
            data = { nodeData: createTree([false]) };
            listeners.get('expandNode')?.forEach(listener => listener());
        });
        expect(result.current).toEqual({ canCollapse: false, canExpand: true });

        act(() => {
            data = { nodeData: createTree([true, false]) };
            listeners.get('operation')?.forEach(listener => listener());
        });
        expect(result.current).toEqual({ canCollapse: true, canExpand: true });

        unmount();
        expect(removeListener).toHaveBeenCalledTimes(2);
        expect(listeners.get('operation')).toHaveLength(0);
        expect(listeners.get('expandNode')).toHaveLength(0);
    });
});
