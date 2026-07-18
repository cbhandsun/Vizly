const parsePositiveInteger = (raw, name) => {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
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

export const rankSlowestTestCiShards = (results, limit = 5) => {
  const normalizedLimit = parsePositiveInteger(limit, 'test:ci slow-shard limit');
  return results
    .filter(({ durationMs }) => Number.isFinite(durationMs) && durationMs >= 0)
    .toSorted((left, right) => (
      right.durationMs - left.durationMs || left.name.localeCompare(right.name)
    ))
    .slice(0, normalizedLimit);
};
