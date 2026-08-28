import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { resolveFlowchartLayoutPresentation } from '../flowchartDesignerViewHelpers';

const authoritativeNodes: Node[] = [
    { id: 'old', position: { x: 0, y: 0 }, data: {} },
];
const previewNodes: Node[] = [
    { id: 'old', position: { x: 120, y: 80 }, data: {} },
];
const displayEdges: Edge[] = [
    { id: 'edge', source: 'old', target: 'old' },
];

describe('flowchart layout presentation', () => {
    it('shows preview geometry with no display edges and editing disabled', () => {
        expect(resolveFlowchartLayoutPresentation({
            nodes: authoritativeNodes,
            displayEdges,
            editingEnabled: true,
            previewNodes,
        })).toEqual({
            nodes: previewNodes,
            displayEdges: [],
            editingEnabled: false,
        });
    });

    it('preserves the authoritative presentation when no preview exists', () => {
        expect(resolveFlowchartLayoutPresentation({
            nodes: authoritativeNodes,
            displayEdges,
            editingEnabled: true,
            previewNodes: null,
        })).toEqual({
            nodes: authoritativeNodes,
            displayEdges,
            editingEnabled: true,
        });
    });
});
