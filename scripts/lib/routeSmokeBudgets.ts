export interface RouteBudget { criticalAssets?: number; criticalDecodedKB?: number; readyMs?: number }
export const defaultDesktopRouteBudgets: Readonly<Record<string, RouteBudget>> = Object.freeze({
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
  'warehouse-3d': { criticalAssets: 46, criticalDecodedKB: 2800 },
  'unified-designer': { criticalAssets: 100, criticalDecodedKB: 3800, readyMs: 3500 },
});
const own = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
};
const positive = (env: unknown, key: string): number | undefined => {
  const raw = own(env, key);
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.length > 64 || !/^(?:\d+(?:\.\d+)?|\.\d+)$/u.test(raw)) {
    throw new Error(`Invalid numeric budget: ${key}`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) throw new Error(`Invalid numeric budget: ${key}`);
  return value;
};
export const resolveRouteBudget = (routeName: unknown, { env = process.env, isMobile = false }: {
  env?: unknown; isMobile?: boolean;
} = {}): RouteBudget => {
  if (typeof routeName !== 'string' || !/^[a-z][a-z0-9-]{0,127}$/u.test(routeName)) throw new Error('Invalid smoke route');
  const prefix = `SMOKE_BUDGET_${routeName.toUpperCase().replaceAll('-', '_')}`;
  const base = Object.hasOwn(defaultDesktopRouteBudgets, routeName) ? defaultDesktopRouteBudgets[routeName] : {};
  const read = (metric: keyof RouteBudget, suffix: string) =>
    (isMobile ? positive(env, `${prefix}_MOBILE_${suffix}`) ?? positive(env, `SMOKE_MOBILE_MAX_${suffix}`) : undefined)
    ?? positive(env, `${prefix}_${suffix}`) ?? positive(env, `SMOKE_MAX_${suffix}`)
    ?? (isMobile && routeName === 'management' && metric === 'readyMs' ? 7500 : base[metric]);
  return { criticalAssets: read('criticalAssets', 'CRITICAL_ASSETS'), criticalDecodedKB: read('criticalDecodedKB', 'CRITICAL_DECODED_KB'), readyMs: read('readyMs', 'READY_MS') };
};
export const isRuntimeEvaluateTimeout = (error: unknown): boolean => error instanceof Error && error.message === 'CDP command timed out: Runtime.evaluate';
export const shouldRetryEvaluateAfterTimeout = (error: unknown, { isMobile = false } = {}): boolean => isMobile && isRuntimeEvaluateTimeout(error);
export const isFinalWmsDisplayRoutingReady = (value: unknown): boolean => {
  const routeMs = own(value, 'routeMs');
  const finalAppliedAt = own(value, 'finalAppliedAt');
  const signature = own(value, 'outputRouteSignature');
  const resolution = own(value, 'workerResolution');
  return own(value, 'stage') === 'final-applied' && own(value, 'workerStartCount') === 1 && own(value, 'workerAbortCount') === 0
    && typeof resolution === 'string' && ['validated-candidate', 'repaired-candidate', 'full-route', 'full-route-repaired', 'repair'].includes(resolution)
    && typeof routeMs === 'number' && Number.isFinite(routeMs) && routeMs >= 0
    && typeof finalAppliedAt === 'number' && Number.isFinite(finalAppliedAt) && finalAppliedAt > 0
    && typeof signature === 'string' && /^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/u.test(signature);
};
export interface MetricViolation { metric: string; actual: unknown; max: number; unit: string }
export const collectRouteStabilityViolations = (report: unknown, budget: unknown): MetricViolation[] => {
  const checks = [['maxLongTaskMs', 'maxLongTaskMs', 'ms'], ['longTaskCount', 'maxLongTaskCount', 'tasks'],
    ['heapGrowthKB', 'maxHeapGrowthKB', 'KB'], ['activeWorkers', 'maxActiveWorkers', 'workers'], ['queuedTasks', 'maxQueuedTasks', 'tasks']];
  return checks.flatMap(([metric, key, unit]) => {
    const max = own(budget, key);
    if (max === undefined) return [];
    if (typeof max !== 'number' || !Number.isFinite(max) || max < 0) throw new Error('Invalid stability budget');
    const actual = own(report, metric);
    return typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0 || actual > max ? [{ metric, actual, max, unit }] : [];
  });
};
export const collectRouteBudgetViolations = (report: unknown, budget: RouteBudget): MetricViolation[] =>
  Object.entries(budget).flatMap(([metric, max]) => {
    if (max === undefined) return [];
    if (!Number.isFinite(max) || max <= 0) throw new Error('Invalid route budget');
    const actual = own(report, metric);
    return typeof actual !== 'number' || !Number.isFinite(actual) || actual < 0 || actual > max
      ? [{ metric, actual, max, unit: metric === 'readyMs' ? 'ms' : metric === 'criticalDecodedKB' ? 'KB' : 'assets' }] : [];
  });
