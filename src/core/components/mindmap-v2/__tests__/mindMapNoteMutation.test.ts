import type { NodeObj, Topic } from 'mind-elixir';
import { describe, expect, it, vi } from 'vitest';

import { updateMindMapNoteAndRestoreSelection } from '../mindMapNoteMutation';
import { MINDMAP_MAX_NOTE_LENGTH } from '../mindmapTreeSanitizer';

const topic = {} as Topic;
const refreshedTopic = {} as Topic;
const node = { id: 'node-1', topic: 'Node' } as NodeObj;

describe('updateMindMapNoteAndRestoreSelection', () => {
    it('awaits the mutation, sanitizes the note, and restores node selection', async () => {
        const reshapeNode = vi.fn(async (_topic: Topic, _node: NodeObj) => undefined);
        const findEle = vi.fn(() => refreshedTopic);
        const selectNodes = vi.fn();
        const fire = vi.fn();

        await expect(updateMindMapNoteAndRestoreSelection(
            { bus: { fire }, findEle, reshapeNode, selectNodes },
            topic,
            node,
            `  ${'n'.repeat(MINDMAP_MAX_NOTE_LENGTH + 20)}  `,
        )).resolves.toBe(true);

        expect(reshapeNode).toHaveBeenCalledTimes(1);
        expect(reshapeNode.mock.calls[0]?.[1].note).toHaveLength(MINDMAP_MAX_NOTE_LENGTH);
        expect(findEle).toHaveBeenCalledTimes(2);
        expect(findEle).toHaveBeenNthCalledWith(1, 'node-1');
        expect(findEle).toHaveBeenNthCalledWith(2, 'node-1');
        expect(selectNodes).toHaveBeenCalledTimes(2);
        expect(selectNodes).toHaveBeenNthCalledWith(1, [refreshedTopic]);
        expect(selectNodes).toHaveBeenNthCalledWith(2, [refreshedTopic]);
        expect(fire).toHaveBeenCalledTimes(2);
        expect(fire).toHaveBeenNthCalledWith(1, 'selectNodes', [node]);
        expect(fire).toHaveBeenNthCalledWith(2, 'selectNodes', [node]);
    });

    it('reports a missing refreshed topic without selecting a stale element', async () => {
        const selectNodes = vi.fn();
        await expect(updateMindMapNoteAndRestoreSelection(
            { bus: { fire: vi.fn() }, findEle: () => null, reshapeNode: () => undefined, selectNodes },
            topic,
            node,
            undefined,
        )).resolves.toBe(false);
        expect(selectNodes).not.toHaveBeenCalled();
    });

    it('reports a topic removed during render reconciliation', async () => {
        const selectNodes = vi.fn();
        const findEle = vi.fn()
            .mockReturnValueOnce(refreshedTopic)
            .mockReturnValueOnce(null);
        await expect(updateMindMapNoteAndRestoreSelection(
            { bus: { fire: vi.fn() }, findEle, reshapeNode: () => undefined, selectNodes },
            topic,
            node,
            'note',
        )).resolves.toBe(false);
        expect(selectNodes).toHaveBeenCalledTimes(1);
    });

    it('propagates mutation failures and does not attempt selection', async () => {
        const findEle = vi.fn(() => refreshedTopic);
        await expect(updateMindMapNoteAndRestoreSelection(
            {
                bus: { fire: vi.fn() },
                findEle,
                reshapeNode: async () => { throw new Error('reshape failed'); },
                selectNodes: vi.fn(),
            },
            topic,
            node,
            'note',
        )).rejects.toThrow('reshape failed');
        expect(findEle).not.toHaveBeenCalled();
    });
});
