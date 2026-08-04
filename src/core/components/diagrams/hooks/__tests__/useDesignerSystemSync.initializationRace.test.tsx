// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const lookups = new Map<string, { id: string; ready: true; preset: { id: string } }>();
  const markFunctions = new Map<string, () => void>();
  const marks: string[] = [];
  const initializedIds = new Set<string>();
  const autoSaveEnabledValues: boolean[] = [];

  return {
    marks,
    initializedIds,
    autoSaveEnabledValues,
    loadSaved: vi.fn(() => null),
    clearSaved: vi.fn(),
    saveNow: vi.fn(),
    loadStandardPresetCanvas: vi.fn(),
    logPresetFailure: vi.fn(),
    getLookup(id: string) {
      let lookup = lookups.get(id);
      if (!lookup) {
        lookup = { id, ready: true, preset: { id } };
        lookups.set(id, lookup);
      }
      return lookup;
    },
    getMarkFunction(id: string) {
      let mark = markFunctions.get(id);
      if (!mark) {
        mark = () => { marks.push(id); };
        markFunctions.set(id, mark);
      }
      return mark;
    },
  };
});

vi.mock('../useAutoSave', () => ({
  useAutoSave: (
    _nodes: unknown,
    _edges: unknown,
    options: { enabled?: boolean } = {},
  ) => {
    mocks.autoSaveEnabledValues.push(options.enabled ?? true);
    return {
      loadSaved: mocks.loadSaved,
      clearSaved: mocks.clearSaved,
      saveNow: mocks.saveNow,
      saveState: { status: 'idle' },
    };
  },
}));

vi.mock('../useDesignerPresetInitialization', () => ({
  useDesignerPresetInitialization: (id: string | undefined) => {
    const stableId = id ?? '';
    return {
      activePresetLookup: mocks.getLookup(stableId),
      isCurrentDiagramInitialized: mocks.initializedIds.has(stableId),
      markCurrentDiagramInitialized: mocks.getMarkFunction(stableId),
    };
  },
}));

vi.mock('../standardPresetCanvasCache', () => ({
  loadStandardPresetCanvas: mocks.loadStandardPresetCanvas,
}));

vi.mock('../designerSystemSyncPersistence', () => ({
  clearDesignerFreshSeedFlag: vi.fn(),
  mergePresetExplicitEdgeHandles: (saved: unknown) => saved,
  recalculateAutosaveNodeSizes: vi.fn(),
  shouldUseGlobalDesignerPerformanceMode: () => false,
}));

vi.mock('../designerSystemSyncLogging', () => ({
  logDesignerSystemSyncAutoSaveFailure: vi.fn(),
  logDesignerSystemSyncAutosaveRecalculationFailure: vi.fn(),
  logDesignerSystemSyncDataRegistryImportFailure: vi.fn(),
  logDesignerSystemSyncDataRegistryWriteFailure: vi.fn(),
  logDesignerSystemSyncImportDataFailure: vi.fn(),
  logDesignerSystemSyncStaleAutosaveDetected: vi.fn(),
  logDesignerSystemSyncStandardDataToCanvasFailure: mocks.logPresetFailure,
}));

vi.mock('../../../../utils/flowDataBridge', () => ({
  registerFlowDataBridge: () => () => undefined,
  registerFlowDesignerCloudOpener: () => () => undefined,
}));

vi.mock('../../../../utils/animateLayoutTransition', () => ({
  cancelLayoutTransition: vi.fn(),
  suspendLayoutTransitions: vi.fn(),
}));

vi.mock('../../../../services/EdgeRoutingCoordinator', () => ({
  EdgeRoutingCoordinator: {
    getInstance: () => ({ freeze: vi.fn(), unfreeze: vi.fn() }),
  },
}));

vi.mock('../designerFlowDataBridgeProjection', () => ({
  analyzeDesignerCanvas: vi.fn(),
  projectDesignerStandardEdges: () => [],
  projectDesignerStandardNodes: () => ({ standardNodes: [], groups: [] }),
}));

import { useDesignerSystemSync } from '../useDesignerSystemSync';

interface DeferredCanvas {
  promise: Promise<{ nodes: Node[]; edges: Edge[] }>;
  resolve: (value: { nodes: Node[]; edges: Edge[] }) => void;
  reject: (reason: unknown) => void;
}

const createDeferredCanvas = (): DeferredCanvas => {
  let resolvePromise: DeferredCanvas['resolve'] = () => {
    throw new Error('Deferred canvas was not initialized');
  };
  let rejectPromise: DeferredCanvas['reject'] = () => {
    throw new Error('Deferred canvas was not initialized');
  };
  const promise = new Promise<{ nodes: Node[]; edges: Edge[] }>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

const canvasFor = (id: string) => ({
  nodes: [{ id, position: { x: 0, y: 0 }, data: {} }] satisfies Node[],
  edges: [] satisfies Edge[],
});

const createSetter = <T,>() => vi.fn<(value: SetStateAction<T[]>) => void>();

describe('useDesignerSystemSync initialization race safety', () => {
  const pending = new Map<string, DeferredCanvas[]>();

  beforeEach(() => {
    pending.clear();
    mocks.marks.length = 0;
    mocks.initializedIds.clear();
    mocks.autoSaveEnabledValues.length = 0;
    mocks.loadSaved.mockClear();
    mocks.clearSaved.mockClear();
    mocks.saveNow.mockClear();
    mocks.loadStandardPresetCanvas.mockReset();
    mocks.logPresetFailure.mockClear();
    mocks.loadStandardPresetCanvas.mockImplementation((id: string) => {
      const deferred = createDeferredCanvas();
      const attempts = pending.get(id) ?? [];
      attempts.push(deferred);
      pending.set(id, attempts);
      return deferred.promise;
    });
  });

  const renderSync = (initialId: string) => {
    const setNodes = createSetter<Node>();
    const setEdges = createSetter<Edge>();
    const hook = renderHook(
      ({ id }) => useDesignerSystemSync({
        id,
        diagramIdForExport: id,
        nodes: [],
        edges: [],
        setNodes,
        setEdges,
        reactFlowInstance: null,
        isDragging: false,
        pluginId: 'flowchart',
      }),
      { initialProps: { id: initialId } },
    );
    return { ...hook, setNodes, setEdges };
  };

  it('keeps the latest diagram when an older preset finishes last', async () => {
    const { rerender, setNodes } = renderSync('diagram-a');
    rerender({ id: 'diagram-b' });

    await act(async () => {
      pending.get('diagram-b')?.[0]?.resolve(canvasFor('node-b'));
      await Promise.resolve();
      pending.get('diagram-a')?.[0]?.resolve(canvasFor('node-a'));
      await Promise.resolve();
    });

    const committedNodeIds = setNodes.mock.calls.flatMap(([value]) => (
      Array.isArray(value) && value[0] ? [value[0].id] : []
    ));
    expect(committedNodeIds).toEqual(['node-b']);
    expect(mocks.marks).toEqual(['diagram-b']);
  });

  it('does not revive the first request during an A-B-A switch', async () => {
    const { rerender, setNodes } = renderSync('diagram-a');
    rerender({ id: 'diagram-b' });
    rerender({ id: 'diagram-a' });

    await act(async () => {
      pending.get('diagram-a')?.[1]?.resolve(canvasFor('node-a-current'));
      await Promise.resolve();
      pending.get('diagram-a')?.[0]?.resolve(canvasFor('node-a-stale'));
      pending.get('diagram-b')?.[0]?.resolve(canvasFor('node-b-stale'));
      await Promise.resolve();
    });

    const committedNodeIds = setNodes.mock.calls.flatMap(([value]) => (
      Array.isArray(value) && value[0] ? [value[0].id] : []
    ));
    expect(committedNodeIds).toEqual(['node-a-current']);
    expect(mocks.marks).toEqual(['diagram-a']);
  });

  it('suppresses stale failures and their completion state', async () => {
    const { rerender } = renderSync('diagram-a');
    rerender({ id: 'diagram-b' });

    await act(async () => {
      pending.get('diagram-a')?.[0]?.reject(new Error('stale failure'));
      pending.get('diagram-b')?.[0]?.resolve(canvasFor('node-b'));
      await Promise.resolve();
    });

    expect(mocks.logPresetFailure).not.toHaveBeenCalled();
    expect(mocks.marks).toEqual(['diagram-b']);
  });

  it('keeps custom-diagram autosave disabled until initialization completes', () => {
    renderSync('custom:loading');

    expect(mocks.autoSaveEnabledValues.at(-1)).toBe(false);
  });

  it('enables custom-diagram autosave once the active diagram is initialized', () => {
    mocks.initializedIds.add('custom:ready');
    renderSync('custom:ready');

    expect(mocks.autoSaveEnabledValues.at(-1)).toBe(true);
  });
});
