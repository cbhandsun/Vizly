// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { MindElixirInstance, NodeObj, Topic } from 'mind-elixir';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMindMapFloatingSelection } from '../useMindMapFloatingSelection';

type SelectionListener = (payload?: unknown) => void;

const createFixture = () => {
    const listeners = new Map<string, Set<SelectionListener>>();
    const container = document.createElement('div');
    const firstTopic = document.createElement('me-tpc') as unknown as Topic;
    const secondTopic = document.createElement('me-tpc') as unknown as Topic;
    firstTopic.dataset.nodeid = 'node-1';
    secondTopic.dataset.nodeid = 'node-2';
    container.append(firstTopic, secondTopic);
    document.body.append(container);

    const firstNode: NodeObj = { id: 'node-1', topic: 'First node' };
    const secondNode: NodeObj = { id: 'node-2', topic: 'Second node' };
    const root: NodeObj = {
        id: 'root',
        topic: 'Root',
        children: [firstNode, secondNode],
    };
    let currentNode: Topic | null = null;
    const addListener = vi.fn((event: string, listener: SelectionListener) => {
        const eventListeners = listeners.get(event) ?? new Set<SelectionListener>();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
    });
    const removeListener = vi.fn((event: string, listener: SelectionListener) => {
        listeners.get(event)?.delete(listener);
    });
    const mind = {
        bus: { addListener, removeListener },
        container,
        findEle: (nodeId: string) => {
            if (nodeId === firstNode.id) return firstTopic;
            if (nodeId === secondNode.id) return secondTopic;
            return null;
        },
        get currentNode() { return currentNode; },
        getData: () => ({ nodeData: root }),
    } as unknown as MindElixirInstance;
    const select = (node: NodeObj, topic: Topic) => {
        currentNode = topic;
        firstTopic.classList.toggle('selected', topic === firstTopic);
        secondTopic.classList.toggle('selected', topic === secondTopic);
        listeners.get('selectNodes')?.forEach(listener => listener([node]));
    };

    return {
        firstNode,
        firstTopic,
        listeners,
        mind,
        secondNode,
        secondTopic,
        select,
    };
};

afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
});

describe('useMindMapFloatingSelection interaction boundary', () => {
    it('keeps a newly positioned toolbar inert until the selecting pointer sequence ends', () => {
        const fixture = createFixture();
        let releaseFrame: FrameRequestCallback | null = null;
        const cancelAnimationFrame = vi.fn();
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            releaseFrame = callback;
            return 17;
        }));
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
        const onSelectionCleared = vi.fn();
        const { result } = renderHook(() => useMindMapFloatingSelection(fixture.mind, onSelectionCleared));

        act(() => fixture.select(fixture.firstNode, fixture.firstTopic));
        expect(result.current.interactionReady).toBe(true);

        act(() => {
            fixture.secondTopic.dispatchEvent(new MouseEvent('pointerdown', {
                bubbles: true,
                button: 0,
            }));
            fixture.select(fixture.secondNode, fixture.secondTopic);
        });
        expect(result.current.interactionReady).toBe(false);
        expect(result.current.position?.nodeId).toBe('node-2');

        act(() => window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 })));
        expect(result.current.interactionReady).toBe(false);

        act(() => releaseFrame?.(0));
        expect(result.current.interactionReady).toBe(true);
        expect(cancelAnimationFrame).not.toHaveBeenCalled();
    });

    it('does not block keyboard or out-of-canvas selection changes', () => {
        const fixture = createFixture();
        const onSelectionCleared = vi.fn();
        const { result } = renderHook(() => useMindMapFloatingSelection(fixture.mind, onSelectionCleared));

        act(() => fixture.select(fixture.firstNode, fixture.firstTopic));
        expect(result.current.interactionReady).toBe(true);

        act(() => {
            document.body.dispatchEvent(new MouseEvent('pointerdown', {
                bubbles: true,
                button: 0,
            }));
            fixture.select(fixture.secondNode, fixture.secondTopic);
        });
        expect(result.current.interactionReady).toBe(true);
    });

    it('cancels a pending release when the toolbar unmounts', () => {
        const fixture = createFixture();
        const cancelAnimationFrame = vi.fn();
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 23));
        vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
        const onSelectionCleared = vi.fn();
        const { unmount } = renderHook(() => useMindMapFloatingSelection(fixture.mind, onSelectionCleared));

        act(() => {
            fixture.firstTopic.dispatchEvent(new MouseEvent('pointerdown', {
                bubbles: true,
                button: 0,
            }));
            fixture.select(fixture.firstNode, fixture.firstTopic);
            window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
        });
        unmount();

        expect(cancelAnimationFrame).toHaveBeenCalledWith(23);
    });
});
