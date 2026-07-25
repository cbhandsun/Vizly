import { EDGE_ROUTING_CACHE_VERSION } from './routingVersion';

export const RENDERED_PATH_CACHE_VERSION = EDGE_ROUTING_CACHE_VERSION;
export const MAX_RENDERED_PATH_CACHE_SIZE = 2_000;

type RenderedPathCacheWindow = Window & {
    __dv_rendered_path_cache__?: Map<string, string>;
    __dv_rendered_path_cache_version__?: string;
};

const nonBrowserRenderedPathCache = new Map<string, string>();

export const getRenderedPathCache = (): Map<string, string> => {
    if (typeof window === 'undefined') return nonBrowserRenderedPathCache;

    const w = window as RenderedPathCacheWindow;
    if (
        w.__dv_rendered_path_cache_version__ !== RENDERED_PATH_CACHE_VERSION
        || !(w.__dv_rendered_path_cache__ instanceof Map)
    ) {
        w.__dv_rendered_path_cache__ = new Map<string, string>();
        w.__dv_rendered_path_cache_version__ = RENDERED_PATH_CACHE_VERSION;
    }

    return w.__dv_rendered_path_cache__;
};

export const setRenderedPathCacheValue = (edgeId: string, path: string): void => {
    const cache = getRenderedPathCache();
    if (cache.get(edgeId) === path) return;
    cache.delete(edgeId);
    cache.set(edgeId, path);
    while (cache.size > MAX_RENDERED_PATH_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        cache.delete(oldestKey);
    }
};

export const retainRenderedPathCacheEdges = (activeEdgeIds: ReadonlySet<string>): void => {
    const cache = getRenderedPathCache();
    for (const edgeId of cache.keys()) {
        if (!activeEdgeIds.has(edgeId)) cache.delete(edgeId);
    }
};

export const clearRenderedPathCache = (): void => {
    if (typeof window === 'undefined') {
        nonBrowserRenderedPathCache.clear();
        return;
    }

    const w = window as RenderedPathCacheWindow;
    w.__dv_rendered_path_cache_version__ = RENDERED_PATH_CACHE_VERSION;
    if (w.__dv_rendered_path_cache__ instanceof Map) {
        w.__dv_rendered_path_cache__.clear();
        return;
    }
    w.__dv_rendered_path_cache__ = new Map<string, string>();
};
