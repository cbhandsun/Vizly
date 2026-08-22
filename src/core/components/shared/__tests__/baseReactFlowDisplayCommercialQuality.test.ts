import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  auditBaseReactFlowDisplayCommercialQuality,
  baseReactFlowDisplayCommercialQualityIsClean,
} from '../baseReactFlowDisplayCommercialQuality';
import { canReuseBaseReactFlowFinalCommercialSafety } from '../baseReactFlowDisplayCommercialSafety';

const edgeWithPath = (id: string, computedPath: Array<{ x: number; y: number }>): Edge => ({
  id,
  source: `${id}-source`,
  target: `${id}-target`,
  data: { computedPath },
});

describe('baseReactFlowDisplayCommercialQuality', () => {
  it('reuses an unchanged route whose only endpoint defect was delegated by incremental routing', () => {
    const orderedEdges = [edgeWithPath('delegated', [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 120, y: 80 },
    ])];
    const exactClone = [edgeWithPath('delegated', [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 120, y: 80 },
    ])];
    expect(canReuseBaseReactFlowFinalCommercialSafety({
      commercialClosureReady: false,
      commercialEvaluationEdges: null,
      endpointDefectDelegated: true,
      finalEdges: exactClone,
      orderedEdges,
    })).toBe(true);
  });

  it('does not reuse a delegated endpoint route after its geometry changes', () => {
    const orderedEdges = [edgeWithPath('delegated', [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 120, y: 80 },
    ])];
    const changedEdges = [edgeWithPath('delegated', [
      { x: 0, y: 0 },
      { x: 0, y: 96 },
      { x: 120, y: 96 },
    ])];
    expect(canReuseBaseReactFlowFinalCommercialSafety({
      commercialClosureReady: false,
      commercialEvaluationEdges: null,
      endpointDefectDelegated: true,
      finalEdges: changedEdges,
      orderedEdges,
    })).toBe(false);
  });

  it('accepts a compact orthogonal route and short endpoint stubs', () => {
    const edges = [edgeWithPath('compact', [
      { x: 0, y: 0 },
      { x: 0, y: 6 },
      { x: 120, y: 6 },
      { x: 120, y: 100 },
    ])];

    expect(baseReactFlowDisplayCommercialQualityIsClean(edges)).toBe(true);
  });

  it('rejects a pathological bend chain', () => {
    const issues = auditBaseReactFlowDisplayCommercialQuality([edgeWithPath('excessive', [
      { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 40 },
      { x: 40, y: 40 }, { x: 40, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 80 },
      { x: 80, y: 80 }, { x: 80, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 120 },
      { x: 120, y: 120 }, { x: 120, y: 140 }, { x: 140, y: 140 },
    ])]);

    expect(issues.map(issue => issue.kind)).toEqual(expect.arrayContaining([
      'excessive-bends',
      'tiny-interior-segment',
    ]));
  });

  it('allows an outer lane when graph topology may require it', () => {
    expect(auditBaseReactFlowDisplayCommercialQuality([edgeWithPath('outer', [
      { x: 1062, y: 593 },
      { x: 1062, y: 59 },
      { x: -96, y: 59 },
      { x: -96, y: 1450 },
      { x: 1216, y: 1450 },
      { x: 1216, y: 1539 },
    ])])).toEqual([]);
  });

  it('rejects an interior micro dogleg while allowing ordinary terminal spacing', () => {
    const issues = auditBaseReactFlowDisplayCommercialQuality([edgeWithPath('micro', [
      { x: 0, y: 0 },
      { x: 0, y: 80 },
      { x: 7, y: 80 },
      { x: 7, y: 160 },
    ])]);

    expect(issues).toEqual([
      expect.objectContaining({ edgeId: 'micro', kind: 'tiny-interior-segment', value: 7 }),
    ]);
  });

  it('uses the 24px commercial interior-segment boundary exactly', () => {
    const issues = auditBaseReactFlowDisplayCommercialQuality([
      edgeWithPath('below', [
        { x: 0, y: 0 }, { x: 0, y: 80 }, { x: 23.99, y: 80 }, { x: 23.99, y: 160 },
      ]),
      edgeWithPath('at-limit', [
        { x: 0, y: 0 }, { x: 0, y: 80 }, { x: 24, y: 80 }, { x: 24, y: 160 },
      ]),
    ]);

    expect(issues).toEqual([
      expect.objectContaining({ edgeId: 'below', kind: 'tiny-interior-segment' }),
    ]);
  });

  it('rejects missing and non-finite paths without throwing', () => {
    const missing: Edge = { id: 'missing', source: 'a', target: 'b' };
    const nonFinite = edgeWithPath('non-finite', [
      { x: 0, y: 0 },
      { x: Number.POSITIVE_INFINITY, y: 10 },
    ]);

    expect(auditBaseReactFlowDisplayCommercialQuality([missing, nonFinite]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ edgeId: 'missing', kind: 'invalid-path' }),
        expect.objectContaining({ edgeId: 'non-finite', kind: 'invalid-path' }),
      ]));
  });
});
