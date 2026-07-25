export type RouteBudget = Readonly<{
  criticalAssets?: number;
  criticalDecodedKB?: number;
  readyMs?: number;
}>;

export type RouteBudgetOptions = Readonly<{
  env?: Readonly<Record<string, string | undefined>>;
  isMobile?: boolean;
}>;

export const defaultDesktopRouteBudgets: Readonly<Record<string, Readonly<{
  criticalAssets: number;
  criticalDecodedKB: number;
  readyMs: number;
}>>>;

export const defaultMobileRouteBudgetOverrides: Readonly<Record<string, RouteBudget>>;

export const resolveRouteBudget: (
  routeName: string,
  options?: RouteBudgetOptions,
) => RouteBudget;

export const shouldRetryEvaluateAfterTimeout: (
  error: unknown,
  options?: Pick<RouteBudgetOptions, 'isMobile'>,
) => boolean;

export const isFinalWmsDisplayRoutingReady: (value: unknown) => boolean;

export type RouteStabilityReport = Readonly<{
  maxLongTaskMs?: number;
  longTaskCount?: number;
  heapGrowthKB?: number;
  activeWorkers?: number;
  queuedTasks?: number;
}>;

export type RouteStabilityBudget = Readonly<{
  maxLongTaskMs?: number;
  maxLongTaskCount?: number;
  maxHeapGrowthKB?: number;
  maxActiveWorkers?: number;
  maxQueuedTasks?: number;
}>;

export const collectRouteStabilityViolations: (
  report: RouteStabilityReport | null | undefined,
  budget: RouteStabilityBudget | null | undefined,
) => Array<{
  metric: string;
  actual: number;
  max: number;
  unit: string;
}>;
