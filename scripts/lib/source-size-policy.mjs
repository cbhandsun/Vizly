const TEST_FILE_PATTERN = /(?:^|\/)(?:__tests__|tests)(?:\/|$)|\.(?:test|spec)\.[^/]+$/i;
const UI_MODULE_PATTERN = /(?:^|\/)(?:components|hooks)(?:\/|$)/i;

export function resolveSourceSizeLimit(file, limits) {
  if (TEST_FILE_PATTERN.test(file)) return limits.test;
  if (file === 'src/main.tsx' || file.startsWith('src/main/')) return limits.compositionRoot;
  if (/\.tsx$/i.test(file) || (UI_MODULE_PATTERN.test(file) && /\.[cm]?tsx?$/i.test(file))) {
    return limits.component;
  }
  return limits.default;
}

export function evaluateSourceSizePolicy({ lineCounts, oversizedBaseline, limits }) {
  const failures = [];

  for (const [file, lineCount] of lineCounts) {
    const baseline = oversizedBaseline.get(file);
    const limit = resolveSourceSizeLimit(file, limits);
    if (baseline === undefined) {
      if (lineCount > limit) {
        failures.push(`${file}: ${lineCount} lines exceeds ${limit}; split or add a justified baseline`);
      }
      continue;
    }

    if (!Number.isInteger(baseline) || baseline <= limit) {
      failures.push(`${file}: oversized baseline ${baseline} must be an integer above its ${limit}-line limit`);
      continue;
    }
    if (lineCount > baseline) {
      failures.push(`${file}: ${lineCount} lines exceeds oversized baseline ${baseline}`);
    } else if (lineCount < baseline) {
      failures.push(`${file}: reduced to ${lineCount} lines; lower the stale oversized baseline ${baseline}`);
    }
  }

  for (const file of oversizedBaseline.keys()) {
    if (!lineCounts.has(file)) {
      failures.push(`${file}: oversized baseline entry points to a missing file`);
    }
  }

  return failures;
}
