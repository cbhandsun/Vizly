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
  it('keeps enclosing boundaries without turning nested visual groups into hard walls', () => {
    const outer = node('outer', 0, 'titleGroup', { width: 500, height: 300 });
    const nested = node('inner', 32, 'subGroup', { width: 436, height: 250 });
    const overlap = node('overlap', 450, 'subGroup', { width: 200, height: 100 });
    const business = node('business', 100);
    const context = createBusinessNodeClearanceRectContext([nested, outer, overlap, business]);
    expect(context.containerRects).toEqual([
      { x: 0, y: 20, width: 500, height: 300 },
      { x: 450, y: 20, width: 200, height: 100 },
    ]);
    expect([...context.obstacles.keys()]).toEqual(['business']);
    expect(createBusinessNodeClearanceRectContext([outer, nested, business]).containerRects)
      .toEqual(createBusinessNodeClearanceRectContext([nested, outer, business]).containerRects);
  });

  it('retains one boundary for coincident groups and retains disjoint containers', () => {
    const context = createBusinessNodeClearanceRectContext([
      node('one', 0, 'group'), node('duplicate', 0, 'subGroup'), node('separate', 100, 'domain'), node('business', 0),
    ]);
    expect(context.containerRects).toHaveLength(2);
    expect(createBusinessNodeClearanceRectContext([]).containerRects).toEqual([]);
  });
  it('preserves nested boundaries that partition different business nodes', () => {
    const context = createBusinessNodeClearanceRectContext([
      node('outer', 0, 'titleGroup', { width: 500, height: 300 }),
      node('inner', 0, 'subGroup', { width: 200, height: 200 }),
      node('inside', 20), node('outside', 300),
    ]);
    expect(context.containerRects).toHaveLength(2);
  });
});
