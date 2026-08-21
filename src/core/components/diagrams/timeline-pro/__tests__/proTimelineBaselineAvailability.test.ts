import { describe, expect, it } from 'vitest';

import { hasProTimelineBaseline } from '../proTimelineBaselineAvailability';

describe('pro timeline baseline availability', () => {
  it('requires a valid start and end date on the same task', () => {
    expect(hasProTimelineBaseline([
      { baselineStartDate: '2026-08-01', baselineEndDate: '2026-08-10' },
    ])).toBe(true);
    expect(hasProTimelineBaseline([
      { baselineStartDate: '2026-08-01' },
      { baselineEndDate: '2026-08-10' },
    ])).toBe(false);
  });

  it.each([
    { label: 'non-array', candidates: null },
    { label: 'empty array', candidates: [] },
    { label: 'null candidate', candidates: [null] },
    { label: 'empty dates', candidates: [{ baselineStartDate: '', baselineEndDate: '' }] },
    { label: 'malformed date', candidates: [{ baselineStartDate: 'not-a-date', baselineEndDate: '2026-08-10' }] },
    { label: 'impossible date', candidates: [{ baselineStartDate: '2026-02-30', baselineEndDate: '2026-08-10' }] },
    { label: 'non-string date', candidates: [{ baselineStartDate: Number.POSITIVE_INFINITY, baselineEndDate: '2026-08-10' }] },
  ])('rejects $label baseline data', ({ candidates }) => {
    expect(hasProTimelineBaseline(candidates)).toBe(false);
  });
});
