import { logFlowchartCacheClearFailure } from './flowchartCacheLogging';

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

const normalizeDiagramId = (diagramId?: string | null) => {
    const trimmed = diagramId?.trim();
    return trimmed || null;
};

export const getFlowchartCacheKeysToClear = (diagramId?: string | null) => {
    const localStorageKeys = new Set<string>(LOCAL_UI_CACHE_KEYS);
    const sessionStorageKeys = new Set<string>(SESSION_UI_CACHE_KEYS);
    const normalizedDiagramId = normalizeDiagramId(diagramId);

    if (normalizedDiagramId) {
        localStorageKeys.add(`flowchart-autosave-v2-${normalizedDiagramId}`);
        localStorageKeys.add(`GenericStandardDiagram.customPresets.${normalizedDiagramId}`);
    }

    return {
        localStorageKeys: [...localStorageKeys],
        sessionStorageKeys: [...sessionStorageKeys],
    };
};

export const clearFlowchartCache = (diagramId?: string | null) => {
    const { localStorageKeys, sessionStorageKeys } = getFlowchartCacheKeysToClear(diagramId);

    for (const key of localStorageKeys) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            logFlowchartCacheClearFailure('localStorage', key, error);
        }
    }

    for (const key of sessionStorageKeys) {
        try {
            sessionStorage.removeItem(key);
        } catch (error) {
            logFlowchartCacheClearFailure('sessionStorage', key, error);
        }
    }
};
