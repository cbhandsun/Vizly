// Regenerate automatic Dagre proposals so their provenance is available before
// the display router decides whether an unsafe path may be reconstructed.
export const EDGE_ROUTING_CACHE_VERSION = '19';

/**
 * Version of the renderer-facing commercial quality contract. Keep this
 * separate from the algorithm/cache version so a visual contract change can
 * invalidate Worker session authority even when route serialization remains
 * compatible.
 */
export const EDGE_ROUTING_VISUAL_VERSION = 'balanced-crossing-gate-v2';

/** Version of the structured-clone contract used for commit-capable Worker results. */
export const EDGE_ROUTING_WORKER_PROTOCOL_VERSION = 'display-routing-worker-v1';
