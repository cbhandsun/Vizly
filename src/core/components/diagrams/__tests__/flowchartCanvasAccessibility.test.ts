import { describe, expect, it } from 'vitest';

import { addFlowchartAccessibilityLabels } from '../flowchartCanvasAccessibility';

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
});
