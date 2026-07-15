import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { calculateEdgePathQualityScore } from '../../../strategies/shared/edgeStrictCrossingGuard';
import { buildSafeEndpointSideStepCandidates } from '../baseReactFlowDisplayEndpointStubCandidates';
import {
  countRenderUnsafeEndpointStubs,
  repairRenderSafeEndpointStubs,
} from '../baseReactFlowDisplayEndpointStubRepair';

const edgeWithPath = (
  id: string,
  computedPath: Array<{ x: number; y: number }>,
): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath },
});

describe('baseReactFlowDisplayEndpointStubRepair', () => {
  it('preserves candidate order and does not mutate the input path', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 100 },
      { x: 200, y: 100 },
    ];
    const edges = [edgeWithPath('candidate-order', path)];
    const originalPath = structuredClone(path);

    const candidates = buildSafeEndpointSideStepCandidates(path, 0, edges, []);

    expect(path).toEqual(originalPath);
    expect(candidates).toHaveLength(16);
    expect(candidates.slice(0, 6)).toEqual([
      [
        { x: 0, y: 0 },
        { x: -48, y: 0 },
        { x: -48, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: -72, y: 0 },
        { x: -72, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: -96, y: 0 },
        { x: -96, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: 48, y: 0 },
        { x: 48, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: 72, y: 0 },
        { x: 72, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 0, y: 0 },
        { x: 96, y: 0 },
        { x: 96, y: 100 },
        { x: 200, y: 100 },
      ],
    ]);
  });

  it('extends both render-unsafe terminal stubs without regressing hard quality', () => {
    const edges = [edgeWithPath('short-both', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 252, y: 100 },
      { x: 252, y: 0 },
      { x: 300, y: 0 },
    ])];
    const baselineQuality = calculateEdgePathQualityScore(edges);

    const repaired = repairRenderSafeEndpointStubs(edges, []);
    const repairedQuality = calculateEdgePathQualityScore(repaired);
    const repairedPath = (repaired[0].data as any).computedPath;

    expect(repaired).not.toBe(edges);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(0);
    expect(repairedPath).toEqual([
      { x: 0, y: 0 },
      { x: 56, y: 0 },
      { x: 56, y: 100 },
      { x: 244, y: 100 },
      { x: 244, y: 0 },
      { x: 300, y: 0 },
    ]);
    expect(repairedQuality.nonOrthogonalSegments).toBeLessThanOrEqual(
      baselineQuality.nonOrthogonalSegments,
    );
    expect(repairedQuality.strictCrossings).toBeLessThanOrEqual(baselineQuality.strictCrossings);
  });

  it('rejects a longer stub when it would introduce a strict crossing', () => {
    const short = edgeWithPath('short-source', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 300, y: 100 },
    ]);
    const blocker = edgeWithPath('blocker', [
      { x: 52, y: -20 },
      { x: 52, y: 20 },
    ]);
    const edges = [short, blocker];

    const repaired = repairRenderSafeEndpointStubs(edges, []);

    expect(repaired).toBe(edges);
    expect(countRenderUnsafeEndpointStubs(repaired)).toBe(1);
    expect(calculateEdgePathQualityScore(repaired).strictCrossings).toBe(0);
  });

  it('preserves identity for an unchanged path and never mutates a repaired input', () => {
    const cleanEdges = [edgeWithPath('already-safe', [
      { x: 0, y: 0 },
      { x: 64, y: 0 },
      { x: 64, y: 100 },
      { x: 236, y: 100 },
      { x: 236, y: 0 },
      { x: 300, y: 0 },
    ])];
    const unsafeEdges = [edgeWithPath('immutable-input', [
      { x: 0, y: 0 },
      { x: 48, y: 0 },
      { x: 48, y: 100 },
      { x: 252, y: 100 },
      { x: 252, y: 0 },
      { x: 300, y: 0 },
    ])];
    const originalUnsafePath = structuredClone(
      (unsafeEdges[0].data as any).computedPath,
    );

    expect(repairRenderSafeEndpointStubs(cleanEdges, [])).toBe(cleanEdges);

    const repaired = repairRenderSafeEndpointStubs(unsafeEdges, []);
    expect(repaired).not.toBe(unsafeEdges);
    expect((unsafeEdges[0].data as any).computedPath).toEqual(originalUnsafePath);
  });
});
