export function evaluateEslintWarningPolicy({ warningCounts, warningBaseline }) {
  const failures = [];

  for (const [fingerprint, count] of warningCounts) {
    const baseline = warningBaseline.get(fingerprint);
    if (baseline === undefined) {
      failures.push(`${fingerprint}: ${count} new warning${count === 1 ? '' : 's'}; fix before merging`);
    } else if (count > baseline) {
      failures.push(`${fingerprint}: ${count} warnings exceeds baseline ${baseline}`);
    } else if (count < baseline) {
      failures.push(`${fingerprint}: reduced to ${count} warnings; lower the stale baseline ${baseline}`);
    }
  }

  for (const [fingerprint, baseline] of warningBaseline) {
    if (!warningCounts.has(fingerprint)) {
      failures.push(`${fingerprint}: warning debt cleared; remove stale baseline ${baseline}`);
    }
  }

  return failures;
}
