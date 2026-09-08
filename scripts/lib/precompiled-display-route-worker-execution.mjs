export const WORKER_EXECUTION_FIELDS = ['handlerReadyAfterPostMs', 'postReadyDispatchMs',
  'executionMs', 'responseDeliveryMs'];

/** Self-contained browser projection. Absolute timestamps never leave the page. */
export const measurePrecompiledWorkerExecution = (timing, execution, timeOrigin) => {
  if (execution == null) return { status: 'unavailable' };
  const timestamp = value => typeof value === 'number' && Number.isFinite(value)
    && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
  if (!execution || typeof execution !== 'object' || Array.isArray(execution)
    || !timestamp(timeOrigin) || !timestamp(timing?.postedMonotonicAt)
    || !timestamp(timing?.finalResponseMonotonicAt)
    || ![execution.readyAt, execution.receivedAt, execution.finishedAt].every(timestamp)) {
    return { status: 'invalid' };
  }
  const postedAt = timeOrigin + timing.postedMonotonicAt;
  const deliveredAt = timeOrigin + timing.finalResponseMonotonicAt;
  const { readyAt, receivedAt, finishedAt } = execution;
  // Allow at most 1 ms of cross-context timer precision loss, not arbitrary
  // clock skew. Handler readiness may precede this request by hours.
  if (!timestamp(postedAt) || !timestamp(deliveredAt) || readyAt > receivedAt
    || receivedAt > finishedAt || postedAt > receivedAt + 1 || finishedAt > deliveredAt + 1
    || deliveredAt < postedAt || deliveredAt - postedAt > 600_000
    || finishedAt - receivedAt > 600_000 || readyAt - postedAt > 600_000) {
    return { status: 'clock-inconsistent' };
  }
  return { status: 'available',
    handlerReadyAfterPostMs: Math.max(0, readyAt - postedAt),
    postReadyDispatchMs: Math.max(0, receivedAt - Math.max(readyAt, postedAt)),
    executionMs: finishedAt - receivedAt,
    responseDeliveryMs: Math.max(0, deliveredAt - finishedAt),
  };
};

/** Host-side allowlist for machine results, summaries and journals. */
export const projectPrecompiledWorkerExecution = value => {
  if (value == null) return { status: 'unavailable' };
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['available', 'unavailable', 'invalid', 'clock-inconsistent'].includes(value.status)) {
    throw new Error('Invalid Worker execution evidence');
  }
  if (value.status !== 'available') return { status: value.status };
  if (WORKER_EXECUTION_FIELDS.some(field => !Number.isFinite(value[field])
    || value[field] < 0 || value[field] > 600_000)) throw new Error('Invalid Worker execution durations');
  return { status: 'available', ...Object.fromEntries(WORKER_EXECUTION_FIELDS.map(field => [field, value[field]])) };
};

export const assertPrecompiledWorkerExecutionCoverage = sample => {
  if (!Array.isArray(sample?.presets) || sample.presets.length === 0 || sample.presets.length > 32
    || sample.presets.some(preset => projectPrecompiledWorkerExecution(preset?.workerExecution).status !== 'available')) {
    throw new Error('Cold-route sample is missing valid Worker execution evidence');
  }
};
