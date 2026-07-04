import { describe, expect, it, vi } from 'vitest';
import {
    finalizeDiagramSeedNavigation,
    needsStandardDiagramSeedConversion,
    normalizeDiagramSeedData,
} from '../diagramViewerSeedNavigation';

describe('diagramViewerSeedNavigation', () => {
    it('detects when diagram seed data needs standard-to-canvas conversion', () => {
        expect(needsStandardDiagramSeedConversion({
            nodes: [{ id: 'n1', domain: 'core' }],
            edges: [],
        })).toBe(true);

        expect(needsStandardDiagramSeedConversion({
            nodes: [{ id: 'n1', data: { label: 'A' } }],
            edges: [{ id: 'e1', type: 'main', source: 'n1', target: 'n2' }],
        })).toBe(true);

        expect(needsStandardDiagramSeedConversion({
            nodes: [{ id: 'n1', data: { label: 'A' } }],
            edges: [{ id: 'e1', markerEnd: { type: 'arrowclosed' }, sourceHandle: 'a' }],
        })).toBe(false);
    });

    it('converts standard diagram seeds using the provided canvas converter', async () => {
        const convert = vi.fn().mockResolvedValue({
            nodes: [{ id: 'canvas-1', data: { label: 'A' } }],
            edges: [{ id: 'edge-1' }],
        });

        const result = await normalizeDiagramSeedData({
            data: {
                nodes: [{ id: 'std-1', domain: 'core' }],
                edges: [],
            },
            convertStandardDataToCanvas: convert,
            logLayoutFallbackFailure: vi.fn(),
        });

        expect(convert).toHaveBeenCalled();
        expect(result.nodes).toEqual([{ id: 'canvas-1', data: { label: 'A' } }]);
        expect(result.edges).toEqual([{ id: 'edge-1' }]);
        expect(result.layout).toEqual({ type: 'DomainDagreLayout', direction: 'TB' });
    });

    it('logs and falls back to the original data when conversion fails', async () => {
        const error = new Error('layout failed');
        const log = vi.fn();
        const data = {
            nodes: [{ id: 'std-1', domain: 'core' }],
            edges: [],
        };

        const result = await normalizeDiagramSeedData({
            data,
            convertStandardDataToCanvas: vi.fn().mockRejectedValue(error),
            logLayoutFallbackFailure: log,
        });

        expect(result).toBe(data);
        expect(log).toHaveBeenCalledWith(error);
    });

    it('normalizes edge-like canvas data when conversion is not required', async () => {
        const result = await normalizeDiagramSeedData({
            data: {
                nodes: [{ id: 'n1', data: { label: 'A' } }],
                edges: [{ id: 'e1', type: 'main', source: 'n1', target: 'n2', sourceHandle: 'right' }],
            },
            convertStandardDataToCanvas: vi.fn(),
            logLayoutFallbackFailure: vi.fn(),
        });

        expect(result.edges).toEqual([{
            id: 'e1',
            type: 'advanced-smart-step',
            source: 'n1',
            target: 'n2',
            sourceHandle: 'right',
            markerEnd: { type: 'arrowclosed' },
            data: { auto: ['source', 'target'] },
        }]);
    });

    it('persists fresh seed data, clears old bridge state, and schedules reload navigation', () => {
        const storage = {
            removeItem: vi.fn(),
            setItem: vi.fn(),
        };
        const saveSelectedDiagramId = vi.fn();
        const removeBridge = vi.fn();
        const assignHashRoute = vi.fn();
        const reloadWindow = vi.fn();
        const requestAnimationFrameImpl = vi.fn((callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        const createPayload = vi.fn(() => ({
            diagramId: 'diagram-b',
            nodes: [{ id: 'n1' }],
            edges: [],
            version: '1.0',
            isFreshSeed: true,
        }));

        finalizeDiagramSeedNavigation({
            storage,
            currentDiagramId: 'diagram-a',
            nextDiagramId: 'diagram-b',
            processedData: {
                nodes: [{ id: 'n1' }],
                edges: [],
                metadata: { title: 'Diagram B' },
            },
            saveSelectedDiagramId,
            assignHashRoute,
            reloadWindow,
            requestAnimationFrameImpl,
            removeBridge,
            createPayload,
            buildHashRoute: (id) => `#/?diagram=${id}`,
            logBridgeCleanupFailure: vi.fn(),
        });

        expect(storage.removeItem).toHaveBeenCalledWith('flowchart-autosave-v2-diagram-a');
        expect(createPayload).toHaveBeenCalledWith(expect.objectContaining({
            diagramId: 'diagram-b',
            nodes: [{ id: 'n1' }],
            isFreshSeed: true,
        }));
        expect(storage.setItem).toHaveBeenCalledWith(
            'flowchart-autosave-v2-diagram-b',
            expect.any(String)
        );
        expect(saveSelectedDiagramId).toHaveBeenCalledWith('diagram-b');
        expect(removeBridge).toHaveBeenCalledWith('diagram-a');
        expect(assignHashRoute).toHaveBeenCalledWith('#/?diagram=diagram-b');
        expect(requestAnimationFrameImpl).toHaveBeenCalled();
        expect(reloadWindow).toHaveBeenCalled();
    });

    it('logs bridge cleanup failures but still navigates', () => {
        const logBridgeCleanupFailure = vi.fn();
        const assignHashRoute = vi.fn();

        finalizeDiagramSeedNavigation({
            storage: {
                removeItem: vi.fn(),
                setItem: vi.fn(),
            },
            currentDiagramId: 'diagram-a',
            nextDiagramId: 'diagram-b',
            processedData: { nodes: [] },
            saveSelectedDiagramId: vi.fn(),
            assignHashRoute,
            reloadWindow: vi.fn(),
            requestAnimationFrameImpl: vi.fn((callback: FrameRequestCallback) => {
                callback(0);
                return 1;
            }),
            removeBridge: vi.fn(() => {
                throw new Error('cleanup failed');
            }),
            createPayload: vi.fn(() => null),
            buildHashRoute: (id) => `#/?diagram=${id}`,
            logBridgeCleanupFailure,
        });

        expect(logBridgeCleanupFailure).toHaveBeenCalledWith(
            'diagram-a',
            'diagram-b',
            expect.any(Error)
        );
        expect(assignHashRoute).toHaveBeenCalledWith('#/?diagram=diagram-b');
    });
});
