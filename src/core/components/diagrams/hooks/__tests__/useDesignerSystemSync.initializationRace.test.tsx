// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { Edge, Node } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import i18next, { type i18n } from 'i18next';
import type { ReactNode, SetStateAction } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import en from '../../../../../locales/en.json';
import zh from '../../../../../locales/zh.json';

interface SavedCanvas {
  diagramId: string;
  nodes: Node[];
  edges: Edge[];
  isFreshSeed: boolean;
  requiresRecoveryReview?: boolean;
  timestamp: number;
  metadata?: unknown;
  routingSnapshot?: unknown;
}

const mocks = vi.hoisted(() => {
  const lookups = new Map<string, { id: string; ready: true; preset: { id: string } }>();
  const markFunctions = new Map<string, () => void>();
  const marks: string[] = [];
  const initializedIds = new Set<string>();
  const autoSaveEnabledValues: boolean[] = [];
  const registeredBridges = new Map<string, Record<string, unknown>>();
  const routingSnapshot = { schema: 'routing-test-snapshot' };

  return {
    marks,
    initializedIds,
    autoSaveEnabledValues,
    registeredBridges,
    routingSnapshot,
    loadSaved: vi.fn<() => SavedCanvas | null>(() => null),
    clearSaved: vi.fn(),
    saveNow: vi.fn(),
    recalculateAutosaveNodeSizes: vi.fn(async (nodes: Node[]) => nodes),
    registerRoutingCandidate: vi.fn(),
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
  recalculateAutosaveNodeSizes: mocks.recalculateAutosaveNodeSizes,
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
  registerFlowDataBridge: (id: string, entry: Record<string, unknown>) => {
    mocks.registeredBridges.set(id, entry);
    return () => mocks.registeredBridges.delete(id);
  },
  registerFlowDesignerCloudOpener: () => () => undefined,
}));

vi.mock('../../../shared/baseReactFlowDisplayCommittedSnapshot', () => ({
  createBaseReactFlowRoutingOnlyDocumentSnapshot: () => mocks.routingSnapshot,
}));

vi.mock('../../../../routing/routingDocumentCandidateRegistry', () => ({
  registerRoutingOnlyDocumentCandidate: mocks.registerRoutingCandidate,
}));

vi.mock('../../../../services/EdgeRoutingCoordinator', () => ({
  EdgeRoutingCoordinator: {
    getInstance: () => ({
      freeze: vi.fn(),
      unfreeze: vi.fn(),
    }),
  },
}));

vi.mock('../../../../utils/animateLayoutTransition', () => ({
  cancelLayoutTransition: vi.fn(),
  suspendLayoutTransitions: vi.fn(),
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

let testI18n: i18n;

beforeAll(async () => {
  testI18n = i18next.createInstance();
  await testI18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      zh: { translation: zh },
    },
    interpolation: { escapeValue: false },
  });
});

describe('useDesignerSystemSync initialization race safety', () => {
  const pending = new Map<string, DeferredCanvas[]>();

  beforeEach(async () => {
    await testI18n.changeLanguage('en');
    window.history.replaceState({}, '', '/');
    pending.clear();
    mocks.marks.length = 0;
    mocks.initializedIds.clear();
    mocks.autoSaveEnabledValues.length = 0;
    mocks.registeredBridges.clear();
    mocks.loadSaved.mockReset().mockReturnValue(null);
    mocks.clearSaved.mockClear();
    mocks.saveNow.mockClear();
    mocks.recalculateAutosaveNodeSizes.mockReset().mockImplementation(async (nodes: Node[]) => nodes);
    mocks.registerRoutingCandidate.mockReset();
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

  const renderSync = (
    initialId: string,
    messageApi?: Pick<MessageInstance, 'info' | 'success'>,
  ) => {
    const setNodes = createSetter<Node>();
    const setEdges = createSetter<Edge>();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
    );
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
        messageApi,
      }),
      { initialProps: { id: initialId }, wrapper },
    );
    return { ...hook, setNodes, setEdges };
  };

  it('exposes only the Canvas committed routing snapshot to save bridges', () => {
    renderSync('diagram-routing-snapshot');

    const bridge = mocks.registeredBridges.get('diagram-routing-snapshot');
    expect(bridge).toBeDefined();
    expect(bridge?.routingSnapshot).toBe(mocks.routingSnapshot);
    expect((bridge?.getCanvasSnapshot as (() => unknown) | undefined)?.()).toEqual({
      nodes: [],
      edges: [],
      routingSnapshot: mocks.routingSnapshot,
    });
  });

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

  it('enables standard-preset autosave once initialization completes', () => {
    mocks.initializedIds.add('blank-canvas-template');
    renderSync('blank-canvas-template');

    expect(mocks.autoSaveEnabledValues.at(-1)).toBe(true);
  });

  it('restores a standard-preset autosave instead of clearing it', async () => {
    const restoredCanvas = canvasFor('restored-standard-node');
    const routingSnapshot = { schema: 'autosave-routing-candidate' };
    mocks.loadSaved.mockReturnValue({
      diagramId: 'blank-canvas-template',
      nodes: restoredCanvas.nodes,
      edges: restoredCanvas.edges,
      timestamp: Date.now(),
      isFreshSeed: false,
      routingSnapshot,
    });

    const { setNodes } = renderSync('blank-canvas-template');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const committedNodeIds = setNodes.mock.calls.flatMap(([value]) => (
      Array.isArray(value) && value[0] ? [value[0].id] : []
    ));
    expect(committedNodeIds).toEqual(['restored-standard-node']);
    expect(mocks.clearSaved).not.toHaveBeenCalled();
    expect(mocks.loadStandardPresetCanvas).not.toHaveBeenCalled();
    expect(mocks.registerRoutingCandidate).toHaveBeenCalledOnce();
    expect(mocks.registerRoutingCandidate).toHaveBeenCalledWith(routingSnapshot);
  });

  it.each([
    ['en', 'Your last edit was restored. Review it before continuing.'],
    ['zh', '已恢复上次编辑内容，请检查后继续'],
  ] as const)('announces autosave recovery in %s', async (language, expectedMessage) => {
    await testI18n.changeLanguage(language);
    const info = vi.fn<MessageInstance['info']>();
    const success = vi.fn<MessageInstance['success']>();
    mocks.loadSaved.mockReturnValue({
      diagramId: 'blank-canvas-template',
      ...canvasFor('restored-localized-node'),
      timestamp: Date.now(),
      isFreshSeed: false,
      requiresRecoveryReview: true,
    });

    renderSync('blank-canvas-template', { info, success });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(info).toHaveBeenCalledWith({
      key: 'flowchart-autosave-recovery',
      content: expectedMessage,
      duration: 5,
    });
    expect(success).not.toHaveBeenCalled();
  });

  it('restores a routine autosave without claiming that recovery occurred', async () => {
    const info = vi.fn<MessageInstance['info']>();
    const success = vi.fn<MessageInstance['success']>();
    mocks.loadSaved.mockReturnValue({
      diagramId: 'blank-canvas-template',
      ...canvasFor('routine-autosave-node'),
      timestamp: Date.now(),
      isFreshSeed: false,
    });

    renderSync('blank-canvas-template', { info, success });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(info).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
  });

  it.each([
    ['en', 'Template loaded'],
    ['zh', '模板加载成功'],
  ] as const)('announces a fresh template load in %s', async (language, expectedMessage) => {
    await testI18n.changeLanguage(language);
    const info = vi.fn<MessageInstance['info']>();
    const success = vi.fn<MessageInstance['success']>();
    mocks.loadSaved.mockReturnValue({
      diagramId: 'blank-canvas-template',
      ...canvasFor('fresh-localized-node'),
      timestamp: Date.now(),
      isFreshSeed: true,
    });

    renderSync('blank-canvas-template', { info, success });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(success).toHaveBeenCalledWith(expectedMessage);
    expect(info).not.toHaveBeenCalled();
  });

  it('loads the canonical preset without reading or overwriting an existing autosave', async () => {
    window.history.replaceState(
      {},
      '',
      '/?canonicalPreset=blank-canvas-template#/?diagram=blank-canvas-template',
    );
    mocks.loadSaved.mockReturnValue({
      diagramId: 'blank-canvas-template',
      nodes: [],
      edges: [],
      timestamp: Date.now(),
      isFreshSeed: false,
    });

    const { setNodes } = renderSync('blank-canvas-template');
    expect(mocks.autoSaveEnabledValues.at(-1)).toBe(false);
    expect(mocks.loadSaved).not.toHaveBeenCalled();

    await act(async () => {
      pending.get('blank-canvas-template')?.[0]?.resolve(canvasFor('canonical-standard-node'));
      await Promise.resolve();
    });

    const committedNodeIds = setNodes.mock.calls.flatMap(([value]) => (
      Array.isArray(value) && value[0] ? [value[0].id] : []
    ));
    expect(committedNodeIds).toEqual(['canonical-standard-node']);
    expect(mocks.clearSaved).not.toHaveBeenCalled();
    expect(mocks.saveNow).not.toHaveBeenCalled();
  });
});
