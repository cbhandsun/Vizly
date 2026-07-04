export type LocationLike = Pick<Location, 'search' | 'hash'>;

const MAX_QUERY_LENGTH = 4096;
const MAX_HASH_LENGTH = 16_384;
const MAX_DIAGRAM_ID_LENGTH = 256;
const MAX_SHARE_TOKEN_LENGTH = 128;
const clampQueryString = (value: string, maxLength: number): string => {
    const bounded = value.slice(0, maxLength);
    // eslint-disable-next-line no-control-regex
    return bounded.replace(/[\u0000-\u001f\u007f]/g, '');
};

export const coerceSafeStringParam = (
    value: unknown,
    fallback: string,
    maxLength: number = MAX_QUERY_LENGTH,
    allowEmpty = false
): string => {
    if (typeof value !== 'string') return fallback;
    const trimmed = clampQueryString(value, maxLength).trim();
    if (!allowEmpty && !trimmed) return fallback;
    return trimmed;
};

const getRawQueryParam = (query: string, name: string): string | null => {
    if (typeof query !== 'string' || !query || !name) return null;
    try {
        return new URLSearchParams(query).get(name);
    } catch {
        return null;
    }
};

export const getQueryParamFromSearch = (
    search: unknown,
    name: string,
    maxLength = MAX_QUERY_LENGTH
): string | null => {
    return getRawQueryParam(coerceSafeStringParam(search, '', maxLength), name);
};

export const getQueryOrHashParamFromLocation = (
    location: LocationLike | null | undefined,
    name: string,
    maxLength = MAX_QUERY_LENGTH
): string | null => {
    const directValue = getQueryParamFromSearch(location?.search, name, maxLength);
    if (directValue) return directValue;

    if (!location?.hash) return null;
    const queryStart = location.hash.indexOf('?');
    if (queryStart < 0) return null;

    const hashQuery = location.hash.slice(queryStart + 1);
    return getRawQueryParam(clampQueryString(hashQuery, MAX_HASH_LENGTH), name);
};

export const coerceDiagramId = (value: unknown, fallback = ''): string => {
    const cleaned = coerceSafeStringParam(value, fallback, MAX_DIAGRAM_ID_LENGTH)
        .replace(/[^A-Za-z0-9._:\\/-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');

    return cleaned || fallback;
};

export const coerceShareToken = (value: unknown): string | undefined => {
    const token = coerceSafeStringParam(value, '', MAX_SHARE_TOKEN_LENGTH);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return undefined;
    return token;
};

export const getWindowSearchString = (): string => {
    return typeof window === 'undefined' ? '' : coerceSafeStringParam(window.location.search, '', MAX_QUERY_LENGTH);
};

export const getWindowHashString = (): string => {
    return typeof window === 'undefined' ? '' : coerceSafeStringParam(window.location.hash, '', MAX_HASH_LENGTH);
};
