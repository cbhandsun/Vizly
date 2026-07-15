import { EDGE_ROUTING_CACHE_VERSION } from './routingVersion';

export const RENDERED_PATH_CACHE_VERSION = EDGE_ROUTING_CACHE_VERSION;

type RenderedPathCacheWindow = Window & {
    __dv_rendered_path_cache__?: Map<string, string>;
    __dv_rendered_path_cache_version__?: string;
};

export const getRenderedPathCache = (): Map<string, string> => {
    if (typeof window === 'undefined') return new Map<string, string>();

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
    cache.set(edgeId, path);
};

export const clearRenderedPathCache = (): void => {
    if (typeof window === 'undefined') return;

    const w = window as RenderedPathCacheWindow;
    w.__dv_rendered_path_cache_version__ = RENDERED_PATH_CACHE_VERSION;
    if (w.__dv_rendered_path_cache__ instanceof Map) {
        w.__dv_rendered_path_cache__.clear();
        return;
    }
    w.__dv_rendered_path_cache__ = new Map<string, string>();
};
