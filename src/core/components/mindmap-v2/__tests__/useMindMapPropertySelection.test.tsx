// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { MindElixirInstance, NodeObj, Topic } from 'mind-elixir';
import { afterEach, describe, expect, it } from 'vitest';

import { useMindMapPropertySelection } from '../useMindMapPropertySelection';
import { setActiveMindMapSelection } from '../mindMapSelectionStore';

afterEach(() => setActiveMindMapSelection(null));

const createMind = () => {
    const root = {
        id: 'root',
        topic: 'Root',
        children: [{ id: 'node-1', topic: 'Selected node' }],
    } as NodeObj;
    const container = document.createElement('div');
    const topic = document.createElement('me-tpc') as unknown as Topic;
    topic.dataset.nodeid = 'node-1';
    topic.classList.add('selected');
    container.append(topic);
    let currentTopic: Topic | null = topic;
    const mind = {
        container,
        findEle: (nodeId: string) => nodeId === 'node-1' ? topic : null,
        get currentNode() { return currentTopic; },
        getData: () => ({ nodeData: root }),
    } as unknown as MindElixirInstance;
    const clearSelection = () => {
        currentTopic = null;
        topic.classList.remove('selected');
    };
    return { clearSelection, mind, root };
};

describe('useMindMapPropertySelection', () => {
    it('hydrates an already-selected node when the property panel mounts later', async () => {
        const fixture = createMind();
        const { result } = renderHook(() => useMindMapPropertySelection(fixture.mind));

        await waitFor(() => expect(result.current?.id).toBe('node-1'));
        expect(result.current?.topic).toBe('Selected node');
    });

    it('reads the selection captured by the active canvas before the panel mounts', () => {
        const fixture = createMind();
        const selectedNode = fixture.root.children?.[0] ?? null;
        fixture.clearSelection();
        setActiveMindMapSelection(selectedNode);

        const { result } = renderHook(() => useMindMapPropertySelection(fixture.mind));
        expect(result.current).toBe(selectedNode);
    });

    it('ignores transient unselect events but clears a genuine canvas deselection', async () => {
        const fixture = createMind();
        const selectedNode = fixture.root.children?.[0] ?? null;
        setActiveMindMapSelection(selectedNode);
        const { result } = renderHook(() => useMindMapPropertySelection(fixture.mind));
        await waitFor(() => expect(result.current?.id).toBe('node-1'));

        act(() => setActiveMindMapSelection(null));
        expect(result.current?.id).toBe('node-1');

        act(() => setActiveMindMapSelection(selectedNode));
        fixture.clearSelection();
        act(() => setActiveMindMapSelection(null));
        expect(result.current).toBeNull();
    });
});
