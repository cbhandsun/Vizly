import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { appMessage } from '../../../utils/antdStaticBridge';
import {
    coerceActiveLayerId,
    coerceLayers,
    DEFAULT_LAYER,
    readActiveLayerId,
    readLayers,
    writeActiveLayerId,
    writeLayers,
} from '../../../utils/layerStorage';
import { isLayerNameAvailable, normalizeLayerNameInput } from '../../../utils/layerName';

export interface LayerConfig {
    id: string;            // 图层 ID
    name: string;          // 图层名称
    visible: boolean;      // 可见性
    locked: boolean;       // 锁定状态
    color?: string;        // 颜色标记（可选）
    zIndex: number;        // Z-order（越大越靠前）
}

export interface LayersState {
    layers: LayerConfig[];
    activeLayerId: string | null;
}

const findEditableLayer = (layers: LayerConfig[], excludedLayerId?: string) => (
    layers.find(layer => (
        layer.id !== excludedLayerId
        && layer.visible
        && !layer.locked
    ))
);

const ensureEditableLayer = (layers: LayerConfig[]): LayerConfig[] => {
    if (findEditableLayer(layers)) return layers;
    const recoveryLayerId = layers.some(layer => layer.id === DEFAULT_LAYER.id)
        ? DEFAULT_LAYER.id
        : layers[0]?.id;
    return layers.map(layer => (
        layer.id === recoveryLayerId
            ? { ...layer, visible: true, locked: false }
            : layer
    ));
};

const coerceEditableActiveLayerId = (layerId: string, layers: LayerConfig[]): string => {
    const normalizedLayerId = coerceActiveLayerId(layerId, layers);
    const normalizedLayer = layers.find(layer => layer.id === normalizedLayerId);
    return normalizedLayer?.visible && !normalizedLayer.locked
        ? normalizedLayer.id
        : findEditableLayer(layers)?.id ?? DEFAULT_LAYER.id;
};

export const useLayerManagement = () => {
    const { t } = useTranslation();
    // 从 localStorage 恢复图层配置
    const [layers, setLayers] = useState<LayerConfig[]>(() => {
        return ensureEditableLayer(readLayers());
    });

    const [activeLayerId, setActiveLayerId] = useState<string>(() => {
        const initialLayers = ensureEditableLayer(readLayers());
        return coerceEditableActiveLayerId(readActiveLayerId(initialLayers), initialLayers);
    });

    useEffect(() => {
        writeLayers(layers);
    }, [layers]);

    useEffect(() => {
        const normalizedActiveLayerId = coerceEditableActiveLayerId(activeLayerId, layers);
        if (normalizedActiveLayerId !== activeLayerId) {
            const timer = window.setTimeout(() => {
                setActiveLayerId(normalizedActiveLayerId);
            }, 0);
            return () => window.clearTimeout(timer);
        }
        writeActiveLayerId(normalizedActiveLayerId, layers);
    }, [activeLayerId, layers]);

    const createLayer = useCallback((name: string) => {
        const normalizedName = normalizeLayerNameInput(name);
        if (!normalizedName) {
            appMessage.warning(t('designer.layersPanel.messages.nameEmpty'));
            return false;
        }
        if (!isLayerNameAvailable(layers, normalizedName)) {
            appMessage.warning(t('designer.layersPanel.messages.nameDuplicate'));
            return false;
        }
        const newLayer: LayerConfig = {
            id: `layer-${Date.now()}`,
            name: normalizedName,
            visible: true,
            locked: false,
            zIndex: layers.length
        };
        setLayers(prev => coerceLayers([...prev, newLayer]));
        setActiveLayerId(newLayer.id);
        appMessage.success(t('designer.layersPanel.messages.created', { name: normalizedName }));
        return true;
    }, [layers, t]);

    const deleteLayer = useCallback((layerId: string) => {
        if (layerId === DEFAULT_LAYER.id) {
            appMessage.warning(t('designer.layersPanel.messages.cannotDeleteDefault'));
            return;
        }
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;
        const fallbackLayer = activeLayerId === layerId
            ? findEditableLayer(layers, layerId)
            : undefined;
        if (activeLayerId === layerId && !fallbackLayer) {
            appMessage.warning(t('designer.layersPanel.messages.mustKeepEditable'));
            return;
        }
        setLayers(prev => coerceLayers(prev.filter(l => l.id !== layerId)));
        if (fallbackLayer) {
            setActiveLayerId(fallbackLayer.id);
        }
        appMessage.success(t('designer.layersPanel.messages.deleted', { name: layer.name }));
    }, [activeLayerId, layers, t]);

    const toggleVisibility = useCallback((layerId: string) => {
        const layer = layers.find(candidate => candidate.id === layerId);
        if (!layer) return;
        if (layer.visible && activeLayerId === layerId) {
            const fallbackLayer = findEditableLayer(layers, layerId);
            if (!fallbackLayer) {
                appMessage.warning(t('designer.layersPanel.messages.mustKeepEditable'));
                return;
            }
            setActiveLayerId(fallbackLayer.id);
        }
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, visible: !l.visible } : l
        )));
    }, [activeLayerId, layers, t]);

    const toggleLock = useCallback((layerId: string) => {
        const layer = layers.find(candidate => candidate.id === layerId);
        if (!layer) return;
        if (!layer.locked && activeLayerId === layerId) {
            const fallbackLayer = findEditableLayer(layers, layerId);
            if (!fallbackLayer) {
                appMessage.warning(t('designer.layersPanel.messages.mustKeepEditable'));
                return;
            }
            setActiveLayerId(fallbackLayer.id);
        }
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, locked: !l.locked } : l
        )));
    }, [activeLayerId, layers, t]);

    const renameLayer = useCallback((layerId: string, newName: string) => {
        const normalizedName = normalizeLayerNameInput(newName);
        if (!normalizedName) {
            appMessage.warning(t('designer.layersPanel.messages.nameEmpty'));
            return false;
        }
        if (!layers.some(layer => layer.id === layerId)) return false;
        if (!isLayerNameAvailable(layers, normalizedName, layerId)) {
            appMessage.warning(t('designer.layersPanel.messages.nameDuplicate'));
            return false;
        }
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, name: normalizedName } : l
        )));
        return true;
    }, [layers, t]);

    const reorderLayers = useCallback((fromIndex: number, toIndex: number) => {
        setLayers(prev => {
            if (
                !Number.isInteger(fromIndex)
                || !Number.isInteger(toIndex)
                || fromIndex < 0
                || toIndex < 0
                || fromIndex >= prev.length
                || toIndex >= prev.length
            ) {
                return prev;
            }
            const newLayers = [...prev];
            const [moved] = newLayers.splice(fromIndex, 1);
            newLayers.splice(toIndex, 0, moved);
            // 更新 zIndex
            return coerceLayers(newLayers.map((l, idx) => ({ ...l, zIndex: idx })));
        });
    }, []);

    const getLayer = useCallback((layerId: string): LayerConfig | undefined => {
        return layers.find(l => l.id === layerId);
    }, [layers]);

    const setLayerColor = useCallback((layerId: string, color: string | undefined) => {
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, color } : l
        )));
    }, []);

    const setActiveLayerIdSafe = useCallback((layerId: string) => {
        const targetLayer = layers.find(layer => layer.id === layerId);
        if (!targetLayer) return;
        if (!targetLayer.visible) {
            appMessage.warning(t('designer.layersPanel.messages.cannotActivateHidden'));
            return;
        }
        if (targetLayer.locked) {
            appMessage.warning(t('designer.layersPanel.messages.cannotActivateLocked'));
            return;
        }
        setActiveLayerId(prev => {
            const normalized = coerceActiveLayerId(layerId, layers);
            return normalized || prev;
        });
    }, [layers, t]);

    return {
        layers,
        activeLayerId,
        setActiveLayerId: setActiveLayerIdSafe,
        createLayer,
        deleteLayer,
        toggleVisibility,
        toggleLock,
        renameLayer,
        reorderLayers,
        getLayer,
        setLayerColor
    };
};
