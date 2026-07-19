import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { EdgeRoutingIncrementalState } from '../edgeRoutingIncrementalState';

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
});

describe('EdgeRoutingIncrementalState', () => {
  it('indexes both endpoints and expands dirty state across source/target siblings', () => {
    const state = new EdgeRoutingIncrementalState();
    state.initializeEdges([
      edge('ab', 'A', 'B'),
      edge('ac', 'A', 'C'),
      edge('db', 'D', 'B'),
      edge('xy', 'X', 'Y'),
    ]);

    expect(state.getAffectedEdgeIds(['A'])).toEqual(['ab', 'ac']);
    expect(state.getAffectedEdgeIds(['B'])).toEqual(['ab', 'db']);

    state.markNodesChanged('A');
    expect(new Set(state.getDirtyEdgeIds())).toEqual(new Set(['ab', 'ac', 'db']));
    expect(state.isDirty('xy')).toBe(false);
  });

  it('reports topology changes, deduplicates IDs, and rejects invalid runtime edges', () => {
    const state = new EdgeRoutingIncrementalState();
    state.initializeEdges([edge('ab', 'A', 'B')]);
    const result = state.initializeEdges([
      edge('ab', 'A', 'C'),
      edge('cd', 'C', 'D'),
      edge('cd', 'C', 'E'),
      { id: '', source: 'X', target: 'Y' } as Edge,
      { id: 'invalid', source: '', target: 'Y' } as Edge,
    ]);

    expect(new Set(result.affectedNodeIds)).toEqual(new Set(['A', 'B', 'C', 'E']));
    expect(result.hadExistingEdges).toBe(true);
    expect(state.getEdges().map(item => [item.id, item.source, item.target])).toEqual([
      ['ab', 'A', 'C'],
      ['cd', 'C', 'E'],
    ]);
  });

  it('tracks graph versions and supports safe unsubscription', () => {
    const onSubscriberError = vi.fn();
    const state = new EdgeRoutingIncrementalState(onSubscriberError);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = state.subscribeGraphVersion(first);
    state.subscribeGraphVersion(() => {
      throw new Error('subscriber failed');
    });
    state.subscribeGraphVersion(second);

    expect(state.incrementGraphVersion()).toBe(1);
    unsubscribe();
    expect(state.incrementGraphVersion()).toBe(2);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
    expect(onSubscriberError).toHaveBeenCalledTimes(2);
  });

  it('handles empty state, extra dirty IDs, and finite statistics', () => {
    const state = new EdgeRoutingIncrementalState();
    expect(state.getStats()).toEqual({ total: 0, dirty: 0, ratio: 0 });
    expect(state.getAffectedEdgeIds(['missing'])).toEqual([]);

    state.initializeEdges([edge('ab', 'A', 'B')]);
    state.markAllDirty(['pending', '', 'pending']);
    expect(state.getStats()).toEqual({ total: 1, dirty: 2, ratio: 1 });
    state.clearDirtyEdge('pending');
    state.clearDirtyEdges();
    expect(state.hasDirtyEdges()).toBe(false);
  });

  it('delegates node snapshot detection without exposing mutable snapshot state', () => {
    const state = new EdgeRoutingIncrementalState();
    expect(state.detectChangedNodes([
      { id: 'A', position: { x: 10, y: 20 } },
    ])).toEqual(['A']);
    expect(state.detectChangedNodes([
      { id: 'A', position: { x: 11, y: 21 } },
    ])).toEqual([]);
    expect(state.detectChangedNodes([
      { id: 'A', position: { x: 20, y: 21 } },
    ])).toEqual(['A']);
  });
});
