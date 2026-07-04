export const defaultDesktopRouteBudgets = {
  management: { criticalAssets: 45, criticalDecodedKB: 2050, readyMs: 6000 },
  'management-templates': { criticalAssets: 46, criticalDecodedKB: 2150, readyMs: 6500 },
  'default-diagram': { criticalAssets: 92, criticalDecodedKB: 3900, readyMs: 4500 },
  'wms-process-large-diagram': { criticalAssets: 105, criticalDecodedKB: 4700, readyMs: 6500 },
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
