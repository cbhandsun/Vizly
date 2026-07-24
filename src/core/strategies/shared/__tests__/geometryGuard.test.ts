import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { ensureDomainContainment } from '../geometryGuard';

const node = (input: Partial<Node> & Pick<Node, 'id'>): Node => ({
  position: { x: 0, y: 0 },
  data: {},
  ...input,
});

describe('geometryGuard', () => {
  it('expands overflowing domains and keeps domain widths aligned', () => {
    const firstDomain = node({
      id: 'domain-a',
      type: 'titleGroup',
      measured: { width: 100, height: 200 },
    });
    const secondDomain = node({
      id: 'domain-b',
      type: 'titleGroup',
      position: { x: 0, y: 300 },
      measured: { width: 120, height: 200 },
    });
    const overflowingChild = node({
      id: 'child',
      type: 'subGroup',
      position: { x: 90, y: 50 },
      measured: { width: 50, height: 20 },
    });

    const result = ensureDomainContainment([firstDomain, secondDomain, overflowingChild], 30);

    expect(result).toHaveLength(3);
    expect(firstDomain.measured).toEqual({ width: 170, height: 200 });
    expect(secondDomain.measured).toEqual({ width: 170, height: 200 });
    expect(firstDomain.style?.width).toBe(170);
    expect(secondDomain.width).toBe(170);
  });

  it('ignores invalid geometry instead of propagating NaN or Infinity', () => {
    const domain = node({
      id: 'domain',
      type: 'titleGroup',
      position: { x: Number.NaN, y: 0 },
      measured: { width: 100, height: 100 },
    });
    const invalidChild = node({
      id: 'invalid-child',
      type: 'subGroup',
      position: { x: 90, y: 10 },
      measured: { width: Infinity, height: 20 },
    });

    ensureDomainContainment([domain, invalidChild]);

    expect(domain.measured).toEqual({ width: 100, height: 100 });
    expect(domain.style).toBeUndefined();
  });

  it('returns unchanged nodes when no domain containers exist', () => {
    const nodes = [node({ id: 'plain' })];
    expect(ensureDomainContainment(nodes)).toBe(nodes);
  });
});
