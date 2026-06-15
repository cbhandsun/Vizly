import { describe, it, expect } from 'vitest';
import {
    toMermaid,
    fromMermaid,
    MERMAID_CONVERTER_MAX_CHARS,
    MERMAID_CONVERTER_MAX_EDGES,
    MERMAID_CONVERTER_MAX_LABEL_CHARS,
    MERMAID_CONVERTER_MAX_NODES,
    MERMAID_EXPORT_MAX_EDGES,
    MERMAID_EXPORT_MAX_NODES,
} from '../mermaidConverter';
import { Node, Edge } from '@xyflow/react';

describe('mermaidConverter', () => {
    describe('toMermaid', () => {
        it('should render a basic flowchart', () => {
            const nodes: Node[] = [
                { id: 'A', data: { label: 'Start' }, position: { x: 0, y: 0 } },
                { id: 'B', data: { label: 'End', shape: 'pill' }, position: { x: 100, y: 0 } },
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'A', target: 'B', label: 'to' }
            ];
            const result = toMermaid(nodes, edges);
            expect(result).toContain('flowchart TD');
            expect(result).toContain('A["Start"]');
            expect(result).toContain('B(["End"])');
            expect(result).toContain('A -->|"to"| B');
        });

        it('should handle nested subgraphs recursively', () => {
            const nodes: Node[] = [
                { id: 'parent', type: 'group', data: { label: 'Parent' }, position: { x: 0, y: 0 } },
                { id: 'child', type: 'subGroup', data: { label: 'Child' }, position: { x: 10, y: 10 }, parentId: 'parent' } as any,
                { id: 'leaf', data: { label: 'Leaf' }, position: { x: 20, y: 20 }, parentId: 'child' } as any,
            ];
            const result = toMermaid(nodes, []);
            expect(result).toContain('subgraph parent["Parent"]');
            expect(result).toContain('subgraph child["Child"]');
            expect(result).toContain('leaf["Leaf"]');
            // Check nesting order (approximate)
            const parentIdx = result.indexOf('subgraph parent');
            const childIdx = result.indexOf('subgraph child');
            const leafIdx = result.indexOf('leaf');
            expect(parentIdx).toBeLessThan(childIdx);
            expect(childIdx).toBeLessThan(leafIdx);
        });

        it('should include node and group styles', () => {
            const nodes: Node[] = [
                { id: 'A', data: { label: 'Styled', theme: { main: '#ff0000', text: '#ffffff' } }, position: { x: 0, y: 0 } },
                { id: 'G', type: 'group', data: { label: 'Group', themeColor: '#00ff00' }, position: { x: 0, y: 0 } },
            ];
            const result = toMermaid(nodes, []);
            expect(result).toContain('style A fill:#ff0000,stroke:#ff0000,color:#ffffff');
            expect(result).toContain('style G fill:#00ff0015,stroke:#00ff00,stroke-width:2px');
        });

        it('should escape exported Mermaid labels and reject unsafe style colors', () => {
            const nodes: Node[] = [
                {
                    id: 'A bad/id',
                    data: {
                        label: 'A "quoted"\n```mermaid\nX-->Y',
                        theme: { main: '#ff0000\nB-->C', text: '#ffffff' },
                    },
                    position: { x: 0, y: 0 },
                },
                { id: 'B', data: { label: 'Target' }, position: { x: 100, y: 0 } },
            ];
            const edges: Edge[] = [
                { id: 'e1', source: 'A bad/id', target: 'B', label: 'edge\n```' },
            ];

            const result = toMermaid(nodes, edges);

            expect(result).toContain('A_bad_id["A \\"quoted\\" \\`\\`\\`mermaid X-->Y"]');
            expect(result).toContain('A_bad_id -->|"edge \\`\\`\\`"| B');
            expect(result).not.toContain('#ff0000\nB-->C');
            expect(result).not.toContain('\nX-->Y');
        });

        it('should bound exported Mermaid nodes and edges', () => {
            const nodes: Node[] = Array.from({ length: MERMAID_EXPORT_MAX_NODES + 50 }, (_, index) => ({
                id: `N${index}`,
                data: { label: `Node ${index}` },
                position: { x: 0, y: 0 },
            }));
            const edges: Edge[] = Array.from({ length: MERMAID_EXPORT_MAX_EDGES + 50 }, (_, index) => ({
                id: `E${index}`,
                source: `N${index % MERMAID_EXPORT_MAX_NODES}`,
                target: `N${(index + 1) % MERMAID_EXPORT_MAX_NODES}`,
            }));

            const result = toMermaid(nodes, edges);

            expect(result).toContain(`N${MERMAID_EXPORT_MAX_NODES - 1}["Node ${MERMAID_EXPORT_MAX_NODES - 1}"]`);
            expect(result).not.toContain(`N${MERMAID_EXPORT_MAX_NODES}["Node ${MERMAID_EXPORT_MAX_NODES}"]`);
            expect((result.match(/-->/g) || []).length).toBe(MERMAID_EXPORT_MAX_EDGES);
        });
    });

    describe('fromMermaid', () => {
        it('should parse simple nodes and edges', () => {
            const code = `
                flowchart LR
                A[Start] --> B{Decision}
                B -->|Yes| C[End]
            `;
            const { nodes, edges } = fromMermaid(code);
            expect(nodes).toHaveLength(3);
            expect(edges).toHaveLength(2);
            
            const nodeA = nodes.find(n => n.id === 'A');
            expect(nodeA?.data.label).toBe('Start');
            expect(nodeA?.data.shape).toBe('rectangle');

            const nodeB = nodes.find(n => n.id === 'B');
            expect(nodeB?.data.shape).toBe('diamond');
            
            expect(edges[0].source).toBe('A');
            expect(edges[0].target).toBe('B');
            expect(edges[1].label).toBe('Yes');
        });

        it('should parse nested subgraphs', () => {
            const code = `
                flowchart TD
                subgraph G1[Outer]
                    subgraph G2[Inner]
                        A[Leaf]
                    end
                end
            `;
            const { nodes } = fromMermaid(code);
            const nodeA = nodes.find(n => n.id === 'A');
            const nodeG2 = nodes.find(n => n.id === 'G2');
            
            expect(nodeA?.parentId).toBe('G2');
            expect(nodeG2?.parentId).toBe('G1');
        });

        it('should parse node styles', () => {
            const code = `
                flowchart TD
                A[Styled]
                style A fill:#ff0000,stroke:#000000,color:#ffffff
            `;
            const { nodes } = fromMermaid(code);
            const nodeA = nodes.find(n => n.id === 'A');
            expect(nodeA?.data.theme.main).toBe('#ff0000');
            expect(nodeA?.data.theme.border).toBe('#000000');
            expect(nodeA?.data.theme.text).toBe('#ffffff');
        });

        it('should reject oversized Mermaid imports', () => {
            expect(() => fromMermaid('x'.repeat(MERMAID_CONVERTER_MAX_CHARS + 1))).toThrow('too large');
        });

        it('should bound imported nodes and edges before returning React Flow data', () => {
            const lines = ['flowchart TD'];
            for (let i = 0; i < MERMAID_CONVERTER_MAX_EDGES + 50; i += 1) {
                lines.push(`N${i}[Node ${i}] --> N${i + 1}[Node ${i + 1}]`);
            }

            const { nodes, edges } = fromMermaid(lines.join('\n'));

            expect(nodes.length).toBeLessThanOrEqual(MERMAID_CONVERTER_MAX_NODES);
            expect(edges.length).toBeLessThanOrEqual(MERMAID_CONVERTER_MAX_EDGES);
        });

        it('should truncate oversized imported labels', () => {
            const longLabel = 'x'.repeat(MERMAID_CONVERTER_MAX_LABEL_CHARS + 100);
            const { nodes } = fromMermaid(`flowchart TD\nA[${longLabel}]`);

            expect(nodes.find(n => n.id === 'A')?.data.label).toHaveLength(MERMAID_CONVERTER_MAX_LABEL_CHARS);
        });
    });
});
