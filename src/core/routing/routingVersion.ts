export const EDGE_ROUTING_CACHE_VERSION = '14';

/**
 * Version of the renderer-facing commercial quality contract. Keep this
 * separate from the algorithm/cache version so a visual contract change can
 * invalidate Worker session authority even when route serialization remains
 * compatible.
 */
export const EDGE_ROUTING_VISUAL_VERSION = 'commercial-hard-gate-v1';
