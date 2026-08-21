import { parseDateOnlyTime } from '../../../utils/dateOnly';

type TimelineBaselineCandidate = {
  baselineEndDate?: unknown;
  baselineStartDate?: unknown;
};

const isTimelineBaselineCandidate = (value: unknown): value is TimelineBaselineCandidate => (
  typeof value === 'object' && value !== null
);

export const hasProTimelineBaseline = (candidates: unknown): boolean => (
  Array.isArray(candidates) && candidates.some(candidate => (
    isTimelineBaselineCandidate(candidate)
    && parseDateOnlyTime(candidate.baselineStartDate) !== null
    && parseDateOnlyTime(candidate.baselineEndDate) !== null
  ))
);
