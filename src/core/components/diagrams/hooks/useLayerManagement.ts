import { useState, useCallback } from 'react';
import { appMessage as message } from '../../../utils/antdStaticBridge';

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
        try {
            const saved = localStorage.getItem('flowchart.layers');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch (error) {
            console.warn('Failed to restore layer config:', error);
        }
        return [{ id: 'layer-0', name: '默认', visible: true, locked: false, zIndex: 0 }];
    });

    const [activeLayerId, setActiveLayerId] = useState<string>(() => {
        try {
            const saved = localStorage.getItem('flowchart.activeLayerId');
            return saved || 'layer-0';
        } catch (error) {
            return 'layer-0';
        }
    });

    const createLayer = useCallback((name: string) => {
        const newLayer: LayerConfig = {
            id: `layer-${Date.now()}`,
            name,
            visible: true,
            locked: false,
            zIndex: layers.length
        };
        setLayers(prev => [...prev, newLayer]);
        setActiveLayerId(newLayer.id);
        appMessage.success(`已创建图层 "${name}"`);
    }, [layers.length]);

    const deleteLayer = useCallback((layerId: string) => {
        if (layerId === 'layer-0') {
            appMessage.warning('无法删除默认图层');
            return;
        }
        const layer = layers.find(l => l.id === layerId);
        setLayers(prev => prev.filter(l => l.id !== layerId));
        if (activeLayerId === layerId) {
            setActiveLayerId('layer-0');
        }
        appMessage.success(`已删除图层 "${layer?.name}"`);
    }, [activeLayerId, layers]);

    const toggleVisibility = useCallback((layerId: string) => {
        setLayers(prev => prev.map(l =>
            l.id === layerId ? { ...l, visible: !l.visible } : l
        ));
    }, []);

    const toggleLock = useCallback((layerId: string) => {
        setLayers(prev => prev.map(l =>
            l.id === layerId ? { ...l, locked: !l.locked } : l
        ));
    }, []);

    const renameLayer = useCallback((layerId: string, newName: string) => {
        setLayers(prev => prev.map(l =>
            l.id === layerId ? { ...l, name: newName } : l
        ));
    }, []);

    const reorderLayers = useCallback((fromIndex: number, toIndex: number) => {
        setLayers(prev => {
            const newLayers = [...prev];
            const [moved] = newLayers.splice(fromIndex, 1);
            newLayers.splice(toIndex, 0, moved);
            // 更新 zIndex
            return newLayers.map((l, idx) => ({ ...l, zIndex: idx }));
        });
    }, []);

    const getLayer = useCallback((layerId: string): LayerConfig | undefined => {
        return layers.find(l => l.id === layerId);
    }, [layers]);

    const setLayerColor = useCallback((layerId: string, color: string | undefined) => {
        setLayers(prev => prev.map(l =>
            l.id === layerId ? { ...l, color } : l
        ));
    }, []);

    return {
        layers,
        activeLayerId,
        setActiveLayerId,
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
