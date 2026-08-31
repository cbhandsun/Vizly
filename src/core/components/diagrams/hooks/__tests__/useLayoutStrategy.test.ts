import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { parsePersistedLayoutSelection, usePersistedLayoutSelection, useLayoutAutoSaveMetadata } from '../usePersistedLayoutSelection';
import {
  clearLayoutRuntimeAbsolutePosition,
  LAYERED_TREE_ROUTING_SPACING,
  loadLayoutStrategyPresetFromCandidates,
  normalizeLayoutVisibilityNodes,
  resolveLayoutStrategyGeneratedGroupOptions,
  resolveLayoutStrategyPresetFromCandidates,
  stripHiddenGeneratedLayoutNodes,
} from '../useLayoutStrategy';
import {
  prepareLayeredLayoutEdges,
  sanitizeLayoutEdges,
} from '../layeredLayoutEdgePreparation';

describe('persisted layout selection', () => {
  it('roundtrips layout metadata alongside pages and preserves the page restore result', () => {
    const page = { nodes: [], edges: [] };
    const restorePages = vi.fn(() => page);
    const multiPage = { getPersistedMetadata: () => ({ multiPage: { version: 1 } }), restorePersistedMetadata: restorePages };
    const { result } = renderHook(() => {
      const selection = usePersistedLayoutSelection('first');
      return { ...selection, ...useLayoutAutoSaveMetadata(multiPage, selection.layoutSelection, selection.restoreLayoutSelection) };
    });
    const saved = { multiPage: { version: 1 }, layoutSelection: { version: 1, strategy: 'domain-lanes', direction: 'LR', nodeLayout: 'grid' } };
    act(() => expect(result.current.restoreAutoSaveMetadata(saved)).toBe(page));
    expect(restorePages).toHaveBeenCalledWith(saved);
    expect(result.current.getAutoSaveMetadata()).toEqual(saved);
    expect(result.current.lastDomainDirection).toBe('LR');
  });
  it.each(['TB', 'LR', 'BT', 'RL'] as const)('restores %s without running layout and isolates another diagram', direction => {
    const { result, rerender } = renderHook(({ id }) => usePersistedLayoutSelection(id), { initialProps: { id: 'first' } });
    act(() => result.current.restoreLayoutSelection({ layoutSelection: { version: 1, strategy: 'domain-lanes', direction, nodeLayout: 'dagre' } }));
    expect(result.current.lastDomainStrategy).toBe('domain-lanes');
    expect(result.current.lastDomainDirection).toBe(direction);
    expect(parsePersistedLayoutSelection({ layoutSelection: result.current.layoutSelection })).toEqual(result.current.layoutSelection);
    rerender({ id: 'second' });
    expect(result.current.lastDomainDirection).toBe('TB');
    expect(result.current.lastDomainStrategy).toBe('domain-dagre');
    act(() => { result.current.setLastDomainStrategy('tree'); result.current.setLastDomainDirection('RL'); });
    expect(result.current.lastDomainStrategy).toBe('tree');
    expect(result.current.lastDomainDirection).toBe('RL');
    act(() => result.current.restoreLayoutSelection(null));
    expect(result.current.lastDomainDirection).toBe('TB');
  });
  it.each([null, {}, [], { layoutSelection: null }, { layoutSelection: { version: 2 } },
    { layoutSelection: { version: 1, strategy: '<img onerror=alert(1)>', direction: 'TB', nodeLayout: 'dagre' } },
    { layoutSelection: { version: 1, strategy: 'tree', direction: 'diagonal', nodeLayout: 'dagre' } },
    { layoutSelection: { version: 1, strategy: 'tree', direction: 'LR', nodeLayout: [] } },
    { layoutSelection: { version: 1, strategy: 'x'.repeat(10_000), direction: 'TB', nodeLayout: 'dagre' } },
  ])('rejects malformed, unsupported or unsafe metadata', value => {
    expect(parsePersistedLayoutSelection(value)).toBeNull();
  });
});

describe('LAYERED_TREE_ROUTING_SPACING', () => {
  it('reserves two terminal stubs and a routing channel between ranks', () => {
    expect(LAYERED_TREE_ROUTING_SPACING.levelSpacing).toBeGreaterThanOrEqual(48 * 2 + 24);
    expect(LAYERED_TREE_ROUTING_SPACING.nodeSpacing).toBeGreaterThanOrEqual(48 * 2 + 24);
  });
});

describe('clearLayoutRuntimeAbsolutePosition', () => {
  it('removes stale React Flow geometry from a staged node', () => {
    const node = {
      id: 'node',
      position: { x: 400, y: 500 },
      positionAbsolute: { x: 10, y: 20 },
      data: {},
    } as Node & { positionAbsolute: { x: number; y: number } };

    const result = clearLayoutRuntimeAbsolutePosition(node) as Node & {
      positionAbsolute?: unknown;
    };

    expect(result.position).toEqual({ x: 400, y: 500 });
    expect(result.positionAbsolute).toBeUndefined();
  });
});

describe('prepareLayeredLayoutEdges', () => {
  const nodes = [
    {
      id: 'source',
      position: { x: 0, y: 0 },
      width: 200,
      height: 80,
      data: {},
    },
    {
      id: 'below',
      position: { x: 40, y: 180 },
      width: 200,
      height: 80,
      data: {},
    },
    {
      id: 'same-rank',
      position: { x: 420, y: 0 },
      width: 200,
      height: 80,
      data: {},
    },
  ] as Node[];

  it('keeps a forward TB edge on the vertical axis', () => {
    const [edge] = prepareLayeredLayoutEdges(nodes, [{
      id: 'forward',
      source: 'source',
      target: 'below',
    }] as Edge[], 'TB');

    expect(edge).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' });
  });

  it.each([
    ['BT', { x: 40, y: 180 }, { x: 0, y: 0 }, 'top', 'bottom'],
    ['RL', { x: 420, y: 0 }, { x: 0, y: 0 }, 'left', 'right'],
  ] as const)(
    'keeps a reverse %s edge on its directed terminal axis',
    (direction, sourcePosition, targetPosition, sourceHandle, targetHandle) => {
      const reverseNodes = [
        { id: 'source', position: sourcePosition, width: 200, height: 80, data: {} },
        { id: 'target', position: targetPosition, width: 200, height: 80, data: {} },
      ] as Node[];
      const [edge] = prepareLayeredLayoutEdges(reverseNodes, [{
        id: 'reverse', source: 'source', target: 'target',
      }] as Edge[], direction);

      expect(edge).toMatchObject({ sourceHandle, targetHandle });
    },
  );

  it('uses horizontal candidates for a same-rank edge in a TB layout', () => {
    const [edge] = prepareLayeredLayoutEdges(nodes, [{
      id: 'same-rank',
      source: 'source',
      target: 'same-rank',
    }] as Edge[], 'TB');

    expect(edge).toMatchObject({ sourceHandle: 'right', targetHandle: 'left' });
  });

  it('uses side ports for a far diagonal cross-layer edge', () => {
    const farDiagonalNodes = [
      { id: 'source', position: { x: 0, y: 0 }, width: 200, height: 80, data: {} },
      { id: 'target', position: { x: 1_200, y: 400 }, width: 200, height: 80, data: {} },
    ] as Node[];
    const [edge] = prepareLayeredLayoutEdges(farDiagonalNodes, [{
      id: 'far-diagonal',
      source: 'source',
      target: 'target',
    }] as Edge[], 'TB');

    expect(edge).toMatchObject({ sourceHandle: 'right', targetHandle: 'left' });
  });

  it('resolves cross-container ports from absolute rather than relative geometry', () => {
    const nestedNodes = [
      { id: 'source-domain', position: { x: 0, y: 400 }, data: {} },
      { id: 'target-domain', position: { x: 1_500, y: 0 }, data: {} },
      {
        id: 'source',
        parentId: 'source-domain',
        position: { x: 100, y: 0 },
        width: 200,
        height: 80,
        data: {},
      },
      {
        id: 'target',
        parentId: 'target-domain',
        position: { x: 100, y: 0 },
        width: 200,
        height: 80,
        data: {},
      },
    ] as Node[];
    const [edge] = prepareLayeredLayoutEdges(nestedNodes, [{
      id: 'cross-container',
      source: 'source',
      target: 'target',
    }] as Edge[], 'LR');

    expect(edge).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
    });
  });

  it('uses safe dimensions when staged nodes have not been measured yet', () => {
    const unmeasuredNodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 400, y: 0 }, data: {} },
    ] as Node[];
    const [edge] = prepareLayeredLayoutEdges(unmeasuredNodes, [{
      id: 'same-rank-unmeasured',
      source: 'source',
      target: 'target',
    }] as Edge[], 'TB');

    expect(edge).toMatchObject({ sourceHandle: 'right', targetHandle: 'left' });
  });

  it('removes route ownership from the previous layout before staging', () => {
    const [edge] = prepareLayeredLayoutEdges(nodes, [{
      id: 'stale-route',
      source: 'source',
      target: 'below',
      type: 'stablePath',
      data: {
        computedPath: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        elkPath: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        treeRouting: { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
        layoutPathLocked: true,
        _layoutPathLocked: true,
        runtimeHandleLock: { source: true, target: true },
        _runtimeHandleLock: true,
        auto: true,
        autoSource: true,
        autoTarget: true,
        isTreeBus: true,
        sharedTrunkAware: true,
        sharedTrunkSynthesized: true,
        useElkRouting: true,
        h: [';1,2;'],
        pathOptions: 'invalid',
        businessMarker: 'preserved',
      },
    }] as Edge[], 'TB');
    const data = edge.data as Record<string, unknown>;

    expect(edge.type).toBe('advanced-smart-step');
    expect(data.computedPath).toBeUndefined();
    expect(data.elkPath).toBeUndefined();
    expect(data.treeRouting).toBeUndefined();
    expect(data.layoutPathLocked).toBeUndefined();
    expect(data._layoutPathLocked).toBeUndefined();
    expect(data._runtimeHandleLock).toBeUndefined();
    expect(data.auto).toBeUndefined();
    expect(data.autoSource).toBeUndefined();
    expect(data.autoTarget).toBeUndefined();
    expect(data.isTreeBus).toBeUndefined();
    expect(data.sharedTrunkAware).toBeUndefined();
    expect(data.sharedTrunkSynthesized).toBeUndefined();
    expect(data.useElkRouting).toBeUndefined();
    expect(data.h).toBeUndefined();
    expect(data.businessMarker).toBe('preserved');
    expect(data).toMatchObject({
      intraContainerNoObstacle: true,
      obstacleScope: 'corridor',
      obstaclePadding: 24,
      pathOptions: { gridRatio: 1.04, borderRadius: 4 },
      layoutDirection: 'TB',
    });
  });

  it('promotes a freshly calculated locked route to a hidden Worker candidate', () => {
    const computedPath = [
      { x: 200, y: 40 },
      { x: 300, y: 40 },
      { x: 300, y: 180 },
      { x: 140, y: 180 },
    ];
    const [edge] = prepareLayeredLayoutEdges(nodes, [{
      id: 'fresh-layout-route',
      source: 'source',
      target: 'below',
      type: 'stablePath',
      data: {
        computedPath,
        layoutPathLocked: true,
        algorithm: 'domain-dagre-full',
      },
    }] as Edge[], 'TB', { promoteLockedComputedPath: true });

    expect(edge).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'top',
      type: 'advanced-smart-step',
      data: {
        computedPath: undefined,
        elkPath: computedPath,
        layoutRoutingCandidate: true,
      },
    });
  });

  it('uses the terminal segment axis when a route ends on an ambiguous side boundary', () => {
    const ambiguousNodes = [
      { id: 'source', position: { x: 0, y: 0 }, width: 200, height: 80, data: {} },
      { id: 'target', position: { x: 40, y: 180 }, width: 200, height: 80, data: {} },
    ] as Node[];
    const verticalRouteEndingAtTargetLeftCenter = [
      { x: 40, y: 80 },
      { x: 40, y: 220 },
    ];

    const [edge] = prepareLayeredLayoutEdges(ambiguousNodes, [{
      id: 'axis-authoritative',
      source: 'source',
      target: 'target',
      data: {
        layoutRoutingCandidate: true,
        elkPath: verticalRouteEndingAtTargetLeftCenter,
      },
    }] as Edge[], 'TB');

    expect(edge).toMatchObject({
      sourceHandle: 'bottom',
      targetHandle: 'top',
      data: {
        elkPath: verticalRouteEndingAtTargetLeftCenter,
        layoutRoutingCandidate: true,
      },
    });
  });

  it('does not promote an unlocked or malformed computed path', () => {
    const [unlocked, malformed] = prepareLayeredLayoutEdges(nodes, [{
      id: 'unlocked', source: 'source', target: 'below',
      data: { computedPath: [{ x: 200, y: 40 }, { x: 40, y: 180 }] },
    }, {
      id: 'malformed', source: 'source', target: 'below',
      data: {
        layoutPathLocked: true,
        computedPath: [{ x: 200, y: 40 }, { x: Number.NaN, y: 180 }],
      },
    }] as Edge[], 'TB', { promoteLockedComputedPath: true });

    expect(unlocked.data?.layoutRoutingCandidate).toBeUndefined();
    expect(unlocked.data?.elkPath).toBeUndefined();
    expect(malformed.data?.layoutRoutingCandidate).toBeUndefined();
    expect(malformed.data?.elkPath).toBeUndefined();
  });
});

describe('sanitizeLayoutEdges', () => {
  it.each([
    ['TB', 'bottom', 'top'],
    ['BT', 'top', 'bottom'],
    ['LR', 'right', 'left'],
    ['RL', 'left', 'right'],
  ] as const)(
    'assigns directed terminal sides for an unrestricted %s layered edge',
    (direction, sourceHandle, targetHandle) => {
      const nodes = [
        { id: 'source', position: { x: 0, y: 0 }, data: {} },
        { id: 'target', position: { x: 120, y: 120 }, data: {} },
      ] as Node[];
      const edges = [{
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        sourceHandle: null,
        targetHandle: null,
        data: {},
      }] as Edge[];

      const [edge] = sanitizeLayoutEdges(nodes, edges, direction);

      expect(edge.sourceHandle).toBe(sourceHandle);
      expect(edge.targetHandle).toBe(targetHandle);
    },
  );

  it('preserves layout path trust metadata from the routing strategy', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 0, y: 120 }, data: {} },
    ] as Node[];
    const edges = [
      {
        id: 'edge-source-target',
        source: 'source',
        target: 'target',
        sourceHandle: 'b',
        targetHandle: 't',
        data: {
          computedPath: [{ x: 50, y: 40 }, { x: 50, y: 120 }],
          layoutPathLocked: true,
          _layoutPathLocked: true,
          sharedTrunkAware: true,
          stablePathQuality: { strictCrossings: 0 },
          _layoutEpoch: 123,
        },
      },
    ] as Edge[];

    const [edge] = sanitizeLayoutEdges(nodes, edges, 'TB');

    expect(edge.sourceHandle).toBe('bottom');
    expect(edge.targetHandle).toBe('top');
    expect(edge.type).not.toBe('stablePath');
    expect(edge.data).toMatchObject({
      layoutPathLocked: true,
      _layoutPathLocked: true,
      sharedTrunkAware: true,
      stablePathQuality: { strictCrossings: 0 },
      _layoutEpoch: 123,
    });
    expect((edge.data as any).computedPath).toEqual([
      { x: 50, y: 40 },
      { x: 50, y: 120 },
    ]);
  });

  it('does not manufacture an unvalidated orthogonal bend for a diagonal layout candidate', () => {
    const nodes = [
      { id: 'source', position: { x: 0, y: 0 }, data: {} },
      { id: 'target', position: { x: 120, y: 120 }, data: {} },
    ] as Node[];
    const candidate = [
      { x: 100, y: 40 },
      { x: 95, y: 41 },
      { x: 95, y: 120 },
    ];
    const [edge] = sanitizeLayoutEdges(nodes, [{
      id: 'edge-source-target',
      source: 'source',
      target: 'target',
      data: {
        computedPath: candidate,
        layoutPathLocked: true,
      },
    }], 'LR');

    expect(edge.type).not.toBe('stablePath');
    expect((edge.data as Record<string, unknown>).computedPath).toEqual(candidate);
  });
});

describe('resolveLayoutStrategyGeneratedGroupOptions', () => {
  it('preserves standard preset group visibility contracts', () => {
    expect(resolveLayoutStrategyGeneratedGroupOptions({
      layout: {
        generateDomainGroups: false,
        generateSubDomainGroups: true,
        domainWhitelist: ['external'],
        subDomainWhitelist: ['物流执行层'],
      },
    })).toEqual({
      generateDomainGroups: false,
      generateSubDomainGroups: true,
      domainWhitelist: ['external'],
      subDomainWhitelist: ['物流执行层'],
    });
  });

  it('keeps legacy layout defaults when presets do not specify group visibility', () => {
    expect(resolveLayoutStrategyGeneratedGroupOptions({ layout: {} })).toEqual({
      generateDomainGroups: true,
      generateSubDomainGroups: true,
      domainWhitelist: undefined,
      subDomainWhitelist: undefined,
    });
  });

  it('preserves a subdomain-only canvas contract when preset lookup is unavailable', () => {
    const currentNodes = [
      {
        id: 'subgroup-wms-tms-物流执行层',
        type: 'subGroup',
        position: { x: 0, y: 0 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
      {
        id: 'wms-outbound',
        type: 'custom',
        parentId: 'subgroup-wms-tms-物流执行层',
        position: { x: 40, y: 80 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
    ] as Node[];

    expect(resolveLayoutStrategyGeneratedGroupOptions(undefined, currentNodes)).toEqual({
      generateDomainGroups: false,
      generateSubDomainGroups: true,
      domainWhitelist: undefined,
      subDomainWhitelist: ['物流执行层'],
    });
  });
});

describe('stripHiddenGeneratedLayoutNodes', () => {
  it('removes hidden or contract-forbidden generated containers before rendering', () => {
    const nodes = [
      {
        id: 'titlegroup-external',
        type: 'titleGroup',
        position: { x: 0, y: 0 },
        data: { domain: 'external' },
      },
      {
        id: 'subgroup-wms-tms-物流执行层',
        type: 'subGroup',
        position: { x: 0, y: 0 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
      {
        id: 'titlegroup-hidden',
        type: 'titleGroup',
        hidden: true,
        position: { x: 0, y: 0 },
        data: { domain: 'hidden', hidden: true },
      },
      {
        id: 'wms-outbound',
        type: 'custom',
        position: { x: 40, y: 80 },
        data: { domain: 'wms-tms', subDomain: '物流执行层' },
      },
    ] as Node[];

    expect(stripHiddenGeneratedLayoutNodes(nodes, {
      generateDomainGroups: false,
      generateSubDomainGroups: true,
      domainWhitelist: undefined,
      subDomainWhitelist: ['物流执行层'],
    }).map(node => node.id)).toEqual([
      'subgroup-wms-tms-物流执行层',
      'wms-outbound',
    ]);
  });
});

describe('resolveLayoutStrategyPresetFromCandidates', () => {
  it('falls back to later candidate ids when the first id is not a standard preset', () => {
    const preset = { layout: { generateDomainGroups: false } };

    expect(resolveLayoutStrategyPresetFromCandidates(
      { SystemsInteractionStandardData: preset },
      ['export-name', 'SystemsInteractionStandardData'],
    )).toEqual({
      id: 'SystemsInteractionStandardData',
      preset,
    });
  });
});

describe('loadLayoutStrategyPresetFromCandidates', () => {
  it('loads the preset map through the application-provided port', async () => {
    const preset = { layout: { domainOrder: ['业务域'] } };

    await expect(loadLayoutStrategyPresetFromCandidates(
      async () => ({ standard: preset }),
      ['missing', 'standard'],
    )).resolves.toEqual({ id: 'standard', preset });
  });

  it('returns no preset when the optional port is not configured', async () => {
    await expect(loadLayoutStrategyPresetFromCandidates(undefined, ['standard']))
      .resolves.toEqual({});
  });

  it('propagates provider failures to the layout error boundary', async () => {
    const failure = new Error('preset provider unavailable');

    await expect(loadLayoutStrategyPresetFromCandidates(
      async () => { throw failure; },
      ['standard'],
    )).rejects.toBe(failure);
  });
});

describe('normalizeLayoutVisibilityNodes', () => {
  it('preserves hidden generated containers during layout normalization', () => {
    const nodes = [
      {
        id: 'titlegroup-external',
        type: 'titleGroup',
        position: { x: 0, y: 0 },
        hidden: true,
        data: { domain: 'external', hidden: true },
      },
      {
        id: 'business',
        type: 'flowchart',
        position: { x: 10, y: 10 },
        data: { domain: 'external' },
      },
    ] as Node[];

    const result = normalizeLayoutVisibilityNodes(nodes);

    expect(result[0]).toMatchObject({
      id: 'titlegroup-external',
      hidden: true,
      data: { hidden: true },
    });
    expect(result[1]).toMatchObject({
      id: 'business',
      hidden: false,
    });
  });
});
