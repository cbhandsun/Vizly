import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';

export const FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY = 'vizly.flowchart.canvas-preferences.v1';

const FLOWCHART_CANVAS_PREFERENCES_VERSION = 1;
const MAX_PREFERENCES_LENGTH = 512;

export type FlowchartCanvasGridVariant = 'dots' | 'lines' | 'cross';

export interface FlowchartCanvasPreferences {
    readonly version: typeof FLOWCHART_CANVAS_PREFERENCES_VERSION;
    readonly showGrid: boolean;
    readonly gridVariant: FlowchartCanvasGridVariant;
    readonly showMinimap: boolean;
    readonly showRuler: boolean;
    readonly snapEnabled: boolean;
}

export interface FlowchartCanvasPreferencesStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export type FlowchartCanvasPreferencesStorageProvider = () => FlowchartCanvasPreferencesStorage | null;

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isGridVariant = (value: unknown): value is FlowchartCanvasGridVariant => (
    value === 'dots' || value === 'lines' || value === 'cross'
);

export const coerceFlowchartCanvasPreferences = (value: unknown): FlowchartCanvasPreferences | null => {
    if (!isRecord(value)) return null;

    const hasSnapPreference = Object.hasOwn(value, 'snapEnabled');
    const snapEnabled = hasSnapPreference ? value.snapEnabled : undefined;
    if (!Object.hasOwn(value, 'version')
        || !Object.hasOwn(value, 'showGrid')
        || !Object.hasOwn(value, 'gridVariant')
        || !Object.hasOwn(value, 'showMinimap')
        || !Object.hasOwn(value, 'showRuler')
        || value.version !== FLOWCHART_CANVAS_PREFERENCES_VERSION
        || typeof value.showGrid !== 'boolean'
        || !isGridVariant(value.gridVariant)
        || typeof value.showMinimap !== 'boolean'
        || typeof value.showRuler !== 'boolean'
        || (hasSnapPreference && typeof snapEnabled !== 'boolean')) {
        return null;
    }

    return {
        version: FLOWCHART_CANVAS_PREFERENCES_VERSION,
        showGrid: value.showGrid,
        gridVariant: value.gridVariant,
        showMinimap: value.showMinimap,
        showRuler: value.showRuler,
        snapEnabled: typeof snapEnabled === 'boolean' ? snapEnabled : true,
    };
};

export const parseFlowchartCanvasPreferences = (value: unknown): FlowchartCanvasPreferences | null => {
    if (typeof value !== 'string'
        || value.trim().length === 0
        || value.length > MAX_PREFERENCES_LENGTH) {
        return null;
    }

    try {
        return coerceFlowchartCanvasPreferences(JSON.parse(value) as unknown);
    } catch {
        return null;
    }
};

const defaultStorageProvider: FlowchartCanvasPreferencesStorageProvider = () => {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
};

export const readFlowchartCanvasPreferences = (
    storageProvider: FlowchartCanvasPreferencesStorageProvider = defaultStorageProvider,
): FlowchartCanvasPreferences | null => {
    try {
        const storage = storageProvider();
        if (!storage) return null;
        return parseFlowchartCanvasPreferences(
            storage.getItem(FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY),
        );
    } catch (error: unknown) {
        safeLog.warn(
            '[Flowchart canvas] Failed to read display preferences:',
            redactSensitiveLogValue(error),
        );
        return null;
    }
};

export const writeFlowchartCanvasPreferences = (
    preferences: FlowchartCanvasPreferences,
    storageProvider: FlowchartCanvasPreferencesStorageProvider = defaultStorageProvider,
): boolean => {
    const safePreferences = coerceFlowchartCanvasPreferences(preferences);
    if (!safePreferences) return false;

    try {
        const storage = storageProvider();
        if (!storage) return false;
        storage.setItem(
            FLOWCHART_CANVAS_PREFERENCES_STORAGE_KEY,
            JSON.stringify(safePreferences),
        );
        return true;
    } catch (error: unknown) {
        safeLog.warn(
            '[Flowchart canvas] Failed to save display preferences:',
            redactSensitiveLogValue(error),
        );
        return false;
    }
};
