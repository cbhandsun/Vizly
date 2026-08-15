import { describe, expect, it } from 'vitest';

import {
  LARGE_GRAPH_MICRO_CANDIDATES_PER_EDGE,
  MAX_MICRO_CANDIDATES_PER_EDGE,
  resolveMicroCandidateBudget,
} from '../edgeDisplayMicroCleanupGeometry';

describe('resolveMicroCandidateBudget', () => {
  it('retains the complete visual candidate set for ordinary diagrams', () => {
    expect(resolveMicroCandidateBudget(0)).toBe(MAX_MICRO_CANDIDATES_PER_EDGE);
    expect(resolveMicroCandidateBudget(32)).toBe(MAX_MICRO_CANDIDATES_PER_EDGE);
  });

  it('bounds per-edge candidate scoring for large diagrams', () => {
    expect(resolveMicroCandidateBudget(33)).toBe(LARGE_GRAPH_MICRO_CANDIDATES_PER_EDGE);
    expect(resolveMicroCandidateBudget(44)).toBe(LARGE_GRAPH_MICRO_CANDIDATES_PER_EDGE);
  });

  it('does not promote invalid counts into the large-graph policy', () => {
    expect(resolveMicroCandidateBudget(Number.POSITIVE_INFINITY))
      .toBe(MAX_MICRO_CANDIDATES_PER_EDGE);
    expect(resolveMicroCandidateBudget(-1)).toBe(MAX_MICRO_CANDIDATES_PER_EDGE);
  });
});
