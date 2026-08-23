type DisplayRoutingLocation = Readonly<{
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
}>;

type DisplayRoutingWorkerLoader = () => Promise<unknown>;

const MAX_LOCATION_PART_LENGTH = 4_096;
const MAX_ROUTE_TOKEN_LENGTH = 256;
const DISPLAY_ROUTE_PARAMS = Object.freeze([
  'diagram',
  'canonicalPreset',
  'precompiledCapture',
]);

const boundedLocationPart = (value: unknown): string => (
  typeof value === 'string' && value.length <= MAX_LOCATION_PART_LENGTH ? value : ''
);

const hasBoundedRouteToken = (params: URLSearchParams): boolean => (
  DISPLAY_ROUTE_PARAMS.some((key) => {
    const value = params.get(key);
    return typeof value === 'string'
      && value.trim().length > 0
      && value.length <= MAX_ROUTE_TOKEN_LENGTH;
  })
);

export const shouldPrewarmDisplayRouting = (location: DisplayRoutingLocation): boolean => {
  const pathname = boundedLocationPart(location.pathname).toLowerCase();
  if (pathname === '/share' || pathname.startsWith('/share/')) return true;

  const search = boundedLocationPart(location.search);
  if (hasBoundedRouteToken(new URLSearchParams(search))) return true;

  const hash = boundedLocationPart(location.hash);
  const queryIndex = hash.indexOf('?');
  return queryIndex >= 0
    && hasBoundedRouteToken(new URLSearchParams(hash.slice(queryIndex + 1)));
};

const loadDisplayRoutingWorkerClient: DisplayRoutingWorkerLoader = () => (
  import('../core/components/shared/baseReactFlowDisplayWorkerClient')
);

export const prewarmDisplayRoutingForLocation = async (
  location: DisplayRoutingLocation,
  load: DisplayRoutingWorkerLoader = loadDisplayRoutingWorkerClient,
): Promise<boolean> => {
  if (!shouldPrewarmDisplayRouting(location)) return false;
  try {
    await load();
    return true;
  } catch {
    // Canvas routing owns the normal Worker fallback. Early prewarm is optional.
    return false;
  }
};
