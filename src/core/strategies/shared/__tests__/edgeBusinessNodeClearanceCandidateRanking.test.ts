import { describe, expect, it, vi } from 'vitest';

import {
  iterateBusinessNodeClearanceCandidates,
  rankBusinessNodeClearanceCandidates,
  selectBusinessNodeClearanceCandidatesWithinHitBudget,
  type BusinessNodeClearanceCandidateRank,
} from '../edgeBusinessNodeClearanceCandidateRanking';

const candidate = (
  id: string,
  values: Partial<Omit<BusinessNodeClearanceCandidateRank<string>, 'candidate'>> = {},
): BusinessNodeClearanceCandidateRank<string> => ({
  candidate: id,
  bendCount: 4,
  commercialRisk: 8,
  hits: 1,
  length: 200,
  risk: 8,
  ...values,
});

describe('rankBusinessNodeClearanceCandidates', () => {
  it('prunes candidates above the baseline hit budget before expensive scoring', () => {
    const countHits = vi.fn((entry: { hits: number }, maximumHits: number) => (
      entry.hits > maximumHits ? maximumHits + 1 : entry.hits
    ));
    const candidates = [{ id: 'clean', hits: 0 }, { id: 'worse', hits: 3 }];

    expect(selectBusinessNodeClearanceCandidatesWithinHitBudget(
      candidates,
      1,
      countHits,
    )).toEqual([{ candidate: candidates[0], hits: 0 }]);
    expect(countHits).toHaveBeenCalledWith(candidates[0], 1);
    expect(countHits).toHaveBeenCalledWith(candidates[1], 1);
    expect(selectBusinessNodeClearanceCandidatesWithinHitBudget(
      candidates,
      Number.POSITIVE_INFINITY,
      countHits,
    )).toEqual([]);
  });

  it('orders exact local winners before hard-gate fallback candidates', () => {
    const ranked = rankBusinessNodeClearanceCandidates([
      candidate('risk-improvement', { risk: 4 }),
      candidate('zero-hits', { hits: 0, commercialRisk: 8, risk: 20 }),
      candidate('commercial-improvement', { commercialRisk: 2, risk: 12 }),
    ], { hits: 1, commercialRisk: 10, risk: 10 });

    expect(ranked.map(entry => entry.candidate)).toEqual([
      'zero-hits',
      'commercial-improvement',
      'risk-improvement',
    ]);
  });

  it('preserves first-candidate order for equivalent geometry scores', () => {
    const ranked = rankBusinessNodeClearanceCandidates([
      candidate('first', { risk: 4 }),
      candidate('second', { risk: 4 }),
    ], { hits: 1, commercialRisk: 10, risk: 10 });

    expect(ranked.map(entry => entry.candidate)).toEqual(['first', 'second']);
  });

  it('does not rank unused alternatives after an accepted first winner', () => {
    let candidateReads = 0;
    const candidates = [
      candidate('first', { hits: 0, commercialRisk: 0, risk: 0 }),
      candidate('second', { hits: 0, commercialRisk: 1, risk: 1 }),
      candidate('third', { hits: 0, commercialRisk: 2, risk: 2 }),
    ].map(entry => ({
      ...entry,
      get hits() {
        candidateReads += 1;
        return entry.hits;
      },
    }));
    const iterator = iterateBusinessNodeClearanceCandidates(candidates, {
      hits: 1,
      commercialRisk: 10,
      risk: 10,
    });

    expect(iterator.next().value?.candidate).toBe('first');
    const readsAfterFirstWinner = candidateReads;
    iterator.return();

    expect(readsAfterFirstWinner).toBeGreaterThan(0);
    expect(candidateReads).toBe(readsAfterFirstWinner);
  });
});
