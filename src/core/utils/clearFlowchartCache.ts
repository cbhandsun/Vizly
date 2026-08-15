import { logFlowchartCacheClearFailure } from './flowchartCacheLogging';
import { getLayerStorageKeys } from './layerStorage';

const LOCAL_UI_CACHE_KEYS = [
    'commandPalette.recent',
    'diagramMenu.collapsedGroups',
    'diagramMenu.favorites',
    'diagramMenu.recent',
    'diagramMenu.scrollTop',
    'designer.flowchart.onboarding.dismissed',
    'designer.minimap.minimized',
    'designer.minimap.offset',
    'designer.minimap.size',
    'designer.rightSidebar.collapsed',
    'designer.rightSidebar.width',
    'designer.sidebar.drawerWidth',
    'flowchart.activeLayerId',
    'flowchart.layers',
    'flowchart-clipboard',
] as const;

const SESSION_UI_CACHE_KEYS = [
    'layered-config-session',
] as const;

const STANDARD_PRESET_CANVAS_CACHE_PREFIX = 'vizly:standard-preset-canvas:';
const BASE_DISPLAY_CACHE_PREFIX = 'vizly:baseReactFlowDisplayEdges:';
const MAX_STORAGE_KEYS_TO_SCAN = 10_000;
const SAFE_DIAGRAM_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/;

export interface FlowchartCacheClearFailure {
    storageType: 'localStorage' | 'sessionStorage';
    operation: 'enumerate' | 'remove';
    key?: string;
}

export interface FlowchartCacheClearResult {
    ok: boolean;
    removedCount: number;
    failures: FlowchartCacheClearFailure[];
}

const normalizeDiagramId = (diagramId?: string | null) => {
    const trimmed = diagramId?.trim();
    return trimmed || null;
};

const isStandardPresetCacheForDiagram = (key: string, diagramId: string): boolean => {
    if (!key.startsWith(STANDARD_PRESET_CANVAS_CACHE_PREFIX)) return false;
    const segments = key.slice(STANDARD_PRESET_CANVAS_CACHE_PREFIX.length).split(':');
    return segments.length === 3 && segments[1] === diagramId;
};

const discoverFlowchartRuntimeCacheKeys = (
    storage: Pick<Storage, 'key' | 'length'>,
    diagramId?: string | null,
): { keys: string[]; enumerationFailed: boolean } => {
    const normalizedDiagramId = normalizeDiagramId(diagramId);
    const canMatchDiagram = normalizedDiagramId !== null
        && SAFE_DIAGRAM_ID_PATTERN.test(normalizedDiagramId);
    const keys = new Set<string>();
    let length: number;
    try {
        length = Math.min(storage.length, MAX_STORAGE_KEYS_TO_SCAN);
    } catch (error) {
        logFlowchartCacheClearFailure('localStorage', '<runtime-cache-index>', error);
        return { keys: [], enumerationFailed: true };
    }

    let enumerationFailed = false;

    for (let index = 0; index < length; index += 1) {
        let key: string | null;
        try {
            key = storage.key(index);
        } catch (error) {
            enumerationFailed = true;
            logFlowchartCacheClearFailure('localStorage', `<runtime-cache-index:${index}>`, error);
            continue;
        }
        if (!key || key.length > 2_048) continue;
        if (key.startsWith(BASE_DISPLAY_CACHE_PREFIX)) {
            keys.add(key);
            continue;
        }
        if (
            canMatchDiagram
            && isStandardPresetCacheForDiagram(key, normalizedDiagramId)
        ) {
            keys.add(key);
        }
    }
    return { keys: [...keys], enumerationFailed };
};

export const getFlowchartRuntimeCacheKeysToClear = (
    storage: Pick<Storage, 'key' | 'length'>,
    diagramId?: string | null,
): string[] => discoverFlowchartRuntimeCacheKeys(storage, diagramId).keys;

export const getFlowchartCacheKeysToClear = (diagramId?: string | null) => {
    const localStorageKeys = new Set<string>(LOCAL_UI_CACHE_KEYS);
    const sessionStorageKeys = new Set<string>(SESSION_UI_CACHE_KEYS);
    const normalizedDiagramId = normalizeDiagramId(diagramId);

    if (normalizedDiagramId) {
        localStorageKeys.add(`flowchart-autosave-v2-${normalizedDiagramId}`);
        localStorageKeys.add(`GenericStandardDiagram.customPresets.${normalizedDiagramId}`);
        const layerStorageKeys = getLayerStorageKeys(normalizedDiagramId);
        localStorageKeys.add(layerStorageKeys.layers);
        localStorageKeys.add(layerStorageKeys.activeLayer);
    }

    return {
        localStorageKeys: [...localStorageKeys],
        sessionStorageKeys: [...sessionStorageKeys],
    };
};

export const clearFlowchartCache = (diagramId?: string | null): FlowchartCacheClearResult => {
    const { localStorageKeys, sessionStorageKeys } = getFlowchartCacheKeysToClear(diagramId);
    const runtimeCacheDiscovery = discoverFlowchartRuntimeCacheKeys(localStorage, diagramId);
    const failures: FlowchartCacheClearFailure[] = runtimeCacheDiscovery.enumerationFailed
        ? [{ storageType: 'localStorage', operation: 'enumerate' }]
        : [];
    let removedCount = 0;

    for (const key of [...localStorageKeys, ...runtimeCacheDiscovery.keys]) {
        try {
            localStorage.removeItem(key);
            removedCount += 1;
        } catch (error) {
            logFlowchartCacheClearFailure('localStorage', key, error);
            failures.push({ storageType: 'localStorage', operation: 'remove', key });
        }
    }

    for (const key of sessionStorageKeys) {
        try {
            sessionStorage.removeItem(key);
            removedCount += 1;
        } catch (error) {
            logFlowchartCacheClearFailure('sessionStorage', key, error);
            failures.push({ storageType: 'sessionStorage', operation: 'remove', key });
        }
    }

    return {
        ok: failures.length === 0,
        removedCount,
        failures,
    };
};
