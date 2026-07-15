const normalizeModuleId = (id: string): string => id.replace(/\\/g, '/');

const APP_SAFE_LOGGING_FILES = new Set([
  'consoleCleanup.ts',
  'logSecurity.ts',
  'uiStorageLogging.ts',
]);

const basename = (id: string): string => {
  const normalized = normalizeModuleId(id);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
};

/** Safe logging is shared by several lazy features and must stay feature-neutral. */
export const matchesAppSafeLoggingModule = (id: string): boolean => {
  const normalized = normalizeModuleId(id);
  return normalized.includes('/src/core/utils/')
    && APP_SAFE_LOGGING_FILES.has(basename(normalized));
};

/** Theme presets are lazy modules, but the diagram route loads them together. */
export const matchesThemePresetModule = (id: string): boolean => (
  normalizeModuleId(id).includes('/src/core/themes/presets/')
);
