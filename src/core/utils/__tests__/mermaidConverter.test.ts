import { describe, it, expect } from 'vitest';
import { toMermaid, fromMermaid } from '../mermaidConverter';
import { Node, Edge, MarkerType } from '@xyflow/react';

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
    });
});
