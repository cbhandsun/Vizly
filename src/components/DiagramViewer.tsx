import React, { useState, useRef, useEffect, lazy, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDiagramControls } from '@/core/hooks/useDiagramControls';
import { useUIState } from '@/core/hooks/useUIState';
import { diagramDefinitions } from '../data/diagram-definitions';
import { DiagramSettingsPanel } from './ui/DiagramSettingsPanel';
import { useConfigIntegration, useConfigValue } from '@/core/hooks/useConfigIntegration';
import { useDiagramHostStorage } from '@/core/hooks/useDiagramHostStorage';
import { useSubscription } from '../context/useSubscription';

import { LayeredConfigManager, ConfigLayer } from '@/core/config/LayeredConfigManager';
import { useYjsCollaboration } from './diagrams/collaboration/YjsProviderHooks';
import { useCloudSave } from './diagrams/hooks/useCloudSave';
import { parseAIDiagramJson } from './ai/aiDiagramImport';
import {
    logDiagramViewerBridgeCleanupFailure,
    logDiagramViewerDocTypeDetectionFailure,
    logDiagramViewerEdgeModeInitializationFailure,
    logDiagramViewerMermaidImportFailure,
    logDiagramViewerRemoteLoadFailure,
    logDiagramViewerStandardDataLayoutFallbackFailure,
    logDiagramViewerSwitchConfirmationFailure,
} from './diagramViewerLogging';
import { clearBlankTemplateLocalState } from './diagramViewerStorage';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { resolvePluginId } from '@/core/plugins/registry';
import { ensureBuiltInPlugins } from '@/core/plugins/builtInPlugins';
import { getStandardPresetDocTypeById } from '@/data/standardized/presetMetadata';
import { loadStandardPresetById } from '@/data/standardized/presetLoader';
import { getDiagramDocTypeFromStorage } from '@/core/utils/diagramTypeStorage';
import { createAutoSavePayload } from '@/core/utils/autoSaveStorage';
import { getCustomPreset } from '@/core/utils/customPresetStorage';
import {
    getFlowDataBridge,
    getFlowDataBridgeEdges,
    getFlowDataBridgeNodes,
    removeFlowDataBridge,
} from '@/core/utils/flowDataBridge';
import {
    createDiagramViewerCanvasOps,
    importAIDiagramJsonToBridge,
} from './diagramViewerAiBridge';
import {
    buildDiagramHashRoute,
    getDiagramViewerRouteParam,
    setDiagramSearchParam,
} from './diagramViewerLocation';
import {
    seedAutoSaveAndNavigateDiagram,
    selectDiagramInViewer,
} from './diagramViewerNavigation';
import {
    finalizeDiagramSeedNavigation,
    normalizeDiagramSeedData,
} from './diagramViewerSeedNavigation';
import { ensureDiagramSwitchConfirmed } from './diagramViewerSwitchGuard';
import { parseRemoteDiagramContent } from '@/services/remoteDiagramContent';
import { coerceToStandardDiagramData } from '@/core/utils/coerceDiagram';
import { importMermaidGraphToBridge } from './diagramViewerMermaidImport';
import {
    normalizeCollaborationRoomName,
    normalizeCollaborationServerUrl,
    normalizeCollaborationToken,
} from './diagrams/collaboration/collaborationSecurity';

import {
    coerceRemoteDiagramSelection,
    selectDiagramViewerTemplate,
    type DiagramViewerTemplateData,
} from './diagramViewerTemplateSelection';
import { useDiagramViewerCommands } from './useDiagramViewerCommands';
import { useDiagramViewerSaveActions } from './useDiagramViewerSaveActions';
import { DiagramViewerView } from './DiagramViewerView';

const PLUGIN_EMPTY_CANVAS_IDS = new Set(['flowchart']);

const loadFlowchartDesigner = async (pluginId?: string, presetId?: string) => {
    const [{ default: FlowchartDesigner }] = await Promise.all([
        import('@/core/components/diagrams/FlowchartDesigner'),
        ensureBuiltInPlugins(pluginId || 'flowchart'),
        loadStandardPresetById(presetId),
    ]);

    return {
        default: (props: any) => React.createElement(
            FlowchartDesigner,
            pluginId ? { ...props, pluginId } : props
        )
    };
};


const DiagramViewer: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    // 商业化订阅信息
    const { hasFeature, jwtToken, showUpgradeModal } = useSubscription();

    // 使用新的存储 Hook
    const {
        selectedDiagramId: storedDiagramId,
        saveSelectedDiagramId,
        addRecentDiagram
    } = useDiagramHostStorage(diagramDefinitions[0]?.id || '');
    const browserLocation = typeof window !== 'undefined' ? window.location : null;

    const selectedDiagramId = useMemo(() => {
        const urlId = getDiagramViewerRouteParam(searchParams, browserLocation, 'diagram');
        if (urlId) return urlId;
        return storedDiagramId;
    }, [searchParams, browserLocation, storedDiagramId]);
    // refreshNonce: 仅用于手动刷新场景（如设置面板的 onRefreshRequest），
    // 模板切换已改为 window.location.reload() 方式，不再依赖 nonce 触发 remount。
    const [refreshNonce, setRefreshNonce] = useState(0);

    // =============== Phase 5: IoC 依赖注入层 =================
    const YJS_WS_URL = normalizeCollaborationServerUrl(import.meta.env.VITE_YJS_WEBSOCKET_URL || '') || '';
    const roomFromUrl = getDiagramViewerRouteParam(searchParams, browserLocation, 'room');
    const [collabModalVisible, setCollabModalVisible] = useState(false);
    const roomName = normalizeCollaborationRoomName(roomFromUrl || `vizly-room-${selectedDiagramId}`);
    
    // Enable if user specifically clicks Share, OR if the url has ?room=, OR cloud-sync is active
    const wantsCollaboration = !!roomFromUrl || collabModalVisible || hasFeature('cloud-sync');
    const isCollabEnabled = Boolean(YJS_WS_URL) && wantsCollaboration;

    const { isSynced: isYjsSynced, pushLocalChangesToYjs, activeUsers, provider } = useYjsCollaboration({
        roomName,
        serverUrl: YJS_WS_URL,
        token: normalizeCollaborationToken(jwtToken),
        enabled: isCollabEnabled
    });

    // Provide client ID to window for UI badge tracking
    useEffect(() => {
        if (provider?.awareness?.clientID) {
            (window as any)._yjsClientId = provider.awareness.clientID;
        }
    }, [provider?.awareness?.clientID]);

    const { saveToCloud, shareDialogOpen, closeShareDialog, ensureSaved } = useCloudSave(selectedDiagramId);
    
    // --- Phase 6: Mermaid Import Logic ---
    const handleImportMermaidNodes = useCallback(async (nodes: unknown[], edges: unknown[]) => {
        const bridge = getFlowDataBridge(selectedDiagramId);
        const addNode = bridge?.addNode;
        if (!bridge || !addNode) {
            appMessage.error(t('diagramViewer.canvasNotFound'));
            return;
        }

        try {
            await importMermaidGraphToBridge({ bridge: { addNode, connectNodes: bridge.connectNodes }, nodes, edges });

            // 3. 自动触发智能布局
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'smart-layout' } }));
            }, 500);
        } catch (err) {
            logDiagramViewerMermaidImportFailure(err);
            appMessage.error('导入过程中发生错误');
        }
    }, [selectedDiagramId, t]);
    const [aiConfigVisible, setAiConfigVisible] = useState(false);
    const [cloudManagerVisible, setCloudManagerVisible] = useState(false);
    const [mermaidModalVisible, setMermaidModalVisible] = useState(false);

    const aiNodesRef = useMemo(() => ({
        get current() {
            return getFlowDataBridgeNodes(selectedDiagramId);
        }
    }), [selectedDiagramId]);

    const aiEdgesRef = useMemo(() => ({
        get current() {
            return getFlowDataBridgeEdges(selectedDiagramId);
        }
    }), [selectedDiagramId]);
    // =======================================================


    const [edgeMode, setEdgeMode] = useConfigValue<'advanced-smart' | 'native'>(
        'diagram.edge.mode',
        'advanced-smart'
    );
    const [layoutStrategy, setLayoutStrategy] = useConfigValue<string>(
        'diagram.layout.strategy',
        'DomainVerticalLayout'
    );
    const [nodeLayoutStrategy, setNodeLayoutStrategy] = useConfigValue<string>(
        'diagram.layout.nodeStrategy',
        'HorizontalLayout'
    );
    const [elkAlgorithm, setElkAlgorithm] = useConfigValue<string>(
        'diagram.layout.ELK_ALGORITHM',
        'layered'
    );
    const [linkOrientationEnabled] = useConfigValue<boolean>(
        'diagram.layout.linkOrientation',
        true
    );
    const panelRef = useRef<{ collapse?: () => void; expand?: () => void } | null>(null);
    const [mainFlowAnimationEnabled, setMainFlowAnimationEnabled] = useState(true); // 主流程动线状态


    // 集成新的配置和主题系统
    const [configState, configActions] = useConfigIntegration();

    // useConfigValue 已自动监听 layeredConfig 的变化并同步到本地状态

    const {
        isFullscreen,
        handleToggleFullscreen
    } = useUIState(panelRef);
    const getReactFlowSnapshot = useCallback(() => ({
        nodes: getFlowDataBridgeNodes(selectedDiagramId) as any[],
        edges: getFlowDataBridgeEdges(selectedDiagramId) as any[],
    }), [selectedDiagramId]);
    const {
        handleToggleFullscreen: handleFsControl,
        exportToPNG,
        exportToPDF,
        exportToSVG,
        exportToGIF,
    } = useDiagramControls(selectedDiagramId, true, { getReactFlowSnapshot });
    const selectedDiagram = diagramDefinitions.find(d => d.id === selectedDiagramId);
    const [sessionDocType, setSessionDocType] = useState<string | undefined>();

    useEffect(() => {
        let cancelled = false;
        if (!selectedDiagramId || selectedDiagram) {
            setSessionDocType(undefined);
            return;
        }
        if (PLUGIN_EMPTY_CANVAS_IDS.has(selectedDiagramId)) {
            setSessionDocType(selectedDiagramId);
            return;
        }
        const standardPresetDocType = getStandardPresetDocTypeById(selectedDiagramId);
        if (standardPresetDocType) {
            setSessionDocType(standardPresetDocType);
            return;
        }

        void import('@/data/DataRegistry').then(async ({ dataRegistry }) => {
            await dataRegistry.initialize();
            if (cancelled) return;
            try {
                const dataService = dataRegistry.getDataService();
                setSessionDocType(dataService.getDiagram(selectedDiagramId)?.type);
            } catch (error) {
                logDiagramViewerDocTypeDetectionFailure(selectedDiagramId, error);
                setSessionDocType(undefined);
            }
        }).catch((error) => {
            logDiagramViewerDocTypeDetectionFailure(selectedDiagramId, error);
            if (!cancelled) setSessionDocType(undefined);
        });

        return () => { cancelled = true; };
    }, [selectedDiagramId, selectedDiagram]);

    // Look up local storage or dataService to find the type
    const docType = useMemo(() => {
        if (!selectedDiagramId || selectedDiagram) return undefined;
        if (PLUGIN_EMPTY_CANVAS_IDS.has(selectedDiagramId)) return selectedDiagramId;
        const standardPresetDocType = getStandardPresetDocTypeById(selectedDiagramId);
        if (standardPresetDocType) return standardPresetDocType;
        if (sessionDocType) return sessionDocType;
        return getDiagramDocTypeFromStorage(localStorage, selectedDiagramId);
    }, [selectedDiagramId, selectedDiagram, sessionDocType]);

    // Bridge: diagram.type → plugin registry ID
    // template type 值与 plugin.id 注册名之间存在历史差异，此映射表统一桥接
    const resolvedPluginId = resolvePluginId(docType);

    const SelectedDiagramComponent = useMemo(() => {
        if (selectedDiagram?.component) return selectedDiagram.component;

        if (resolvedPluginId) {
            // Use FlowchartDesigner (full implementation) with the resolved pluginId.
            // Plugins that override the canvas entirely (mindmap, timeline, network...)
            // register themselves via PluginRegistry and contribute canvas + toolbar via hooks.
            // The legacy UnifiedDesigner is just an architecture skeleton and must NOT be used here.
            return lazy(() => loadFlowchartDesigner(resolvedPluginId, selectedDiagramId));
        }

        // Fallback to FlowchartDesigner if not found
        return lazy(() => loadFlowchartDesigner(undefined, selectedDiagramId));
    }, [selectedDiagram?.component, resolvedPluginId, selectedDiagramId]);

    // 仅显示主流程（动线）开关状态（函数级注释）
    // - 将开关迁移到“更多”菜单中统一管理
    /**
     * 函数级注释：主流程显示开关默认值
     * 默认关闭“仅显示主流程”，以显示完整图面；用户可在“更多”菜单中打开
     */
    const [showOnlyMainFlow, setShowOnlyMainFlow] = useState<boolean>(false);

    // ==========================================
    // Phase 6: 高级图表展示安全防护与多级存管
    // ==========================================
    /** 图表锁定防误触：禁止所有拖拽连线编排 */
    const [isReadonly] = useState<boolean>(false);

    /** 沉浸式演示模式：隐藏 UI 侧边栏与工具栏 */
    const [isPresentationMode, setIsPresentationMode] = useState<boolean>(false);


    const handleCloudReplicaSaved = useCallback((savedId: string) => {
        setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set('diagram', savedId);
            return next;
        });
    }, [setSearchParams]);
    const { handleSaveTo, handleDirectSave } = useDiagramViewerSaveActions({
        selectedDiagramId,
        t,
        onCloudReplicaSaved: handleCloudReplicaSaved,
    });

    /* Removed renderOverflowContent and helper functions - moved to DiagramSettingsPanel */

    const handleSelectDiagram = useCallback((id: string) => {
        selectDiagramInViewer({
            id,
            setSearchParams,
            setDiagramSearchParam,
            addRecentDiagram,
        });
    }, [setSearchParams, addRecentDiagram]);

    const seedAutoSaveAndNavigate = useCallback(async (data: any, id: string) => {
        await seedAutoSaveAndNavigateDiagram({
            data,
            id,
            ensureSwitchConfirmed: () => ensureDiagramSwitchConfirmed({
                getCurrentNodeCount: async () => {
                    const { useDiagramStore } = await import('@/core/store/useDiagramStore');
                    return useDiagramStore.getState().nodes?.length ?? 0;
                },
                logFailure: logDiagramViewerSwitchConfirmationFailure,
            }),
            normalizeSeedData: (seedData) => normalizeDiagramSeedData({
                data: seedData,
                convertStandardDataToCanvas: async (normalizedSeedData) => {
                    const { standardDataToCanvas } = await import('@/core/components/diagrams/designerUtils');
                    const standardData = coerceToStandardDiagramData(normalizedSeedData, {
                        id,
                        title: typeof normalizedSeedData.name === 'string' ? normalizedSeedData.name : id,
                    });
                    return standardDataToCanvas(standardData);
                },
                logLayoutFallbackFailure: logDiagramViewerStandardDataLayoutFallbackFailure,
            }),
            finalizeNavigation: (processedData, nextDiagramId) => finalizeDiagramSeedNavigation({
                storage: localStorage,
                currentDiagramId: selectedDiagramId,
                nextDiagramId,
                processedData,
                saveSelectedDiagramId,
                buildHashRoute: buildDiagramHashRoute,
                removeBridge: removeFlowDataBridge,
                createPayload: createAutoSavePayload,
                logBridgeCleanupFailure: logDiagramViewerBridgeCleanupFailure,
            }),
        });
    }, [saveSelectedDiagramId, selectedDiagramId]);
    // 构建通过 IoC 模式下发的商业级高级操作菜单
    const extraExportItems = useMemo(() => [
        {
            key: 'pro-export-pdf',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: '140px' }}>
                    <span>{t('diagramViewer.export.pdf')}</span>
                    <span style={{ fontSize: '14px', marginLeft: 8 }} title={t('common.proFeature')}>👑</span>
                </div>
            ),
            onClick: () => {
                if (!hasFeature('export-pdf')) {
                    showUpgradeModal(t('diagramViewer.export.pdf'));
                } else {
                    // TODO: 真正的云渲染
                }
            }
        },
        {
            key: 'pro-export-svg',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: '140px' }}>
                    <span>{t('diagramViewer.export.svg')}</span>
                    <span style={{ fontSize: '14px', marginLeft: 8 }} title={t('common.proFeature')}>👑</span>
                </div>
            ),
            onClick: () => {
                if (!hasFeature('export-hd-svg')) {
                    showUpgradeModal(t('diagramViewer.export.svg'));
                } else {
                    // TODO: 真正的云渲染
                }
            }
        }
    ], [hasFeature, showUpgradeModal, t]);

    // 同步 selectedDiagramId → localStorage（供命令面板等非 reload 路径使用）
    // 注意：seedAutoSaveAndNavigate 中有直接写 localStorage 的逻辑（用于 reload 前持久化），
    // 此 useEffect 覆盖命令面板 handleSelectDiagram 等同步导航场景。
    useEffect(() => {
        if (selectedDiagramId) {
            saveSelectedDiagramId(selectedDiagramId);
        }
    }, [selectedDiagramId, saveSelectedDiagramId]);

    // 全屏切换后自动触发顶部对齐，保持与 fitWidthTop 一致
    useEffect(() => {
        const onFsChange = () => {
            const entering = !!document.fullscreenElement;
            if (entering) {
                // Now handled by viewport restoration
            }
        };
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, [selectedDiagramId]);

    const handlePreviewAIJson = useCallback((json: string) => {
        importAIDiagramJsonToBridge({
            diagramId: selectedDiagramId,
            json,
            mode: 'preview',
            parseJson: parseAIDiagramJson,
        });
    }, [selectedDiagramId]);

    const handleApplyAIJson = useCallback((json: string) => {
        importAIDiagramJsonToBridge({
            diagramId: selectedDiagramId,
            json,
            mode: 'apply',
            parseJson: parseAIDiagramJson,
        });
    }, [selectedDiagramId]);

    const aiCanvasOps = useMemo(() => createDiagramViewerCanvasOps({
        diagramId: selectedDiagramId,
        isFullscreen,
        analyzeFallbackSummary: t('diagramViewer.ai.analyzeError'),
        invalidThemeMessage: t('diagramViewer.aiThemeInvalid', '主题样式未通过安全校验'),
        appliedThemeMessage: t('diagramViewer.aiThemeApplied'),
        onExportPNG: exportToPNG,
        onExportPDF: exportToPDF,
        onExportSVG: exportToSVG,
        onExportGIF: exportToGIF,
        onSave: handleDirectSave,
        onShare: () => setCollabModalVisible(true),
        onSetPresentationMode: setIsPresentationMode,
        onToggleFullscreen: handleToggleFullscreen,
    }), [
        selectedDiagramId,
        isFullscreen,
        t,
        handleDirectSave,
        handleToggleFullscreen,
        exportToPNG,
        exportToPDF,
        exportToSVG,
        exportToGIF,
    ]);

    /**
     * 函数级注释：初始化连线模式的默认值
     * 目的：仅在未设置任何层级值时，初始化为智能模式；避免覆盖用户在"更多配置面板"中的选择。
     * [FIX] 使用 ref 确保只初始化一次，避免配置系统重新加载时覆盖用户选择。
     */
    const edgeModeInitializedRef = useRef(false);
    useEffect(() => {
        if (configState.isReady && configActions && !edgeModeInitializedRef.current) {
            edgeModeInitializedRef.current = true;
            try {
                const layered = LayeredConfigManager.getInstance();
                const sessionLayer = layered.getLayer(ConfigLayer.SESSION);

                if (sessionLayer['diagram.edge.mode'] === 'native') {
                    configActions.removeConfig('diagram.edge.mode', ConfigLayer.SESSION);
                    delete sessionLayer['diagram.edge.mode'];
                }

                const userLayer = layered.getLayer(ConfigLayer.USER);
                const globalLayer = layered.getLayer(ConfigLayer.GLOBAL);
                const hasExisting =
                    userLayer['diagram.edge.mode'] !== undefined ||
                    globalLayer['diagram.edge.mode'] !== undefined ||
                    sessionLayer['diagram.edge.mode'] !== undefined;

                if (!hasExisting) {
                    configActions.setConfig('diagram.edge.mode', 'advanced-smart');
                }
            } catch (error) {
                logDiagramViewerEdgeModeInitializationFailure(error);
            }
        }
    }, [configState.isReady, configActions]);



    // 展开后的视图适配统一由 BaseDiagramContainer 负责（避免重复触发造成缩放跳变）

    // Diagram Settings Popover Content
    const settingsPanel = (
        <DiagramSettingsPanel
            selectedDiagram={selectedDiagram}
            selectedDiagramId={selectedDiagramId}
            edgeMode={String(edgeMode || 'native')}
            onEdgeModeChange={async (val) => setEdgeMode(val)}
            layoutStrategy={String(layoutStrategy || '')}
            onLayoutStrategyChange={async (val) => setLayoutStrategy(val)}
            nodeLayoutStrategy={String(nodeLayoutStrategy)}
            onNodeLayoutStrategyChange={async (val) => setNodeLayoutStrategy(val)}
            elkAlgorithm={String(elkAlgorithm)}
            onElkAlgorithmChange={async (val) => setElkAlgorithm(val)}
            linkOrientationEnabled={!!linkOrientationEnabled}
            showOnlyMainFlow={showOnlyMainFlow}
            onShowOnlyMainFlowChange={setShowOnlyMainFlow}
            onRefreshRequest={() => setRefreshNonce(n => n + 1)}
        />
    );

    const handleAiTabIntercept = useCallback(() => {
        if (!hasFeature('ai-assistant')) {
            showUpgradeModal(t('diagramViewer.aiAssistant'));
            return false;
        }
        return true;
    }, [hasFeature, showUpgradeModal, t]);

    const handleTemplateChange = useCallback(async (_value: string[], leafKey: string, rootGroup: string) => {
        await selectDiagramViewerTemplate(leafKey, rootGroup, {
            loadRemoteDiagram: async (providerName, id) => {
                const { unifiedStorage } = await import('@/services/UnifiedStorageService');
                const savedDiagram = await unifiedStorage.getProvider(providerName).loadDiagram(id);
                return coerceRemoteDiagramSelection(savedDiagram, id);
            },
            loadSystemTemplate: async (id) => {
                const { supabase } = await import('@/services/supabase');
                if (!supabase) return null;
                const { data, error } = await supabase
                    .from('system_templates')
                    .select('content, title, id')
                    .eq('id', id)
                    .single();
                if (error) throw error;
                return coerceRemoteDiagramSelection(data, id);
            },
            loadStandardPreset: async (id) => {
                const { PRESET_MAP } = await import('@/data/standardized');
                return (PRESET_MAP[id] ?? null) as unknown as DiagramViewerTemplateData | null;
            },
            getLocalPreset: (id) => getCustomPreset(id) as unknown as DiagramViewerTemplateData | null,
            parseRemoteContent: (content, fallback) => parseRemoteDiagramContent(
                typeof content === 'string' ? content : JSON.stringify(content),
                { id: fallback.id, title: fallback.title ?? fallback.id },
            ) as unknown as DiagramViewerTemplateData,
            seedAndNavigate: seedAutoSaveAndNavigate,
            clearBlankTemplate: (id) => clearBlankTemplateLocalState(localStorage, id),
            selectDiagram: handleSelectDiagram,
            showLoading: (message) => appMessage.loading(message, 0),
            showError: (message) => appMessage.error(message),
            logFailure: logDiagramViewerRemoteLoadFailure,
            translate: (key, values) => {
                if (key === 'storage.manager.downloading') return t('storage.manager.downloading');
                if (key === 'storage.manager.noContent') return t('storage.manager.noContent');
                return t('diagramViewer.cloudLoad.error', { message: values?.message ?? '' });
            },
        });
    }, [handleSelectDiagram, seedAutoSaveAndNavigate, t]);

    const exitPresentation = useCallback(() => {
        setIsPresentationMode(false);
        appMessage.info(t('diagramViewer.presentation.exit'));
    }, [t]);
    const {
        commandItems,
        isCommandOpen,
        setIsCommandOpen,
        isSettingsOpen,
        setIsSettingsOpen,
        isShortcutsOpen,
        setIsShortcutsOpen,
        showDebugPanel,
        setShowDebugPanel,
    } = useDiagramViewerCommands({
        t,
        isFullscreen,
        isPresentationMode,
        handleToggleFullscreen,
        exitFullscreen: handleFsControl,
        handleSelectDiagram,
        navigate,
        setMermaidModalVisible,
        exitPresentation,
    });

    return (
        <DiagramViewerView
            t={t}
            selectedDiagramId={selectedDiagramId}
            selectedDiagram={selectedDiagram}
            edgeMode={edgeMode || 'advanced-smart'}
            setEdgeMode={setEdgeMode}
            layoutStrategy={String(layoutStrategy || '')}
            nodeLayoutStrategy={String(nodeLayoutStrategy || '')}
            elkAlgorithm={String(elkAlgorithm || '')}
            showOnlyMainFlow={showOnlyMainFlow}
            setShowOnlyMainFlow={setShowOnlyMainFlow}
            mainFlowAnimationEnabled={mainFlowAnimationEnabled}
            setMainFlowAnimationEnabled={setMainFlowAnimationEnabled}
            isReadonly={isReadonly}
            isPresentationMode={isPresentationMode}
            setIsPresentationMode={setIsPresentationMode}
            isFullscreen={isFullscreen}
            handleToggleFullscreen={handleToggleFullscreen}
            resolvedPluginId={resolvedPluginId}
            handleTemplateChange={handleTemplateChange}
            commandItems={commandItems}
            isCommandOpen={isCommandOpen}
            setIsCommandOpen={setIsCommandOpen}
            isShortcutsOpen={isShortcutsOpen}
            setIsShortcutsOpen={setIsShortcutsOpen}
            collabModalVisible={collabModalVisible}
            setCollabModalVisible={setCollabModalVisible}
            activeUsers={activeUsers || []}
            roomName={roomName}
            SelectedDiagramComponent={SelectedDiagramComponent}
            refreshNonce={refreshNonce}
            extraExportItems={extraExportItems}
            isYjsSynced={isYjsSynced}
            pushLocalChangesToYjs={pushLocalChangesToYjs}
            provider={provider ?? null}
            saveToCloud={saveToCloud}
            handleDirectSave={handleDirectSave}
            handleSaveTo={handleSaveTo}
            isSettingsOpen={isSettingsOpen}
            setIsSettingsOpen={setIsSettingsOpen}
            settingsPanel={settingsPanel}
            aiConfigVisible={aiConfigVisible}
            setAiConfigVisible={setAiConfigVisible}
            handlePreviewAIJson={handlePreviewAIJson}
            handleApplyAIJson={handleApplyAIJson}
            aiNodesRef={aiNodesRef as any}
            aiEdgesRef={aiEdgesRef as any}
            aiCanvasOps={aiCanvasOps}
            handleAiTabIntercept={handleAiTabIntercept}
            shareDialogOpen={shareDialogOpen}
            closeShareDialog={closeShareDialog}
            ensureSaved={ensureSaved}
            cloudManagerVisible={cloudManagerVisible}
            setCloudManagerVisible={setCloudManagerVisible}
            seedAutoSaveAndNavigate={seedAutoSaveAndNavigate}
            mermaidModalVisible={mermaidModalVisible}
            setMermaidModalVisible={setMermaidModalVisible}
            handleImportMermaidNodes={handleImportMermaidNodes}
            showDebugPanel={showDebugPanel}
            setShowDebugPanel={setShowDebugPanel}
        />
    );
};

export default DiagramViewer;
