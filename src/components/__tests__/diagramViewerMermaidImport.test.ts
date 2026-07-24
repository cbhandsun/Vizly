// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
    importMermaidGraphToBridge,
    MERMAID_IMPORT_MAX_NODES,
} from '../diagramViewerMermaidImport';

describe('diagramViewerMermaidImport', () => {
    it('validates and imports nodes before edges', async () => {
        const calls: string[] = [];
        const addNode = vi.fn(async () => { calls.push('node'); });
        const connectNodes = vi.fn(async () => { calls.push('edge'); });

        await importMermaidGraphToBridge({
            bridge: { addNode, connectNodes },
            nodes: [{
                id: 'service-a',
                data: { label: 'Service A', type: 'service', shape: 'rectangle' },
                parentId: 'group-1',
                position: { x: 10, y: 20 },
            }],
            edges: [{ source: 'service-a', target: 'service-b', label: 'calls' }],
        });

        expect(addNode).toHaveBeenCalledWith({
            id: 'service-a',
            label: 'Service A',
            type: 'service',
            shape: 'rectangle',
            parentId: 'group-1',
            position: { x: 10, y: 20 },
        });
        expect(connectNodes).toHaveBeenCalledWith({
            source: 'service-a',
            target: 'service-b',
            label: 'calls',
        });
        expect(calls).toEqual(['node', 'edge']);
    });

    it.each([
        { nodes: null, edges: [], message: 'node collection' },
        { nodes: [{ id: '__proto__', data: {} }], edges: [], message: 'node payload' },
        { nodes: [{ id: 'a', data: { label: 'x'.repeat(1_001) } }], edges: [], message: 'node payload' },
        { nodes: [], edges: [{ source: 'a', target: '' }], message: 'edge payload' },
    ])('rejects invalid boundary input: $message', async ({ nodes, edges, message }) => {
        await expect(importMermaidGraphToBridge({
            bridge: { addNode: vi.fn() },
            nodes,
            edges,
        })).rejects.toThrow(message);
    });

    it('rejects extreme collection sizes before invoking the bridge', async () => {
        const addNode = vi.fn();
        await expect(importMermaidGraphToBridge({
            bridge: { addNode },
            nodes: new Array(MERMAID_IMPORT_MAX_NODES + 1).fill(null),
            edges: [],
        })).rejects.toThrow('node collection');
        expect(addNode).not.toHaveBeenCalled();
    });

    it('allows an empty import and a bridge without edge support', async () => {
        const addNode = vi.fn();
        await expect(importMermaidGraphToBridge({
            bridge: { addNode },
            nodes: [],
            edges: [],
        })).resolves.toBeUndefined();
        expect(addNode).not.toHaveBeenCalled();
    });
});
