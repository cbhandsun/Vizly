import type { LayerConfig } from '../components/diagrams/hooks/useLayerManagement';
import { normalizeLayerNameInput, resolveUniqueLayerName } from './layerName';
import { logUiStorageReadFailure, logUiStorageWriteFailure } from './uiStorageLogging';

export const FLOWCHART_LAYERS_STORAGE_KEY = 'flowchart.layers';
export const FLOWCHART_ACTIVE_LAYER_STORAGE_KEY = 'flowchart.activeLayerId';

export const DEFAULT_LAYER: LayerConfig = {
    id: 'layer-0',
    name: '默认',
    visible: true,
    locked: false,
    zIndex: 0,
};

const MAX_LAYERS = 50;
const MAX_LAYER_ID_LENGTH = 80;
const MAX_LAYER_STORAGE_JSON_LENGTH = 2 * 1024 * 1024;
const MAX_LAYER_SCOPE_INPUT_LENGTH = 2_048;
const SAFE_LAYER_ID = /^[\w:-]+$/u;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/u;
const SAFE_LAYER_SCOPE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/u;

const hashLayerScope = (value: string): string => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const normalizeLayerStorageScope = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (SAFE_LAYER_SCOPE.test(trimmed)) return trimmed;

    const bounded = trimmed.slice(0, MAX_LAYER_SCOPE_INPUT_LENGTH);
    return `hashed-${hashLayerScope(`${trimmed.length}:${bounded}`)}`;
};

export const getLayerStorageKeys = (scope?: unknown) => {
    const normalizedScope = normalizeLayerStorageScope(scope);
    if (!normalizedScope) {
        return {
            layers: FLOWCHART_LAYERS_STORAGE_KEY,
            activeLayer: FLOWCHART_ACTIVE_LAYER_STORAGE_KEY,
        };
    }
    return {
        layers: `${FLOWCHART_LAYERS_STORAGE_KEY}.diagram.${normalizedScope}`,
        activeLayer: `${FLOWCHART_ACTIVE_LAYER_STORAGE_KEY}.diagram.${normalizedScope}`,
    };
};

const isSafeLayerId = (value: unknown): value is string =>
    typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= MAX_LAYER_ID_LENGTH
    && SAFE_LAYER_ID.test(value.trim());

const normalizeLayerName = (value: unknown, fallback: string): string => {
    return normalizeLayerNameInput(value) ?? fallback;
};

const coerceLayer = (value: unknown, zIndex: number): LayerConfig | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;
    if (!isSafeLayerId(record.id)) return null;

    const color = typeof record.color === 'string' && SAFE_COLOR.test(record.color)
        ? record.color
        : undefined;

    return {
        id: record.id.trim(),
        name: normalizeLayerName(record.name, record.id.trim()),
        visible: typeof record.visible === 'boolean' ? record.visible : true,
        locked: typeof record.locked === 'boolean' ? record.locked : false,
        ...(color ? { color } : {}),
        zIndex,
    };
};

export const coerceLayers = (value: unknown): LayerConfig[] => {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    const layers: LayerConfig[] = [];

    for (const rawLayer of source.slice(0, MAX_LAYERS)) {
        const layer = coerceLayer(rawLayer, layers.length);
        if (!layer || seen.has(layer.id)) continue;
        seen.add(layer.id);
        layers.push(layer);
    }

    if (!layers.some(layer => layer.id === DEFAULT_LAYER.id)) {
        layers.unshift({ ...DEFAULT_LAYER });
    }

    const defaultLayer = layers.find(layer => layer.id === DEFAULT_LAYER.id) ?? DEFAULT_LAYER;
    const defaultName = normalizeLayerNameInput(defaultLayer.name) ?? DEFAULT_LAYER.name;
    const usedNames = [defaultName];
    const resolvedNames = new Map<string, string>([[DEFAULT_LAYER.id, defaultName]]);

    for (const layer of layers) {
        if (layer.id === DEFAULT_LAYER.id) continue;
        const uniqueName = resolveUniqueLayerName(usedNames, layer.name);
        if (!uniqueName) continue;
        usedNames.push(uniqueName);
        resolvedNames.set(layer.id, uniqueName);
    }

    return layers.map((layer, index) => ({
        ...layer,
        name: resolvedNames.get(layer.id) ?? layer.id,
        zIndex: index,
    }));
};

export const coerceActiveLayerId = (value: unknown, layers: LayerConfig[]): string => {
    const layerIds = new Set(layers.map(layer => layer.id));
    if (isSafeLayerId(value) && layerIds.has(value.trim())) {
        return value.trim();
    }
    return DEFAULT_LAYER.id;
};

const parseStoredLayers = (raw: string | null, storageKey: string): unknown => {
    if (!raw) return [];
    if (raw.length > MAX_LAYER_STORAGE_JSON_LENGTH) {
        logUiStorageReadFailure('layerStorage', storageKey, new Error('Layer storage JSON is too large.'));
        return [];
    }

    try {
        return JSON.parse(raw) as unknown;
    } catch (error) {
        logUiStorageReadFailure('layerStorage', storageKey, error);
        return [];
    }
};

export const readLayers = (scope?: unknown): LayerConfig[] => {
    const storageKeys = getLayerStorageKeys(scope);
    try {
        const scopedRaw = localStorage.getItem(storageKeys.layers);
        const shouldMigrate = scopedRaw === null
            && storageKeys.layers !== FLOWCHART_LAYERS_STORAGE_KEY;
        const sourceKey = shouldMigrate ? FLOWCHART_LAYERS_STORAGE_KEY : storageKeys.layers;
        const sourceRaw = shouldMigrate
            ? localStorage.getItem(FLOWCHART_LAYERS_STORAGE_KEY)
            : scopedRaw;
        const normalized = coerceLayers(parseStoredLayers(sourceRaw, sourceKey));
        if (shouldMigrate && sourceRaw !== null) {
            try {
                localStorage.setItem(storageKeys.layers, JSON.stringify(normalized));
                if (localStorage.getItem(storageKeys.activeLayer) === null) {
                    const legacyActiveLayerId = coerceActiveLayerId(
                        localStorage.getItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY),
                        normalized,
                    );
                    localStorage.setItem(storageKeys.activeLayer, legacyActiveLayerId);
                }
                localStorage.removeItem(FLOWCHART_LAYERS_STORAGE_KEY);
                localStorage.removeItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY);
            } catch (error) {
                logUiStorageWriteFailure('layerStorage', storageKeys.layers, error);
            }
        }
        return normalized;
    } catch (error) {
        logUiStorageReadFailure('layerStorage', storageKeys.layers, error);
        return [{ ...DEFAULT_LAYER }];
    }
};

export const writeLayers = (layers: LayerConfig[], scope?: unknown): LayerConfig[] => {
    const normalized = coerceLayers(layers);
    const storageKey = getLayerStorageKeys(scope).layers;
    try {
        localStorage.setItem(storageKey, JSON.stringify(normalized));
    } catch (error) {
        logUiStorageWriteFailure('layerStorage', storageKey, error);
    }
    return normalized;
};

export const readActiveLayerId = (layers: LayerConfig[], scope?: unknown): string => {
    const storageKeys = getLayerStorageKeys(scope);
    try {
        const scopedRaw = localStorage.getItem(storageKeys.activeLayer);
        const shouldMigrate = scopedRaw === null
            && storageKeys.activeLayer !== FLOWCHART_ACTIVE_LAYER_STORAGE_KEY;
        const sourceRaw = shouldMigrate
            ? localStorage.getItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY)
            : scopedRaw;
        const normalized = coerceActiveLayerId(sourceRaw, layers);
        if (shouldMigrate && sourceRaw !== null) {
            try {
                localStorage.setItem(storageKeys.activeLayer, normalized);
                localStorage.removeItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY);
            } catch (error) {
                logUiStorageWriteFailure('layerStorage', storageKeys.activeLayer, error);
            }
        }
        return normalized;
    } catch (error) {
        logUiStorageReadFailure('layerStorage', storageKeys.activeLayer, error);
        return DEFAULT_LAYER.id;
    }
};

export const writeActiveLayerId = (
    activeLayerId: string,
    layers: LayerConfig[],
    scope?: unknown,
): string => {
    const normalized = coerceActiveLayerId(activeLayerId, layers);
    const storageKey = getLayerStorageKeys(scope).activeLayer;
    try {
        localStorage.setItem(storageKey, normalized);
    } catch (error) {
        logUiStorageWriteFailure('layerStorage', storageKey, error);
    }
    return normalized;
};
