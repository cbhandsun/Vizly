import { describe, expect, it } from 'vitest';
import {
    cleanMindMapBridgeNode,
    cleanMindMapBridgeSide,
    cleanMindMapChildNode,
    createSafeMindMapNodeId,
} from '../mindmapBridgeSecurity';
import { MINDMAP_MAX_TOPIC_LENGTH } from '../mindmapTreeSanitizer';

describe('mindmapBridgeSecurity', () => {
    it('sanitizes external bridge node creation args', () => {
        const node = cleanMindMapBridgeNode({
            label: 'x'.repeat(MINDMAP_MAX_TOPIC_LENGTH + 20),
            side: '<script>',
            branchColor: 'url(javascript:alert(1))',
        } as any, '<bad-id>');

        expect(node.id).toMatch(/^ai_/);
        expect(node.topic).toHaveLength(MINDMAP_MAX_TOPIC_LENGTH);
        expect((node as any).side).toBeUndefined();
        expect((node as any).branchColor).toBeUndefined();
    });

    it('preserves only supported branch sides', () => {
        expect(cleanMindMapBridgeSide('left')).toBe('left');
        expect(cleanMindMapBridgeSide('right')).toBe('right');
        expect(cleanMindMapBridgeSide('top')).toBeUndefined();
        expect((cleanMindMapBridgeNode({ label: 'Child', side: 'right' }, 'node_safe') as any).side).toBe('right');
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
