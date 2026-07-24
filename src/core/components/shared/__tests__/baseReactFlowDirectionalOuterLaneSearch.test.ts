import { describe, expect, it } from 'vitest';

import { streamDirectionalOuterLaneCandidateBatches } from '../baseReactFlowDirectionalOuterLaneSearch';

type Candidate = {
  lane: number;
  sourceStub: number;
  targetStub: number;
  variant: 'direct' | 'side';
};

const candidateKey = (candidate: Candidate): string => (
  `${candidate.lane}:${candidate.sourceStub}:${candidate.targetStub}:${candidate.variant}`
);

describe('streamDirectionalOuterLaneCandidateBatches', () => {
  it('starts with near lanes and common stubs without materializing the full fallback', () => {
    let visitedCoordinates = 0;
    const batches = streamDirectionalOuterLaneCandidateBatches<Candidate>({
      laneCount: 48,
      sourceStubCount: 20,
      targetStubCount: 6,
      batchSize: 12,
      candidateKey,
      createCandidates: (lane, sourceStub, targetStub) => {
        visitedCoordinates += 1;
        return [{ lane, sourceStub, targetStub, variant: 'direct' }];
      },
    });

    const first = batches.next();

    expect(first.done).toBe(false);
    expect(first.value?.candidates).toHaveLength(12);
    expect(first.value?.tier).toBe(0);
    expect(visitedCoordinates).toBe(12);
    expect(first.value?.candidates.every((candidate: Candidate) => (
      candidate.lane < 4
      && candidate.sourceStub < 3
      && candidate.targetStub < 2
    ))).toBe(true);
    expect(visitedCoordinates).toBeLessThan(48 * 20 * 6);
  });

  it('expands through every original coordinate while keeping each batch bounded', () => {
    const batches = [...streamDirectionalOuterLaneCandidateBatches<Candidate>({
      laneCount: 10,
      sourceStubCount: 7,
      targetStubCount: 5,
      batchSize: 17,
      candidateKey,
      createCandidates: (lane, sourceStub, targetStub) => [
        { lane, sourceStub, targetStub, variant: 'direct' },
        { lane, sourceStub, targetStub, variant: 'side' },
      ],
    })];
    const candidates = batches.flatMap(batch => batch.candidates);
    const keys = candidates.map(candidateKey);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every(batch => batch.candidates.length <= 17)).toBe(true);
    expect(new Set(batches.map(batch => batch.tier)).size).toBeGreaterThan(1);
    expect(candidates).toHaveLength(10 * 7 * 5 * 2);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('9:6:4:direct');
    expect(keys).toContain('9:6:4:side');
  });

  it('deduplicates equivalent paths across variants without truncating later tiers', () => {
    const batches = [...streamDirectionalOuterLaneCandidateBatches<string>({
      laneCount: 9,
      sourceStubCount: 5,
      targetStubCount: 3,
      batchSize: 8,
      candidateKey: candidate => candidate,
      createCandidates: (lane, sourceStub, targetStub) => [
        `${lane}:${sourceStub}:${targetStub}`,
        `${lane}:${sourceStub}:${targetStub}`,
      ],
    })];
    const candidates = batches.flatMap(batch => batch.candidates);

    expect(candidates).toHaveLength(9 * 5 * 3);
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates).toContain('8:4:2');
  });
});
