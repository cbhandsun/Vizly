import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  analyzeFailureReasons,
  computeNodeBounds,
  unionBounds,
  validateHierarchy,
} from '../DomainStructureValidator';

const node = (id: string, domain: string, subDomain?: string, x = 0): Node => ({
  id,
  position: { x, y: 0 },
  measured: { width: 50, height: 30 },
  data: { domain, ...(subDomain ? { subDomain } : {}) },
});

describe('DomainStructureValidator', () => {
  it('normalizes invalid geometry and handles empty unions', () => {
    expect(computeNodeBounds({
      id: 'invalid',
      position: { x: Number.NaN, y: Infinity },
      measured: { width: Number.NaN, height: Infinity },
      data: {},
    })).toEqual({ x: 0, y: 0, width: 180, height: 80 });
    expect(unionBounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('supports prototype-like domain keys without corrupting grouping state', () => {
    const report = validateHierarchy([
      node('a', 'constructor', '__proto__'),
      node('b', 'constructor', '__proto__', 100),
    ]);

    expect(Object.hasOwn(report.domainBounds, 'constructor')).toBe(true);
    expect(Object.hasOwn(report.subDomainBounds, 'constructor::__proto__')).toBe(true);
    expect(Object.keys(report.nodeBounds)).toEqual(['a', 'b']);
  });

  it('summarizes overlap violations', () => {
    const report = validateHierarchy([
      node('a', 'A', undefined, 0),
      node('b', 'B', undefined, 10),
    ], { padding: 0, minGap: 0 });

    expect(report.violations.some(violation => violation.type === 'DomainOverlap')).toBe(true);
    expect(analyzeFailureReasons(report)).toContainEqual(expect.objectContaining({
      cause: 'DomainOverlap',
      count: 1,
    }));
  });
});
