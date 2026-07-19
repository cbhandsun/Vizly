import { describe, expect, it } from 'vitest';

import type { SharedGraphContext } from '../../types/routing';
import { buildEdgeRoutingCacheParams } from '../edgeRoutingCacheParams';

const graph = {} as SharedGraphContext;

describe('buildEdgeRoutingCacheParams', () => {
  it('captures geometry, handles, bus metadata, and pending segments', () => {
    expect(buildEdgeRoutingCacheParams({
      source: 'A',
      target: 'B',
      sourceX: 1.4,
      sourceY: 2.6,
      targetX: 10,
      targetY: 20,
      sourceRect: { x: 0, y: 1, width: 2, height: 3 },
      sourceHandle: 'right',
      isOneToMany: true,
      busTrunkSource: { x: 5, y: 6 },
    }, graph, [{ start: { x: 1, y: 2 }, end: { x: 3, y: 4 } }])).toMatchObject({
      rv: 16,
      s: 'A',
      t: 'B',
      sx: 1,
      sy: 3,
      sr: '0,1,2,3',
      sourceHandle: 'right',
      bus: 'true|false|5,6|0,0',
      pe: 60,
    });
  });

  it('coerces non-finite and incorrectly typed boundary values to bounded defaults', () => {
    const params = buildEdgeRoutingCacheParams({
      source: 'x'.repeat(1_000),
      target: 42 as unknown as string,
      sourceX: Number.NaN,
      targetY: Number.POSITIVE_INFINITY,
      sourceRect: { x: Number.NaN, y: 0, width: Number.POSITIVE_INFINITY, height: 2 },
      busTrunkSource: { x: Number.NaN, y: Number.NEGATIVE_INFINITY },
    }, graph, [
      { start: { x: Number.NaN, y: 0 }, end: { x: 0, y: Number.POSITIVE_INFINITY } },
    ]);

    expect(params.s).toHaveLength(512);
    expect(params).toMatchObject({
      t: '',
      sx: 0,
      ty: 0,
      sr: '0,0,0,2',
      bus: 'false|false|0,0|0,0',
      pe: 31,
    });
  });

  it('is deterministic for empty input', () => {
    expect(buildEdgeRoutingCacheParams({}, graph)).toEqual(
      buildEdgeRoutingCacheParams({}, graph),
    );
  });
});
