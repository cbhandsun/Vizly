import { describe, expect, it } from 'vitest';

import { resolveMindMapContextNodeId } from '../mindMapContextNodeId';

const tree = {
    id: 'root',
    topic: 'Root',
    children: [{
        id: 'node_123',
        topic: 'Child',
        children: [],
    }],
};

describe('resolveMindMapContextNodeId', () => {
    it('accepts a canonical node id', () => {
        expect(resolveMindMapContextNodeId(tree, ['node_123'])).toBe('node_123');
    });

    it('removes Mind Elixir DOM prefixes only when the resulting id exists', () => {
        expect(resolveMindMapContextNodeId(tree, ['menode_123'])).toBe('node_123');
        expect(resolveMindMapContextNodeId(tree, ['meroot'])).toBe('root');
        expect(resolveMindMapContextNodeId(tree, ['meunknown'])).toBeNull();
    });

    it('falls back across bounded candidates', () => {
        expect(resolveMindMapContextNodeId(tree, [null, 'missing', 'node_123'])).toBe('node_123');
    });

    it('rejects empty, wrong-type, and oversized ids', () => {
        expect(resolveMindMapContextNodeId(tree, ['', 42, {}])).toBeNull();
        expect(resolveMindMapContextNodeId(tree, ['x'.repeat(257)])).toBeNull();
    });
});
