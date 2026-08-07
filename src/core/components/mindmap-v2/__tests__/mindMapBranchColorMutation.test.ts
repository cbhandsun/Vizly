import type { NodeObj, Topic } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import { updateMindMapBranchColorAndRestoreSelection } from '../mindMapBranchColorMutation';

const topic = {} as Topic;
const refreshedTopic = {} as Topic;
const node = { id: 'node-1', topic: 'Node', branchColor: '#6366f1' } as NodeObj;

describe('updateMindMapBranchColorAndRestoreSelection', () => {
    it('awaits the mutation, applies an allowed color, and restores node selection', async () => {
        const reshapeNode = vi.fn(async (_topic: Topic, _node: NodeObj) => undefined);
        const findEle = vi.fn(() => refreshedTopic);
        const selectNodes = vi.fn();
        const fire = vi.fn();

        await expect(updateMindMapBranchColorAndRestoreSelection(
            { bus: { fire }, findEle, reshapeNode, selectNodes },
            topic,
            node,
            '#ef4444',
        )).resolves.toBe(true);

        expect(reshapeNode).toHaveBeenCalledWith(topic, expect.objectContaining({ branchColor: '#ef4444' }));
        expect(selectNodes).toHaveBeenCalledTimes(3);
        expect(fire).toHaveBeenNthCalledWith(1, 'selectNodes', [expect.objectContaining({ branchColor: '#ef4444' })]);
        expect(fire).toHaveBeenNthCalledWith(2, 'selectNodes', [expect.objectContaining({ branchColor: '#ef4444' })]);
        expect(fire).toHaveBeenNthCalledWith(3, 'selectNodes', [expect.objectContaining({ branchColor: '#ef4444' })]);
    });

    it('clears the explicit color for the inherit-theme option', async () => {
        const reshapeNode = vi.fn();

        await updateMindMapBranchColorAndRestoreSelection(
            {
                bus: { fire: vi.fn() },
                findEle: () => refreshedTopic,
                reshapeNode,
                selectNodes: vi.fn(),
            },
            topic,
            node,
            undefined,
        );

        expect(reshapeNode.mock.calls[0]?.[1]).toHaveProperty('branchColor', undefined);
    });

    it('sanitizes unsafe color input before it reaches Mind Elixir', async () => {
        const reshapeNode = vi.fn();

        await updateMindMapBranchColorAndRestoreSelection(
            {
                bus: { fire: vi.fn() },
                findEle: () => refreshedTopic,
                reshapeNode,
                selectNodes: vi.fn(),
            },
            topic,
            node,
            'url(javascript:alert(1))',
        );

        expect(reshapeNode.mock.calls[0]?.[1]).toHaveProperty('branchColor', undefined);
    });

    it('reconciles selection when the refreshed topic appears on a later render frame', async () => {
        const selectNodes = vi.fn();
        const findEle = vi.fn()
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(refreshedTopic);

        await expect(updateMindMapBranchColorAndRestoreSelection(
            {
                bus: { fire: vi.fn() },
                findEle,
                reshapeNode: vi.fn(),
                selectNodes,
            },
            topic,
            node,
            undefined,
        )).resolves.toBe(true);
        expect(selectNodes).toHaveBeenCalledWith([refreshedTopic]);
    });

    it('does not select a stale element when mutation or remount fails', async () => {
        const selectNodes = vi.fn();
        await expect(updateMindMapBranchColorAndRestoreSelection(
            {
                bus: { fire: vi.fn() },
                findEle: () => null,
                reshapeNode: vi.fn(),
                selectNodes,
            },
            topic,
            node,
            '#22c55e',
        )).resolves.toBe(false);
        expect(selectNodes).not.toHaveBeenCalled();

        const findEle = vi.fn();
        await expect(updateMindMapBranchColorAndRestoreSelection(
            {
                bus: { fire: vi.fn() },
                findEle,
                reshapeNode: async () => { throw new Error('reshape failed'); },
                selectNodes,
            },
            topic,
            node,
            '#22c55e',
        )).rejects.toThrow('reshape failed');
        expect(findEle).not.toHaveBeenCalled();
    });
});
