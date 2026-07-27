export const defaultDesktopRouteBudgets = {
  management: { criticalAssets: 45, criticalDecodedKB: 2050, readyMs: 6000 },
  'management-templates': { criticalAssets: 46, criticalDecodedKB: 2150, readyMs: 6500 },
  'default-diagram': { criticalAssets: 92, criticalDecodedKB: 3900, readyMs: 4500 },
  'wms-process-large-diagram': { criticalAssets: 108, criticalDecodedKB: 4900, readyMs: 6500 },
  'enterprise-architecture-large-diagram': { criticalAssets: 108, criticalDecodedKB: 4900, readyMs: 6500 },
  'storage-config': { criticalAssets: 40, criticalDecodedKB: 2700, readyMs: 3000 },
  'shared-missing-token': { criticalAssets: 35, criticalDecodedKB: 2200, readyMs: 3000 },
  'theme-colors': { criticalAssets: 40, criticalDecodedKB: 1200, readyMs: 2500 },
  'theme-side-by-side': { criticalAssets: 40, criticalDecodedKB: 1200, readyMs: 2500 },
  'docs-preview': { criticalAssets: 30, criticalDecodedKB: 1100, readyMs: 2500 },
  'warehouse-3d': { criticalAssets: 46, criticalDecodedKB: 2800, readyMs: 4000 },
  'unified-designer': { criticalAssets: 100, criticalDecodedKB: 3800, readyMs: 3500 },
};

export const defaultMobileRouteBudgetOverrides = {
  management: { readyMs: 7500 },
};

const readPositiveNumber = (env, name) => {
  const raw = env[name];
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid positive numeric env value for ${name}: ${raw}`);
  }
  return value;
};

const routeBudgetEnvPrefix = (routeName) => `SMOKE_BUDGET_${routeName.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

export const resolveRouteBudget = (routeName, { env = process.env, isMobile = false } = {}) => {
  const routePrefix = routeBudgetEnvPrefix(routeName);
  const baseBudget = {
    ...(defaultDesktopRouteBudgets[routeName] || {}),
    ...(isMobile ? defaultMobileRouteBudgetOverrides[routeName] || {} : {}),
  };

  const readMetric = (metricKey, envSuffix) => {
    const mobileRouteValue = isMobile ? readPositiveNumber(env, `${routePrefix}_MOBILE_${envSuffix}`) : undefined;
    const mobileGlobalValue = isMobile ? readPositiveNumber(env, `SMOKE_MOBILE_MAX_${envSuffix}`) : undefined;
    const routeValue = readPositiveNumber(env, `${routePrefix}_${envSuffix}`);
    const globalValue = readPositiveNumber(env, `SMOKE_MAX_${envSuffix}`);
    return mobileRouteValue ?? mobileGlobalValue ?? routeValue ?? globalValue ?? baseBudget[metricKey];
  };

  return {
    criticalAssets: readMetric('criticalAssets', 'CRITICAL_ASSETS'),
    criticalDecodedKB: readMetric('criticalDecodedKB', 'CRITICAL_DECODED_KB'),
    readyMs: readMetric('readyMs', 'READY_MS'),
  };
};

export const shouldRetryEvaluateAfterTimeout = (error, { isMobile = false } = {}) => {
  if (!isMobile || !(error instanceof Error)) return false;
  return /CDP command timed out: Runtime\.evaluate/.test(error.message);
};

/**
 * The WMS page is not ready merely because React Flow mounted. Its user-visible
 * contract is the single final, hard-clean display route committed by the
 * routing hook. Keeping this predicate pure lets the CDP smoke probe and its
 * unit tests share the exact boundary rules.
 */
export const isFinalWmsDisplayRoutingReady = (value) => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && value.stage === 'final-applied'
  && value.workerStartCount === 1
  && value.workerAbortCount === 0
  && (
    value.workerResolution === 'validated-candidate'
    || value.workerResolution === 'full-route'
    || value.workerResolution === 'full-route-repaired'
    || value.workerResolution === 'repair'
  )
  && Number.isFinite(value.routeMs)
  && value.routeMs >= 0
  && Number.isFinite(value.finalAppliedAt)
  && value.finalAppliedAt > 0
  && typeof value.outputRouteSignature === 'string'
  && /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(value.outputRouteSignature)
);

export const collectRouteStabilityViolations = (report, budget) => {
  if (!report || !budget) return [];
  const checks = [
    ['maxLongTaskMs', report.maxLongTaskMs, budget.maxLongTaskMs, 'ms'],
    ['longTaskCount', report.longTaskCount, budget.maxLongTaskCount, 'tasks'],
    ['heapGrowthKB', report.heapGrowthKB, budget.maxHeapGrowthKB, 'KB'],
    ['activeWorkers', report.activeWorkers, budget.maxActiveWorkers, 'workers'],
    ['queuedTasks', report.queuedTasks, budget.maxQueuedTasks, 'tasks'],
  ];
  return checks
    .filter(([, actual, max]) => Number.isFinite(actual) && Number.isFinite(max) && actual > max)
    .map(([metric, actual, max, unit]) => ({ metric, actual, max, unit }));
};
