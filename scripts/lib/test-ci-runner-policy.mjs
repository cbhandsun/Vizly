const parsePositiveInteger = (raw, name) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${name} value: ${raw}`);
  }
  return value;
};

const parseNonNegativeInteger = (raw, name) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${name} value: ${raw}`);
  }
  return value;
};

export const resolveTestCiConcurrency = ({ raw, platform = process.platform } = {}) => {
  if (raw === undefined || raw === '') {
    // On Windows, parallel Vitest processes contend while each process also
    // initializes its own worker pool and jsdom instances. One shard at a time
    // is faster and avoids worker-startup timeouts on constrained workstations.
    return platform === 'win32' ? 1 : 2;
  }
  return parsePositiveInteger(raw, 'TEST_CI_CONCURRENCY');
};

export const resolveTestCiShardTimeoutMs = (raw) => {
  if (raw === undefined || raw === '') return 900_000;
  return parsePositiveInteger(raw, 'TEST_CI_SHARD_TIMEOUT_MS');
};

export const resolveTestCiShardRetries = (raw) => {
  if (raw === undefined || raw === '') return 1;
  return parseNonNegativeInteger(raw, 'TEST_CI_SHARD_RETRIES');
};

export const resolveTestCiCoverageEnabled = (raw) => {
  if (raw === undefined || raw === '' || raw === '0') return false;
  if (raw === '1') return true;
  throw new Error(`Invalid TEST_CI_COVERAGE value: ${raw}`);
};

export const isRetryableTestCiInfrastructureFailure = (output) => (
  output.includes('[vitest-pool]: Failed to start')
  && output.includes('Timeout waiting for worker to respond')
);

export const rankSlowestTestCiShards = (results, limit = 5) => {
  const normalizedLimit = parsePositiveInteger(limit, 'test:ci slow-shard limit');
  const durationsByName = new Map();
  for (const { name, durationMs } of results) {
    if (!Number.isFinite(durationMs) || durationMs < 0) continue;
    durationsByName.set(name, (durationsByName.get(name) ?? 0) + durationMs);
  }
  return [...durationsByName.entries()]
    .map(([name, durationMs]) => ({ name, durationMs }))
    .toSorted((left, right) => (
      right.durationMs - left.durationMs || left.name.localeCompare(right.name)
    ))
    .slice(0, normalizedLimit);
};
