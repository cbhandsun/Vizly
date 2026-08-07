import type { Topic } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import {
    resolveSelectedMindMapTopic,
    resolveMindMapNodeAfterSelectionSettles,
    restoreCurrentMindMapSelectionAfterMutation,
} from '../mindMapFloatingSelection';

const topicWithSelectedState = (selected: boolean): Topic => ({
    classList: { contains: vi.fn(() => selected) },
} as unknown as Topic);

const selectionContainer = (topic: Topic | null = null) => ({
    querySelector: vi.fn(() => topic),
});

describe('resolveSelectedMindMapTopic', () => {
    it('prefers the authoritative current topic', () => {
        const currentNode = topicWithSelectedState(false);
        expect(resolveSelectedMindMapTopic({
            currentNode,
            container: selectionContainer(),
            findEle: vi.fn(),
        }, 'fallback'))
            .toBe(currentNode);
    });

    it('recovers a visibly selected topic while Mind Elixir selection state settles', () => {
        const fallback = topicWithSelectedState(true);
        expect(resolveSelectedMindMapTopic({
            currentNode: null,
            container: selectionContainer(),
            findEle: () => fallback,
        }, 'node-1'))
            .toBe(fallback);
    });

    it('recovers the instance-scoped selected topic after a transient empty event', () => {
        const selectedTopic = topicWithSelectedState(true);
        expect(resolveSelectedMindMapTopic({
            currentNode: null,
            container: selectionContainer(selectedTopic),
            findEle: () => null,
        }, null)).toBe(selectedTopic);
    });

    it('does not revive a deselected, missing, or failed fallback topic', () => {
        expect(resolveSelectedMindMapTopic({
            currentNode: null,
            container: selectionContainer(),
            findEle: () => topicWithSelectedState(false),
        }, 'node-1')).toBeNull();
        expect(resolveSelectedMindMapTopic({
            currentNode: null,
            container: selectionContainer(),
            findEle: () => null,
        }, null)).toBeNull();
        expect(resolveSelectedMindMapTopic({
            currentNode: null,
            container: selectionContainer(),
            findEle: () => { throw new Error('missing'); },
        }, 'node-1')).toBeNull();
    });

    it('republishes the selected duplicate after a canvas mutation settles', async () => {
        const selectedTopic = topicWithSelectedState(true);
        Object.assign(selectedTopic, { dataset: { nodeid: 'copy-1' } });
        const selectNodes = vi.fn();
        const fire = vi.fn();
        const copiedNode = { id: 'copy-1', topic: 'Copy' };

        await expect(restoreCurrentMindMapSelectionAfterMutation({
            currentNode: selectedTopic,
            container: selectionContainer(selectedTopic),
            findEle: () => selectedTopic,
            getData: () => ({ nodeData: copiedNode }),
            selectNodes,
            bus: { fire },
        })).resolves.toEqual(copiedNode);

        expect(selectNodes).toHaveBeenCalledTimes(3);
        expect(fire).toHaveBeenCalledWith('selectNodes', [copiedNode]);
    });

    it('waits through transient empty selection frames before clearing the toolbar', async () => {
        const selectedTopic = topicWithSelectedState(true);
        Object.assign(selectedTopic, { dataset: { nodeid: 'copy-1' } });
        const querySelector = vi.fn()
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(selectedTopic);
        const copiedNode = { id: 'copy-1', topic: 'Copy' };

        await expect(resolveMindMapNodeAfterSelectionSettles({
            currentNode: null,
            container: { querySelector },
            findEle: () => null,
            getData: () => ({ nodeData: copiedNode }),
            selectNodes: vi.fn(),
            bus: { fire: vi.fn() },
        })).resolves.toEqual(copiedNode);
        expect(querySelector).toHaveBeenCalledTimes(3);
    });
});
