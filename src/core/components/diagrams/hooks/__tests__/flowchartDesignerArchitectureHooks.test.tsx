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
import { useFlowchartNodeFocus } from '../useFlowchartNodeFocus';

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
            showGrid: true,
            gridVariant: BackgroundVariant.Lines,
            setGridVariant,
            setShowGrid,
            reactFlowInstance: null,
            viewport: { x: 0, y: 0, zoom: 1 },
            createFromTemplate: vi.fn(() => ({ nodes: [], edges: [] })),
            templates: [],
            selectedNodes,
            updateNodesBatch,
        }));

        act(() => result.current.handleGridRotate());
        act(() => result.current.handleOpacity(0.5));

        expect(setGridVariant).toHaveBeenCalledWith(BackgroundVariant.Dots);
        expect(setShowGrid).not.toHaveBeenCalled();
        expect(updateNodesBatch).toHaveBeenCalledWith(
            ['node-1', 'node-2'],
            { style: { opacity: 0.5 } },
        );
    });

    it('cycles the grid through cross, hidden, and a stable visible default', () => {
        const baseOptions = {
            t: ((key: string) => key) as never,
            getNodes: () => [],
            getEdges: () => [],
            setNodes: vi.fn(),
            setEdges: vi.fn(),
            takeSnapshot: vi.fn(),
            handleStrategyLayout: vi.fn(),
            isReadonly: false,
            setGridVariant: vi.fn(),
            setShowGrid: vi.fn(),
            reactFlowInstance: null,
            viewport: { x: 0, y: 0, zoom: 1 },
            createFromTemplate: vi.fn(() => ({ nodes: [], edges: [] })),
            templates: [],
            selectedNodes: [],
            updateNodesBatch: vi.fn(),
        };
        const { result, rerender } = renderHook(
            ({ showGrid, gridVariant }) => useFlowchartCanvasCommands({
                ...baseOptions,
                showGrid,
                gridVariant,
            }),
            { initialProps: { showGrid: true, gridVariant: BackgroundVariant.Cross } },
        );

        act(() => result.current.handleGridRotate());
        expect(baseOptions.setShowGrid).toHaveBeenLastCalledWith(false);
        expect(baseOptions.setGridVariant).not.toHaveBeenCalled();

        rerender({ showGrid: false, gridVariant: BackgroundVariant.Cross });
        act(() => result.current.handleGridRotate());
        expect(baseOptions.setGridVariant).toHaveBeenLastCalledWith(BackgroundVariant.Lines);
        expect(baseOptions.setShowGrid).toHaveBeenLastCalledWith(true);
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

    it('keeps controlled and visual node selection aligned after navigator focus', () => {
        const nodes = [
            { id: 'node-1', position: { x: 10, y: 20 }, data: {}, selected: true },
            { id: 'node-2', position: { x: 100, y: 120 }, data: {}, selected: false },
        ] as Node[];
        const edges = [
            { id: 'edge-1', source: 'node-1', target: 'node-2', selected: true },
        ] as Edge[];
        let renderedNodes = nodes;
        let renderedEdges = edges;
        const setSelectedNodes = vi.fn();
        const setSelectedEdges = vi.fn();
        const setCenter = vi.fn();
        const { result } = renderHook(() => useFlowchartNodeFocus({
            reactFlowInstance: { getZoom: vi.fn(() => 1), setCenter } as never,
            nodesRef: { current: nodes },
            setNodes: (update) => {
                renderedNodes = typeof update === 'function' ? update(renderedNodes) : update;
            },
            setEdges: (update) => {
                renderedEdges = typeof update === 'function' ? update(renderedEdges) : update;
            },
            setSelectedNodes,
            setSelectedEdges,
        }));

        act(() => result.current('node-2'));

        expect(setCenter).toHaveBeenCalledWith(150, 145, { duration: 800, zoom: 1.2 });
        expect(setSelectedNodes).toHaveBeenCalledWith([nodes[1]]);
        expect(setSelectedEdges).toHaveBeenCalledWith([]);
        expect(renderedNodes.map(node => node.selected)).toEqual([false, true]);
        expect(renderedEdges[0].selected).toBe(false);
    });

    it('initializes and destroys plugin runtime while sanitizing added nodes', async () => {
        const plugin = makePlugin('flowchart-hook-test');
        plugin.onInit = vi.fn();
        plugin.onDestroy = vi.fn();
        const registry = PluginRegistry.getInstance();
        registry.register(plugin);
        const setNodes = vi.fn();
        const setEdges = vi.fn();
        const setSelectedNodes = vi.fn();
        const setSelectedEdges = vi.fn();
        const takeSnapshot = vi.fn();

        const { result, unmount } = renderHook(() => useFlowchartPluginRuntime({
            pluginId: plugin.id,
            diagramId: 'diagram-1',
            getNodes: () => [],
            getEdges: () => [],
            setNodes,
            setEdges,
            setSelectedNodes,
            setSelectedEdges,
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
        let appendedNodes: Node[] = [{
            id: 'existing',
            position: { x: 0, y: 0 },
            data: {},
            selected: true,
        }];
        let updatedEdges: Edge[] = [{
            id: 'existing-edge',
            source: 'existing',
            target: 'existing',
            selected: true,
        }];
        setNodes.mockImplementation((updater) => {
            appendedNodes = updater(appendedNodes);
        });
        setEdges.mockImplementation((updater) => {
            updatedEdges = updater(updatedEdges);
        });
        act(() => {
            result.current.pluginCtx?.addNode('unsafe/type', ['invalid-data'], { x: 1, y: 2 });
        });

        expect(takeSnapshot).toHaveBeenCalledWith([], []);
        expect(appendedNodes[0].selected).toBe(false);
        expect(appendedNodes[1]).toMatchObject({
            type: 'custom',
            position: { x: 1, y: 2 },
            data: { label: 'designer.flowchart.newNode', layer: 'default' },
            selected: true,
        });
        expect(updatedEdges[0].selected).toBe(false);
        await waitFor(() => expect(setSelectedNodes).toHaveBeenCalledWith([appendedNodes[1]]));
        expect(setSelectedEdges).toHaveBeenCalledWith([]);

        unmount();
        expect(plugin.onDestroy).toHaveBeenCalled();
    });
});
