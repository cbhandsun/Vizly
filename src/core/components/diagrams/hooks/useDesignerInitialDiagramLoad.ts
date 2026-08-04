import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { MessageInstance } from 'antd/es/message/interface';
import { PluginRegistry } from '../../../services/PluginRegistry';
import { EdgeRoutingCoordinator } from '../../../services/EdgeRoutingCoordinator';
import { cancelLayoutTransition, suspendLayoutTransitions } from '../../../utils/animateLayoutTransition';
import { getApplicationDiagramRuntime } from '../../../ports/applicationDiagramRuntime';
import { loadStandardPresetCanvas } from './standardPresetCanvasCache';
import type { DesignerPresetLookup } from './useDesignerPresetInitialization';
import type { useAutoSave } from './useAutoSave';
import {
    clearDesignerFreshSeedFlag,
    mergePresetExplicitEdgeHandles,
    recalculateAutosaveNodeSizes,
} from './designerSystemSyncPersistence';
import {
    logDesignerSystemSyncAutosaveRecalculationFailure,
    logDesignerSystemSyncDataRegistryImportFailure,
    logDesignerSystemSyncStaleAutosaveDetected,
    logDesignerSystemSyncStandardDataToCanvasFailure,
} from './designerSystemSyncLogging';

const PLUGIN_EMPTY_CANVAS_IDS = new Set(['flowchart']);

const getPluginEmptyState = (pluginId: string) => {
    const plugin = PluginRegistry.getInstance().getPlugin(pluginId);
    return plugin?.getEmptyState();
};

interface UseDesignerInitialDiagramLoadProps {
    id?: string;
    pluginId: string;
    activePresetLookup: DesignerPresetLookup;
    isCurrentDiagramInitialized: boolean;
    markCurrentDiagramInitialized: () => void;
    loadSaved: ReturnType<typeof useAutoSave>['loadSaved'];
    clearSaved: ReturnType<typeof useAutoSave>['clearSaved'];
    restoreAutoSaveMetadata?: (metadata: unknown) => { nodes: Node[]; edges: Edge[] } | null;
    messageApi?: MessageInstance;
    setNodes: Dispatch<SetStateAction<Node[]>>;
    setEdges: Dispatch<SetStateAction<Edge[]>>;
    needsInitialFitView: MutableRefObject<boolean>;
}

export const useDesignerInitialDiagramLoad = ({
    id,
    pluginId,
    activePresetLookup,
    isCurrentDiagramInitialized,
    markCurrentDiagramInitialized,
    loadSaved,
    clearSaved,
    restoreAutoSaveMetadata,
    messageApi,
    setNodes,
    setEdges,
    needsInitialFitView,
}: UseDesignerInitialDiagramLoadProps) => {
    useEffect(() => {
        if (isCurrentDiagramInitialized) return;
        cancelLayoutTransition(setNodes);
        setNodes([]);
        setEdges([]);
        if (!activePresetLookup.ready || activePresetLookup.id !== id) return;

        const initializationController = new AbortController();
        const isInitializationActive = () => !initializationController.signal.aborted;
        const commitInitialization = (apply?: () => void) => {
            if (!isInitializationActive()) return false;
            apply?.();
            markCurrentDiagramInitialized();
            return true;
        };
        const failInitialization = (error: unknown, logFailure: (failure: unknown) => void) => {
            if (!isInitializationActive()) return;
            markCurrentDiagramInitialized();
            logFailure(error);
        };

        const preset = activePresetLookup.preset;
        let saved = mergePresetExplicitEdgeHandles(loadSaved(), preset);
        let shouldLoadAutosave = false;

        if (saved) {
            if (saved.diagramId && saved.diagramId !== id) {
                logDesignerSystemSyncStaleAutosaveDetected(id, saved.diagramId);
                clearSaved();
            } else {
                const freshSeedTtlMs = 5 * 60 * 1000;
                const isFreshAndValid = saved.isFreshSeed && saved.timestamp
                    && (Date.now() - saved.timestamp) < freshSeedTtlMs;
                const isCanvasData = isFreshAndValid || (
                    saved.nodes.length === 0
                    || saved.nodes.some(node => node.data !== undefined)
                );

                if (saved.isFreshSeed && !isFreshAndValid) {
                    clearDesignerFreshSeedFlag(`flowchart-autosave-v2-${id || 'default'}`);
                    saved = { ...saved, isFreshSeed: false };
                }

                shouldLoadAutosave = !!isCanvasData;
            }
        }

        if (shouldLoadAutosave && saved) {
            const restoredActivePage = restoreAutoSaveMetadata?.(saved.metadata);
            const restoredNodes = restoredActivePage?.nodes ?? saved.nodes;
            const restoredEdges = restoredActivePage?.edges ?? saved.edges;
            void recalculateAutosaveNodeSizes(restoredNodes).then((recalculatedNodes) => {
                commitInitialization(() => {
                    cancelLayoutTransition(setNodes);
                    setNodes(recalculatedNodes);
                    setEdges(restoredEdges);
                    needsInitialFitView.current = true;
                    EdgeRoutingCoordinator.getInstance().freeze();

                    if (saved.isFreshSeed) {
                        messageApi?.success('加载模板成功');
                        clearDesignerFreshSeedFlag(`flowchart-autosave-v2-${id || 'default'}`);
                    } else {
                        messageApi?.info({
                            key: 'flowchart-autosave-recovery',
                            content: '已恢复上次编辑内容，请检查后继续',
                            duration: 5,
                        });
                    }
                });
            }).catch((error) => {
                failInitialization(error, logDesignerSystemSyncAutosaveRecalculationFailure);
            });
        } else if (preset) {
            loadStandardPresetCanvas(String(id || ''), preset).then(({ nodes, edges }) => {
                commitInitialization(() => {
                    suspendLayoutTransitions(setNodes);
                    setNodes(nodes);
                    setEdges(edges);
                    needsInitialFitView.current = true;
                });
            }).catch((error) => {
                failInitialization(error, failure => {
                    logDesignerSystemSyncStandardDataToCanvasFailure('preset', failure);
                });
            });
        } else if (PLUGIN_EMPTY_CANVAS_IDS.has(String(id || ''))) {
            queueMicrotask(() => {
                commitInitialization(() => {
                    const emptyState = getPluginEmptyState(pluginId);
                    if (emptyState) {
                        setNodes(emptyState.nodes);
                        setEdges(emptyState.edges);
                        needsInitialFitView.current = true;
                    }
                });
            });
        } else {
            getApplicationDiagramRuntime().loadDiagram(id || '', { initialize: true }).then(async (existing) => {
                if (!isInitializationActive()) return;
                if (existing) {
                    try {
                        const { standardDataToCanvas } = await import('../designerUtils');
                        if (!isInitializationActive()) return;
                        const { nodes, edges } = await standardDataToCanvas(existing);
                        commitInitialization(() => {
                            cancelLayoutTransition(setNodes);
                            setNodes(nodes);
                            setEdges(edges);
                            needsInitialFitView.current = true;
                        });
                    } catch (error) {
                        failInitialization(error, failure => {
                            logDesignerSystemSyncStandardDataToCanvasFailure('registry', failure);
                        });
                    }
                } else {
                    commitInitialization(() => {
                        const emptyState = getPluginEmptyState(pluginId);
                        if (emptyState) {
                            setNodes(emptyState.nodes);
                            setEdges(emptyState.edges);
                            needsInitialFitView.current = true;
                        }
                    });
                }
            }).catch((error) => {
                failInitialization(error, logDesignerSystemSyncDataRegistryImportFailure);
            });
        }

        return () => { initializationController.abort(); };
    }, [
        activePresetLookup,
        clearSaved,
        id,
        isCurrentDiagramInitialized,
        loadSaved,
        markCurrentDiagramInitialized,
        messageApi,
        needsInitialFitView,
        pluginId,
        restoreAutoSaveMetadata,
        setEdges,
        setNodes,
    ]);
};
