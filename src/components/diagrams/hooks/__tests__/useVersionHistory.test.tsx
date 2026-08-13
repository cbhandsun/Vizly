import { act, renderHook, waitFor } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => {
    const t = (key: string, params?: { message?: string }) => ({
            'designer.versionHistoryPanel.loadFailed': 'Failed to load version history',
            'designer.versionHistoryPanel.canvasUnavailable': 'The current diagram data could not be read',
            'designer.versionHistoryPanel.saveSuccess': 'Snapshot saved',
            'designer.versionHistoryPanel.saveFailed': 'Failed to save snapshot',
            'designer.versionHistoryPanel.payloadLoadFailed': 'Failed to load snapshot details',
            'designer.versionHistoryPanel.previewMissing': 'Cannot preview: snapshot data is missing',
            'designer.versionHistoryPanel.previewInvalid': 'Cannot preview: snapshot data is invalid',
            'designer.versionHistoryPanel.restoreMissing': 'Cannot restore: snapshot data is missing',
            'designer.versionHistoryPanel.restoreInvalid': 'Cannot restore: snapshot data is invalid',
            'designer.versionHistoryPanel.backupMessage': 'Automatic backup before restore',
            'designer.versionHistoryPanel.backupFailed': 'Restore cancelled because the safety backup could not be created',
            'designer.versionHistoryPanel.restoreSuccess': `Restored to snapshot: ${params?.message ?? ''}. The previous canvas was backed up automatically.`,
            'designer.versionHistoryPanel.restoreFailed': 'Restore failed. The previous canvas remains safely backed up.',
        }[key] ?? key);
    return { useTranslation: () => ({ t }) };
});

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

const makeBackupVersion = () => ({
    id: 'backup-version-1',
    diagramId: 'diagram-1',
    snapshotData: {
        nodes: originalNodes,
        edges: originalEdges,
    },
    createdAt: 2,
    message: 'Automatic backup before restore',
});

describe('useVersionHistory', () => {
    beforeEach(() => {
        storageMocks.listVersions.mockReset().mockResolvedValue([]);
        storageMocks.loadVersion.mockReset().mockResolvedValue(makeVersion());
        storageMocks.saveVersion.mockReset().mockResolvedValue(makeBackupVersion());
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
            entered = await result.current.enterPreview(
                'version-1',
                setNodes,
                setEdges,
                () => originalNodes,
                () => originalEdges,
            );
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

    it('captures the latest canvas immediately before an async preview is applied', async () => {
        let resolveVersion: ((version: ReturnType<typeof makeVersion>) => void) | undefined;
        storageMocks.loadVersion.mockImplementation(() => new Promise((resolve) => {
            resolveVersion = resolve;
        }));
        const editedNodes = [{ ...originalNodes[0], position: { x: 48, y: 72 } }];
        const editedEdges: Edge[] = [{
            id: 'edited-edge',
            source: 'original-node',
            target: 'original-node',
            label: 'Edited while loading',
        }];
        let currentNodes = originalNodes;
        let currentEdges = originalEdges;
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const { result } = renderHook(() => useVersionHistory('diagram-1'));

        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));

        let previewPromise: Promise<boolean> | undefined;
        act(() => {
            previewPromise = result.current.enterPreview(
                'version-1',
                setNodes,
                setEdges,
                () => currentNodes,
                () => currentEdges,
            );
        });
        await waitFor(() => expect(storageMocks.loadVersion).toHaveBeenCalledWith('diagram-1', 'version-1'));

        currentNodes = editedNodes;
        currentEdges = editedEdges;
        await act(async () => {
            resolveVersion?.(makeVersion());
            expect(await previewPromise!).toBe(true);
        });

        let previewBase: { nodes: Node[]; edges: Edge[] } | null = null;
        act(() => {
            previewBase = result.current.exitPreview();
        });
        expect(previewBase).toEqual({ nodes: editedNodes, edges: editedEdges });
    });

    it('rejects preview when the live canvas cannot be read', async () => {
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const { result } = renderHook(() => useVersionHistory('diagram-1'));

        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));

        let entered = true;
        await act(async () => {
            entered = await result.current.enterPreview(
                'version-1',
                setNodes,
                setEdges,
                () => { throw new Error('canvas unavailable'); },
                () => originalEdges,
            );
        });

        expect(entered).toBe(false);
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
        expect(messageMocks.error).toHaveBeenCalledWith('The current diagram data could not be read');
    });

    it('exposes a persistent load error and clears it after a successful retry', async () => {
        storageMocks.listVersions.mockRejectedValueOnce(new Error('offline'));
        const { result } = renderHook(() => useVersionHistory('diagram-1'));

        await waitFor(() => expect(result.current.loadError).toBe(true));
        expect(result.current.versions).toEqual([]);
        expect(messageMocks.error).toHaveBeenCalledWith('Failed to load version history');

        storageMocks.listVersions.mockResolvedValueOnce([makeVersion()]);
        await act(async () => {
            await result.current.loadVersions();
        });

        expect(result.current.loadError).toBe(false);
        expect(result.current.versions).toHaveLength(1);
    });

    it('keeps the last usable history visible when a refresh fails', async () => {
        storageMocks.listVersions.mockResolvedValueOnce([makeVersion()]);
        const { result } = renderHook(() => useVersionHistory('diagram-1'));

        await waitFor(() => expect(result.current.versions).toHaveLength(1));
        storageMocks.listVersions.mockRejectedValueOnce(new Error('refresh unavailable'));
        await act(async () => {
            await result.current.loadVersions();
        });

        expect(result.current.loadError).toBe(true);
        expect(result.current.versions).toHaveLength(1);
        expect(result.current.versions[0]?.id).toBe('version-1');
        expect(messageMocks.error).toHaveBeenCalledWith('Failed to load version history');
    });

    it('ignores an older version list response after the active diagram changes', async () => {
        let resolveFirstDiagram: ((versions: ReturnType<typeof makeVersion>[]) => void) | undefined;
        storageMocks.listVersions.mockImplementation((requestedDiagramId: string) => {
            if (requestedDiagramId === 'diagram-1') {
                return new Promise((resolve) => {
                    resolveFirstDiagram = resolve;
                });
            }
            return Promise.resolve([{
                ...makeVersion(),
                id: 'version-2',
                diagramId: 'diagram-2',
                message: 'Second diagram version',
            }]);
        });
        const { result, rerender } = renderHook(
            ({ activeDiagramId }) => useVersionHistory(activeDiagramId),
            { initialProps: { activeDiagramId: 'diagram-1' } },
        );

        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));
        rerender({ activeDiagramId: 'diagram-2' });
        await waitFor(() => expect(result.current.versions[0]?.id).toBe('version-2'));

        await act(async () => {
            resolveFirstDiagram?.([makeVersion()]);
            await Promise.resolve();
        });

        expect(result.current.versions).toHaveLength(1);
        expect(result.current.versions[0]?.diagramId).toBe('diagram-2');
    });

    it('ignores a preview payload that finishes after preview was cancelled', async () => {
        let resolveVersion: ((version: ReturnType<typeof makeVersion>) => void) | undefined;
        storageMocks.loadVersion.mockImplementation(() => new Promise((resolve) => {
            resolveVersion = resolve;
        }));
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const { result } = renderHook(() => useVersionHistory('diagram-1'));

        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));

        let previewPromise: Promise<boolean> | undefined;
        act(() => {
            previewPromise = result.current.enterPreview(
                'version-1',
                setNodes,
                setEdges,
                () => originalNodes,
                () => originalEdges,
            );
        });
        await waitFor(() => expect(storageMocks.loadVersion).toHaveBeenCalledWith('diagram-1', 'version-1'));

        act(() => {
            expect(result.current.exitPreview()).toBeNull();
        });

        let entered = true;
        await act(async () => {
            resolveVersion?.(makeVersion());
            entered = await previewPromise!;
        });

        expect(entered).toBe(false);
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
        expect(result.current.previewVersion).toBeNull();
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
            await result.current.enterPreview(
                'version-1',
                setNodes,
                setEdges,
                () => originalNodes,
                () => originalEdges,
            );
        });
        await waitFor(() => expect(result.current.previewVersion?.id).toBe('version-1'));

        let restored = false;
        await act(async () => {
            restored = await result.current.restoreVersion('version-1', setNodes, setEdges);
        });

        expect(restored).toBe(true);
        expect(storageMocks.saveVersion).toHaveBeenCalledWith(
            'diagram-1',
            { nodes: originalNodes, edges: originalEdges },
            'Automatic backup before restore',
        );
        expect(bridge.replaceCanvasSnapshot).toHaveBeenCalledWith({ nodes: previewNodes, edges: previewEdges });
        expect(bridge.nodes).toEqual(previewNodes);
        expect(bridge.edges).toEqual(previewEdges);
        expect(setNodes).toHaveBeenLastCalledWith(previewNodes);
        expect(setEdges).toHaveBeenLastCalledWith(previewEdges);
        expect(result.current.exitPreview()).toBeNull();
    });

    it('returns success and appends a saved snapshot', async () => {
        storageMocks.saveVersion.mockResolvedValue(makeVersion());
        const bridge = {
            id: 'diagram-1',
            nodes: [{ id: 'standard-node', metadata: { canvasPosition: { x: 0, y: 0 } } }],
            edges: [],
            getCanvasSnapshot: vi.fn(() => ({ nodes: originalNodes, edges: originalEdges })),
        };
        (window as unknown as { __flowDataBridge: Record<string, typeof bridge> }).__flowDataBridge = { 'diagram-1': bridge };
        const { result } = renderHook(() => useVersionHistory('diagram-1'));
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalled());

        let saved = false;
        await act(async () => {
            saved = await result.current.saveVersion('发布候选版本');
        });

        expect(saved).toBe(true);
        expect(storageMocks.saveVersion).toHaveBeenCalledWith(
            'diagram-1',
            { nodes: originalNodes, edges: originalEdges },
            '发布候选版本',
        );
        expect(bridge.getCanvasSnapshot).toHaveBeenCalledTimes(1);
        expect(result.current.versions[0]?.id).toBe('version-1');
    });

    it('allows only one persistence mutation at a time', async () => {
        let resolveSave: ((version: ReturnType<typeof makeVersion>) => void) | undefined;
        storageMocks.saveVersion.mockImplementation(() => new Promise((resolve) => {
            resolveSave = resolve;
        }));
        const bridge = {
            id: 'diagram-1',
            nodes: originalNodes,
            edges: originalEdges,
            getCanvasSnapshot: vi.fn(() => ({ nodes: originalNodes, edges: originalEdges })),
            replaceCanvasSnapshot: vi.fn(),
        };
        (window as unknown as { __flowDataBridge: Record<string, typeof bridge> }).__flowDataBridge = { 'diagram-1': bridge };
        const { result } = renderHook(() => useVersionHistory('diagram-1'));
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalled());

        let savePromise: Promise<boolean> | undefined;
        act(() => {
            savePromise = result.current.saveVersion('Release candidate');
        });
        await waitFor(() => expect(storageMocks.saveVersion).toHaveBeenCalledTimes(1));

        let overlappingRestore = true;
        await act(async () => {
            overlappingRestore = await result.current.restoreVersion('version-1', vi.fn(), vi.fn());
        });

        expect(overlappingRestore).toBe(false);
        expect(storageMocks.loadVersion).not.toHaveBeenCalled();
        expect(storageMocks.saveVersion).toHaveBeenCalledTimes(1);

        let saved = false;
        await act(async () => {
            resolveSave?.(makeVersion());
            saved = await savePromise!;
        });
        expect(saved).toBe(true);
    });

    it('does not publish a stale save result after switching diagrams', async () => {
        let resolveFirstSave: ((version: ReturnType<typeof makeVersion>) => void) | undefined;
        storageMocks.saveVersion
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveFirstSave = resolve;
            }))
            .mockResolvedValueOnce({
                ...makeVersion(),
                id: 'version-2',
                diagramId: 'diagram-2',
                message: 'Second diagram snapshot',
            });
        const firstBridge = {
            id: 'diagram-1',
            nodes: originalNodes,
            edges: originalEdges,
            getCanvasSnapshot: vi.fn(() => ({ nodes: originalNodes, edges: originalEdges })),
        };
        const secondBridge = {
            ...firstBridge,
            id: 'diagram-2',
        };
        (window as unknown as {
            __flowDataBridge: Record<string, typeof firstBridge>;
        }).__flowDataBridge = {
            'diagram-1': firstBridge,
            'diagram-2': secondBridge,
        };
        const { result, rerender } = renderHook(
            ({ activeDiagramId }) => useVersionHistory(activeDiagramId),
            { initialProps: { activeDiagramId: 'diagram-1' } },
        );
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));

        let firstSave: Promise<boolean> | undefined;
        act(() => {
            firstSave = result.current.saveVersion('First diagram snapshot');
        });
        await waitFor(() => expect(storageMocks.saveVersion).toHaveBeenCalledTimes(1));

        rerender({ activeDiagramId: 'diagram-2' });
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-2'));
        let secondSaved = false;
        await act(async () => {
            secondSaved = await result.current.saveVersion('Second diagram snapshot');
        });
        expect(secondSaved).toBe(true);

        let firstSaved = true;
        await act(async () => {
            resolveFirstSave?.(makeVersion());
            firstSaved = await firstSave!;
        });

        expect(firstSaved).toBe(false);
        expect(result.current.versions.map(version => version.id)).toEqual(['version-2']);
        expect(messageMocks.success).toHaveBeenCalledTimes(1);
        expect(messageMocks.success).toHaveBeenCalledWith('Snapshot saved');
    });

    it('does not apply a restore whose safety backup finishes after switching diagrams', async () => {
        let resolveBackup: ((version: ReturnType<typeof makeBackupVersion>) => void) | undefined;
        storageMocks.saveVersion.mockImplementationOnce(() => new Promise((resolve) => {
            resolveBackup = resolve;
        }));
        const replaceCanvasSnapshot = vi.fn();
        const firstBridge = {
            id: 'diagram-1',
            nodes: originalNodes,
            edges: originalEdges,
            replaceCanvasSnapshot,
        };
        (window as unknown as {
            __flowDataBridge: Record<string, typeof firstBridge>;
        }).__flowDataBridge = { 'diagram-1': firstBridge };
        const { result, rerender } = renderHook(
            ({ activeDiagramId }) => useVersionHistory(activeDiagramId),
            { initialProps: { activeDiagramId: 'diagram-1' } },
        );
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalledWith('diagram-1'));

        let restorePromise: Promise<boolean> | undefined;
        act(() => {
            restorePromise = result.current.restoreVersion('version-1', vi.fn(), vi.fn());
        });
        await waitFor(() => expect(storageMocks.saveVersion).toHaveBeenCalledTimes(1));

        rerender({ activeDiagramId: 'diagram-2' });
        let restored = true;
        await act(async () => {
            resolveBackup?.(makeBackupVersion());
            restored = await restorePromise!;
        });

        expect(restored).toBe(false);
        expect(replaceCanvasSnapshot).not.toHaveBeenCalled();
        expect(messageMocks.success).not.toHaveBeenCalled();
        expect(messageMocks.error).not.toHaveBeenCalled();
    });

    it('rejects invalid active canvas data before persistence', async () => {
        const bridge = { id: 'diagram-1', nodes: 'invalid', edges: originalEdges };
        (window as unknown as { __flowDataBridge: Record<string, typeof bridge> }).__flowDataBridge = { 'diagram-1': bridge };
        const { result } = renderHook(() => useVersionHistory('diagram-1'));
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalled());

        let saved = true;
        await act(async () => {
            saved = await result.current.saveVersion('非法画布');
        });

        expect(saved).toBe(false);
        expect(storageMocks.saveVersion).not.toHaveBeenCalled();
        expect(messageMocks.error).toHaveBeenCalledWith('The current diagram data could not be read');
    });

    it('cancels restore and preserves the preview when the safety backup fails', async () => {
        storageMocks.saveVersion.mockRejectedValue(new Error('backup unavailable'));
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const bridge = {
            id: 'diagram-1',
            nodes: originalNodes,
            edges: originalEdges,
            replaceCanvasSnapshot: vi.fn(),
        };
        (window as unknown as { __flowDataBridge: Record<string, typeof bridge> }).__flowDataBridge = { 'diagram-1': bridge };
        const { result } = renderHook(() => useVersionHistory('diagram-1'));
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalled());

        await act(async () => {
            await result.current.enterPreview(
                'version-1',
                setNodes,
                setEdges,
                () => originalNodes,
                () => originalEdges,
            );
        });
        await waitFor(() => expect(result.current.previewVersion?.id).toBe('version-1'));

        let restored = true;
        await act(async () => {
            restored = await result.current.restoreVersion('version-1', setNodes, setEdges);
        });

        expect(restored).toBe(false);
        expect(storageMocks.saveVersion).toHaveBeenCalledWith(
            'diagram-1',
            { nodes: originalNodes, edges: originalEdges },
            'Automatic backup before restore',
        );
        expect(bridge.replaceCanvasSnapshot).not.toHaveBeenCalled();
        expect(result.current.previewVersion?.id).toBe('version-1');
        expect(messageMocks.error).toHaveBeenCalledWith('Restore cancelled because the safety backup could not be created');
    });

    it('returns failure when persistence rejects', async () => {
        storageMocks.saveVersion.mockRejectedValue(new Error('storage unavailable'));
        const bridge = { id: 'diagram-1', nodes: originalNodes, edges: originalEdges };
        (window as unknown as { __flowDataBridge: Record<string, typeof bridge> }).__flowDataBridge = { 'diagram-1': bridge };
        const { result } = renderHook(() => useVersionHistory('diagram-1'));
        await waitFor(() => expect(storageMocks.listVersions).toHaveBeenCalled());

        let saved = true;
        await act(async () => {
            saved = await result.current.saveVersion('失败版本');
        });

        expect(saved).toBe(false);
        expect(messageMocks.error).toHaveBeenCalledWith('Failed to save snapshot');
        expect(result.current.versions).toEqual([]);
    });
});
