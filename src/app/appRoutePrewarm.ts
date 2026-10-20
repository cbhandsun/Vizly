import type { ComponentType } from 'react';
import {
  coerceDiagramId,
  coerceSafeStringParam,
  getQueryOrHashParamFromLocation,
  type LocationLike,
} from '@vizly/core/input';
import { isStandardPresetId } from '@/data/standardized/presetMetadata';
import { resolveAppRouteTarget, type AppRouteTarget } from './appRouteResolver';

export type LazyPageModule = { default: ComponentType };

const MAX_LOCATION_PART_LENGTH = 4_096;

const PROD_ALLOWED_TEST_MODES = new Set(['docs', '3d']);
const DEV_ALLOWED_TEST_MODES = new Set(['docs', '3d', 'colors', 'sidebyside', 'unified']);

export const createSingleFlightLoader = <T>(loader: () => Promise<T>): (() => Promise<T>) => {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= loader().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
};

const extractHashPathname = (hash: unknown): string => {
  if (typeof hash !== 'string' || hash.length === 0 || hash.length > MAX_LOCATION_PART_LENGTH) {
    return '/';
  }
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const queryIndex = withoutHash.indexOf('?');
  const rawPath = (queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash).trim();
  if (!rawPath) return '/';
  return rawPath.startsWith('/') ? rawPath : '/';
};

export type BrowserRouteLocation = Readonly<{
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
}>;

export interface ResolvedBrowserRoutePrewarmTarget {
  routeTarget: AppRouteTarget;
  diagramId: string;
  testMode: string;
  path: string;
}

const toLocationLike = (location: BrowserRouteLocation | null | undefined): LocationLike | null => {
  if (!location) return null;
  return {
    search:
      typeof location.search === 'string' && location.search.length <= MAX_LOCATION_PART_LENGTH
        ? location.search
        : '',
    hash:
      typeof location.hash === 'string' && location.hash.length <= MAX_LOCATION_PART_LENGTH
        ? location.hash
        : '',
  };
};

export const resolveBrowserLocationRouteTarget = (
  browserLocation: BrowserRouteLocation | null | undefined,
  enableDevRoutes: boolean = import.meta.env.DEV,
): ResolvedBrowserRoutePrewarmTarget => {
  const allowedModes = enableDevRoutes ? DEV_ALLOWED_TEST_MODES : PROD_ALLOWED_TEST_MODES;
  const locationLike = toLocationLike(browserLocation);
  const testModeRaw = coerceSafeStringParam(
    getQueryOrHashParamFromLocation(locationLike, 'test'),
    '',
    64,
  );
  const testMode = allowedModes.has(testModeRaw) ? testModeRaw : '';
  const diagramId = coerceDiagramId(
    getQueryOrHashParamFromLocation(locationLike, 'diagram'),
  );

  let path = extractHashPathname(browserLocation?.hash);
  const browserPathname =
    typeof browserLocation?.pathname === 'string'
    && browserLocation.pathname.length <= MAX_LOCATION_PART_LENGTH
      ? browserLocation.pathname
      : '';
  if (
    path === '/'
    && browserPathname
    && browserPathname !== '/'
    && browserPathname !== '/index.html'
    && !diagramId
    && !testMode
  ) {
    path = browserPathname;
  }

  const routeTarget = resolveAppRouteTarget({
    path,
    diagramId,
    testMode,
    enableDevRoutes,
  });

  return {
    routeTarget,
    diagramId,
    testMode,
    path,
  };
};

export type RoutePrewarmLoaders = Partial<Record<Exclude<AppRouteTarget, 'not-found'>, () => Promise<unknown>>>;

export interface PrewarmBrowserRouteDependencies {
  routeLoaders: RoutePrewarmLoaders;
  preloadStandardPreset?: (diagramId: string) => Promise<unknown>;
  enableDevRoutes?: boolean;
}

const defaultPreloadStandardPreset = async (diagramId: string): Promise<unknown> => {
  const { loadStandardPresetById } = await import('@/data/standardized/presetLoader');
  return loadStandardPresetById(diagramId);
};

export const prewarmBrowserLocationRoute = async (
  browserLocation: BrowserRouteLocation | null | undefined,
  {
    routeLoaders,
    preloadStandardPreset = defaultPreloadStandardPreset,
    enableDevRoutes = import.meta.env.DEV,
  }: PrewarmBrowserRouteDependencies,
): Promise<boolean> => {
  const { routeTarget, diagramId } = resolveBrowserLocationRouteTarget(browserLocation, enableDevRoutes);
  if (routeTarget === 'not-found') return false;

  const loadRoute = routeLoaders[routeTarget];
  if (!loadRoute) return false;

  const tasks: Promise<unknown>[] = [loadRoute()];
  if (routeTarget === 'diagram' && diagramId && isStandardPresetId(diagramId)) {
    tasks.push(preloadStandardPreset(diagramId).catch(() => null));
  }

  try {
    await Promise.all(tasks);
    return true;
  } catch {
    return false;
  }
};
