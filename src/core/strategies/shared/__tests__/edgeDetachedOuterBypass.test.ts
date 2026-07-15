import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  buildDetachedOuterBypassCandidates,
} from '../edgeDetachedOuterBypass';
import {
  allSegmentsOrthogonal,
  axisOf,
} from '../edgeDetachedOverlapCandidates';

const obstacle = (id: string, x: number, y: number, width = 100, height = 80): Node => ({
  id,
  position: { x, y },
  width,
  height,
  data: {},
});

const horizontalEdge: Edge = {
  id: 'horizontal',
  source: 'source',
  target: 'target',
  sourceHandle: 'right',
  targetHandle: 'left',
};

describe('buildDetachedOuterBypassCandidates', () => {
  it('lazily builds axis-preserving envelope lanes for same-axis terminal stubs', () => {
    const path = [
      { x: 0, y: 40 },
      { x: 48, y: 40 },
      { x: 48, y: 120 },
      { x: 252, y: 120 },
      { x: 252, y: 40 },
      { x: 300, y: 40 },
    ];
    const nodes = [obstacle('blocker', 100, 80)];

    expect(buildDetachedOuterBypassCandidates(path, horizontalEdge, nodes)).toEqual([]);

    const candidates = buildDetachedOuterBypassCandidates(
      path,
      horizontalEdge,
      nodes,
      { includeAxisPreservingEnvelope: true },
    );

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate[0]).toEqual(path[0]);
      expect(candidate[1]).toEqual(path[1]);
      expect(candidate.at(-2)).toEqual(path.at(-2));
      expect(candidate.at(-1)).toEqual(path.at(-1));
      expect(axisOf(candidate[0], candidate[1])).toBe('h');
      expect(axisOf(candidate.at(-2)!, candidate.at(-1)!)).toBe('h');
      expect(allSegmentsOrthogonal(candidate)).toBe(true);
    }
  });

  it('preserves vertical source and target stubs while changing only the outer lane', () => {
    const edge: Edge = {
      id: 'vertical',
      source: 'source',
      target: 'target',
      sourceHandle: 'bottom',
      targetHandle: 'top',
    };
    const path = [
      { x: 40, y: 0 },
      { x: 40, y: 48 },
      { x: 120, y: 48 },
      { x: 120, y: 252 },
      { x: 40, y: 252 },
      { x: 40, y: 300 },
    ];
    const candidates = buildDetachedOuterBypassCandidates(
      path,
      edge,
      [obstacle('blocker', 80, 100, 80, 100)],
      { includeAxisPreservingEnvelope: true },
    );

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every(candidate => (
      axisOf(candidate[0], candidate[1]) === 'v'
      && axisOf(candidate.at(-2)!, candidate.at(-1)!) === 'v'
      && allSegmentsOrthogonal(candidate)
    ))).toBe(true);
  });

  it('returns no candidate for empty, incomplete, obstacle-free, or non-boolean requests', () => {
    const nodes = [obstacle('blocker', 100, 80)];
    expect(buildDetachedOuterBypassCandidates([], horizontalEdge, nodes, {
      includeAxisPreservingEnvelope: true,
    })).toEqual([]);
    expect(buildDetachedOuterBypassCandidates([{ x: 0, y: 0 }], horizontalEdge, nodes, {
      includeAxisPreservingEnvelope: true,
    })).toEqual([]);
    expect(buildDetachedOuterBypassCandidates([
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 48 },
      { x: 96, y: 48 },
    ], horizontalEdge, [], {
      includeAxisPreservingEnvelope: true,
    })).toEqual([]);
    expect(buildDetachedOuterBypassCandidates([
      { x: 0, y: 40 },
      { x: 48, y: 40 },
      { x: 48, y: 120 },
      { x: 252, y: 120 },
      { x: 252, y: 40 },
      { x: 300, y: 40 },
    ], horizontalEdge, nodes, {
      includeAxisPreservingEnvelope: 'yes' as unknown as boolean,
    })).toEqual([]);
  });

  it('fails closed for non-finite, oversized, and runtime type-invalid inputs', () => {
    const validPath = [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 96 },
      { x: 144, y: 96 },
    ];
    expect(buildDetachedOuterBypassCandidates([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 0 },
    ], horizontalEdge, [obstacle('blocker', 40, 40)])).toEqual([]);
    expect(buildDetachedOuterBypassCandidates(
      Array.from({ length: 2_001 }, (_, index) => ({ x: index, y: 0 })),
      horizontalEdge,
      [obstacle('blocker', 40, 40)],
    )).toEqual([]);
    expect(buildDetachedOuterBypassCandidates(
      validPath,
      horizontalEdge,
      Array.from({ length: 501 }, (_, index) => obstacle(`blocker-${index}`, 40, 40)),
    )).toEqual([]);
    expect(buildDetachedOuterBypassCandidates(
      null as unknown as typeof validPath,
      horizontalEdge,
      [obstacle('blocker', 40, 40)],
    )).toEqual([]);
    expect(buildDetachedOuterBypassCandidates(
      validPath,
      horizontalEdge,
      [null as unknown as Node],
    )).toEqual([]);
    expect(buildDetachedOuterBypassCandidates(
      validPath,
      horizontalEdge,
      [obstacle('blocker', 40, 40)],
      null as unknown as Parameters<typeof buildDetachedOuterBypassCandidates>[3],
    )).toEqual([]);
  });
});
