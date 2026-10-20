type DisplayRoutingLocation = Readonly<{
  pathname?: unknown;
  search?: unknown;
  hash?: unknown;
}>;

type DisplayRoutingModule = Readonly<{
  prefetchBaseReactFlowPrecompiledRoute?: (presetId: unknown) => Promise<boolean>;
}>;

type DisplayRoutingWorkerLoader = () => Promise<DisplayRoutingModule | unknown>;

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

const extractBoundedTokenFromParams = (params: URLSearchParams): string | null => {
  for (const key of DISPLAY_ROUTE_PARAMS) {
    const value = params.get(key);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0 && value.length <= MAX_ROUTE_TOKEN_LENGTH) {
        return trimmed;
      }
    }
  }
  return null;
};

export const extractDisplayRoutingToken = (location: DisplayRoutingLocation): string | null => {
  const search = boundedLocationPart(location.search);
  const searchToken = extractBoundedTokenFromParams(new URLSearchParams(search));
  if (searchToken) return searchToken;

  const hash = boundedLocationPart(location.hash);
  const queryIndex = hash.indexOf('?');
  if (queryIndex < 0) return null;
  return extractBoundedTokenFromParams(new URLSearchParams(hash.slice(queryIndex + 1)));
};

export const shouldPrewarmDisplayRouting = (location: DisplayRoutingLocation): boolean => {
  const pathname = boundedLocationPart(location.pathname).toLowerCase();
  if (pathname === '/share' || pathname.startsWith('/share/')) return true;
  return extractDisplayRoutingToken(location) !== null;
};

const isDisplayRoutingModule = (value: unknown): value is DisplayRoutingModule => (
  typeof value === 'object' && value !== null
);

const loadDisplayRoutingWorkerClient: DisplayRoutingWorkerLoader = () => (
  import('@vizly/core/routing-runtime')
);

export const prewarmDisplayRoutingForLocation = async (
  location: DisplayRoutingLocation,
  load: DisplayRoutingWorkerLoader = loadDisplayRoutingWorkerClient,
): Promise<boolean> => {
  if (!shouldPrewarmDisplayRouting(location)) return false;
  try {
    const loaded = await load();
    const token = extractDisplayRoutingToken(location);
    if (
      token
      && isDisplayRoutingModule(loaded)
      && typeof loaded.prefetchBaseReactFlowPrecompiledRoute === 'function'
    ) {
      await loaded.prefetchBaseReactFlowPrecompiledRoute(token).catch(() => false);
    }
    return true;
  } catch {
    // Canvas routing owns the normal Worker fallback. Early prewarm is optional.
    return false;
  }
};
