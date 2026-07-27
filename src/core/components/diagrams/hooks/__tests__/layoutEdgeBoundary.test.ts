import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  preserveEdgesOnEmptyLayoutResult,
  resolveLayoutSourceEdges,
} from '../layoutEdgeBoundary';

const edge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  type: 'advanced-smart-step',
});

const nodeIds = new Set(['a', 'b', 'c']);

describe('layoutEdgeBoundary', () => {
  it('uses the live React Flow edges when the state ref is stale or empty', () => {
    const liveEdges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')];

    expect(resolveLayoutSourceEdges([], liveEdges, nodeIds)).toEqual(liveEdges);
    expect(resolveLayoutSourceEdges(null, liveEdges, nodeIds)).toEqual(liveEdges);
  });

  it('prefers the complete valid collection and rejects orphan edges', () => {
    const referenced = [edge('ab', 'a', 'b')];
    const live = [
      edge('ab', 'a', 'b'),
      edge('bc', 'b', 'c'),
      edge('orphan', 'c', 'missing'),
    ];

    expect(resolveLayoutSourceEdges(referenced, live, nodeIds)).toEqual(
      live.slice(0, 2),
    );
  });

  it('preserves source edges when a strategy unexpectedly returns none', () => {
    const source = [edge('ab', 'a', 'b')];

    expect(preserveEdgesOnEmptyLayoutResult(source, [], nodeIds)).toEqual(source);
    expect(preserveEdgesOnEmptyLayoutResult(source, null, nodeIds)).toEqual(source);
    expect(preserveEdgesOnEmptyLayoutResult(
      source,
      [edge('bc', 'b', 'c')],
      nodeIds,
    )).toEqual([edge('bc', 'b', 'c')]);
    expect(preserveEdgesOnEmptyLayoutResult([], [], nodeIds)).toEqual([]);
  });
});
