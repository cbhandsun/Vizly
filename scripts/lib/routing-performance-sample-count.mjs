const DEFAULT_PERFORMANCE_SAMPLE_COUNT = 30;
const MAIN_PUSH_SAMPLE_COUNT = 5;
const MAX_PERFORMANCE_SAMPLE_COUNT = 100;

export const resolveRoutingPerformanceSampleCount = ({
  eventName,
  requestedSampleCount,
}) => {
  if (eventName === 'push') return MAIN_PUSH_SAMPLE_COUNT;
  const rawValue = String(requestedSampleCount ?? '').trim();
  if (rawValue.length === 0) return DEFAULT_PERFORMANCE_SAMPLE_COUNT;
  const parsed = Number(rawValue);
  if (
    !Number.isSafeInteger(parsed)
    || parsed < 1
    || parsed > MAX_PERFORMANCE_SAMPLE_COUNT
  ) {
    throw new Error('Routing performance sample count must be an integer from 1 to 100.');
  }
  return parsed;
};
