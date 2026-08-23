import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { EDGE_ROUTING_CACHE_VERSION } from '../../../../routing/routingVersion';

import {
  clearDesignerFreshSeedFlag,
  mergePresetExplicitEdgeHandles,
  recalculateAutosaveNodeSizes,
  shouldUseGlobalDesignerPerformanceMode,
  shouldUseScopedDesignerDragPerformanceMode,
} from '../designerSystemSyncPersistence';

describe('mergePresetExplicitEdgeHandles', () => {
  it('restores preset handles and removes the matching automatic sides', () => {
    const saved = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{
        id: 'edge', source: 'A', target: 'B',
        data: { auto: ['source', 'target', 42] },
      }],
    };
    const merged = mergePresetExplicitEdgeHandles(saved, {
      edges: [{ id: 'edge', sourceHandle: 'r', targetHandle: 'l' }],
    });

    expect(merged.edges[0]).toMatchObject({
      sourceHandle: 'right',
      targetHandle: 'left',
      data: { auto: [], autoSource: false, autoTarget: false, manualHandleSides: ['source', 'target'] },
    });
  });

  it('forces cross-subdomain edges outward and tolerates malformed records', () => {
    const saved = {
      nodes: [
        { id: 'A', data: { domain: 'D', subDomain: 'one' } },
        { id: 'B', data: { domain: 'D', subDomain: 'two' } },
      ],
      edges: [null, { id: 'edge', source: 'A', target: 'B' }],
    };
    const merged = mergePresetExplicitEdgeHandles(saved, { edges: 'invalid' });
    expect(merged.edges[0]).toBeNull();
    expect(merged.edges[1]).toMatchObject({ sourceHandle: 'right', targetHandle: 'left' });
    expect(mergePresetExplicitEdgeHandles(null, null)).toBeNull();
  });

  it('preserves compatibility with numeric preset edge identifiers', () => {
    const saved = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ id: '42', source: 'A', target: 'B' }],
    };
    const merged = mergePresetExplicitEdgeHandles(saved, {
      edges: [{ id: 42, sourceHandle: 'b', targetHandle: 't' }],
    });
    expect(merged.edges[0]).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' });
  });

  it('restores missing multi-domain semantic presentation without overwriting saved overrides', () => {
    const saved = {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [
        {
          id: 'main', source: 'A', target: 'B',
          style: { opacity: 0.75 },
          markerEnd: { type: 'arrowclosed' },
        },
        { id: 'data', source: 'A', target: 'B' },
        {
          id: 'support', source: 'A', target: 'B',
          style: { stroke: '#123456' },
          markerEnd: { type: 'arrowclosed' },
        },
      ],
    };
    const merged = mergePresetExplicitEdgeHandles(saved, {
      edges: [
        { id: 'main', type: 'main', style: { stroke: '#FF5722', strokeWidth: 3 } },
        { id: 'data', type: 'data', style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' } },
        { id: 'support', type: 'support', style: { stroke: '#78909C', strokeWidth: 2, strokeDasharray: '5 5' } },
      ],
    });

    expect(merged.edges[0]).toMatchObject({
      className: 'vizly-edge-role-main',
      style: { stroke: '#FF5722', strokeWidth: 3, opacity: 0.75 },
      markerEnd: { type: 'arrowclosed', color: '#FF5722' },
    });
    expect(merged.edges[1]).toMatchObject({
      className: 'vizly-edge-role-data',
      style: { stroke: '#47CACC', strokeWidth: 2, strokeDasharray: '6 4' },
      markerEnd: { type: 'arrowclosed', color: '#47CACC' },
    });
    expect(merged.edges[2]).toMatchObject({
      className: 'vizly-edge-role-support',
      style: { stroke: '#123456', strokeWidth: 2, strokeDasharray: '5 5' },
      markerEnd: { type: 'arrowclosed', color: '#123456' },
    });
  });

  it('replaces a stale semantic role class while preserving unrelated saved classes', () => {
    const merged = mergePresetExplicitEdgeHandles({
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{
        id: 'edge',
        source: 'A',
        target: 'B',
        className: 'user-authored vizly-edge-role-main',
      }],
    }, {
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ id: 'edge', source: 'A', target: 'B', type: 'data' }],
    });

    expect(merged.edges[0]).toMatchObject({
      className: 'user-authored vizly-edge-role-data',
    });
  });

  it('does not mutate preset input or derive marker colors from unsafe presentation tokens', () => {
    const preset = {
      edges: [{
        id: 'edge',
        style: {
          stroke: 'url(javascript:alert(1))',
          strokeWidth: Number.POSITIVE_INFINITY,
          strokeDasharray: '4 calc(2px)',
        },
        markerEnd: { type: 'arrowclosed', color: 'url(javascript:alert(1))' },
      }],
    };
    const presetSnapshot = structuredClone(preset);
    const merged = mergePresetExplicitEdgeHandles({
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ id: 'edge', source: 'A', target: 'B', style: {}, markerEnd: undefined }],
    }, preset);

    expect(merged.edges[0].style).toBeUndefined();
    expect(merged.edges[0].markerEnd).toEqual({ type: 'arrowclosed' });
    expect(preset).toEqual(presetSnapshot);
  });

  it('rejects unsafe autosave styles and external marker references in favor of the preset', () => {
    const merged = mergePresetExplicitEdgeHandles({
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{
        id: 'edge',
        source: 'A',
        target: 'B',
        style: {
          stroke: 'url(javascript:alert(1))',
          strokeWidth: 1_000,
          strokeDasharray: '4;stroke:red',
          opacity: 2,
          strokeLinecap: 'inherit',
          filter: 'url(https://attacker.example/filter.svg#x)',
        },
        markerEnd: 'url(javascript:alert(1))',
      }],
    }, {
      edges: [{
        id: 'edge',
        style: { stroke: '#FF5722', strokeWidth: 3, strokeDasharray: '6 4', opacity: 0.9 },
      }],
    });

    expect(merged.edges[0].style).toEqual({
      stroke: '#FF5722',
      strokeWidth: 3,
      strokeDasharray: '6 4',
      opacity: 0.9,
    });
    expect(merged.edges[0].markerEnd).toEqual({ type: 'arrowclosed', color: '#FF5722' });
  });

  it('keeps only safe autosave semantic overrides and internal marker fragments', () => {
    const merged = mergePresetExplicitEdgeHandles({
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{
        id: 'edge',
        source: 'A',
        target: 'B',
        style: {
          stroke: '#123456',
          strokeWidth: 4,
          strokeDasharray: '8, 4',
          opacity: 0.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'bevel',
          filter: 'drop-shadow(0 0 2px red)',
        },
        markerEnd: 'url(#vizly-marker-42)',
      }],
    }, {
      edges: [{ id: 'edge', style: { stroke: '#78909C', strokeWidth: 2 } }],
    });

    expect(merged.edges[0].style).toEqual({
      stroke: '#123456',
      strokeWidth: 4,
      strokeDasharray: '8, 4',
      opacity: 0.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'bevel',
    });
    expect(merged.edges[0].markerEnd).toBe('url(#vizly-marker-42)');
  });

  it.each([
    Number.POSITIVE_INFINITY,
    -1,
    0.1,
    25,
  ])('falls back to the preset for an unsafe autosave stroke width (%s)', (strokeWidth) => {
    const merged = mergePresetExplicitEdgeHandles({
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{ id: 'edge', source: 'A', target: 'B', style: { strokeWidth } }],
    }, {
      edges: [{ id: 'edge', style: { stroke: '#78909C', strokeWidth: 2 } }],
    });

    expect(merged.edges[0].style).toMatchObject({ stroke: '#78909C', strokeWidth: 2 });
  });

  it('sanitizes autosave-only edges even when no matching preset edge exists', () => {
    const merged = mergePresetExplicitEdgeHandles({
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{
        id: 'user-edge',
        source: 'A',
        target: 'B',
        style: {
          stroke: '#123456',
          strokeWidth: 2,
          filter: 'url(javascript:alert(1))',
        },
        markerEnd: 'https://attacker.example/marker.svg',
      }],
    }, { edges: [] });

    expect(merged.edges[0].style).toEqual({ stroke: '#123456', strokeWidth: 2 });
    expect(merged.edges[0].markerEnd).toBeUndefined();
  });

  it('removes durable automatic geometry from legacy, current, and user-only edges', () => {
    const legacyPath = [{ x: 191, y: 742 }, { x: -24, y: 742 }];
    const legacy = mergePresetExplicitEdgeHandles({
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [
        {
          id: 'preset-edge', source: 'A', target: 'B', type: 'stablePath',
          data: { computedPath: legacyPath, layoutPathLocked: true, label: 'business' },
        },
        {
          id: 'user-edge', source: 'A', target: 'B', type: 'stablePath',
          className: 'user-authored vizly-edge-role-feedback',
          data: { computedPath: legacyPath, layoutPathLocked: true },
        },
      ],
    }, { edges: [{ id: 'preset-edge', type: 'main' }] });

    expect(legacy.edges[0]).toMatchObject({
      type: 'advanced-smart-step',
      data: { label: 'business' },
    });
    expect(legacy.edges[0].data.computedPath).toBeUndefined();
    expect(legacy.edges[1].type).toBe('advanced-smart-step');
    expect(legacy.edges[1].data.computedPath).toBeUndefined();
    expect(legacy.edges[1].className).toBe('user-authored vizly-edge-role-feedback');

    const current = mergePresetExplicitEdgeHandles({
      routingVersion: EDGE_ROUTING_CACHE_VERSION,
      nodes: [{ id: 'A' }, { id: 'B' }],
      edges: [{
        id: 'preset-edge', source: 'A', target: 'B', type: 'stablePath',
        data: { computedPath: legacyPath, layoutPathLocked: true },
      }],
    }, { edges: [{ id: 'preset-edge', type: 'main' }] });

    expect(current.edges[0].type).toBe('advanced-smart-step');
    expect(current.edges[0].data.computedPath).toBeUndefined();
  });
});

describe('clearDesignerFreshSeedFlag', () => {
  it('removes only the bounded fresh-seed marker', () => {
    const setItem = vi.fn();
    const storage = {
      getItem: vi.fn(() => JSON.stringify({ nodes: [], edges: [], isFreshSeed: true })),
      setItem,
    };
    clearDesignerFreshSeedFlag('autosave', storage);
    expect(JSON.parse(setItem.mock.calls[0][1])).toEqual({
      nodes: [], edges: [], version: '1.0',
    });

    clearDesignerFreshSeedFlag('', storage);
    clearDesignerFreshSeedFlag('x'.repeat(1_025), storage);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
  });

  it('does not throw for malformed storage payloads or storage failures', () => {
    expect(() => clearDesignerFreshSeedFlag('key', {
      getItem: () => '{',
      setItem: () => { throw new Error('write failed'); },
    })).not.toThrow();
    expect(() => clearDesignerFreshSeedFlag('key', {
      getItem: () => JSON.stringify({ nodes: [], edges: [], isFreshSeed: true }),
      setItem: () => { throw new Error('write failed'); },
    })).not.toThrow();
  });
});

describe('recalculateAutosaveNodeSizes', () => {
  it('avoids loading the optimizer when every node already has usable dimensions', async () => {
    const loadOptimizer = vi.fn();
    const nodes = [{ id: 'A', position: { x: 0, y: 0 }, width: 100, height: 40 }] as Node[];
    await expect(recalculateAutosaveNodeSizes(nodes, loadOptimizer)).resolves.toEqual(nodes);
    expect(loadOptimizer).not.toHaveBeenCalled();
  });

  it('recalculates missing sizes while preserving containers and rejecting invalid results', async () => {
    const nodes = [
      { id: 'A', position: { x: 0, y: 0 }, data: { label: 'Node A' } },
      { id: 'group', type: 'group', position: { x: 0, y: 0 } },
    ] as Node[];
    const resized = await recalculateAutosaveNodeSizes(nodes, async () => ({
      calculateNodeWidth: () => 120,
      calculateNodeHeight: () => 60,
    }));
    expect(resized[0]).toMatchObject({ width: 120, height: 60, style: { width: 120, height: 60 } });
    expect(resized[1]).toBe(nodes[1]);

    const invalid = await recalculateAutosaveNodeSizes(nodes.slice(0, 1), async () => ({
      calculateNodeWidth: () => Number.POSITIVE_INFINITY,
      calculateNodeHeight: () => -1,
    }));
    expect(invalid[0]).toBe(nodes[0]);
  });
});

describe('shouldUseGlobalDesignerPerformanceMode', () => {
  it('reserves document-wide style changes for high-density graphs', () => {
    expect(shouldUseGlobalDesignerPerformanceMode(300)).toBe(false);
    expect(shouldUseGlobalDesignerPerformanceMode(301)).toBe(true);
    expect(shouldUseGlobalDesignerPerformanceMode(-1)).toBe(false);
    expect(shouldUseGlobalDesignerPerformanceMode(Number.NaN)).toBe(false);
  });

  it('avoids a second canvas-wide class invalidation for high-density drags', () => {
    expect(shouldUseScopedDesignerDragPerformanceMode(119, true)).toBe(false);
    expect(shouldUseScopedDesignerDragPerformanceMode(120, true)).toBe(true);
    expect(shouldUseScopedDesignerDragPerformanceMode(300, true)).toBe(true);
    expect(shouldUseScopedDesignerDragPerformanceMode(301, true)).toBe(false);
    expect(shouldUseScopedDesignerDragPerformanceMode(500, false)).toBe(false);
    expect(shouldUseScopedDesignerDragPerformanceMode(Number.NaN, true)).toBe(false);
  });
});
