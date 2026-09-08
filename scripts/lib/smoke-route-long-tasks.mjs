// Serialized into the browser. Keep independent of host imports and page content.
export const installSmokeLongTaskProbe = () => {
  const startedAt = performance.now();
  const entries = [];
  let count = 0;
  let maxMs = 0;
  let droppedCount = 0;
  let invalidCount = 0;
  let observer;
  let ended = false;
  let supported = false;
  const record = values => {
    for (const entry of values) {
      const offsetMs = entry.startTime - startedAt;
      if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) > 600_000
        || !Number.isFinite(entry.duration) || entry.duration < 0 || entry.duration > 600_000) {
        invalidCount += 1;
        continue;
      }
      count += 1;
      maxMs = Math.max(maxMs, entry.duration);
      if (entries.length < 256) entries.push({ offsetMs: Math.round(offsetMs), durationMs: Math.round(entry.duration) });
      else droppedCount += 1;
    }
  };
  try {
    if (Array.isArray(PerformanceObserver.supportedEntryTypes)
      && !PerformanceObserver.supportedEntryTypes.includes('longtask')) throw new Error('Unsupported observer');
    observer = new PerformanceObserver(list => { if (!ended) record(list.getEntries()); });
    observer.observe({ entryTypes: ['longtask'] });
    supported = true;
  } catch {
    observer?.disconnect();
  }
  let result;
  return {
    stop() {
      if (result) return result;
      const durationMs = Math.round(performance.now() - startedAt);
      try { if (supported) record(observer.takeRecords()); }
      catch { supported = false; }
      ended = true;
      observer?.disconnect();
      result = { supported, durationMs, longTaskCount: count, maxLongTaskMs: Math.round(maxMs),
        droppedCount, invalidCount, entries };
      return result;
    },
  };
};

// CDP results are external input. Never copy names, attribution, URLs or arbitrary keys.
export const projectSmokeLongTaskEvidence = value => {
  const bounded = (number, max) => Number.isSafeInteger(number) && number >= 0 && number <= max;
  if (!value || typeof value !== 'object' || typeof value.supported !== 'boolean'
    || !bounded(value.durationMs, 600_000) || !bounded(value.longTaskCount, 1_000_000)
    || !bounded(value.maxLongTaskMs, 600_000) || !bounded(value.droppedCount, 1_000_000)
    || !bounded(value.invalidCount, 1_000_000) || !Array.isArray(value.entries) || value.entries.length > 256
    || value.entries.length + value.droppedCount !== value.longTaskCount
    || value.entries.some(entry => !entry || !Number.isSafeInteger(entry.offsetMs)
      || Math.abs(entry.offsetMs) > 600_000 || !bounded(entry.durationMs, value.maxLongTaskMs))) {
    throw new Error('Invalid smoke long task evidence');
  }
  return { supported: value.supported, durationMs: value.durationMs, longTaskCount: value.longTaskCount,
    maxLongTaskMs: value.maxLongTaskMs, droppedCount: value.droppedCount, invalidCount: value.invalidCount,
    entries: value.entries.map(entry => ({ offsetMs: entry.offsetMs, durationMs: entry.durationMs })) };
};
