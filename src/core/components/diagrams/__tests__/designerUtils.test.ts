import { describe, expect, it, vi } from 'vitest';

vi.mock('../../layout/LayoutOptimizer', () => ({
    LayoutOptimizer: {
        getInstance: () => ({
            calculateNodeWidth: () => 160,
            calculateNodeHeight: () => 80,
        }),
    },
}));

import type { StandardDiagramData } from '../../../models/DiagramModels';
import { standardDataToCanvas } from '../designerUtils';

const makeDiagram = (): StandardDiagramData => ({
    id: 'diagram-1',
    name: 'Boundary test',
    type: 'flowchart',
    version: '1',
    nodes: [
        {
            id: 'valid',
            description: 'Valid',
            type: 'flowchart',
            domain: 'core',
            metadata: { canvasPosition: { x: 10, y: 20 } },
        },
        {
            id: 'invalid',
            description: 'Invalid metadata',
            type: 'flowchart',
            domain: 'core',
            metadata: {
                canvasPosition: { x: Number.POSITIVE_INFINITY, y: 'bad' },
                parentId: 42,
                style: null,
            },
        },
    ],
    edges: [],
    layout: {
        type: 'flow',
        direction: 'TB',
        spacing: { horizontal: 80, vertical: 80 },
        padding: { horizontal: 20, vertical: 20 },
    },
    theme: { name: 'manual', displayName: 'Manual', domains: {} },
});

describe('standardDataToCanvas', () => {
    it('restores finite positions and rejects malformed metadata fields', async () => {
        const result = await standardDataToCanvas(makeDiagram());

        expect(result.nodes.find((node) => node.id === 'valid')?.position).toEqual({ x: 10, y: 20 });
        expect(result.nodes.find((node) => node.id === 'invalid')).toMatchObject({
            position: { x: 250, y: 100 },
            parentId: undefined,
        });
    });
});
