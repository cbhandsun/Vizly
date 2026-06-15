import type { LayerConfig } from '../components/diagrams/hooks/useLayerManagement';
import { safeJsonParse } from './jsonUtils';

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
const MAX_LAYER_NAME_LENGTH = 80;
const SAFE_LAYER_ID = /^[\w:-]+$/u;
const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/u;

const isSafeLayerId = (value: unknown): value is string =>
    typeof value === 'string'
    && value.trim().length > 0
    && value.trim().length <= MAX_LAYER_ID_LENGTH
    && SAFE_LAYER_ID.test(value.trim());

const normalizeLayerName = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim().slice(0, MAX_LAYER_NAME_LENGTH);
    return trimmed || fallback;
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

    const defaultIndex = layers.findIndex(layer => layer.id === DEFAULT_LAYER.id);
    if (defaultIndex === -1) {
        layers.unshift({ ...DEFAULT_LAYER });
    } else {
        layers[defaultIndex] = {
            ...layers[defaultIndex],
            id: DEFAULT_LAYER.id,
            name: layers[defaultIndex].name || DEFAULT_LAYER.name,
        };
    }

    return layers.map((layer, index) => ({ ...layer, zIndex: index }));
};

export const coerceActiveLayerId = (value: unknown, layers: LayerConfig[]): string => {
    const layerIds = new Set(layers.map(layer => layer.id));
    if (isSafeLayerId(value) && layerIds.has(value.trim())) {
        return value.trim();
    }
    return DEFAULT_LAYER.id;
};

export const readLayers = (): LayerConfig[] => {
    try {
        return coerceLayers(safeJsonParse<unknown>(localStorage.getItem(FLOWCHART_LAYERS_STORAGE_KEY), []));
    } catch {
        return [{ ...DEFAULT_LAYER }];
    }
};

export const writeLayers = (layers: LayerConfig[]): LayerConfig[] => {
    const normalized = coerceLayers(layers);
    try {
        localStorage.setItem(FLOWCHART_LAYERS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
        void 0;
    }
    return normalized;
};

export const readActiveLayerId = (layers: LayerConfig[]): string => {
    try {
        return coerceActiveLayerId(localStorage.getItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY), layers);
    } catch {
        return DEFAULT_LAYER.id;
    }
};

export const writeActiveLayerId = (activeLayerId: string, layers: LayerConfig[]): string => {
    const normalized = coerceActiveLayerId(activeLayerId, layers);
    try {
        localStorage.setItem(FLOWCHART_ACTIVE_LAYER_STORAGE_KEY, normalized);
    } catch {
        void 0;
    }
    return normalized;
};
