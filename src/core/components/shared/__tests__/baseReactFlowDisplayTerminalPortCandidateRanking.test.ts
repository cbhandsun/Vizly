import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  createDisplayTerminalPortCandidateBuckets,
  displayTerminalPortCandidateIsBetter,
  displayTerminalPortCandidateIsComplete,
  rankDisplayTerminalPortCandidates,
} from '../baseReactFlowDisplayTerminalPortCandidateRanking';

const edge = (id: string): Edge => ({ id, source: 'source', target: 'target' });

describe('baseReactFlowDisplayTerminalPortCandidateRanking', () => {
  it('keeps obstacles primary for graph candidates and uses axis completion as the tie-break', () => {
    const candidates = [edge('zero-obstacle'), edge('axis-clean')];
    const axisMismatches = (candidate: Edge) => candidate.id === 'axis-clean' ? 0 : 1;
    const obstacleHits = (candidate: Edge) => candidate.id === 'axis-clean' ? 1 : 0;

    expect(rankDisplayTerminalPortCandidates(
      candidates,
      axisMismatches,
      obstacleHits,
      true,
    )[0]?.candidateEdge.id).toBe('axis-clean');
    expect(rankDisplayTerminalPortCandidates(
      candidates,
      axisMismatches,
      obstacleHits,
      false,
    )[0]?.candidateEdge.id).toBe('zero-obstacle');

    const equalObstacleHits = () => 0;
    expect(rankDisplayTerminalPortCandidates(
      candidates,
      axisMismatches,
      equalObstacleHits,
      false,
    )[0]?.candidateEdge.id).toBe('axis-clean');
  });

  it('keeps invalid candidates out of every candidate bucket', () => {
    const buckets = createDisplayTerminalPortCandidateBuckets(candidate => (
      candidate.id !== 'invalid'
    ));
    buckets.appendCandidate(edge('valid'));
    buckets.appendPriorityCandidate(edge('invalid'));
    buckets.appendInsetNudgeCandidate(edge('valid-inset'));

    expect(buckets.candidateEdges.map(candidate => candidate.id)).toEqual(['valid']);
    expect(buckets.handleOnlyCandidateEdges).toEqual([]);
    expect(buckets.insetNudgeCandidateEdges.map(candidate => candidate.id)).toEqual([
      'valid-inset',
    ]);
  });

  it('requires both clean axes and zero obstacles before any candidate is complete', () => {
    const partial = { declaredAxisMismatches: 1, obstacleHits: 0 };
    const complete = { declaredAxisMismatches: 0, obstacleHits: 0 };

    expect(displayTerminalPortCandidateIsBetter(partial, 2, 0, true)).toBe(true);
    expect(displayTerminalPortCandidateIsComplete(partial, true)).toBe(false);
    expect(displayTerminalPortCandidateIsComplete(partial, false)).toBe(false);
    expect(displayTerminalPortCandidateIsComplete(complete, true)).toBe(true);
    expect(displayTerminalPortCandidateIsComplete(complete, false)).toBe(true);
  });
});
