import type { NodeObj, Topic } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import { addEditableMindMapChild } from '../mindMapNodeCreation';

const parent = {} as Topic;
const createdTopic = {} as Topic;

describe('addEditableMindMapChild', () => {
    it('adds a safe child, selects it, and immediately starts text editing', async () => {
        const addChild = vi.fn(async (_parent: Topic, _child: NodeObj) => undefined);
        const findEle = vi.fn(() => createdTopic);
        const selectNode = vi.fn();
        const scrollIntoView = vi.fn();
        const editTopic = vi.fn();

        const nodeId = await addEditableMindMapChild({
            addChild,
            findEle,
            selectNode,
            scrollIntoView,
            editTopic,
        }, parent);

        expect(addChild).toHaveBeenCalledTimes(1);
        const call = addChild.mock.calls[0];
        if (!call) throw new Error('Expected addChild to be called');
        const child = call[1];
        expect(child).toMatchObject({ topic: '新节点', children: [] });
        expect(nodeId).toBe(child.id);
        expect(findEle).toHaveBeenCalledWith(child.id);
        expect(selectNode).toHaveBeenCalledWith(createdTopic);
        expect(scrollIntoView).toHaveBeenCalledWith(createdTopic, true);
        expect(editTopic).toHaveBeenCalledWith(createdTopic);
    });

    it('does not edit when the created topic is not available after rendering', async () => {
        const selectNode = vi.fn();
        const scrollIntoView = vi.fn();
        const editTopic = vi.fn();

        await expect(addEditableMindMapChild({
            addChild: vi.fn(async () => undefined),
            findEle: vi.fn(() => null),
            selectNode,
            scrollIntoView,
            editTopic,
        }, parent)).resolves.toBeNull();

        expect(selectNode).not.toHaveBeenCalled();
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(editTopic).not.toHaveBeenCalled();
    });

    it('propagates add failures so the caller can route them through safe logging', async () => {
        const failure = new Error('add failed');

        await expect(addEditableMindMapChild({
            addChild: vi.fn(async () => { throw failure; }),
            findEle: vi.fn(() => createdTopic),
            selectNode: vi.fn(),
            scrollIntoView: vi.fn(),
            editTopic: vi.fn(),
        }, parent)).rejects.toBe(failure);
    });
});
