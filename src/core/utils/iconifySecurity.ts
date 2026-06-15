const ICONIFY_SEARCH_ENDPOINT = 'https://api.iconify.design/search';
const ICONIFY_SVG_ENDPOINT = 'https://api.iconify.design';
const MAX_ICONIFY_QUERY_LENGTH = 80;
const MAX_ICONIFY_RESULTS = 100;
const ICONIFY_ID_PATTERN = /^[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/i;
const ICONIFY_COLLECTION_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

export const normalizeIconifyQuery = (query: unknown, fallback = 'cloud'): string => {
    if (typeof query !== 'string') return fallback;
    const normalized = query
        .trim()
        .replace(/[^\p{L}\p{N}\s:_-]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, MAX_ICONIFY_QUERY_LENGTH);
    return normalized || fallback;
};

export const isSafeIconifyIconName = (iconName: unknown): iconName is string => {
    return typeof iconName === 'string' && ICONIFY_ID_PATTERN.test(iconName) && iconName.length <= 128;
};

export const buildIconifySearchUrl = (options: {
    query: unknown;
    collection?: unknown;
    limit?: number;
    start?: number;
}): string => {
    const url = new URL(ICONIFY_SEARCH_ENDPOINT);
    url.searchParams.set('query', normalizeIconifyQuery(options.query));

    if (typeof options.collection === 'string' && ICONIFY_COLLECTION_PATTERN.test(options.collection)) {
        url.searchParams.set('collection', options.collection);
    }

    const limit = Number.isFinite(options.limit)
        ? Math.max(1, Math.min(Number(options.limit), MAX_ICONIFY_RESULTS))
        : 40;
    const start = Number.isFinite(options.start)
        ? Math.max(0, Math.min(Number(options.start), 10_000))
        : 0;

    url.searchParams.set('limit', String(limit));
    url.searchParams.set('start', String(start));
    return url.toString();
};

export const parseIconifySearchResponse = (value: unknown, maxResults = MAX_ICONIFY_RESULTS): {
    icons: string[];
    total: number;
} => {
    const input = value && typeof value === 'object' ? value as { icons?: unknown; total?: unknown } : {};
    const limit = Math.max(0, Math.min(maxResults, MAX_ICONIFY_RESULTS));
    const icons = Array.isArray(input.icons)
        ? input.icons
            .filter(isSafeIconifyIconName)
            .slice(0, limit)
        : [];
    const total = typeof input.total === 'number' && Number.isFinite(input.total) && input.total > 0
        ? Math.min(input.total, 10_000)
        : icons.length;

    return { icons, total };
};

export const buildIconifySvgUrl = (iconName: unknown): string | null => {
    if (!isSafeIconifyIconName(iconName)) return null;
    return `${ICONIFY_SVG_ENDPOINT}/${iconName}.svg`;
};
