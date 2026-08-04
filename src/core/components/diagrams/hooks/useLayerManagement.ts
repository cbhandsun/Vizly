import { useState, useCallback, useEffect } from 'react';
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

export const useLayerManagement = () => {
    // 从 localStorage 恢复图层配置
    const [layers, setLayers] = useState<LayerConfig[]>(() => {
        return readLayers();
    });

    const [activeLayerId, setActiveLayerId] = useState<string>(() => {
        const initialLayers = readLayers();
        return readActiveLayerId(initialLayers);
    });

    useEffect(() => {
        writeLayers(layers);
    }, [layers]);

    useEffect(() => {
        const normalizedActiveLayerId = coerceActiveLayerId(activeLayerId, layers);
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
            appMessage.warning('图层名称不能为空');
            return false;
        }
        if (!isLayerNameAvailable(layers, normalizedName)) {
            appMessage.warning('图层名称不能重复');
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
        appMessage.success(`已创建图层 "${normalizedName}"`);
        return true;
    }, [layers]);

    const deleteLayer = useCallback((layerId: string) => {
        if (layerId === DEFAULT_LAYER.id) {
            appMessage.warning('无法删除默认图层');
            return;
        }
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;
        setLayers(prev => coerceLayers(prev.filter(l => l.id !== layerId)));
        if (activeLayerId === layerId) {
            setActiveLayerId(DEFAULT_LAYER.id);
        }
        appMessage.success(`已删除图层 "${layer?.name}"`);
    }, [activeLayerId, layers]);

    const toggleVisibility = useCallback((layerId: string) => {
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, visible: !l.visible } : l
        )));
    }, []);

    const toggleLock = useCallback((layerId: string) => {
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, locked: !l.locked } : l
        )));
    }, []);

    const renameLayer = useCallback((layerId: string, newName: string) => {
        const normalizedName = normalizeLayerNameInput(newName);
        if (!normalizedName) {
            appMessage.warning('图层名称不能为空');
            return false;
        }
        if (!layers.some(layer => layer.id === layerId)) return false;
        if (!isLayerNameAvailable(layers, normalizedName, layerId)) {
            appMessage.warning('图层名称不能重复');
            return false;
        }
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, name: normalizedName } : l
        )));
        return true;
    }, [layers]);

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
        setActiveLayerId(prev => {
            const normalized = coerceActiveLayerId(layerId, layers);
            return normalized || prev;
        });
    }, [layers]);

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
