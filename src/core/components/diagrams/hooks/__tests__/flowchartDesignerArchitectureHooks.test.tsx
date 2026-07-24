// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { BackgroundVariant, type Edge, type Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PluginRegistry } from '../../../../services/PluginRegistry';
import type { DiagramTypePlugin } from '../../../../types/plugin';
import { useFlowchartCanvasCommands } from '../useFlowchartCanvasCommands';
import { useFlowchartExternalEvents } from '../useFlowchartExternalEvents';
import { useFlowchartPluginRuntime } from '../useFlowchartPluginRuntime';
import { useFlowchartShellState } from '../useFlowchartShellState';

const makePlugin = (id: string): DiagramTypePlugin => ({
    id,
    name: 'Test Plugin',
    parseData: () => ({ nodes: [], edges: [] }),
    serializeData: () => ({}),
    getEmptyState: () => ({ nodes: [], edges: [] }),
    getSupportedLayouts: () => [],
    getDefaultLayout: () => 'grid',
    getNodeTypes: () => ({}),
    getEdgeTypes: () => ({}),
});

describe('flowchart designer architecture hooks', () => {
    afterEach(() => {
        PluginRegistry.getInstance().unregister('flowchart-hook-test');
        vi.restoreAllMocks();
    });

    it('owns shell grid and presentation state transitions', async () => {
        const { result, rerender } = renderHook(
            ({ grid }) => useFlowchartShellState(grid),
            { initialProps: { grid: { style: 'dots' } as unknown } },
        );

        await waitFor(() => expect(result.current.gridVariant).toBe(BackgroundVariant.Dots));
        expect(result.current.showGrid).toBe(true);

        rerender({ grid: { style: 'hidden' } });
        await waitFor(() => expect(result.current.showGrid).toBe(false));

        act(() => result.current.setPresentationActive(true));
        act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' })));
        expect(result.current.laserEnabled).toBe(true);
        act(() => result.current.setPresentationActive(false));
        await waitFor(() => expect(result.current.laserEnabled).toBe(false));
    });

    it('wires canvas commands to state setters without duplicating canvas state', () => {
        const setGridVariant = vi.fn();
        const setShowGrid = vi.fn();
        const setJsonEditorVisible = vi.fn();
        const updateNodesBatch = vi.fn();
        const selectedNodes = [{ id: 'node-1' }, { id: 'node-2' }] as Node[];
        const { result } = renderHook(() => useFlowchartCanvasCommands({
            t: ((key: string) => key) as never,
            getNodes: () => selectedNodes,
            getEdges: () => [],
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            takeSnapshot: vi.fn(),
            handleStrategyLayout: vi.fn(),
            isReadonly: false,
            gridVariant: BackgroundVariant.Lines,
            setGridVariant,
            setShowGrid,
            setJsonEditorVisible,
            reactFlowInstance: null,
            viewport: { x: 0, y: 0, zoom: 1 },
            createFromTemplate: vi.fn(() => ({ nodes: [], edges: [] })),
            selectedNodes,
            updateNodesBatch,
        }));

        act(() => result.current.handleGridRotate());
        act(() => result.current.handleExport());
        act(() => result.current.handleOpacity(0.5));

        expect(setGridVariant).toHaveBeenCalledWith(BackgroundVariant.Dots);
        expect(setShowGrid).toHaveBeenCalledWith(true);
        expect(setJsonEditorVisible).toHaveBeenCalledWith(true);
        expect(updateNodesBatch).toHaveBeenCalledWith(
            ['node-1', 'node-2'],
            { style: { opacity: 0.5 } },
        );
    });

    it('binds external snapshot events to current canvas getters', () => {
        const nodes = [{ id: 'node-1' }] as Node[];
        const edges = [{ id: 'edge-1', source: 'node-1', target: 'node-1' }] as Edge[];
        const takeSnapshot = vi.fn();
        const command = {
            handleSmartLayout: vi.fn(),
            handleStrategyLayout: vi.fn(),
            handleExport: vi.fn(),
            setAiChatVisible: vi.fn(),
            setActiveRightTab: vi.fn(),
            reactFlowInstance: null,
            activePlugin: undefined,
            setNodes: vi.fn(),
            newNodeLabel: 'New Node',
            confirmClearCanvas: vi.fn(),
        };

        renderHook(() => useFlowchartExternalEvents({
            snapshot: { getNodes: () => nodes, getEdges: () => edges, takeSnapshot },
            reverseImport: { notifySuccess: vi.fn(), scheduleFitView: vi.fn() },
            focus: {
                reactFlowInstance: null,
                getNodes: () => nodes,
                getEdges: () => edges,
                setSelectedNodes: vi.fn(),
                setSelectedEdges: vi.fn(),
            },
            command,
            summary: {
                nodesRef: { current: nodes },
                edgesRef: { current: edges },
                label: 'Summary',
                takeSnapshot,
                setNodes: vi.fn(),
            },
        }));

        act(() => window.dispatchEvent(new Event('diagram:save-snapshot')));
        expect(takeSnapshot).toHaveBeenCalledWith(nodes, edges);
    });

    it('initializes and destroys plugin runtime while sanitizing added nodes', () => {
        const plugin = makePlugin('flowchart-hook-test');
        plugin.onInit = vi.fn();
        plugin.onDestroy = vi.fn();
        const registry = PluginRegistry.getInstance();
        registry.register(plugin);
        const setNodes = vi.fn();
        const takeSnapshot = vi.fn();

        const { result, unmount } = renderHook(() => useFlowchartPluginRuntime({
            pluginId: plugin.id,
            diagramId: 'diagram-1',
            getNodes: () => [],
            getEdges: () => [],
            setNodes,
            setEdges: vi.fn(),
            updateNodesBatch: vi.fn(),
            updateEdgesBatch: vi.fn(),
            takeSnapshot,
            reactFlowInstance: null,
            reactFlowWrapper: { current: null },
            activeLayerId: 'default',
            isMobile: false,
            t: ((key: string) => key) as never,
            onMobileNodeAdded: vi.fn(),
            notifyNodeAdded: vi.fn(),
        }));

        expect(plugin.onInit).toHaveBeenCalledWith(result.current.pluginCtx);
        let appendedNodes: Node[] = [];
        setNodes.mockImplementation((updater) => {
            appendedNodes = updater([]);
        });
        act(() => {
            result.current.pluginCtx?.addNode('unsafe/type', ['invalid-data'], { x: 1, y: 2 });
        });

        expect(takeSnapshot).toHaveBeenCalledWith([], []);
        expect(appendedNodes[0]).toMatchObject({
            type: 'custom',
            position: { x: 1, y: 2 },
            data: { label: 'designer.flowchart.newNode', layer: 'default' },
        });

        unmount();
        expect(plugin.onDestroy).toHaveBeenCalled();
    });
});
