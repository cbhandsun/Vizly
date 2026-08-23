import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createDisplayMicroCleanupInputSignature,
  createDisplayMicroCleanupNoopCache,
  createDisplayMicroCleanupNoopCacheKey,
} from '../edgeDisplayMicroCleanupNoopCache';

const route = (id: string, y = 0): Edge => ({
  id,
  source: `source-${id}`,
  target: `target-${id}`,
  sourceHandle: 'right',
  targetHandle: 'left',
  data: {
    computedPath: [{ x: 0, y }, { x: 100, y }],
  },
});

describe('display micro-cleanup no-op cache', () => {
  it('uses exact routing inputs and ignores fresh object identity', () => {
    const baseline = [route('edge')];
    const sameRouting = baseline.map(edge => ({
      ...edge,
      style: { strokeWidth: 4 },
      data: { ...edge.data },
    }));
    const baselineSignature = createDisplayMicroCleanupInputSignature(baseline);

    expect(baselineSignature).not.toBeNull();
    expect(createDisplayMicroCleanupInputSignature(sameRouting)).toBe(baselineSignature);
    expect(createDisplayMicroCleanupInputSignature([{
      ...baseline[0],
      targetHandle: 'right',
    }])).not.toBe(baselineSignature);
    expect(createDisplayMicroCleanupInputSignature([{
      ...baseline[0],
      data: { ...baseline[0].data, sharedTrunkAware: true },
    }])).not.toBe(baselineSignature);
    expect(createDisplayMicroCleanupInputSignature([route('edge', 20)]))
      .not.toBe(baselineSignature);
  });

  it('fails closed for empty, non-finite, or malformed routing inputs', () => {
    expect(createDisplayMicroCleanupInputSignature([])).toBeNull();
    expect(createDisplayMicroCleanupInputSignature([{
      ...route('non-finite'),
      data: { computedPath: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }] },
    }])).toBeNull();
    expect(createDisplayMicroCleanupInputSignature([{
      ...route('oversized'),
      id: 'x'.repeat(501),
    }])).toBeNull();
  });

  it('binds no-op proofs to candidate scope and compound repair policy', () => {
    const edges = [route('first'), route('second', 20)];
    const full = createDisplayMicroCleanupNoopCacheKey(edges, null, true);

    expect(full).not.toBeNull();
    expect(createDisplayMicroCleanupNoopCacheKey(edges, [0, 1], true)).toBe(full);
    expect(createDisplayMicroCleanupNoopCacheKey(edges, [0], true)).not.toBe(full);
    expect(createDisplayMicroCleanupNoopCacheKey(edges, [0], false))
      .not.toBe(createDisplayMicroCleanupNoopCacheKey(edges, [0], true));
    expect(createDisplayMicroCleanupNoopCacheKey([], null, true)).toBeNull();
  });

  it('evicts least-recently-used signatures at the configured bound', () => {
    const cache = createDisplayMicroCleanupNoopCache(2);
    cache.remember('first');
    cache.remember('second');
    expect(cache.has('first')).toBe(true);
    cache.remember('third');

    expect(cache.size()).toBe(2);
    expect(cache.has('first')).toBe(true);
    expect(cache.has('second')).toBe(false);
    expect(cache.has('third')).toBe(true);
  });
});
