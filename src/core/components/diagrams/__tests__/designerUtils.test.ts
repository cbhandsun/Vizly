import { describe, expect, it, vi } from 'vitest';
import { MarkerType, type Edge, type Node } from '@xyflow/react';

vi.mock('../../layout/LayoutOptimizer', () => ({
    LayoutOptimizer: {
        getInstance: () => ({
            calculateNodeWidth: () => 160,
            calculateNodeHeight: () => 80,
        }),
    },
}));

import type { StandardDiagramData } from '../../../models/DiagramModels';
import logisticsStandardData from '../../../../data/standardized/LogisticsStandardData.json';
import { canvasToPureStandardData, canvasToStandardData, standardDataToCanvas } from '../designerUtils';
import { coerceStandardDiagramImport } from '../../../utils/diagramJsonImport';

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

    it('preserves group and child coordinates through the JSON editor import boundary', async () => {
        const nodes: Node[] = [
            {
                id: 'group-1',
                type: 'titleGroup',
                position: { x: 400, y: 200 },
                measured: { width: 640, height: 420 },
                data: { label: 'Operations', domain: 'ops' },
            },
            {
                id: 'child-1',
                type: 'flowchart',
                parentId: 'group-1',
                position: { x: 35, y: 55 },
                measured: { width: 160, height: 80 },
                data: { label: 'Pick order', domain: 'ops' },
            },
        ];

        const exported = canvasToStandardData(nodes, [], 'Round trip');
        const imported = coerceStandardDiagramImport(JSON.parse(JSON.stringify(exported)), {
            id: 'fallback',
            title: 'Fallback',
        });
        const restored = await standardDataToCanvas(imported);

        expect(restored.nodes.find(node => node.id === 'group-1')).toMatchObject({
            type: 'titleGroup',
            position: { x: 400, y: 200 },
        });
        expect(restored.nodes.find(node => node.id === 'child-1')).toMatchObject({
            parentId: 'group-1',
            position: { x: 35, y: 55 },
        });
        expect(restored.nodes.filter(node => node.id === 'group-1')).toHaveLength(1);
    });

    it.each([
        ['saved coordinates', true],
        ['generated layout', false],
    ])('preserves semantic edge presentation with %s', async (_scenario, hasSavedCoordinates) => {
        const diagram = makeDiagram();
        diagram.nodes = diagram.nodes.map((node, index) => ({
            ...node,
            metadata: hasSavedCoordinates
                ? { canvasPosition: { x: index * 240, y: index * 120 } }
                : undefined,
        }));
        diagram.edges = [{
            id: 'semantic-edge',
            source: 'valid',
            target: 'invalid',
            type: 'dependency',
            label: 'Inventory sync',
            style: {
                stroke: '#47CACC',
                strokeWidth: 2,
                strokeDasharray: '6 4',
                opacity: 0.82,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#47CACC',
                width: 12,
                height: 14,
            },
        }];

        const result = await standardDataToCanvas(diagram);
        const edge = result.edges.find(candidate => candidate.id === 'semantic-edge');

        expect(edge).toMatchObject({
            type: 'dependency',
            className: 'vizly-edge-role-dependency',
            label: 'Inventory sync',
            style: {
                stroke: '#47CACC',
                strokeWidth: 2,
                strokeDasharray: '6 4',
                opacity: 0.82,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#47CACC',
                width: 12,
                height: 14,
            },
        });
    });

    it('keeps logistics multi-domain semantic styles and derives matching marker colors', async () => {
        const diagram = coerceStandardDiagramImport(logisticsStandardData, {
            id: 'logistics-architecture-v1',
            title: 'Logistics architecture',
        });
        const result = await standardDataToCanvas(diagram);
        const byId = new Map(result.edges.map(edge => [edge.id, edge]));

        expect(byId.get('edge-upstream-loms')).toMatchObject({
            style: { stroke: '#FF5722', strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#FF5722' },
        });
        expect(byId.get('edge-loms-visibility')).toMatchObject({
            style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#47CACC' },
        });
        expect(byId.get('edge-wms-bms')).toMatchObject({
            style: { stroke: '#78909C', strokeWidth: 2, strokeDasharray: '5 5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#78909C' },
        });
    }, 20_000);
});
