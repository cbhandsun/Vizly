export const COVERAGE_METRICS = Object.freeze(['statements', 'branches', 'functions', 'lines']);

export const validateCoverageThresholds = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('coverage thresholds must be an object');
  }
  const normalized = {};
  for (const metric of COVERAGE_METRICS) {
    const threshold = value[metric];
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      throw new TypeError(`coverage threshold ${metric} must be between 0 and 100`);
    }
    normalized[metric] = threshold;
  }
  return normalized;
};

export const findCoverageThresholdFailures = (summary, thresholds) => {
  const safeThresholds = validateCoverageThresholds(thresholds);
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new TypeError('coverage summary must be an object');
  }

  return COVERAGE_METRICS.flatMap((metric) => {
    const actual = summary[metric]?.pct;
    if (!Number.isFinite(actual) || actual < 0 || actual > 100) {
      throw new TypeError(`coverage summary ${metric}.pct must be between 0 and 100`);
    }
    return actual < safeThresholds[metric]
      ? [{ metric, actual, required: safeThresholds[metric] }]
      : [];
  });
};
