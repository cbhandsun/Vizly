import { describe, expect, it } from 'vitest';

import { interleaveOuterPortCandidateBuckets } from '../baseReactFlowDisplayOuterPortCandidates';
import { buildFacingPortPathCandidates } from '../baseReactFlowSharedNodePortRoleRepair';

describe('outer port candidate selection', () => {
  it('keeps a non-shortest topology in the next round before a global cap', () => {
    const selected = interleaveOuterPortCandidateBuckets([
      ['first-shortest', 'first-alternate'],
      ['second-shortest', 'second-alternate'],
      ['third-shortest'],
    ], 4);

    expect(selected).toEqual([
      'first-shortest',
      'second-shortest',
      'third-shortest',
      'first-alternate',
    ]);
  });

  it('retains multiple topologies for the same top-to-top side pair', () => {
    const paths = buildFacingPortPathCandidates(
      { x: 500, y: 400, width: 80, height: 40 },
      { x: 0, y: 100, width: 80, height: 40 },
      'top',
      'top',
      48,
    );
    const topologyBuckets = paths.map(path => [path]);
    const selected = interleaveOuterPortCandidateBuckets(topologyBuckets, 16);

    expect(paths.length).toBeGreaterThan(1);
    expect(selected).toHaveLength(paths.length);
    expect(new Set(selected.map(path => JSON.stringify(path))).size).toBe(paths.length);
  });
});
