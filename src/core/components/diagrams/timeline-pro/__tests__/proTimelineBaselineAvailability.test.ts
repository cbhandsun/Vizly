import { describe, expect, it } from 'vitest';

import { hasProTimelineBaseline } from '../proTimelineBaselineAvailability';
import {
  clearProTimelineBaselineSnapshot,
  createProTimelineBaselineSnapshot,
} from '../proTimelineBaselineTransaction';

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

describe('pro timeline baseline transactions', () => {
  const taskNode = {
    id: 'task-1',
    position: { x: 0, y: 0 },
    data: { date: '2026-08-01', endDate: '2026-08-10' },
  };

  it('creates a valid snapshot without mutating the source nodes', () => {
    const transaction = createProTimelineBaselineSnapshot([taskNode]);

    expect(transaction.changed).toBe(true);
    expect(transaction.eligibleCount).toBe(1);
    expect(transaction.nodes[0]?.data).toMatchObject({
      baselineStartDate: '2026-08-01',
      baselineEndDate: '2026-08-10',
    });
    expect(taskNode.data).not.toHaveProperty('baselineStartDate');
  });

  it('does not create history-worthy changes for an identical or invalid snapshot', () => {
    expect(createProTimelineBaselineSnapshot([{
      ...taskNode,
      data: {
        ...taskNode.data,
        baselineStartDate: '2026-08-01',
        baselineEndDate: '2026-08-10',
      },
    }]).changed).toBe(false);
    expect(createProTimelineBaselineSnapshot([{
      ...taskNode,
      data: { date: 'invalid', endDate: Number.POSITIVE_INFINITY },
    }])).toMatchObject({ changed: false, eligibleCount: 0 });
  });

  it('clears valid and malformed baseline remnants without mutating the source', () => {
    const source = [{
      ...taskNode,
      data: { ...taskNode.data, baselineStartDate: 'invalid', baselineEndDate: '2026-08-10' },
    }];
    const transaction = clearProTimelineBaselineSnapshot(source);

    expect(transaction.changed).toBe(true);
    expect(transaction.nodes[0]?.data.baselineStartDate).toBeUndefined();
    expect(transaction.nodes[0]?.data.baselineEndDate).toBeUndefined();
    expect(source[0]?.data.baselineStartDate).toBe('invalid');
  });
});
