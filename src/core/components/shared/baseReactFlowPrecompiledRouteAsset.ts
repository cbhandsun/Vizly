const MAX_PRECOMPILED_ROUTE_ASSET_BYTES = 1_000_000;
const MAX_PRECOMPILED_ROUTE_ASSET_CACHE_ENTRIES = 8;

type RouteArtifactFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type PrecompiledRouteAssetCache = Map<string, Promise<unknown>>;

const precompiledRouteAssetCache: PrecompiledRouteAssetCache = new Map();

const parseContentLength = (value: string | null): number | null => {
  if (value === null || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const isSameOriginHttpAsset = (url: URL): boolean => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const runtimeOrigin = globalThis.location?.origin;
  return !runtimeOrigin || runtimeOrigin === 'null' || url.origin === runtimeOrigin;
};

const rememberPrecompiledRouteAsset = (
  key: string,
  promise: Promise<unknown>,
): void => {
  if (precompiledRouteAssetCache.has(key)) precompiledRouteAssetCache.delete(key);
  precompiledRouteAssetCache.set(key, promise);
  while (precompiledRouteAssetCache.size > MAX_PRECOMPILED_ROUTE_ASSET_CACHE_ENTRIES) {
    const oldestKey = precompiledRouteAssetCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    precompiledRouteAssetCache.delete(oldestKey);
  }
};

const fetchBaseReactFlowPrecompiledRouteAsset = async (
  url: URL,
  fetchRouteArtifact: RouteArtifactFetch,
): Promise<unknown> => {
  const response = await fetchRouteArtifact(url, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Precompiled route asset returned HTTP ${response.status}`);
  const declaredLength = parseContentLength(response.headers.get('content-length'));
  if (declaredLength !== null && declaredLength > MAX_PRECOMPILED_ROUTE_ASSET_BYTES) {
    throw new Error('Precompiled route asset exceeds the byte limit');
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > MAX_PRECOMPILED_ROUTE_ASSET_BYTES) {
    throw new Error('Precompiled route asset exceeds the byte limit');
  }
  return JSON.parse(body) as unknown;
};

/** Loads a generated route as bounded same-origin data rather than executable JS. */
export const loadBaseReactFlowPrecompiledRouteAsset = async (
  url: URL,
  fetchRouteArtifact?: RouteArtifactFetch,
): Promise<unknown> => {
  if (!(url instanceof URL) || !isSameOriginHttpAsset(url)) {
    throw new Error('Precompiled route asset URL must be same-origin HTTP(S)');
  }
  const resolvedFetch = fetchRouteArtifact ?? globalThis.fetch;
  if (typeof resolvedFetch !== 'function') {
    throw new Error('Precompiled route asset fetch is unavailable');
  }
  if (fetchRouteArtifact) {
    return fetchBaseReactFlowPrecompiledRouteAsset(url, resolvedFetch);
  }

  const key = url.href;
  const cached = precompiledRouteAssetCache.get(key);
  if (cached) {
    rememberPrecompiledRouteAsset(key, cached);
    return cached;
  }
  const promise = fetchBaseReactFlowPrecompiledRouteAsset(url, resolvedFetch).catch(error => {
    if (precompiledRouteAssetCache.get(key) === promise) {
      precompiledRouteAssetCache.delete(key);
    }
    throw error;
  });
  rememberPrecompiledRouteAsset(key, promise);
  return promise;
};
