// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { BackgroundVariant, type Edge, type Node } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DiagramIntelligenceService, type OptimizationResult } from '@/core/services/DiagramIntelligenceService';
import { useFlowchartCanvasCommands } from '../hooks/useFlowchartCanvasCommands';

const { appMessageMock } = vi.hoisted(() => ({
  appMessageMock: {
    info: vi.fn(),
    open: vi.fn(),
  },
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
  appMessage: appMessageMock,
  appModal: { confirm: vi.fn() },
}));

const node = (overrides: Partial<Node> = {}): Node => ({
  id: 'node-1',
  position: { x: 13, y: 17 },
  data: { label: 'Node' },
  ...overrides,
});

const renderCommands = ({
  nodes = [node()],
  edges = [],
  isReadonly = false,
}: {
  nodes?: Node[];
  edges?: Edge[];
  isReadonly?: boolean;
} = {}) => {
  const setNodes = vi.fn();
  const setEdges = vi.fn();
  const takeSnapshot = vi.fn();
  const hook = renderHook(() => useFlowchartCanvasCommands({
    t: ((key: string) => key) as never,
    getNodes: () => nodes,
    getEdges: () => edges,
    setNodes,
    setEdges,
    takeSnapshot,
    handleStrategyLayout: vi.fn(),
    isReadonly,
    showGrid: true,
    gridVariant: BackgroundVariant.Lines,
    setGridVariant: vi.fn(),
    setShowGrid: vi.fn(),
    reactFlowInstance: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    createFromTemplate: vi.fn(() => ({ nodes: [], edges: [] })),
    templates: [],
    selectedNodes: [],
    updateNodesBatch: vi.fn(),
  }));
  return { ...hook, setNodes, setEdges, takeSnapshot };
};

describe('useFlowchartCanvasCommands smart optimize', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    appMessageMock.info.mockReset();
    appMessageMock.open.mockReset();
  });

  it('blocks command-level execution in read-only mode', async () => {
    const serviceSpy = vi.spyOn(DiagramIntelligenceService, 'getInstance');
    const state = renderCommands({ isReadonly: true });

    await act(async () => state.result.current.handleSmartOptimize());

    expect(serviceSpy).not.toHaveBeenCalled();
    expect(appMessageMock.info).toHaveBeenCalledWith('designer.flowchart.optimizeReadonly');
    expect(state.takeSnapshot).not.toHaveBeenCalled();
    expect(state.setNodes).not.toHaveBeenCalled();
  });

  it('reports empty canvases without creating state or history', async () => {
    const state = renderCommands({ nodes: [] });

    await act(async () => state.result.current.handleSmartOptimize());

    expect(appMessageMock.open).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'loading' }));
    expect(appMessageMock.open).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'info',
      content: 'designer.flowchart.optimizeEmpty',
    }));
    expect(state.takeSnapshot).not.toHaveBeenCalled();
    expect(state.setNodes).not.toHaveBeenCalled();
  });

  it('contains optimizer failures and leaves the canvas unchanged', async () => {
    const optimize = vi.fn(async (): Promise<OptimizationResult> => {
      throw new Error('failed');
    });
    vi.spyOn(DiagramIntelligenceService, 'getInstance').mockReturnValue({ optimize } as never);
    const state = renderCommands();

    await act(async () => state.result.current.handleSmartOptimize());

    expect(appMessageMock.open).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'error',
      content: 'designer.flowchart.optimizeFailed',
    }));
    expect(state.takeSnapshot).not.toHaveBeenCalled();
    expect(state.setNodes).not.toHaveBeenCalled();
    expect(state.setEdges).not.toHaveBeenCalled();
  });

  it('suppresses a second trigger while optimization is still running', async () => {
    let resolveOptimization: ((result: OptimizationResult) => void) | undefined;
    const optimize = vi.fn(() => new Promise<OptimizationResult>((resolve) => {
      resolveOptimization = resolve;
    }));
    vi.spyOn(DiagramIntelligenceService, 'getInstance').mockReturnValue({ optimize } as never);
    const nodes = [node()];
    const state = renderCommands({ nodes });

    let firstRun: Promise<void> | undefined;
    await act(async () => {
      firstRun = state.result.current.handleSmartOptimize();
      await state.result.current.handleSmartOptimize();
    });

    expect(optimize).toHaveBeenCalledOnce();
    expect(appMessageMock.info).toHaveBeenCalledWith('designer.flowchart.optimizeInProgress');

    resolveOptimization?.({
      nodes,
      edges: [],
      stats: { rectifiedOverlaps: 0, alignedNodes: 0 },
    });
    await act(async () => firstRun);
    expect(appMessageMock.open).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'info',
      content: 'designer.flowchart.optimizeUnchanged',
    }));
  });
});
