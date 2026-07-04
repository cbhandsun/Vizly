import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  hasTrustedLockedComputedPath,
  refreshDomainLayoutEdgeForRender,
} from '../layoutEdgeRefresh';

const makeEdge = (data: Edge['data']): Edge => ({
  id: 'edge-a-b',
  source: 'a',
  target: 'b',
  type: 'advanced-smart-step',
  data,
});

describe('layoutEdgeRefresh', () => {
  it('preserves locked computed paths during render refresh', () => {
    const computedPath = [{ x: 0, y: 0 }, { x: 40, y: 0 }];
    const edge = makeEdge({
      computedPath,
      layoutPathLocked: true,
      sharedTrunkAware: true,
      algorithm: 'domain-dagre',
    });

    const refreshed = refreshDomainLayoutEdgeForRender(edge, 123);

    expect(hasTrustedLockedComputedPath(edge)).toBe(true);
    expect((refreshed.data as any).computedPath).toBe(computedPath);
    expect((refreshed.data as any).algorithm).toBe('domain-dagre');
    expect((refreshed.data as any)._layoutEpoch).toBe(123);
    expect((refreshed.data as any).waypoints).toEqual([]);
  });

  it('clears unlocked computed path caches during render refresh', () => {
    const edge = makeEdge({
      computedPath: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
      algorithm: 'domain-dagre',
    });

    const refreshed = refreshDomainLayoutEdgeForRender(edge, 456);

    expect(hasTrustedLockedComputedPath(edge)).toBe(false);
    expect((refreshed.data as any).computedPath).toBeUndefined();
    expect((refreshed.data as any).algorithm).toBeUndefined();
    expect((refreshed.data as any)._layoutEpoch).toBe(456);
  });

  it('does not preserve invalid post-processed computed paths', () => {
    const edge = makeEdge({
      computedPath: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }],
      layoutPathLocked: true,
      sharedTrunkAware: true,
    });

    const refreshed = refreshDomainLayoutEdgeForRender(edge, 789);

    expect(hasTrustedLockedComputedPath(edge)).toBe(false);
    expect((refreshed.data as any).computedPath).toBeUndefined();
  });
});
