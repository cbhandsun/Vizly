const MAX_ENV_URL_LENGTH = 2_048;
const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const isAllowedSupabaseProtocol = (parsed: URL): boolean => (
    parsed.protocol === 'https:' ||
    (parsed.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(parsed.hostname))
);

export const normalizeSupabaseUrl = (rawUrl: unknown): string | null => {
    if (typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.length > MAX_ENV_URL_LENGTH) return null;

    try {
        const parsed = new URL(trimmed);
        if (!isAllowedSupabaseProtocol(parsed)) return null;
        if (parsed.username || parsed.password) return null;
        if (parsed.search || parsed.hash) return null;

        return parsed.origin;
    } catch {
        return null;
    }
};

export const buildSupabaseFunctionUrl = (supabaseUrl: unknown, functionName: string): string | null => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(functionName)) return null;
    const normalizedUrl = normalizeSupabaseUrl(supabaseUrl);
    return normalizedUrl ? `${normalizedUrl}/functions/v1/${functionName}` : null;
};

export const normalizeStripePriceId = (rawPriceId: unknown): string | null => {
    if (typeof rawPriceId !== 'string') return null;
    const priceId = rawPriceId.trim();
    if (/^price_mock/i.test(priceId)) return null;
    return /^price_[A-Za-z0-9_]{1,128}$/.test(priceId) ? priceId : null;
};
