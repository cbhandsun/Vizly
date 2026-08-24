import { describe, expect, it } from 'vitest';

import {
  rankBusinessNodeClearanceCandidates,
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
});
