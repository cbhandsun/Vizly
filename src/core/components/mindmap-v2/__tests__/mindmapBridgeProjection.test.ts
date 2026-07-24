import { describe, expect, it } from 'vitest';
import type { NodeObj } from 'mind-elixir';

import { projectMindMapTreeToBridge } from '../mindmapBridgeProjection';

describe('projectMindMapTreeToBridge', () => {
    it('projects node metadata, depth, parent ids, and edges', () => {
        const root: NodeObj = {
            id: 'root',
            topic: 'Root',
            children: [{
                id: 'child',
                topic: 'Child',
                note: 'Note',
                hyperLink: 'https://example.com',
                tags: ['tag', { text: ' styled ', className: 'tag' }, { text: '  ' }],
                icons: ['star'],
                children: [],
            }],
        };

        const result = projectMindMapTreeToBridge(root);

        expect(result.nodes).toEqual([
            { id: 'root', type: 'mindmap', data: { label: 'Root', depth: 0 } },
            {
                id: 'child',
                type: 'mindmap',
                data: {
                    label: 'Child',
                    depth: 1,
                    side: 'right',
                    parentId: 'root',
                    note: 'Note',
                    url: 'https://example.com',
                    tags: ['tag', 'styled'],
                    icons: ['star'],
                },
            },
        ]);
        expect(result.edges).toEqual([{ id: 'edge_root_child', source: 'root', target: 'child' }]);
    });

    it('inherits only valid branch sides from runtime extensions', () => {
        const root = {
            id: 'root',
            topic: 'Root',
            children: [
                { id: 'left', topic: 'Left', side: 'left', children: [{ id: 'nested', topic: 'Nested' }] },
                { id: 'unsafe', topic: 'Unsafe', side: 'center', children: [] },
            ],
        } as unknown as NodeObj;

        const result = projectMindMapTreeToBridge(root);

        expect(result.nodes.find((node) => node.id === 'left')?.data.side).toBe('left');
        expect(result.nodes.find((node) => node.id === 'nested')?.data.side).toBe('left');
        expect(result.nodes.find((node) => node.id === 'unsafe')?.data.side).toBe('right');
    });
});
