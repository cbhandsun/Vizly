import React, { useState, useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import { useTranslation } from 'react-i18next';
import { appMessage } from '../../../utils/antdStaticBridge';
import {
    coerceActiveLayerId,
    coerceLayers,
    DEFAULT_LAYER,
    normalizeLayerStorageScope,
    readActiveLayerId,
    readLayers,
    writeActiveLayerId,
    writeLayers,
} from '../../../utils/layerStorage';
import { isLayerNameAvailable, normalizeLayerNameInput } from '../../../utils/layerName';
import {
    createLayerDeletionContentSnapshot,
    moveDeletedLayerEdges,
    moveDeletedLayerNodes,
    restoreDeletedLayerEdges,
    restoreDeletedLayerNodes,
} from '../layerDeletionTransaction';

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

interface LayerManagementGraphBoundary {
    nodesRef: MutableRefObject<Node[]>;
    edgesRef: MutableRefObject<Edge[]>;
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    storageScope?: string;
    messageApi?: Pick<MessageInstance, 'destroy' | 'open' | 'success' | 'warning'>;
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

export const useLayerManagement = (graph?: LayerManagementGraphBoundary) => {
    const { t } = useTranslation();
    const feedbackApi = graph?.messageApi ?? appMessage;
    const nodesRef = graph?.nodesRef;
    const edgesRef = graph?.edgesRef;
    const setGraphNodes = graph?.setNodes;
    const setGraphEdges = graph?.setEdges;
    const [storageScope] = useState(() => normalizeLayerStorageScope(graph?.storageScope));
    // 从 localStorage 恢复图层配置
    const [layers, setLayers] = useState<LayerConfig[]>(() => {
        return ensureEditableLayer(readLayers(storageScope));
    });

    const [activeLayerId, setActiveLayerId] = useState<string>(() => {
        const initialLayers = ensureEditableLayer(readLayers(storageScope));
        return coerceEditableActiveLayerId(
            readActiveLayerId(initialLayers, storageScope),
            initialLayers,
        );
    });
    useEffect(() => {
        writeLayers(layers, storageScope);
    }, [layers, storageScope]);

    useEffect(() => {
        const normalizedActiveLayerId = coerceEditableActiveLayerId(activeLayerId, layers);
        if (normalizedActiveLayerId !== activeLayerId) {
            const timer = window.setTimeout(() => {
                setActiveLayerId(normalizedActiveLayerId);
            }, 0);
            return () => window.clearTimeout(timer);
        }
        writeActiveLayerId(normalizedActiveLayerId, layers, storageScope);
    }, [activeLayerId, layers, storageScope]);

    const createLayer = useCallback((name: string) => {
        const normalizedName = normalizeLayerNameInput(name);
        if (!normalizedName) {
            feedbackApi.warning(t('designer.layersPanel.messages.nameEmpty'));
            return false;
        }
        if (!isLayerNameAvailable(layers, normalizedName)) {
            feedbackApi.warning(t('designer.layersPanel.messages.nameDuplicate'));
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
        feedbackApi.success(t('designer.layersPanel.messages.created', { name: normalizedName }));
        return true;
    }, [feedbackApi, layers, t]);

    const deleteLayer = (layerId: string): void => {
        if (layerId === DEFAULT_LAYER.id) {
            feedbackApi.warning(t('designer.layersPanel.messages.cannotDeleteDefault'));
            return;
        }
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;
        const activeFallback = layers.find(candidate => (
            candidate.id === activeLayerId
            && candidate.id !== layerId
            && candidate.visible
            && !candidate.locked
        ));
        const fallbackLayer = activeFallback ?? findEditableLayer(layers, layerId);
        if (!fallbackLayer) {
            feedbackApi.warning(t('designer.layersPanel.messages.mustKeepEditable'));
            return;
        }
        const layerIndex = layers.findIndex(candidate => candidate.id === layerId);
        const wasActive = activeLayerId === layerId;
        const contentSnapshot = createLayerDeletionContentSnapshot(
            nodesRef?.current ?? [],
            edgesRef?.current ?? [],
            layerId,
            fallbackLayer.id,
        );

        setLayers(prev => coerceLayers(prev.filter(l => l.id !== layerId)));
        if (wasActive) {
            setActiveLayerId(fallbackLayer.id);
        }
        setGraphNodes?.(prev => moveDeletedLayerNodes(prev, layerId, fallbackLayer.id));
        setGraphEdges?.(prev => moveDeletedLayerEdges(prev, layerId, fallbackLayer.id));

        const messageKey = `designer.layers.delete.${layerId}`;
        const handleUndo = () => {
            setLayers(prev => {
                if (prev.some(candidate => candidate.id === layer.id)) return prev;
                const nextLayers = [...prev];
                nextLayers.splice(Math.min(layerIndex, nextLayers.length), 0, layer);
                return coerceLayers(nextLayers);
            });
            if (wasActive) setActiveLayerId(layer.id);
            setGraphNodes?.(prev => restoreDeletedLayerNodes(prev, contentSnapshot));
            setGraphEdges?.(prev => restoreDeletedLayerEdges(prev, contentSnapshot));
            feedbackApi.destroy(messageKey);
            feedbackApi.success(t('designer.layersPanel.messages.restored', { name: layer.name }));
        };
        feedbackApi.open({
            key: messageKey,
            type: 'success',
            duration: 8,
            content: React.createElement(
                'span',
                { style: { display: 'flex', alignItems: 'center', gap: 12 } },
                t('designer.layersPanel.messages.deletedWithContents', {
                    name: layer.name,
                    fallback: fallbackLayer.name,
                    nodes: contentSnapshot.nodeIds.size,
                    edges: contentSnapshot.edgeIds.size,
                }),
                React.createElement('button', {
                    type: 'button',
                    onClick: handleUndo,
                    style: {
                        appearance: 'none',
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        color: 'inherit',
                        cursor: 'pointer',
                        font: 'inherit',
                        fontWeight: 600,
                        textDecoration: 'underline',
                    },
                }, t('designer.layersPanel.messages.undoDelete')),
            ),
        });
    };

    const toggleVisibility = useCallback((layerId: string) => {
        const layer = layers.find(candidate => candidate.id === layerId);
        if (!layer) return;
        if (layer.visible && activeLayerId === layerId) {
            const fallbackLayer = findEditableLayer(layers, layerId);
            if (!fallbackLayer) {
                feedbackApi.warning(t('designer.layersPanel.messages.mustKeepEditable'));
                return;
            }
            setActiveLayerId(fallbackLayer.id);
        }
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, visible: !l.visible } : l
        )));
    }, [activeLayerId, feedbackApi, layers, t]);

    const toggleLock = useCallback((layerId: string) => {
        const layer = layers.find(candidate => candidate.id === layerId);
        if (!layer) return;
        if (!layer.locked && activeLayerId === layerId) {
            const fallbackLayer = findEditableLayer(layers, layerId);
            if (!fallbackLayer) {
                feedbackApi.warning(t('designer.layersPanel.messages.mustKeepEditable'));
                return;
            }
            setActiveLayerId(fallbackLayer.id);
        }
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, locked: !l.locked } : l
        )));
    }, [activeLayerId, feedbackApi, layers, t]);

    const renameLayer = useCallback((layerId: string, newName: string) => {
        const normalizedName = normalizeLayerNameInput(newName);
        if (!normalizedName) {
            feedbackApi.warning(t('designer.layersPanel.messages.nameEmpty'));
            return false;
        }
        if (!layers.some(layer => layer.id === layerId)) return false;
        if (!isLayerNameAvailable(layers, normalizedName, layerId)) {
            feedbackApi.warning(t('designer.layersPanel.messages.nameDuplicate'));
            return false;
        }
        setLayers(prev => coerceLayers(prev.map(l =>
            l.id === layerId ? { ...l, name: normalizedName } : l
        )));
        return true;
    }, [feedbackApi, layers, t]);

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
            feedbackApi.warning(t('designer.layersPanel.messages.cannotActivateHidden'));
            return;
        }
        if (targetLayer.locked) {
            feedbackApi.warning(t('designer.layersPanel.messages.cannotActivateLocked'));
            return;
        }
        setActiveLayerId(prev => {
            const normalized = coerceActiveLayerId(layerId, layers);
            return normalized || prev;
        });
    }, [feedbackApi, layers, t]);

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
