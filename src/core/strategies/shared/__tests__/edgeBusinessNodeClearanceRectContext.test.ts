import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { createBusinessNodeClearanceRectContext } from '../edgeBusinessNodeClearanceRectContext';

const node = (
  id: string,
  x: number,
  type?: string,
  measured: { width: number; height: number } = { width: 80, height: 40 },
): Node => ({ id, type, position: { x, y: 20 }, measured, data: {} });

describe('business-node clearance rect context', () => {
  it('projects node geometry once and excludes edge terminals from candidate obstacles', () => {
    const context = createBusinessNodeClearanceRectContext([
      node('source', 0),
      node('business', 120),
      node('target', 240),
      node('container', -20, 'subGroup', { width: 400, height: 160 }),
    ]);

    expect([...context.obstacles.keys()]).toEqual(['source', 'business', 'target']);
    expect(context.containerRects).toEqual([{ x: -20, y: 20, width: 400, height: 160 }]);
    const first = context.rectsForTerminals('source', 'target');
    expect(first).toEqual([{ x: 120, y: 20, width: 80, height: 40 }]);
    expect(context.rectsForTerminals('source', 'target')).toBe(first);
  });

  it('ignores empty and non-finite node geometry without throwing', () => {
    const context = createBusinessNodeClearanceRectContext([
      node('zero', 0, undefined, { width: 0, height: 40 }),
      node('non-finite', Number.POSITIVE_INFINITY),
    ]);

    expect([...context.obstacles]).toEqual([
      ['non-finite', { x: 0, y: 20, width: 80, height: 40 }],
    ]);
    expect(context.containerRects).toEqual([]);
  });
});
