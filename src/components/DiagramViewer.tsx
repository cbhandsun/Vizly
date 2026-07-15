import React, { Suspense, useState, useRef, useEffect, lazy, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
// import Button from 'antd/es/button';
import Spin from 'antd/es/spin';
// import Result from 'antd/es/result';
// import Avatar from 'antd/es/avatar';
import { ConfigProvider } from 'antd';
import { useTranslation } from 'react-i18next';
import { useDiagramControls } from '@/core/hooks/useDiagramControls';
import { useUIState } from '@/core/hooks/useUIState';
import { diagramDefinitions } from '../data/diagram-definitions';
import { DiagramSettingsPanel } from './ui/DiagramSettingsPanel';
import { EnhancedThemeSelector } from './ui/EnhancedThemeSelector';
import { DiagramThemeProvider } from '@/core/themes/DiagramThemeProvider';
import { useConfigIntegration, useConfigValue } from '@/core/hooks/useConfigIntegration';
import { useDiagramHostStorage } from '@/core/hooks/useDiagramHostStorage';
import { readFavoriteDiagramIds, readRecentDiagramIds, writeFavoriteDiagramIds } from '@/core/hooks/diagramHostStorage';
import { useSubscription } from '../context/useSubscription';

const RoutingDebugPanel = React.lazy(() => import('./debug/RoutingDebugPanel').then(m => ({ default: m.RoutingDebugPanel })));
import { LayeredConfigManager, ConfigLayer } from '@/core/config/LayeredConfigManager';
import { DiagramLayout } from './layout/DiagramLayout';
import { CommandPalette, type CommandItem } from '@/core/components/ui/CommandPalette';
import { readRecentCommandIds } from '@/core/components/ui/commandPaletteStorage';
import { useYjsCollaboration } from './diagrams/collaboration/YjsProviderHooks';
import { useCloudSave } from './diagrams/hooks/useCloudSave';
const ShortcutsHelpModal = React.lazy(() => import('@/core/components/ui/ShortcutsHelpModal'));
const CollaborationModal = React.lazy(() => import('./ui/CollaborationModal').then(m => ({ default: m.CollaborationModal })));
const AIConfigModal = React.lazy(() => import('./ai/AIConfigModal'));
const AIChatView = React.lazy(() => import('./ai/AIChatPanel').then(m => ({ default: m.AIChatView })));
const ShareDialog = React.lazy(() => import('@/components/diagrams/ShareDialog'));
import { parseAIDiagramJson } from './ai/aiDiagramImport';
import {      Input } from 'antd';
import {
    logDiagramViewerBridgeCleanupFailure,
    logDiagramViewerCommandPaletteStateFailure,
    logDiagramViewerDirectSaveFailure,
    logDiagramViewerDocTypeDetectionFailure,
    logDiagramViewerEdgeModeInitializationFailure,
    logDiagramViewerFullscreenExitFailure,
    logDiagramViewerMermaidImportFailure,
    logDiagramViewerOpenNewTabFailure,
    logDiagramViewerRemoteLoadFailure,
    logDiagramViewerSaveAsFailure,
    logDiagramViewerStandardDataLayoutFallbackFailure,
    logDiagramViewerSwitchConfirmationFailure,
} from './diagramViewerLogging';
import {
    clearBlankTemplateLocalState,
} from './diagramViewerStorage';
const CloudStorageManagerModal = React.lazy(() => import('./storage/CloudStorageManagerModal').then(m => ({ default: m.CloudStorageManagerModal })));
const MermaidImportModal = React.lazy(() => import('./ui/MermaidImportModal').then(m => ({ default: m.MermaidImportModal })));
import { tryAttachDiagramSnapshot } from '@/core/utils/diagramSnapshot';
import { invalidateRemoteDiagramPreview } from '@/core/utils/remoteDiagramPreview';
import DiagramControlBridge from '@/core/components/shared/DiagramControlBridge';



const DraggableSettingsPanel = React.lazy(() => import('./ui/DraggableSettingsPanel').then(m => ({ default: m.DraggableSettingsPanel })));
const TemplateCascaderMenu = React.lazy(() => import('./diagrams/ui/TemplateCascaderMenu').then(m => ({ default: m.TemplateCascaderMenu })));
import { appMessage } from '@/core/utils/antdStaticBridge';
import { resolvePluginId } from '@/core/plugins/registry';
import { ensureBuiltInPlugins } from '@/core/plugins/builtInPlugins';
import { getStandardPresetDocTypeById } from '@/data/standardized/presetMetadata';
import { loadStandardPresetById } from '@/data/standardized/presetLoader';
import { getDiagramDocTypeFromStorage } from '@/core/utils/diagramTypeStorage';
import { createAutoSavePayload } from '@/core/utils/autoSaveStorage';
import { addCustomPreset, getCustomPreset } from '@/core/utils/customPresetStorage';
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
    createDiagramViewerCommandItems,
    getDiagramViewerCommandModifierLabel,
} from './diagramViewerCommandItems';
import {
    openDiagramViewerInNewTab,
    seedAutoSaveAndNavigateDiagram,
    selectDiagramInViewer,
} from './diagramViewerNavigation';
import {
    isDiagramViewerBridgeSavable,
    saveDiagramViewerCloudReplica,
    saveDiagramViewerDirectCloud,
} from './diagramViewerSave';
import { createDiagramViewerGlobalKeydownHandler } from './diagramViewerKeyboard';
import {
    finalizeDiagramSeedNavigation,
    normalizeDiagramSeedData,
} from './diagramViewerSeedNavigation';
import { ensureDiagramSwitchConfirmed } from './diagramViewerSwitchGuard';
import { parseRemoteDiagramContent } from '@/services/remoteDiagramContent';
import {
    normalizeCollaborationRoomName,
    normalizeCollaborationServerUrl,
    normalizeCollaborationToken,
} from './diagrams/collaboration/collaborationSecurity';

import { ErrorBoundary } from './ui/ErrorBoundary';
import { appModal } from '@/core/utils/antdStaticBridge';

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
    const handleImportMermaidNodes = useCallback(async (nodes: any[], edges: any[]) => {
        const bridge = getFlowDataBridge(selectedDiagramId);
        if (!bridge) {
            appMessage.error(t('diagramViewer.canvasNotFound'));
            return;
        }

        try {
            // 1. 批量创建节点 (利用更新后的 addNode 支持自定义 ID)
            for (const n of nodes) {
                await bridge.addNode({
                    id: n.id,
                    label: n.data.label,
                    type: n.data.type,
                    shape: n.data.shape,
                    parentId: n.parentId,
                    position: n.position
                });
            }

            // 2. 批量连接
            for (const e of edges) {
                if (bridge.connectNodes) {
                    bridge.connectNodes({ source: e.source, target: e.target, label: e.label });
                }
            }

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


    /** 更强大的多端另存为统筹逻辑 */
    const handleSaveTo = useCallback(async (target: 's3' | 'supabase' | 'local') => {
        const bridge = getFlowDataBridge(selectedDiagramId);
        if (!isDiagramViewerBridgeSavable(bridge)) {
            appMessage.error('未找到图表数据，无法保存');
            return;
        }

        const defaultName = bridge.metadata?.title || bridge.name || selectedDiagramId;

        let newName = defaultName;
        // 使用简易模态交互提供命名的机会
        appModal.confirm({
            title: t('diagramViewer.saveAs.title', { target: target.toUpperCase() }),
            content: (
                <div style={{ marginTop: 16 }}>
                    <p style={{ marginBottom: 8, color: '#666' }}>{t('diagramViewer.saveAs.namePlaceholder')}</p>
                    <Input
                        defaultValue={defaultName}
                        onChange={e => newName = e.target.value} />
                </div>
            ),
            onOk: async () => {
                if (!newName || !newName.trim()) {
                    appMessage.error(t('diagramViewer.saveAs.nameRequired'));
                    return;
                }
                const nameStr = newName.trim();
                const hide = appMessage.loading(t('diagramViewer.saveAs.saving', { target }), 0);
                try {
                    const dataToSave = {
                        ...bridge,
                        id: crypto.randomUUID(), // 作为全新文件存储
                        name: nameStr,
                        metadata: {
                            ...(bridge.metadata || {}),
                            title: nameStr
                        }
                    };

                    if (target === 'local') {
                        const savedPreset = addCustomPreset(nameStr, dataToSave);
                        if (!savedPreset) throw new Error('本地模板数据无效');
                        appMessage.success(t('diagramViewer.saveAs.localSuccess'));

                        // Sync current
                        // selectedDiagramId && dispatchDiagramControl('loadLocalJson', { json: JSON.stringify(dataToSave) });
                    } else {
                        const savedId = await saveDiagramViewerCloudReplica({
                            bridge,
                            selectedDiagramId,
                            providerName: target,
                            title: nameStr,
                            getProvider: async (providerName) => {
                                const { unifiedStorage } = await import('@/services/UnifiedStorageService');
                                return unifiedStorage.getProvider(providerName);
                            },
                            attachSnapshot: tryAttachDiagramSnapshot,
                            invalidatePreview: invalidateRemoteDiagramPreview,
                            createId: () => crypto.randomUUID(),
                        });

                        // URL 刷新指引
                        setSearchParams(prev => { prev.set('diagram', savedId); return prev; });
                        appMessage.success(t('diagramViewer.saveAs.cloudSuccess'));
                    }
                } catch (e: any) {
                    logDiagramViewerSaveAsFailure(target, e);
                    appMessage.error(t('diagramViewer.saveAs.error', { message: e.message || String(e) }));
                } finally {
                    hide();
                }
            }
        });
    }, [selectedDiagramId, setSearchParams, t]);

    /** 同源直接覆盖保护机制 */
    const handleDirectSave = useCallback(async () => {
        const bridge = getFlowDataBridge(selectedDiagramId);
        const cloudMeta = bridge?.metadata?.cloud;
        if (cloudMeta && cloudMeta.provider && cloudMeta.title) {
            // 已存在云记录，静默同名同 id 覆盖更新
            const hide = appMessage.loading(t('diagramViewer.directSave.saving', { provider: cloudMeta.provider }), 0);
            try {
                await saveDiagramViewerDirectCloud({
                    bridge,
                    selectedDiagramId,
                    getProvider: async (providerName) => {
                        const { unifiedStorage } = await import('@/services/UnifiedStorageService');
                        return unifiedStorage.getProvider(providerName as any);
                    },
                    attachSnapshot: tryAttachDiagramSnapshot,
                    invalidatePreview: invalidateRemoteDiagramPreview,
                });
                appMessage.success(t('diagramViewer.directSave.success'));
            } catch (e: any) {
                logDiagramViewerDirectSaveFailure(String(cloudMeta.provider), e);
                appMessage.error(t('diagramViewer.directSave.error', { message: e.message }));
            } finally { hide(); }
        } else {
            // 首次未知归属文件强制另存为至 supabase 后端
            handleSaveTo('supabase');
        }
    }, [selectedDiagramId, handleSaveTo, t]);

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
                    return standardDataToCanvas(normalizedSeedData);
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

    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isCommandOpen, setIsCommandOpen] = useState(false);
    const [commandFavorites, setCommandFavorites] = useState<string[]>([]);
    const [commandRecent, setCommandRecent] = useState<string[]>([]);
    const [commandRecentOps, setCommandRecentOps] = useState<string[]>([]);
    const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

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

    useEffect(() => {
        if (!isCommandOpen) return;
        const read = () => {
            try {
                const favorites = readFavoriteDiagramIds();
                const recent = readRecentDiagramIds();
                const recentOps = readRecentCommandIds(8).filter(id => id.startsWith('op:'));
                queueMicrotask(() => {
                    setCommandFavorites(favorites);
                    setCommandRecent(recent);
                    setCommandRecentOps(recentOps.slice(0, 8));
                });
            } catch (error) {
                logDiagramViewerCommandPaletteStateFailure(error);
            }
        };

        read();
        const onFav = () => read();
        window.addEventListener('diagramMenuFavoritesChanged', onFav as EventListener);
        window.addEventListener('diagramMenuRecentChanged', onFav as EventListener);
        window.addEventListener('commandPaletteRecentChanged', onFav as EventListener);
        return () => {
            window.removeEventListener('diagramMenuFavoritesChanged', onFav as EventListener);
            window.removeEventListener('diagramMenuRecentChanged', onFav as EventListener);
            window.removeEventListener('commandPaletteRecentChanged', onFav as EventListener);
        };
    }, [isCommandOpen]);

    // ESC 优化：一步退出全屏并回到主视图
    useEffect(() => {
        const onKeyDown = createDiagramViewerGlobalKeydownHandler({
            isPresentationMode,
            isFullscreenActive: () => Boolean(document.fullscreenElement),
            exitFullscreen: () => handleFsControl(),
            onFullscreenExitFailure: (error) => logDiagramViewerFullscreenExitFailure(error),
            toggleDebugPanel: () => setShowDebugPanel(prev => !prev),
            openCommandPalette: () => setIsCommandOpen(true),
            openSettings: () => setIsSettingsOpen(true),
            triggerEditorCommand: (action) => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action } })),
            triggerAi: () => {
                const aiBtn = document.querySelector('[data-id="toolbar-ai-btn"]') || document.querySelector('.toolbar-button-ai');
                if (aiBtn) (aiBtn as HTMLButtonElement).click();
            },
            triggerTheme: () => {
                const themeBtn = document.querySelector('[data-id="toolbar-theme-btn"]');
                if (themeBtn) (themeBtn as HTMLButtonElement).click();
            },
            exitPresentation: () => {
                setIsPresentationMode(false);
                appMessage.info(t('diagramViewer.presentation.exit'));
            },
        });
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleFsControl, isPresentationMode, t]);

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

    const openDiagramInNewTab = useCallback((id: string) => {
        openDiagramViewerInNewTab({
            id,
            currentHref: window.location.href,
            openWindow: (url, target, features) => window.open(url, target, features),
            logFailure: logDiagramViewerOpenNewTabFailure,
        });
    }, []);

    const handleAiTabIntercept = useCallback(() => {
        if (!hasFeature('ai-assistant')) {
            showUpgradeModal(t('diagramViewer.aiAssistant'));
            return false;
        }
        return true;
    }, [hasFeature, showUpgradeModal, t]);

    const commandItems: CommandItem[] = useMemo(() => {
        const modifierLabel = getDiagramViewerCommandModifierLabel({
            platform: typeof navigator !== 'undefined' ? navigator.platform || '' : '',
        });

        return createDiagramViewerCommandItems({
            t,
            modifierLabel,
            isFullscreen,
            commandFavorites,
            commandRecent,
            commandRecentOps,
            diagramDefinitions,
            setIsShortcutsOpen,
            setIsSettingsOpen,
            setMermaidModalVisible,
            handleToggleFullscreen,
            handleSelectDiagram,
            openDiagramInNewTab,
            navigate,
            triggerEditorCommand: (action) => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action } })),
            triggerAiButton: () => {
                const aiBtn = document.querySelector('[data-id="toolbar-ai-btn"]') || document.querySelector('.toolbar-button-ai');
                if (aiBtn) (aiBtn as HTMLButtonElement).click();
            },
            triggerThemeButton: () => {
                const themeBtn = document.querySelector('[data-id="toolbar-theme-btn"]');
                if (themeBtn) (themeBtn as HTMLButtonElement).click();
            },
            clearFavorites: () => {
                writeFavoriteDiagramIds([]);
                window.dispatchEvent(new CustomEvent('diagramMenuFavoritesChanged'));
            },
        });
    }, [commandFavorites, commandRecent, commandRecentOps, handleSelectDiagram, handleToggleFullscreen, isFullscreen, navigate, openDiagramInNewTab, t]);

    return (
        <DiagramThemeProvider>
            <DiagramLayout
                isPresentationMode={isPresentationMode}
                toolbarProps={{
                    diagramId: selectedDiagramId,
                    diagramName: selectedDiagram?.titleKey ? t(selectedDiagram.titleKey) : (selectedDiagram?.name || 'Diagram'),
                    title: selectedDiagram?.titleKey ? t(selectedDiagram.titleKey) : (selectedDiagram?.name || 'Diagram'),
                    edgeMode: edgeMode || 'advanced-smart',
                    onEdgeModeChange: (mode: 'advanced-smart' | 'native') => setEdgeMode(mode),
                    isFullscreen: isFullscreen,
                    onToggleFullscreen: handleToggleFullscreen,
                    setIsCommandOpen: setIsCommandOpen,
                    showExport: true,
                    showThemeSelector: false,
                    showStyleSwitcher: false,
                    hideCenterIsland: resolvedPluginId === 'mindmap',
                    leftChildren: (
                        <>
                            <div className="flex items-center max-w-[240px]">
                                <TemplateCascaderMenu
                                    style={{ width: '100%', minWidth: 160 }}
                                    onChange={async (val, leafKey, rootGroup) => {
                                        if (!leafKey) return;

                                        if (rootGroup === 's3' || rootGroup === 'cloud' || rootGroup === 'supabase') {
                                            const providerName = rootGroup === 's3' ? 's3' : 'supabase';
                                            const messageKey = appMessage.loading(t('storage.manager.downloading'), 0);
                                            try {
                                                const { unifiedStorage } = await import('@/services/UnifiedStorageService');
                                                const provider = unifiedStorage.getProvider(providerName);
                                                const savedDiagram = await provider.loadDiagram(leafKey);
                                                if (savedDiagram && savedDiagram.content) {
                                                    const parsedContent = parseRemoteDiagramContent(savedDiagram.content, {
                                                        id: savedDiagram.id,
                                                        title: savedDiagram.title,
                                                    });
                                                    const normalized = {
                                                        ...parsedContent,
                                                        id: savedDiagram.id,
                                                        name: savedDiagram.title || parsedContent.name,
                                                        metadata: {
                                                            ...(parsedContent.metadata || {}),
                                                            title: savedDiagram.title,
                                                            cloud: { provider: providerName, id: savedDiagram.id, title: savedDiagram.title }
                                                        }
                                                    };
                                                    seedAutoSaveAndNavigate(normalized, savedDiagram.id);
                                                } else {
                                                    appMessage.error(t('storage.manager.noContent'));
                                                }
                                            } catch (e: any) {
                                                logDiagramViewerRemoteLoadFailure(providerName, String(leafKey), e);
                                                appMessage.error(t('diagramViewer.cloudLoad.error', { message: e.message }));
                                            } finally {
                                                messageKey();
                                            }
                                        } else if (rootGroup === 'system-templates') {
                                            const messageKey = appMessage.loading('正在加载云端模板...', 0);
                                            try {
                                                const { supabase } = await import('@/services/supabase');
                                                if (supabase) {
                                                    const { data, error } = await supabase.from('system_templates').select('content, title, id').eq('id', leafKey).single();
                                                    if (!error && data && data.content) {
                                                        const parsedContent = parseRemoteDiagramContent(data.content, { id: data.id, title: data.title });
                                                        const baseData = {
                                                            ...parsedContent,
                                                            id: data.id,
                                                            name: data.title || parsedContent.name,
                                                            metadata: {
                                                                ...(parsedContent.metadata || {}),
                                                                title: data.title
                                                            }
                                                        };
                                                        const normalized = baseData;
                                                        seedAutoSaveAndNavigate(normalized, data.id);
                                                    } else {
                                                        appMessage.error('模板内容为空');
                                                    }
                                                }
                                            } catch (e: any) {
                                                logDiagramViewerRemoteLoadFailure('system-templates', String(leafKey), e);
                                                appMessage.error(`加载失败: ${e.message}`);
                                            } finally {
                                                messageKey();
                                            }
                                        } else {
                                            if (rootGroup === 'local-workspace') {
                                                const found = getCustomPreset(leafKey);
                                                if (found) {
                                                    const trueId = found.id || leafKey;
                                                    seedAutoSaveAndNavigate(found, trueId);
                                                    return;
                                                }
                                            }
                                            
                                            const { PRESET_MAP } = await import('@/data/standardized');
                                            const preset = PRESET_MAP[leafKey];
                                            if (preset) {
                                                const trueId = preset.id || leafKey;
                                                seedAutoSaveAndNavigate({
                                                    ...preset,
                                                    id: trueId,
                                                    metadata: { ...preset.metadata, title: preset.name }
                                                }, trueId);
                                            } else {
                                                // If there's no preset, this is a blank template or direct URL load via UI menu.
                                                // We must clear any potentially poisoned autosave data before navigating to force a new blank/default canvas.
                                                clearBlankTemplateLocalState(localStorage, leafKey);
                                                handleSelectDiagram(leafKey);
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </>
                    ),
                    centerChildren: null,
                    rightChildren: null
                }}
                showMenu={false}
            >
                {/* Host actions are now unified in the designer's internal toolbar islands */}

                <CommandPalette
                    open={isCommandOpen}
                    onClose={() => setIsCommandOpen(false)}
                    items={commandItems}
                    getContainer={() => document.getElementById('app-root-layout') || document.body}
                />
                {isShortcutsOpen && (
                    <Suspense fallback={null}>
                        <ShortcutsHelpModal
                            open={isShortcutsOpen}
                            onClose={() => setIsShortcutsOpen(false)}
                            getContainer={() => document.getElementById('app-root-layout') || document.body}
                        />
                    </Suspense>
                )}
                {collabModalVisible && (
                    <Suspense fallback={null}>
                        <CollaborationModal
                            open={collabModalVisible}
                            onClose={() => setCollabModalVisible(false)}
                            activeUsers={activeUsers || []}
                            roomName={roomName}
                        />
                    </Suspense>
                )}
                <DiagramControlBridge />

                {/* Main Content Area */}
                <div id={`diagram-${selectedDiagramId}`} className={`flex-1 flex flex-col relative bg-surface ${isFullscreen ? 'fixed inset-0 z-[1000]' : ''}`} style={{ height: '100%', width: '100%' }}>
                    <ConfigProvider
                        getPopupContainer={(trigger) => {
                            if (isFullscreen) {
                                return document.getElementById(`diagram-${selectedDiagramId}`) || document.body;
                            }
                            return trigger?.parentElement || document.body;
                        }}
                    >
                        <div className="flex-1 w-full relative min-h-0 overflow-hidden" style={{ height: '100%', width: '100%' }}>
                            <ErrorBoundary
                                title={t('designer.viewer.renderFailed')}
                                subTitle={t('designer.viewer.renderFailedSubtitle')}
                            >
                                <Suspense
                                    fallback={
                                        <div className="flex items-center justify-center h-full text-slate-400">
                                            <Spin size="large" />
                                        </div>
                                    }
                                >
                                    {SelectedDiagramComponent && (() => {
                                        const DynamicComponent: any = SelectedDiagramComponent;
                                        return (
                                            <DynamicComponent
                                                key={`${selectedDiagramId}-${refreshNonce}`}
                                                id={selectedDiagramId}
                                                edgeMode={edgeMode}
                                                layoutStrategy={layoutStrategy}
                                                nodeLayoutStrategy={nodeLayoutStrategy}
                                                elkAlgorithm={elkAlgorithm}
                                                showOnlyMainFlow={showOnlyMainFlow}
                                                onShowOnlyMainFlowChange={setShowOnlyMainFlow}
                                                onMainFlowAnimationChange={setMainFlowAnimationEnabled}
                                                highlightMainFlow={mainFlowAnimationEnabled}
                                                isReadonly={isReadonly}
                                                extraExportItems={extraExportItems}
                                                isYjsSynced={isYjsSynced}
                                                onSyncPush={pushLocalChangesToYjs}
                                                activeUsers={activeUsers || []}
                                                yAwareness={provider?.awareness}
                                                onCloudSave={saveToCloud}
                                                onDirectSave={handleDirectSave}
                                                isDirectSaveDisabled={false}
                                                onSaveAsTo={handleSaveTo}
                                                onOpenSettings={() => setIsSettingsOpen(true)}
                                                renderAIChatPanel={() => (
                                                    <Suspense fallback={<div className="p-4 text-center text-gray-500">Loading AI...</div>}>
                                                        <AIChatView
                                                            onOpenConfig={() => setAiConfigVisible(true)}
                                                            pluginId={resolvedPluginId || 'flowchart-diagram'}
                                                            diagramId={selectedDiagramId}
                                                            onPreviewJson={handlePreviewAIJson}
                                                            onApplyJson={handleApplyAIJson}
                                                            diagramNodesRef={aiNodesRef as any}
                                                            diagramEdgesRef={aiEdgesRef as any}
                                                            canvasOps={aiCanvasOps}
                                                            onClose={() => {
                                                                const aiBtn = document.querySelector('.toolbar-button-ai');
                                                                if (aiBtn) aiBtn.click();
                                                            }}
                                                        />
                                                    </Suspense>
                                                )}
                                                onAiTabIntercept={handleAiTabIntercept}
                                                renderThemeSelector={
                                                    <EnhancedThemeSelector />
                                                }
                                                renderAIConfigModal={aiConfigVisible ? (
                                                    <Suspense fallback={<div />}>
                                                        <AIConfigModal
                                                            open={aiConfigVisible}
                                                            onCancel={() => setAiConfigVisible(false)}
                                                            onSave={() => setAiConfigVisible(false)}
                                                        />
                                                    </Suspense>
                                                ) : null}
                                                renderShareDialog={shareDialogOpen ? (
                                                    <Suspense fallback={null}>
                                                        <ShareDialog
                                                            open={shareDialogOpen}
                                                            onClose={closeShareDialog}
                                                            diagramId={selectedDiagramId}
                                                            onEnsureSaved={ensureSaved}
                                                        />
                                                    </Suspense>
                                                ) : null}
                                            />
                                        );
                                    })()}
                                </Suspense>

                                {isSettingsOpen && (
                                    <Suspense fallback={null}>
                                        <DraggableSettingsPanel 
                                            title={t('designer.commandItems.settings', '配置面板 / Settings')}
                                            onClose={() => setIsSettingsOpen(false)}
                                        >
                                            {settingsPanel}
                                        </DraggableSettingsPanel>
                                    </Suspense>
                                )}

                                {/* 演示模式退出提示层 */}
                                {isPresentationMode && (
                                    <div 
                                        className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[3000] px-6 py-2.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-white text-xs font-semibold rounded-full cursor-pointer transition-all border border-white/20 shadow-2xl animate-bounce-subtle"
                                        onClick={() => {
                                            setIsPresentationMode(false);
                                            appMessage.info('演示模式已退出');
                                        }}
                                    >
                                        🎬 点击或按 ESC 退出演示模式
                                    </div>
                                )}
                            </ErrorBoundary>

                            {cloudManagerVisible && (
                                <Suspense fallback={null}>
                                    <CloudStorageManagerModal
                                        open={cloudManagerVisible}
                                        onCancel={() => setCloudManagerVisible(false)}
                                        onSelect={(data) => {
                                            seedAutoSaveAndNavigate(data, data.id);
                                        }}
                                    />
                                </Suspense>
                            )}

                            {mermaidModalVisible && (
                                <Suspense fallback={null}>
                                    <MermaidImportModal
                                        visible={mermaidModalVisible}
                                        onClose={() => setMermaidModalVisible(false)}
                                        onImport={handleImportMermaidNodes}
                                    />
                                </Suspense>
                            )}
                        </div>
                    </ConfigProvider>
                </div>

                {/* Routing Debug Panel */}
                {showDebugPanel && (
                    <RoutingDebugPanel onClose={() => setShowDebugPanel(false)} />
                )}
            </DiagramLayout>
        </DiagramThemeProvider>
    );
};

export default DiagramViewer;
