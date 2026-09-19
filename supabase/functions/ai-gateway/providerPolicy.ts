const DEFAULT_PROVIDER_ORIGINS = new Set([
  'https://api.openai.com',
  'https://api.deepseek.com',
  'https://api.siliconflow.cn',
  'https://generativelanguage.googleapis.com',
  'https://api.anthropic.com',
  'https://api.o3.fan',
]);

const MAX_BASE_URL_CHARS = 2_048;
const MAX_EXTRA_ORIGINS = 50;

const normalizeHttpsOrigin = (value: string): string | null => {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
};

export const parseAdditionalProviderOrigins = (rawValue: unknown): Set<string> => {
  if (typeof rawValue !== 'string' || !rawValue.trim()) return new Set();
  const origins = rawValue.split(',').slice(0, MAX_EXTRA_ORIGINS).flatMap((value) => {
    const origin = normalizeHttpsOrigin(value);
    return origin ? [origin] : [];
  });
  return new Set(origins);
};

export type ProviderBaseUrlResult =
  | { ok: true; baseURL: string }
  | { ok: false; reason: 'invalid-url' | 'origin-not-allowed' };

export const validateGatewayProviderBaseUrl = (
  value: unknown,
  additionalOrigins: unknown,
): ProviderBaseUrlResult => {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_BASE_URL_CHARS) {
    return { ok: false, reason: 'invalid-url' };
  }
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash) {
      return { ok: false, reason: 'invalid-url' };
    }
    const allowedOrigins = new Set([
      ...DEFAULT_PROVIDER_ORIGINS,
      ...parseAdditionalProviderOrigins(additionalOrigins),
    ]);
    if (!allowedOrigins.has(parsed.origin)) {
      return { ok: false, reason: 'origin-not-allowed' };
    }
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return { ok: true, baseURL: parsed.toString().replace(/\/$/, '') };
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
};
