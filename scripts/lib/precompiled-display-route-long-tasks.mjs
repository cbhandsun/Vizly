/** Browser-only probe. Retains bounded numeric intervals, never task attribution. */
export const installPrecompiledRouteLongTaskProbe = () => {
  const entries = [];
  let droppedCount = 0;
  let invalidCount = 0;
  let observer = null;
  let supported = false;
  const accept = records => {
    for (const record of records) {
      const start = record.startTime;
      const duration = record.duration;
      if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration)
        || duration < 0 || duration > 600_000) {
        invalidCount = Math.min(100_000, invalidCount + 1);
        continue;
      }
      if (entries.length === 512) {
        entries.shift();
        droppedCount = Math.min(100_000, droppedCount + 1);
      }
      entries.push({ start, end: start + duration });
    }
  };
  try {
    if (typeof PerformanceObserver === 'function'
      && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver(list => accept(list.getEntries()));
      observer.observe({ type: 'longtask', buffered: true });
      supported = true;
    }
  } catch {
    observer?.disconnect();
    observer = null;
  }
  return {
    measure(start, end) {
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0
        || end < start || end - start > 600_000) return null;
      try { if (observer) accept(observer.takeRecords()); } catch { supported = false; }
      const overlaps = entries.map(entry => Math.max(0,
        Math.min(end, entry.end) - Math.max(start, entry.start))).filter(value => value > 0);
      return {
        supported, droppedCount, invalidCount, windowMs: end - start,
        count: supported ? overlaps.length : null,
        totalMs: supported ? Math.min(end - start, overlaps.reduce((total, value) => total + value, 0)) : null,
        maxMs: supported ? Math.max(0, ...overlaps) : null,
      };
    },
  };
};

/** Validate again on the host; unsupported/partial observation is not zero work. */
export const projectPrecompiledRouteLongTasks = value => {
  if (value == null) return null;
  const countKeys = ['droppedCount', 'invalidCount'];
  if (typeof value.supported !== 'boolean' || countKeys.some(key => (
    !Number.isSafeInteger(value[key]) || value[key] < 0 || value[key] > 100_000
  )) || !Number.isFinite(value.windowMs) || value.windowMs < 0 || value.windowMs > 600_000) {
    throw new Error('Invalid long-task observation');
  }
  if (value.supported && (!Number.isSafeInteger(value.count) || value.count < 0 || value.count > 512
    || ![value.totalMs, value.maxMs].every(duration => Number.isFinite(duration) && duration >= 0)
    || value.totalMs > value.windowMs || value.maxMs > value.totalMs)) throw new Error('Invalid long-task metrics');
  return { supported: value.supported, droppedCount: value.droppedCount, invalidCount: value.invalidCount,
    windowMs: value.windowMs, count: value.supported ? value.count : null,
    totalMs: value.supported ? value.totalMs : null, maxMs: value.supported ? value.maxMs : null };
};
