import { act, renderHook, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
    listVersions: vi.fn(),
    loadVersion: vi.fn(),
    saveVersion: vi.fn(),
}));

const messageMocks = vi.hoisted(() => ({
    error: vi.fn(),
    success: vi.fn(),
}));

vi.mock('@/services/UnifiedStorageService', () => ({
    unifiedStorage: storageMocks,
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
    appMessage: messageMocks,
}));

vi.mock('@/core/utils/diagramSnapshot', () => ({
    tryAttachDiagramSnapshot: vi.fn(async (diagram) => ({ diagram })),
}));

import { useVersionHistory } from '../useVersionHistory';

const originalNodes: Node[] = [{
    id: 'original-node',
    position: { x: 0, y: 0 },
    data: { label: 'Original' },
}];
const originalEdges: Edge[] = [];

const previewNodes: Node[] = [{
    id: 'preview-node',
    position: { x: 10, y: 20 },
    data: { label: 'Preview' },
}];
const previewEdges: Edge[] = [{
    id: 'preview-edge',
    source: 'preview-node',
    target: 'preview-node',
}];

const makeVersion = () => ({
    id: 'version-1',
    diagramId: 'diagram-1',
    snapshotData: {
        nodes: previewNodes,
        edges: previewEdges,
    },
    createdAt: 1,
    message: 'Preview version',
});

describe('useVersionHistory', () => {
    beforeEach(() => {
        storageMocks.listVersions.mockReset().mockResolvedValue([]);
        storageMocks.loadVersion.mockReset().mockResolvedValue(makeVersion());
        storageMocks.saveVersion.mockReset();
        messageMocks.error.mockReset();
        messageMocks.success.mockReset();
        delete (window as any).__flowDataBridge;
    });

    it('applies preview snapshots and returns the original canvas on exit', async () => {
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const { result } = renderHook(() => useVersionHistory('diagram-1'));

        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));

        let entered = false;
        await act(async () => {
            entered = await result.current.enterPreview('version-1', setNodes, setEdges, originalNodes, originalEdges);
        });

        expect(entered).toBe(true);
        expect(setNodes).toHaveBeenCalledWith(previewNodes);
        expect(setEdges).toHaveBeenCalledWith(previewEdges);
        await waitFor(() => expect(result.current.previewVersion?.id).toBe('version-1'));

        let previewBase: { nodes: Node[]; edges: Edge[] } | null = null;
        act(() => {
            previewBase = result.current.exitPreview();
        });

        expect(previewBase).toEqual({ nodes: originalNodes, edges: originalEdges });
        await waitFor(() => expect(result.current.previewVersion).toBeNull());
    });

    it('does not restore the preview base after confirming a version restore', async () => {
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const bridge = {
            id: 'diagram-1',
            nodes: originalNodes,
            edges: originalEdges,
            replaceCanvasSnapshot: vi.fn((snapshot: { nodes: Node[]; edges: Edge[] }) => {
                bridge.nodes = snapshot.nodes;
                bridge.edges = snapshot.edges;
                setNodes(snapshot.nodes);
                setEdges(snapshot.edges);
            }),
        };
        (window as any).__flowDataBridge = { 'diagram-1': bridge };
        const { result } = renderHook(() => useVersionHistory('diagram-1'));

        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));

        await act(async () => {
            await result.current.enterPreview('version-1', setNodes, setEdges, originalNodes, originalEdges);
        });
        await waitFor(() => expect(result.current.previewVersion?.id).toBe('version-1'));

        let restored = false;
        await act(async () => {
            restored = await result.current.restoreVersion('version-1', setNodes, setEdges);
        });

        expect(restored).toBe(true);
        expect(bridge.replaceCanvasSnapshot).toHaveBeenCalledWith({ nodes: previewNodes, edges: previewEdges });
        expect(bridge.nodes).toEqual(previewNodes);
        expect(bridge.edges).toEqual(previewEdges);
        expect(setNodes).toHaveBeenLastCalledWith(previewNodes);
        expect(setEdges).toHaveBeenLastCalledWith(previewEdges);
        expect(result.current.exitPreview()).toBeNull();
    });
});
