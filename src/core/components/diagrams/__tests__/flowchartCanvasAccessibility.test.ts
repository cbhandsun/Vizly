import { describe, expect, it } from 'vitest';

import {
    addFlowchartAccessibilityLabels,
    createFlowchartAccessibilityProjectionCache,
} from '../flowchartCanvasAccessibility';

describe('flowchart canvas accessibility', () => {
    it('adds visible node and edge labels', () => {
        const result = addFlowchartAccessibilityLabels(
            [{ id: 'node-1', position: { x: 0, y: 0 }, data: { label: '订单' } }],
            [{ id: 'edge-1', source: 'node-1', target: 'node-2', data: { label: '提交' } }],
        );

        expect(result.nodes[0]?.ariaLabel).toBe('订单');
        expect(result.edges[0]?.ariaLabel).toBe('提交');
    });

    it('preserves explicit labels and safely falls back to element ids', () => {
        const result = addFlowchartAccessibilityLabels(
            [{
                id: 'node-1',
                position: { x: 0, y: 0 },
                data: null as unknown as Record<string, unknown>,
                ariaLabel: '自定义节点标签',
            }],
            [{ id: 'edge-1', source: 'node-1', target: 'node-2' }],
        );

        expect(result.nodes[0]?.ariaLabel).toBe('自定义节点标签');
        expect(result.edges[0]?.ariaLabel).toBe('node-1 → node-2');
    });

    it('bounds untrusted edge text', () => {
        const result = addFlowchartAccessibilityLabels(
            [],
            [{
                id: 'edge-1',
                source: 'a',
                target: 'b',
                label: `  ${'x'.repeat(400)}  `,
            }],
        );

        expect(result.edges[0]?.ariaLabel).toHaveLength(256);
    });

    it('preserves projected identities for unchanged graph elements', () => {
        const cache = createFlowchartAccessibilityProjectionCache();
        const unchangedNode = {
            id: 'node-1',
            position: { x: 0, y: 0 },
            data: { label: '订单' },
        };
        const movedNode = {
            id: 'node-2',
            position: { x: 100, y: 0 },
            data: { label: '仓库' },
        };
        const edge = { id: 'edge-1', source: 'node-1', target: 'node-2' };
        const first = addFlowchartAccessibilityLabels(
            [unchangedNode, movedNode],
            [edge],
            cache,
        );
        const second = addFlowchartAccessibilityLabels(
            [unchangedNode, { ...movedNode, position: { x: 120, y: 0 } }],
            [edge],
            cache,
        );

        expect(second.nodes[0]).toBe(first.nodes[0]);
        expect(second.nodes[1]).not.toBe(first.nodes[1]);
        expect(second.edges[0]).toBe(first.edges[0]);
    });

    it('refreshes a cached projection when a mutable source label changes', () => {
        const cache = createFlowchartAccessibilityProjectionCache();
        const node = {
            id: 'node-1',
            position: { x: 0, y: 0 },
            data: { label: '旧标签' },
        };
        const first = addFlowchartAccessibilityLabels([node], [], cache);
        node.data.label = '新标签';
        const second = addFlowchartAccessibilityLabels([node], [], cache);

        expect(second.nodes[0]?.ariaLabel).toBe('新标签');
        expect(second.nodes[0]).not.toBe(first.nodes[0]);
    });
});
