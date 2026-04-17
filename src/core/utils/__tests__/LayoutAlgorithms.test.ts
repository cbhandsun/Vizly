import { describe, it, expect } from 'vitest';
import { symmetricMindMapLayout } from '../LayoutAlgorithms';
import { Node, Edge } from '@xyflow/react';

describe('symmetricMindMapLayout', () => {
    it('should arrange nodes symmetrically around the root', () => {
        const nodes: Node[] = [
            { id: 'root', position: { x: 500, y: 500 }, data: { label: 'Root' } },
            { id: 'child1', position: { x: 0, y: 0 }, data: { label: 'Child 1' } },
            { id: 'child2', position: { x: 0, y: 0 }, data: { label: 'Child 2' } },
        ];
        const edges: Edge[] = [
            { id: 'e1', source: 'root', target: 'child1' },
            { id: 'e2', source: 'root', target: 'child2' },
        ];

        const positions = symmetricMindMapLayout(nodes, edges, { levelSpacing: 100, nodeSpacing: 50 });

        const rootPos = positions.get('root');
        const c1Pos = positions.get('child1');
        const c2Pos = positions.get('child2');

        expect(rootPos).toBeDefined();
        expect(c1Pos).toBeDefined();
        expect(c2Pos).toBeDefined();

        // In symmetric layout, child1 (idx 1, odd) goes LEFT, child2 (idx 0, even) goes RIGHT
        // idx 0 -> right, idx 1 -> left (based on idx % 2 === 0 in symmetricMindMapLayout)
        // Actually:
        // childIds.forEach((cid, idx) => { ... if (idx % 2 === 0) rightChildren.push(childTree); else leftChildren.push(childTree); });
        // So child1 (idx 0) -> right, child2 (idx 1) -> left.
        
        if (c1Pos && c2Pos && rootPos) {
            expect(c1Pos.x).toBeGreaterThan(rootPos.x); // child1 is first in edges array? No, childIds is childrenMap.get('root')
            // childrenMap is built from edges. e1 is (root, child1), e2 is (root, child2).
            // So childrenMap.get('root') = ['child1', 'child2']
            // index 0 is 'child1' -> Right
            // index 1 is 'child2' -> Left
            
            expect(c1Pos.x).toBeGreaterThan(rootPos.x);
            expect(c2Pos.x).toBeLessThan(rootPos.x);
            
            // Y coordinates should be roughly balanced
            expect(Math.abs(c1Pos.y - rootPos.y)).toBeLessThan(100);
            expect(Math.abs(c2Pos.y - rootPos.y)).toBeLessThan(100);
        }
    });

    it('should handle empty nodes array', () => {
        const positions = symmetricMindMapLayout([], []);
        expect(positions.size).toBe(0);
    });
});
