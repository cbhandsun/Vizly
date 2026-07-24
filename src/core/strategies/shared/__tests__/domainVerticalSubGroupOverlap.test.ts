import type { Node as ReactFlowNode } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { hasVisibleSubGroupOverlapWithinDomains } from '../domainVerticalSubGroupOverlap';

const node = (
  id: string,
  type: string,
  domain: string,
  x: number,
  y: number,
  width: number,
  height: number,
  hidden = false,
): ReactFlowNode => ({
  id,
  type,
  position: { x, y },
  measured: { width, height },
  style: { width, height },
  data: { domain, hidden },
});

describe('hasVisibleSubGroupOverlapWithinDomains', () => {
  it('detects overlap and insufficient horizontal safety gaps', () => {
    const input = [
      node('domain', 'titleGroup', 'A', 0, 0, 500, 300),
      node('left', 'subGroup', 'A', 20, 60, 100, 80),
      node('right', 'subGroup', 'A', 130, 60, 100, 80),
    ];

    expect(hasVisibleSubGroupOverlapWithinDomains(input, 12)).toBe(true);
    expect(hasVisibleSubGroupOverlapWithinDomains(input, 10)).toBe(false);
  });

  it('ignores hidden, vertically disjoint, undeclared, and cross-domain subgroups', () => {
    const input = [
      node('domain-a', 'titleGroup', 'A', 0, 0, 500, 300),
      node('a', 'subGroup', 'A', 20, 60, 100, 80),
      node('hidden-a', 'subGroup', 'A', 20, 60, 100, 80, true),
      node('vertical-a', 'subGroup', 'A', 20, 140, 100, 80),
      node('domain-b', 'titleGroup', 'B', 0, 400, 500, 300),
      node('b', 'subGroup', 'B', 20, 60, 100, 80),
      node('undeclared', 'subGroup', 'C', 20, 60, 100, 80),
    ];

    expect(hasVisibleSubGroupOverlapWithinDomains(input, 0)).toBe(false);
  });

  it('sanitizes invalid sizes and gaps', () => {
    const input = [
      node('domain', 'titleGroup', 'A', 0, 0, 500, 300),
      node('left', 'subGroup', 'A', Number.NaN, 0, -100, Number.NaN),
      node('right', 'subGroup', 'A', Number.POSITIVE_INFINITY, 0, 0, 0),
    ];

    expect(
      hasVisibleSubGroupOverlapWithinDomains(input, Number.NEGATIVE_INFINITY),
    ).toBe(false);
  });
});
