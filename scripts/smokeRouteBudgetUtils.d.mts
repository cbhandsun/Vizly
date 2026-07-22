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
