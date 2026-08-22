import type { Edge } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import { selectHardCleanDisplayCandidate } from '../baseReactFlowDisplayCandidateValidation';

const createEdge = (path: readonly { x: number; y: number }[]): Edge => ({
  id: 'edge-a-b',
  source: 'a',
  target: 'b',
  sourceHandle: 'right',
  targetHandle: 'left',
  data: { computedPath: path },
});

describe('selectHardCleanDisplayCandidate', () => {
  it('retains the audited array when a repair only rematerializes exact geometry', () => {
    const baseline = [createEdge([{ x: 0, y: 0 }, { x: 48, y: 0 }])];
    const candidate = baseline.map(edge => ({ ...edge, data: { ...edge.data } }));
    const isHardClean = vi.fn(() => true);

    expect(selectHardCleanDisplayCandidate(baseline, candidate, isHardClean)).toBe(baseline);
    expect(isHardClean).not.toHaveBeenCalled();
  });

  it('keeps a clean baseline when changed candidate geometry fails its hard gate', () => {
    const baseline = [createEdge([{ x: 0, y: 0 }, { x: 48, y: 0 }])];
    const candidate = [createEdge([{ x: 0, y: 0 }, { x: 24, y: 0 }])];
    const isHardClean = vi.fn((edges: Edge[]) => edges === baseline);

    expect(selectHardCleanDisplayCandidate(baseline, candidate, isHardClean)).toBe(baseline);
    expect(isHardClean).toHaveBeenCalledTimes(2);
  });

  it('accepts changed geometry when both candidates remain hard-clean', () => {
    const baseline = [createEdge([{ x: 0, y: 0 }, { x: 48, y: 0 }])];
    const candidate = [createEdge([{ x: 0, y: 0 }, { x: 72, y: 0 }])];

    expect(selectHardCleanDisplayCandidate(baseline, candidate, () => true)).toBe(candidate);
  });
});
