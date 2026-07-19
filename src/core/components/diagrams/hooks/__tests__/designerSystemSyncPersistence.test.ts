import type { Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import {
  clearDesignerFreshSeedFlag,
  mergePresetExplicitEdgeHandles,
  recalculateAutosaveNodeSizes,
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
