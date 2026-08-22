export type AppRouteTarget =
  | 'theme-colors'
  | 'theme-side-by-side'
  | 'docs'
  | 'warehouse-3d'
  | 'storage-config'
  | 'shared'
  | 'manage'
  | 'unified-test'
  | 'diagram'
  | 'not-found';

export interface AppRouteResolutionInput {
  path: string;
  diagramId: string;
  testMode: string;
  enableDevRoutes: boolean;
}

const matchesRouteSegment = (path: string, route: string): boolean =>
  path === route || path.startsWith(`${route}/`);

/** Resolve sanitized routing inputs without silently treating unknown paths as diagrams. */
export const resolveAppRouteTarget = ({
  path,
  diagramId,
  testMode,
  enableDevRoutes,
}: AppRouteResolutionInput): AppRouteTarget => {
  if (enableDevRoutes && testMode === 'colors') return 'theme-colors';
  if (enableDevRoutes && testMode === 'sidebyside') return 'theme-side-by-side';
  if (matchesRouteSegment(path, '/docs') || testMode === 'docs') return 'docs';
  if (matchesRouteSegment(path, '/warehouse-3d') || testMode === '3d') return 'warehouse-3d';
  if (matchesRouteSegment(path, '/storage-config')) return 'storage-config';
  if (matchesRouteSegment(path, '/shared')) return 'shared';

  const isRoot = path === '/' || path === '';
  if (matchesRouteSegment(path, '/manage') || (isRoot && !diagramId && !testMode)) return 'manage';
  if (enableDevRoutes && (matchesRouteSegment(path, '/unified-test') || testMode === 'unified')) {
    return 'unified-test';
  }
  if (matchesRouteSegment(path, '/diagram') || (isRoot && diagramId)) return 'diagram';

  return 'not-found';
};
