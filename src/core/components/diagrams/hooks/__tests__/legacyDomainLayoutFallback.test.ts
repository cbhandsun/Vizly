import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  shouldPreferElkForLegacyDomainTopology,
  shouldUseElkSafetyFallback,
} from '../legacyDomainLayoutFallback';

const node = (id: string, x: number): Node => ({
  id,
  position: { x, y: 0 },
  measured: { width: 100, height: 60 },
  data: {},
});

const edge = (
  id: string,
  source: string,
  target: string,
  computedPath?: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source,
  target,
  sourceHandle: 'right',
  targetHandle: 'left',
  data: computedPath ? { computedPath } : {},
});

describe('legacy domain layout ELK safety fallback', () => {
  it('uses hard quality as the final safety net even for a forest candidate', () => {
    const nodes = [node('source', 0), node('sibling', 200), node('target', 400)];
    const edges = [edge('source-target', 'source', 'target', [
      { x: 100, y: 30 },
      { x: 400, y: 30 },
    ])];

    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(true);
  });

  it('does not guess when a complex candidate has no complete route geometry', () => {
    const nodes = [node('a', 0), node('b', 200), node('target', 400)];
    const edges = [
      edge('a-target', 'a', 'target'),
      edge('b-target', 'b', 'target'),
    ];

    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(false);
  });

  it('moves a hard-defective multi-parent candidate to the layered safety engine', () => {
    const nodes = [node('a', 0), node('b', 200), node('target', 400)];
    const edges = [
      edge('a-target', 'a', 'target', [
        { x: 100, y: 30 },
        { x: 400, y: 30 },
      ]),
      edge('b-target', 'b', 'target', [
        { x: 300, y: 30 },
        { x: 348, y: 30 },
        { x: 348, y: 100 },
        { x: 352, y: 100 },
        { x: 352, y: 30 },
        { x: 400, y: 30 },
      ]),
    ];

    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(true);
    expect(shouldPreferElkForLegacyDomainTopology(nodes, edges)).toBe(true);
  });

  it('keeps simple forest topology on the requested legacy domain engine', () => {
    const nodes = [node('source', 0), node('target', 400)];
    const edges = [edge('source-target', 'source', 'target', [
      { x: 100, y: 30 },
      { x: 400, y: 30 },
    ])];

    expect(shouldPreferElkForLegacyDomainTopology(nodes, edges)).toBe(false);
    expect(shouldUseElkSafetyFallback(nodes, edges)).toBe(false);
  });
});
