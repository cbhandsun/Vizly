const LOCAL_WEB_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const MAX_ALLOWED_ORIGINS = 50;

const parseWebOrigin = (value: string): string | null => {
  try {
    const parsed = new URL(value.trim());
    const localHttp = parsed.protocol === 'http:' && LOCAL_WEB_HOSTS.has(parsed.hostname);
    if (parsed.protocol !== 'https:' && !localHttp) return null;
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

export const isAllowedGatewayRequestOrigin = (
  requestOrigin: unknown,
  configuredOrigins: unknown,
): boolean => {
  if (typeof requestOrigin !== 'string' || !requestOrigin) return true;
  const normalizedRequestOrigin = parseWebOrigin(requestOrigin);
  if (!normalizedRequestOrigin) return false;
  const parsedRequest = new URL(normalizedRequestOrigin);
  if (LOCAL_WEB_HOSTS.has(parsedRequest.hostname)) return true;
  if (typeof configuredOrigins !== 'string') return false;
  const allowed = configuredOrigins
    .split(',')
    .slice(0, MAX_ALLOWED_ORIGINS)
    .flatMap((value) => {
      const origin = parseWebOrigin(value);
      return origin ? [origin] : [];
    });
  return allowed.includes(normalizedRequestOrigin);
};

export const buildGatewayCorsHeaders = (requestOrigin: string | null): Headers => {
  const headers = new Headers({
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Vizly-AI-Gateway',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  });
  if (requestOrigin) headers.set('Access-Control-Allow-Origin', requestOrigin);
  return headers;
};

export const hasBearerAuthorization = (value: unknown): boolean => (
  typeof value === 'string'
  && /^Bearer [A-Za-z0-9._~-]{16,16384}$/.test(value)
);
