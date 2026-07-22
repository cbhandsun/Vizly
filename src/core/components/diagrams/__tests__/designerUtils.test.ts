import { describe, expect, it, vi } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

vi.mock('../../layout/LayoutOptimizer', () => ({
    LayoutOptimizer: {
        getInstance: () => ({
            calculateNodeWidth: () => 160,
            calculateNodeHeight: () => 80,
        }),
    },
}));

import type { StandardDiagramData } from '../../../models/DiagramModels';
import { canvasToPureStandardData, canvasToStandardData, standardDataToCanvas } from '../designerUtils';

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

    it('serializes canvas records without leaking UI-only fields into pure data', () => {
        const nodes: Node[] = [{
            id: 'node-1',
            type: 'flowchart',
            position: { x: 12, y: 34 },
            data: { label: 'Node', domain: 'orders', subDomain: 'entry', hidden: false },
        }];
        const edges: Edge[] = [{
            id: 'edge-1',
            source: 'node-1',
            target: 'node-1',
            type: 'smart-step',
            data: { label: 'Self', manualHandles: true, constraints: { keep: true } },
        }];

        const standard = canvasToStandardData(nodes, edges, 'Round trip');
        const pure = canvasToPureStandardData(nodes, edges, 'Pure');

        expect(standard.nodes[0]).toMatchObject({ description: '<b>Node</b>', domain: 'orders', subDomain: 'entry' });
        expect(standard.edges[0]).toMatchObject({ type: 'main', label: 'Self' });
        expect(pure.nodes[0]).not.toHaveProperty('metadata.canvasPosition');
        expect(pure.edges[0].data).toEqual({ constraints: { keep: true } });
    });
});
