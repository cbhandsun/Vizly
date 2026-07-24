import { describe, expect, it } from 'vitest';
import {
    cleanMindMapBridgeNode,
    cleanMindMapBridgeSide,
    cleanMindMapChildNode,
    createSafeMindMapNodeId,
} from '../mindmapBridgeSecurity';
import { MINDMAP_MAX_TOPIC_LENGTH } from '../mindmapTreeSanitizer';
import type { NodeObj } from 'mind-elixir';

type ExtendedNode = NodeObj & {
    side?: string;
    branchColor?: string;
};

describe('mindmapBridgeSecurity', () => {
    it('sanitizes external bridge node creation args', () => {
        const node = cleanMindMapBridgeNode({
            label: 'x'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 20),
            side: '<script>',
            branchColor: 'url(javascript:alert(1))',
        }, '<bad-id>') as ExtendedNode;

        expect(node.id).toMatch(/^ai_/);
        expect(node.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
        expect(node.side).toBeUndefined();
        expect(node.branchColor).toBeUndefined();
    });

    it('preserves only supported branch sides', () => {
        expect(cleanMindMapBridgeSide('left')).toBe('left');
        expect(cleanMindMapBridgeSide('right')).toBe('right');
        expect(cleanMindMapBridgeSide('top')).toBeUndefined();
        const node = cleanMindMapBridgeNode({ label: 'Child', side: 'right' }, 'node_safe') as ExtendedNode;
        expect(node.side).toBe('right');
    });

    it('coerces empty and invalid bridge payloads to a safe child', () => {
        expect(cleanMindMapChildNode(null, 'node_null').topic).toBe('新节点');
        expect(cleanMindMapChildNode('invalid', 'node_string').topic).toBe('新节点');
        expect(cleanMindMapChildNode([], 'node_array').topic).toBe('新节点');
    });

    it('creates a safe default child node for UI add-child actions', () => {
        const id = createSafeMindMapNodeId();
        const node = cleanMindMapChildNode({}, id);

        expect(id).toMatch(/^node_\d+_[a-z0-9]+$/);
        expect(node).toMatchObject({
            id,
            topic: '新节点',
            children: [],
        });
    });
});
