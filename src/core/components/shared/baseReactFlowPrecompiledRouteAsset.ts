const MAX_PRECOMPILED_ROUTE_ASSET_BYTES = 1_000_000;

type RouteArtifactFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

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

/** Loads a generated route as bounded same-origin data rather than executable JS. */
export const loadBaseReactFlowPrecompiledRouteAsset = async (
  url: URL,
  fetchRouteArtifact: RouteArtifactFetch = globalThis.fetch,
): Promise<unknown> => {
  if (!(url instanceof URL) || !isSameOriginHttpAsset(url)) {
    throw new Error('Precompiled route asset URL must be same-origin HTTP(S)');
  }
  if (typeof fetchRouteArtifact !== 'function') {
    throw new Error('Precompiled route asset fetch is unavailable');
  }
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
