import type { NodeObj, Topic } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import { updateMindMapNodePatchAndRestoreSelection } from '../mindMapNodeMutation';

const topic = {} as Topic;
const refreshedTopic = {} as Topic;
const node = { id: 'node-1', topic: 'Node' } as NodeObj;

describe('updateMindMapNodePatchAndRestoreSelection', () => {
    it('awaits the shape mutation and restores the selected node across render frames', async () => {
        const reshapeNode = vi.fn(async (_topic: Topic, _node: NodeObj) => undefined);
        const selectNodes = vi.fn();
        const fire = vi.fn();

        const result = await updateMindMapNodePatchAndRestoreSelection(
            { bus: { fire }, findEle: () => refreshedTopic, reshapeNode, selectNodes },
            topic,
            node,
            { shapeClass: 'oval' },
        );

        expect(result).toEqual({
            nextNode: expect.objectContaining({ id: 'node-1', shapeClass: 'oval' }),
            restored: true,
        });
        expect(reshapeNode).toHaveBeenCalledWith(topic, expect.objectContaining({ shapeClass: 'oval' }));
        expect(selectNodes).toHaveBeenCalledTimes(3);
        expect(fire).toHaveBeenCalledTimes(3);
    });

    it('supports resetting a shape to the theme default', async () => {
        const reshapeNode = vi.fn();
        await updateMindMapNodePatchAndRestoreSelection(
            { bus: { fire: vi.fn() }, findEle: () => refreshedTopic, reshapeNode, selectNodes: vi.fn() },
            topic,
            { ...node, shapeClass: 'diamond' } as NodeObj,
            { shapeClass: undefined },
        );
        expect(reshapeNode.mock.calls[0]?.[1]).toHaveProperty('shapeClass', undefined);
    });

    it('sanitizes unsafe shape input before it reaches Mind Elixir', async () => {
        const reshapeNode = vi.fn();
        await updateMindMapNodePatchAndRestoreSelection(
            { bus: { fire: vi.fn() }, findEle: () => refreshedTopic, reshapeNode, selectNodes: vi.fn() },
            topic,
            node,
            { shapeClass: 'url(javascript:alert(1))' },
        );
        expect(reshapeNode.mock.calls[0]?.[1]).toHaveProperty('shapeClass', undefined);
    });

    it('recovers when the refreshed topic appears late and reports a missing remount', async () => {
        const delayedFind = vi.fn()
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(refreshedTopic);
        await expect(updateMindMapNodePatchAndRestoreSelection(
            { bus: { fire: vi.fn() }, findEle: delayedFind, reshapeNode: vi.fn(), selectNodes: vi.fn() },
            topic,
            node,
            { shapeClass: 'rect' },
        )).resolves.toMatchObject({ restored: true });

        await expect(updateMindMapNodePatchAndRestoreSelection(
            { bus: { fire: vi.fn() }, findEle: () => null, reshapeNode: vi.fn(), selectNodes: vi.fn() },
            topic,
            node,
            { shapeClass: 'rect' },
        )).resolves.toMatchObject({ restored: false });
    });

    it('propagates mutation failures without publishing a false selection', async () => {
        const findEle = vi.fn();
        await expect(updateMindMapNodePatchAndRestoreSelection(
            {
                bus: { fire: vi.fn() },
                findEle,
                reshapeNode: async () => { throw new Error('reshape failed'); },
                selectNodes: vi.fn(),
            },
            topic,
            node,
            { shapeClass: 'rect' },
        )).rejects.toThrow('reshape failed');
        expect(findEle).not.toHaveBeenCalled();
    });

    it('serializes rapid mutations and merges each patch over the last committed node', async () => {
        let releaseFirst: (() => void) | undefined;
        const firstPending = new Promise<void>(resolve => { releaseFirst = resolve; });
        const reshapeNode = vi.fn()
            .mockImplementationOnce(async () => firstPending)
            .mockResolvedValue(undefined);
        const mind = {
            bus: { fire: vi.fn() },
            findEle: () => refreshedTopic,
            reshapeNode,
            selectNodes: vi.fn(),
        };

        const first = updateMindMapNodePatchAndRestoreSelection(
            mind,
            topic,
            node,
            { note: 'First', style: { fontSize: '18px' } },
        );
        const second = updateMindMapNodePatchAndRestoreSelection(
            mind,
            topic,
            node,
            { branchColor: '#6366f1', style: { color: '#6366f1' } },
        );

        await Promise.resolve();
        expect(reshapeNode).toHaveBeenCalledTimes(1);
        releaseFirst?.();
        await expect(first).resolves.toMatchObject({ restored: true });
        const secondResult = await second;

        expect(reshapeNode).toHaveBeenCalledTimes(2);
        expect(secondResult.nextNode).toMatchObject({
            note: 'First',
            branchColor: '#6366f1',
            style: {
                color: '#6366f1',
                fontSize: '18px',
            },
        });
    });

    it('preserves a committed text color when a rapid background patch follows', async () => {
        let releaseFirst: (() => void) | undefined;
        const firstPending = new Promise<void>(resolve => { releaseFirst = resolve; });
        const reshapeNode = vi.fn()
            .mockImplementationOnce(async () => firstPending)
            .mockResolvedValue(undefined);
        const mind = {
            bus: { fire: vi.fn() },
            findEle: () => refreshedTopic,
            reshapeNode,
            selectNodes: vi.fn(),
        };
        const styledNode = {
            ...node,
            style: { color: '#111827', background: '#ffffff', fontSize: '14px' },
        } as NodeObj;

        const textColor = updateMindMapNodePatchAndRestoreSelection(
            mind,
            topic,
            styledNode,
            { style: { color: '#6366f1' } },
        );
        const background = updateMindMapNodePatchAndRestoreSelection(
            mind,
            topic,
            styledNode,
            { style: { background: '#fef3c7' } },
        );

        await Promise.resolve();
        releaseFirst?.();
        await textColor;
        const result = await background;

        expect(result.nextNode.style).toEqual({
            color: '#6366f1',
            background: '#fef3c7',
            fontSize: '14px',
        });
    });

    it('continues the queue after a failed mutation without replaying its patch', async () => {
        const reshapeNode = vi.fn()
            .mockRejectedValueOnce(new Error('first failed'))
            .mockResolvedValueOnce(undefined);
        const mind = {
            bus: { fire: vi.fn() },
            findEle: () => refreshedTopic,
            reshapeNode,
            selectNodes: vi.fn(),
        };

        const first = updateMindMapNodePatchAndRestoreSelection(
            mind,
            topic,
            node,
            { note: 'Should not persist' },
        );
        const second = updateMindMapNodePatchAndRestoreSelection(
            mind,
            topic,
            node,
            { branchColor: '#6366f1' },
        );

        await expect(first).rejects.toThrow('first failed');
        const secondResult = await second;
        expect(secondResult.nextNode).toMatchObject({ branchColor: '#6366f1' });
        expect(secondResult.nextNode).not.toHaveProperty('note');
    });
});
