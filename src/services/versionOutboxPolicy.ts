/** Rollback switch: retain v3 data and local-first saves, stop only automatic sends. */
export const VERSION_AUTOSYNC_ENABLED = import.meta.env.VITE_VERSION_AUTOSYNC_ENABLED !== 'false';
