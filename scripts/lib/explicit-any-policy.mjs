export function evaluateExplicitAnyPolicy({ actualCounts, baselineCounts }) {
  const failures = [];

  for (const [file, count] of actualCounts) {
    const baseline = baselineCounts.get(file);
    if (baseline === undefined) {
      failures.push(`${file}: ${count} new explicit any occurrence${count === 1 ? '' : 's'}; use a concrete or unknown type`);
    } else if (count > baseline) {
      failures.push(`${file}: ${count} explicit any occurrences exceeds baseline ${baseline}`);
    } else if (count < baseline) {
      failures.push(`${file}: reduced to ${count} explicit any occurrences; lower the stale baseline ${baseline}`);
    }
  }

  for (const [file, baseline] of baselineCounts) {
    if (!actualCounts.has(file)) {
      failures.push(`${file}: explicit any debt cleared; remove stale baseline ${baseline}`);
    }
  }

  return failures;
}
