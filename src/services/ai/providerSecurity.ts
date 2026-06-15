const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function normalizeProviderBaseUrl(rawUrl: string): string | null {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    try {
        const parsed = new URL(trimmed);
        const isLocalHttp = parsed.protocol === 'http:' && LOCAL_HOSTS.has(parsed.hostname);
        if (parsed.protocol !== 'https:' && !isLocalHttp) return null;
        if (parsed.username || parsed.password) return null;
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        parsed.search = '';
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return null;
    }
}

export function getProviderEndpoint(rawUrl: string, path: '/chat/completions' | '/models'): string | null {
    const baseUrl = normalizeProviderBaseUrl(rawUrl);
    return baseUrl ? `${baseUrl}${path}` : null;
}
