import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { CommentThread } from '../../store/useDiagramStore';
import {
    createDiagramCollaborationSliceSync,
    syncDiagramCollaborationMap,
} from '../useDiagramCollaboration';

describe('createDiagramCollaborationSliceSync', () => {
    it('updates only the slice whose Yjs type changed', () => {
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const setComments = vi.fn();
        const sync = createDiagramCollaborationSliceSync({
            setNodes,
            setEdges,
            setComments,
        });
        const comment: CommentThread = {
            id: 'comment-1',
            x: 10,
            y: 20,
            authorId: 'user-1',
            authorName: 'User',
            authorColor: '#1677ff',
            content: 'Review this',
            createdAt: 1,
            isResolved: false,
            color: '#facc15',
            replies: [],
        };

        sync.comments([comment]);

        expect(setComments).toHaveBeenCalledWith([comment]);
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
    });

    it('materializes iterable node and edge snapshots without cross-updating comments', () => {
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const setComments = vi.fn();
        const sync = createDiagramCollaborationSliceSync({
            setNodes,
            setEdges,
            setComments,
        });
        const nodes: Node[] = [
            { id: 'node-1', position: { x: 0, y: 0 }, data: {} },
        ];
        const edges: Edge[] = [
            { id: 'edge-1', source: 'node-1', target: 'node-2' },
        ];

        sync.nodes(nodes.values());
        sync.edges(edges.values());

        expect(setNodes).toHaveBeenCalledWith(nodes);
        expect(setEdges).toHaveBeenCalledWith(edges);
        expect(setComments).not.toHaveBeenCalled();
    });
});

describe('syncDiagramCollaborationMap', () => {
    it('adds, updates, and removes entries without rewriting equal values', () => {
        const values = new Map<string, { id: string; value: number }>([
            ['same', { id: 'same', value: 1 }],
            ['changed', { id: 'changed', value: 1 }],
            ['removed', { id: 'removed', value: 1 }],
        ]);
        const target = {
            get: (id: string) => values.get(id),
            set: vi.fn((id: string, value: { id: string; value: number }) => values.set(id, value)),
            delete: vi.fn((id: string) => values.delete(id)),
            forEach: (callback: (value: { id: string; value: number }, id: string) => void) => {
                values.forEach(callback);
            },
        };

        syncDiagramCollaborationMap(target, [
            { id: 'same', value: 1 },
            { id: 'changed', value: 2 },
            { id: 'added', value: 3 },
        ]);

        expect(target.set).toHaveBeenCalledTimes(2);
        expect(target.set).toHaveBeenCalledWith('changed', { id: 'changed', value: 2 });
        expect(target.set).toHaveBeenCalledWith('added', { id: 'added', value: 3 });
        expect(target.delete).toHaveBeenCalledWith('removed');
        expect([...values.values()]).toEqual([
            { id: 'same', value: 1 },
            { id: 'changed', value: 2 },
            { id: 'added', value: 3 },
        ]);
    });

    it('does not serialize entries whose references are already synchronized', () => {
        const shared = { id: 'same', value: 1 };
        const values = new Map([['same', shared]]);
        const stringify = vi.spyOn(JSON, 'stringify');

        syncDiagramCollaborationMap({
            get: (id) => values.get(id),
            set: vi.fn((id, value) => values.set(id, value)),
            delete: vi.fn((id) => values.delete(id)),
            forEach: (callback) => values.forEach(callback),
        }, [shared]);

        expect(stringify).not.toHaveBeenCalled();
        stringify.mockRestore();
    });
});
