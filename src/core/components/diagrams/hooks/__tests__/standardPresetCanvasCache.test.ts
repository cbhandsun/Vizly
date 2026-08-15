// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    createStandardPresetCanvasLoader,
    resolveStandardPresetEdgeRoutingQuality,
    type CanvasData,
} from '../standardPresetCanvasCache';

describe('standardPresetCanvasCache', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('deduplicates concurrent conversions for the same preset id and returns isolated clones', async () => {
        const canvas: CanvasData = {
            nodes: [{
                id: 'node-a',
                position: { x: 10, y: 20 },
                data: { label: 'Node A' },
            }],
            edges: [{
                id: 'edge-a',
                source: 'node-a',
                target: 'node-b',
                data: { label: 'Edge A' },
                style: { stroke: '#FF5722', strokeWidth: 3 },
                markerEnd: { type: 'arrowclosed', color: '#FF5722' },
            }],
        };
        const convert = vi.fn(async () => canvas);
        const load = createStandardPresetCanvasLoader(convert);

        const [first, second] = await Promise.all([
            load('SystemsInteractionStandardData', { id: 'preset-a' }),
            load('SystemsInteractionStandardData', { id: 'preset-a' }),
        ]);

        expect(convert).toHaveBeenCalledTimes(1);
        expect(first).not.toBe(second);
        expect(first.nodes[0]).not.toBe(second.nodes[0]);

        (first.nodes[0].data as any).label = 'Changed';
        (first.edges[0].data as any).label = 'Changed Edge';
        first.edges[0].style = { ...first.edges[0].style, stroke: '#000000' };
        first.edges[0].markerEnd = { type: 'arrowclosed', color: '#000000' };

        expect((second.nodes[0].data as any).label).toBe('Node A');
        expect((second.edges[0].data as any).label).toBe('Edge A');
        expect(second.edges[0].style?.stroke).toBe('#FF5722');
        expect(second.edges[0].markerEnd).toEqual({ type: 'arrowclosed', color: '#FF5722' });
    });

    it('clears failed conversions so the same preset id can retry', async () => {
        const canvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 0, y: 0 }, data: {} }],
            edges: [],
        };
        const convert = vi.fn()
            .mockRejectedValueOnce(new Error('layout failed'))
            .mockResolvedValueOnce(canvas);
        const load = createStandardPresetCanvasLoader(convert);

        await expect(load('SystemsInteractionStandardData', {})).rejects.toThrow('layout failed');
        await expect(load('SystemsInteractionStandardData', {})).resolves.toEqual(canvas);
        expect(convert).toHaveBeenCalledTimes(2);
    });

    it('reuses a validated persisted canvas across loader instances', async () => {
        const canvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 1, y: 2 }, data: { label: 'Persisted' } }],
            edges: [{ id: 'edge-a', source: 'node-a', target: 'node-b' }],
        };
        const preset = { nodes: [{ id: 'source-node' }], edges: [{ id: 'source-edge' }], layout: { direction: 'TB' } };
        const firstConvert = vi.fn(async () => canvas);
        const firstLoad = createStandardPresetCanvasLoader(firstConvert);

        await expect(firstLoad('SystemsInteractionStandardData', preset)).resolves.toEqual(canvas);

        const secondConvert = vi.fn(async () => {
            throw new Error('should not convert when persisted cache is valid');
        });
        const secondLoad = createStandardPresetCanvasLoader(secondConvert);
        const persisted = await secondLoad('SystemsInteractionStandardData', preset);

        expect(secondConvert).not.toHaveBeenCalled();
        expect(persisted).toEqual(canvas);
        expect(persisted).not.toBe(canvas);
    });

    it('drops invalid persisted canvas data and retries conversion', async () => {
        const canvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 0, y: 0 }, data: {} }],
            edges: [],
        };
        const preset = { nodes: [{ id: 'source-node' }], edges: [], layout: { direction: 'TB' } };
        const firstLoad = createStandardPresetCanvasLoader(vi.fn(async () => canvas));

        await firstLoad('SystemsInteractionStandardData', preset);
        const storageKey = window.localStorage.key(0);
        expect(storageKey).toBeTruthy();
        window.localStorage.setItem(storageKey!, JSON.stringify({ nodes: [{ id: 'bad-node' }], edges: [] }));

        const convert = vi.fn(async () => canvas);
        const secondLoad = createStandardPresetCanvasLoader(convert);

        await expect(secondLoad('SystemsInteractionStandardData', preset)).resolves.toEqual(canvas);
        expect(convert).toHaveBeenCalledTimes(1);
    });

    it('drops persisted canvases that violate preset group visibility contracts', async () => {
        const staleCanvas: CanvasData = {
            nodes: [
                {
                    id: 'titlegroup-external',
                    type: 'titleGroup',
                    position: { x: 0, y: 0 },
                    data: { domain: 'external' },
                },
            ],
            edges: [],
        };
        const refreshedCanvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 10, y: 20 }, data: { domain: 'external' } }],
            edges: [],
        };
        const preset = {
            nodes: [{ id: 'source-node' }],
            edges: [],
            layout: { generateDomainGroups: false },
        };
        const firstLoad = createStandardPresetCanvasLoader(vi.fn(async () => staleCanvas));

        await firstLoad('SystemsInteractionStandardData', preset);

        const convert = vi.fn(async () => refreshedCanvas);
        const secondLoad = createStandardPresetCanvasLoader(convert);

        await expect(secondLoad('SystemsInteractionStandardData', preset)).resolves.toEqual(refreshedCanvas);
        expect(convert).toHaveBeenCalledTimes(1);
    });

    it('drops in-memory canvases that violate preset group visibility contracts', async () => {
        const staleCanvas: CanvasData = {
            nodes: [{
                id: 'titlegroup-external',
                type: 'titleGroup',
                position: { x: 0, y: 0 },
                data: { domain: 'external' },
            }],
            edges: [],
        };
        const refreshedCanvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 10, y: 20 }, data: { domain: 'external' } }],
            edges: [],
        };
        const preset = {
            nodes: [{ id: 'source-node' }],
            edges: [],
            layout: { generateDomainGroups: false },
        };
        const convert = vi.fn()
            .mockResolvedValueOnce(staleCanvas)
            .mockResolvedValueOnce(refreshedCanvas);
        const load = createStandardPresetCanvasLoader(convert);

        await expect(load('SystemsInteractionStandardData', preset)).resolves.toEqual(refreshedCanvas);

        expect(convert).toHaveBeenCalledTimes(2);
    });

    it('drops styleless cached canvases when the preset declares semantic edge presentation', async () => {
        const nodes: CanvasData['nodes'] = [
            { id: 'node-a', position: { x: 0, y: 0 }, data: {} },
            { id: 'node-b', position: { x: 200, y: 0 }, data: {} },
        ];
        const staleCanvas: CanvasData = {
            nodes,
            edges: [{ id: 'edge-a', source: 'node-a', target: 'node-b' }],
        };
        const refreshedCanvas: CanvasData = {
            nodes,
            edges: [{
                id: 'edge-a',
                source: 'node-a',
                target: 'node-b',
                style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
                markerEnd: { type: 'arrowclosed', color: '#47CACC' },
            }],
        };
        const preset = {
            nodes: [{ id: 'node-a' }, { id: 'node-b' }],
            edges: [{
                id: 'edge-a',
                style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
            }],
        };
        const convert = vi.fn()
            .mockResolvedValueOnce(staleCanvas)
            .mockResolvedValueOnce(refreshedCanvas);
        const load = createStandardPresetCanvasLoader(convert);

        await expect(load('LogisticsStandardData', preset)).resolves.toEqual(refreshedCanvas);
        expect(convert).toHaveBeenCalledTimes(2);
    });

    it('drops cached canvases that lost a styleless preset edge role', async () => {
        const nodes: CanvasData['nodes'] = [
            { id: 'node-a', position: { x: 0, y: 0 }, data: {} },
            { id: 'node-b', position: { x: 200, y: 0 }, data: {} },
        ];
        const staleCanvas: CanvasData = {
            nodes,
            edges: [{ id: 'edge-a', source: 'node-a', target: 'node-b', type: 'advanced-smart-step' }],
        };
        const refreshedCanvas: CanvasData = {
            nodes,
            edges: [{
                id: 'edge-a',
                source: 'node-a',
                target: 'node-b',
                type: 'advanced-smart-step',
                className: 'vizly-edge-role-data',
            }],
        };
        const preset = {
            nodes: [{ id: 'node-a' }, { id: 'node-b' }],
            edges: [{ id: 'edge-a', type: 'data' }],
        };
        const convert = vi.fn()
            .mockResolvedValueOnce(staleCanvas)
            .mockResolvedValueOnce(refreshedCanvas);
        const load = createStandardPresetCanvasLoader(convert);

        await expect(load('DeamndAllocation', preset)).resolves.toEqual(refreshedCanvas);
        expect(convert).toHaveBeenCalledTimes(2);
    });

    it('treats generated group id prefixes as group visibility contract violations', async () => {
        const staleCanvas: CanvasData = {
            nodes: [{
                id: 'titlegroup-external',
                position: { x: 0, y: 0 },
                data: { domain: 'external' },
            }],
            edges: [],
        };
        const refreshedCanvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 10, y: 20 }, data: { domain: 'external' } }],
            edges: [],
        };
        const preset = {
            nodes: [{ id: 'source-node' }],
            edges: [],
            layout: { generateDomainGroups: false },
        };
        const convert = vi.fn()
            .mockResolvedValueOnce(staleCanvas)
            .mockResolvedValueOnce(refreshedCanvas);
        const load = createStandardPresetCanvasLoader(convert);

        await expect(load('SystemsInteractionStandardData', preset)).resolves.toEqual(refreshedCanvas);

        expect(convert).toHaveBeenCalledTimes(2);
    });

    it('drops large preset canvases with legacy full edge routing data', async () => {
        const staleCanvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 0, y: 0 }, data: {} }],
            edges: [{ id: 'edge-a', source: 'node-a', target: 'node-b', data: { algorithm: 'domain-dagre-full' } }],
        };
        const refreshedCanvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 10, y: 20 }, data: {} }],
            edges: [{
                id: 'edge-a',
                source: 'node-a',
                target: 'node-b',
                data: { algorithm: 'domain-dagre-interactive', trunkPolishVersion: 2 },
            }],
        };
        const preset = {
            nodes: Array.from({ length: 37 }, (_, index) => ({ id: `source-${index}` })),
            edges: [{ id: 'source-edge' }],
            layout: {},
        };
        const convert = vi.fn()
            .mockResolvedValueOnce(staleCanvas)
            .mockResolvedValueOnce(refreshedCanvas);
        const load = createStandardPresetCanvasLoader(convert);

        await expect(load('WmsProcessFlowStandardData', preset)).resolves.toEqual(refreshedCanvas);

        expect(convert).toHaveBeenCalledTimes(2);
    });

    it('drops large preset canvases with legacy interactive edge routing data', async () => {
        const staleCanvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 0, y: 0 }, data: {} }],
            edges: [{ id: 'edge-a', source: 'node-a', target: 'node-b', data: { algorithm: 'domain-dagre-interactive', trunkPolishVersion: 1 } }],
        };
        const refreshedCanvas: CanvasData = {
            nodes: [{ id: 'node-a', position: { x: 10, y: 20 }, data: {} }],
            edges: [{
                id: 'edge-a',
                source: 'node-a',
                target: 'node-b',
                data: { algorithm: 'domain-dagre-interactive', trunkPolishVersion: 2 },
            }],
        };
        const preset = {
            nodes: Array.from({ length: 37 }, (_, index) => ({ id: `source-${index}` })),
            edges: [{ id: 'source-edge' }],
            layout: {},
        };
        const convert = vi.fn()
            .mockResolvedValueOnce(staleCanvas)
            .mockResolvedValueOnce(refreshedCanvas);
        const load = createStandardPresetCanvasLoader(convert);

        await expect(load('WmsProcessFlowStandardData', preset)).resolves.toEqual(refreshedCanvas);

        expect(convert).toHaveBeenCalledTimes(2);
    });

    it('uses interactive edge routing only for large standard presets', () => {
        expect(resolveStandardPresetEdgeRoutingQuality({
            nodes: Array.from({ length: 12 }, (_, index) => ({ id: `n-${index}` })),
            edges: Array.from({ length: 16 }, (_, index) => ({ id: `e-${index}` })),
        })).toBe('full');
        expect(resolveStandardPresetEdgeRoutingQuality({
            nodes: Array.from({ length: 37 }, (_, index) => ({ id: `n-${index}` })),
            edges: [],
        })).toBe('interactive');
        expect(resolveStandardPresetEdgeRoutingQuality({
            nodes: [],
            edges: Array.from({ length: 37 }, (_, index) => ({ id: `e-${index}` })),
        })).toBe('interactive');
    });
});
