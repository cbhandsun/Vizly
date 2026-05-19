// @ts-nocheck
import React, { Suspense, useState, useRef, useEffect, ErrorInfo, ReactNode, lazy, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaCog } from 'react-icons/fa';
import Button from 'antd/es/button';
import Spin from 'antd/es/spin';
import Result from 'antd/es/result';
import Avatar from 'antd/es/avatar';
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
import { useSubscription } from '../context/SubscriptionContext';

import { type DiagramControlAction } from '@/core/components/shared/diagramControl';
import { dispatchDiagramControl } from '@/core/components/shared/diagramControl';
const RoutingDebugPanel = React.lazy(() => import('./debug/RoutingDebugPanel').then(m => ({ default: m.RoutingDebugPanel })));
import { LayeredConfigManager, ConfigLayer } from '@/core/config/LayeredConfigManager';
import { DiagramLayout } from './layout/DiagramLayout';
import { CommandPalette, type CommandItem } from '@/core/components/ui/CommandPalette';
import { createPortal } from 'react-dom';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { MdDragIndicator } from 'react-icons/md';
import { ShortcutsHelpModal } from '@/core/components/ui/ShortcutsHelpModal';
import { CollaborationModal } from './ui/CollaborationModal';
import { useYjsCollaboration } from './diagrams/collaboration/YjsProviderHooks';
import { TeamOutlined } from '@ant-design/icons';
import { useCloudSave } from './diagrams/hooks/useCloudSave';
const AIConfigModal = React.lazy(() => import('./ai/AIConfigModal'));
const AIChatView = React.lazy(() => import('./ai/AIChatPanel').then(m => ({ default: m.AIChatView })));
const ShareDialog = React.lazy(() => import('@/components/diagrams/ShareDialog'));
import { CloudOutlined, AppstoreOutlined, FolderOpenOutlined, LockOutlined, UnlockOutlined, HomeOutlined, CodeOutlined } from '@ant-design/icons';
import { Dropdown, Tooltip, Switch, message, Modal, Input } from 'antd';
const CloudStorageManagerModal = React.lazy(() => import('./storage/CloudStorageManagerModal').then(m => ({ default: m.CloudStorageManagerModal })));
import { MermaidImportModal } from './ui/MermaidImportModal';
import { dataService } from '@/services/DataService';
import { PRESET_MAP } from '@/data/standardized';
import { CUSTOM_PRESETS_STORAGE_KEY } from './diagrams/ui/TemplateCascaderMenu';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { tryAttachDiagramSnapshot } from '@/core/utils/diagramSnapshot';
import { invalidateRemoteDiagramPreview } from '@/core/utils/remoteDiagramPreview';
import { TemplateCascaderMenu } from './diagrams/ui/TemplateCascaderMenu';
import DiagramControlBridge from '@/core/components/shared/DiagramControlBridge';



const DraggableSettingsPanel = React.lazy(() => import('./ui/DraggableSettingsPanel').then(m => ({ default: m.DraggableSettingsPanel })));
import { appMessage } from '@/core/utils/antdStaticBridge';
import { resolvePluginId } from '@/core/plugins/registry';

import { ErrorBoundary } from './ui/ErrorBoundary';
import { appModal } from '@/core/utils/antdStaticBridge';


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

    const selectedDiagramId = useMemo(() => {
        const urlId = searchParams.get('diagram');
        if (urlId) return urlId;
        return storedDiagramId;
    }, [searchParams, storedDiagramId]);
    // refreshNonce: 仅用于手动刷新场景（如设置面板的 onRefreshRequest），
    // 模板切换已改为 window.location.reload() 方式，不再依赖 nonce 触发 remount。
    const [refreshNonce, setRefreshNonce] = useState(0);

    // =============== Phase 5: IoC 依赖注入层 =================
    const YJS_WS_URL = import.meta.env.VITE_YJS_WEBSOCKET_URL || 'wss://demos.yjs.dev/ws';
    const roomFromUrl = searchParams.get('room');
    const [collabModalVisible, setCollabModalVisible] = useState(false);
    const roomName = roomFromUrl || `vizly-room-${selectedDiagramId}`;
    
    // Enable if user specifically clicks Share, OR if the url has ?room=, OR cloud-sync is active
    const isCollabEnabled = !!roomFromUrl || collabModalVisible || hasFeature('cloud-sync');

    const { isSynced: isYjsSynced, pushLocalChangesToYjs, activeUsers, provider, wsStatus } = useYjsCollaboration({
        roomName,
        serverUrl: YJS_WS_URL,
        token: jwtToken || 'guest',
        enabled: isCollabEnabled
    });

    // Provide client ID to window for UI badge tracking
    useEffect(() => {
        if (provider?.awareness?.clientID) {
            (window as any)._yjsClientId = provider.awareness.clientID;
        }
    }, [provider?.awareness?.clientID]);

    const { saveToCloud, shareDialogOpen, openShareDialog, closeShareDialog, ensureSaved } = useCloudSave(selectedDiagramId);
    
    // --- Phase 6: Mermaid Import Logic ---
    const handleImportMermaidNodes = useCallback(async (nodes: any[], edges: any[]) => {
        const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
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
            console.error('[Mermaid Import] Error:', err);
            appMessage.error('导入过程中发生错误');
        }
    }, [selectedDiagramId]);
    const [aiConfigVisible, setAiConfigVisible] = useState(false);
    const [cloudManagerVisible, setCloudManagerVisible] = useState(false);
    const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
    const [mermaidModalVisible, setMermaidModalVisible] = useState(false);

    const aiNodesRef = useMemo(() => ({
        get current() {
            return (window as any).__flowDataBridge?.[selectedDiagramId]?.nodes || [];
        }
    }), [selectedDiagramId]);

    const aiEdgesRef = useMemo(() => ({
        get current() {
            return (window as any).__flowDataBridge?.[selectedDiagramId]?.edges || [];
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
    const { handleToggleFullscreen: handleFsControl } = useDiagramControls(selectedDiagramId);
    const selectedDiagram = diagramDefinitions.find(d => d.id === selectedDiagramId);

    // Look up local storage or dataService to find the type
    const docType = useMemo(() => {
        if (!selectedDiagramId || selectedDiagram) return undefined;
        try {
            // 1. In-memory DataService (valid within current session)
            const doc = dataService.getDiagram(selectedDiagramId);
            if (doc?.type) return doc.type;
        } catch { /* ignore */ }
        try {
            // 2. vizly_diagrams localStorage (written by older versions / external tools)
            const raw = localStorage.getItem('vizly_diagrams');
            if (raw) {
                const arr: any[] = JSON.parse(raw);
                const found = Array.isArray(arr) ? arr.find((d: any) => d.id === selectedDiagramId) : null;
                if (found?.type) return found.type;
            }
        } catch { /* ignore */ }
        try {
            // 3. vizly_diagram_configs — lightweight type-only index
            const raw2 = localStorage.getItem('vizly_diagram_configs');
            if (raw2) {
                const configs: any = JSON.parse(raw2);
                if (configs?.[selectedDiagramId]?.type) return configs[selectedDiagramId].type;
            }
        } catch { /* ignore */ }
        try {
            // 4. autosave key — metadata.type written on save by FlowchartDesigner
            const autosaveRaw = localStorage.getItem(`flowchart-autosave-v2-${selectedDiagramId}`);
            if (autosaveRaw) {
                const autosave = JSON.parse(autosaveRaw);
                if (autosave?.metadata?.type) return autosave.metadata.type;
            }
        } catch { /* ignore */ }
        return undefined;
    }, [selectedDiagramId, selectedDiagram]);

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
            return lazy(() => import('@/core').then(async m => {
                if (m.initializePlugins) m.initializePlugins();
                // Ensure plugin-specific registration happens before render
                if (resolvedPluginId === 'mindmap') {
                    const { PluginRegistry } = m;
                    if (!PluginRegistry.getInstance().getPlugin('mindmap')) {
                        const { MindMapPlugin } = await import('../core/plugins/MindMapPlugin');
                        PluginRegistry.getInstance().register(new MindMapPlugin());
                    }
                }
                return {
                    default: (props: any) => React.createElement(m.FlowchartDesigner, { ...props, pluginId: resolvedPluginId })
                };
            }));
        }

        // Fallback to FlowchartDesigner if not found
        return lazy(() => import('@/core').then(m => {
            if (m.initializePlugins) m.initializePlugins();
            return { default: m.FlowchartDesigner };
        }));
    }, [selectedDiagram?.component, docType, resolvedPluginId]);

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
    const [isReadonly, setIsReadonly] = useState<boolean>(false);

    /** 沉浸式演示模式：隐藏 UI 侧边栏与工具栏 */
    const [isPresentationMode, setIsPresentationMode] = useState<boolean>(false);


    /** 更强大的多端另存为统筹逻辑 */
    const handleSaveTo = useCallback(async (target: 's3' | 'supabase' | 'local') => {
        const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
        if (!bridge || !bridge.nodes) {
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
                        // 本地存储写入逻辑
                        const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
                        const parsed = raw ? JSON.parse(raw) : {};
                        // Guard: 如果存储损坏（非对象），回退到空对象防止后续赋值崩溃
                        const map: Record<string, unknown> = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
                        map[nameStr] = dataToSave;
                        localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(map));
                        appMessage.success(t('diagramViewer.saveAs.localSuccess'));

                        // Sync current
                        // selectedDiagramId && dispatchDiagramControl('loadLocalJson', { json: JSON.stringify(dataToSave) });
                    } else {
                        const snap = await tryAttachDiagramSnapshot(dataToSave, selectedDiagramId);
                        const provider = unifiedStorage.getProvider(target);
                        if (!provider.isConfigured()) throw new Error(`${target} 驱动未配置`);

                        await provider.saveDiagram({
                            id: dataToSave.id,
                            title: nameStr,
                            content: { ...snap.diagram, id: dataToSave.id, name: nameStr } as any,
                            updated_at: new Date().toISOString(),
                            user_id: 'anonymous',
                        });

                        invalidateRemoteDiagramPreview(dataToSave.id);

                        // 同步桥接记录为新副本状态
                        bridge.id = dataToSave.id;
                        bridge.name = nameStr;
                        bridge.metadata.cloud = { provider: target, id: dataToSave.id, title: nameStr };

                        // URL 刷新指引
                        setSearchParams(prev => { prev.set('diagram', dataToSave.id); return prev; });
                        appMessage.success(t('diagramViewer.saveAs.cloudSuccess'));
                    }
                } catch (e: any) {
                    appMessage.error(t('diagramViewer.saveAs.error', { message: e.message || String(e) }));
                } finally {
                    hide();
                }
            }
        });
    }, [selectedDiagramId, setSearchParams]);

    /** 同源直接覆盖保护机制 */
    const handleDirectSave = useCallback(async () => {
        const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
        const cloudMeta = bridge?.metadata?.cloud;
        if (cloudMeta && cloudMeta.provider && cloudMeta.title) {
            // 已存在云记录，静默同名同 id 覆盖更新
            const hide = appMessage.loading(t('diagramViewer.directSave.saving', { provider: cloudMeta.provider }), 0);
            try {
                const snap = await tryAttachDiagramSnapshot(bridge, selectedDiagramId);
                const provider = unifiedStorage.getProvider(cloudMeta.provider);
                await provider.saveDiagram({
                    id: cloudMeta.id || bridge.id,
                    title: cloudMeta.title,
                    content: { ...snap.diagram, id: cloudMeta.id || bridge.id } as any,
                    updated_at: new Date().toISOString(),
                    user_id: 'anonymous',
                });
                invalidateRemoteDiagramPreview(cloudMeta.id || bridge.id);
                appMessage.success(t('diagramViewer.directSave.success'));
            } catch (e: any) {
                appMessage.error(t('diagramViewer.directSave.error', { message: e.message }));
            } finally { hide(); }
        } else {
            // 首次未知归属文件强制另存为至 supabase 后端
            handleSaveTo('supabase');
        }
    }, [selectedDiagramId, handleSaveTo]);

    // 是否为云端受控组件，如果是则开放 DirectSave 蓝键
    const isCloudBridged = !!((window as any).__flowDataBridge?.[selectedDiagramId]?.metadata?.cloud);

    /* Removed renderOverflowContent and helper functions - moved to DiagramSettingsPanel */

    const handleSelectDiagram = useCallback((id: string) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('diagram', id);
            return next;
        });
        addRecentDiagram(id);
    }, [setSearchParams, addRecentDiagram]);

    const seedAutoSaveAndNavigate = useCallback(async (data: any, id: string) => {
        // ★ 安全检查：如果当前图表有节点数据，提示用户确认切换
        try {
            const { useDiagramStore } = await import('@/core/store/useDiagramStore');
            const currentNodes = useDiagramStore.getState().nodes;
            if (currentNodes && currentNodes.length > 0) {
                const confirmed = await new Promise<boolean>(resolve => {
                    appModal.confirm({
                        title: '切换图表模板',
                        content: `当前图表包含 ${currentNodes.length} 个节点。切换后当前的本地修改将被新模板覆盖，确定要继续吗？`,
                        okText: '确定切换',
                        cancelText: '取消',
                        okButtonProps: { danger: true },
                        onOk: () => resolve(true),
                        onCancel: () => resolve(false),
                    });
                });
                if (!confirmed) return;
            }
        } catch { /* 确认对话框失败时不阻塞切换 */ }

        let processedData = data;
        
        // Check if it's a standardized data payload that requires conversion to canvas format.
        // 判断条件：节点没有 data 字段（StandardNodeData），或者 edges 没有 markerEnd（Standard Edge 格式）
        const firstNode = data?.nodes?.[0];
        const firstEdge = data?.edges?.[0];
        const nodeIsStandard = firstNode && (!('data' in firstNode) || ('domain' in firstNode));
        const edgeIsStandard = firstEdge && !('markerEnd' in firstEdge) && !('sourceHandle' in firstEdge);
        const needsConversion = data && data.nodes && data.nodes.length > 0 && 
            (nodeIsStandard || edgeIsStandard);
        
        if (needsConversion) {
            try {
                const { standardDataToCanvas } = await import('@/core/components/diagrams/designerUtils');
                const layoutResult = await standardDataToCanvas(data);
                
                processedData = {
                    ...data,
                    nodes: layoutResult.nodes,
                    edges: layoutResult.edges || data.edges || [],
                    layout: data.layout || { type: 'DomainDagreLayout', direction: 'TB' }
                };
            } catch (err) {
                console.warn('[DiagramViewer] Standard data layout fallback execution failed:', err);
            }
        } else if (data?.edges?.length > 0) {
            // [FIX] 即使节点是画布格式，edges 也可能来自 StandardEdgeData（type:"main" 等，无 markerEnd）
            // 做最小化格式兜底：确保 ReactFlow 能识别和渲染这些边
            const STANDARD_EDGE_TYPES = new Set(['main', 'dependency', 'support', 'data', 'feedback', 'custom']);
            const normalizedEdges = data.edges.map((e: any) => {
                const needsFix = STANDARD_EDGE_TYPES.has(e.type) || !e.markerEnd;
                if (!needsFix) return e;
                return {
                    ...e,
                    type: 'advanced-smart-step',
                    markerEnd: e.markerEnd || { type: 'arrowclosed' },
                    data: e.data || { auto: ['source', 'target'] },
                };
            });
            processedData = { ...data, edges: normalizedEdges };
        }


        // Clear old autosave to prevent stale data leak across diagrams
        const oldStorageKey = `flowchart-autosave-v2-${selectedDiagramId}`;
        if (oldStorageKey !== `flowchart-autosave-v2-${id}`) {
            localStorage.removeItem(oldStorageKey);
        }

        if (processedData && processedData.nodes) {
            // Write to localStorage so the new component can reliably load it on mount,
            // regardless of React reconciliation timing.
            const storageKey = `flowchart-autosave-v2-${id}`;
            localStorage.setItem(storageKey, JSON.stringify({
                diagramId: id,
                nodes: processedData.nodes,
                edges: processedData.edges || [],
                layout: processedData.layout,
                metadata: processedData.metadata,
                timestamp: Date.now(),
                version: '1.0',
                isFreshSeed: true
            }));
        }

        // Persist the selected ID for the host storage
        try { localStorage.setItem('diagramMenu.selectedDiagramId', id); } catch {}

        // 清理旧图表的 bridge，防止失效引用在内存中积累
        try {
            const bridge = (window as any).__flowDataBridge;
            if (bridge && selectedDiagramId && selectedDiagramId !== id) {
                delete bridge[selectedDiagramId];
            }
        } catch { /* ignore */ }

        // HashRouter 需要直接操作 hash 并重载，setSearchParams/setRefreshNonce
        // 均无法在异步回调中可靠触发 React 重渲染。
        // localStorage 已写入 isFreshSeed 数据，重载后会被 useDesignerSystemSync 消费。
        window.location.hash = `#/?diagram=${id}`;
        requestAnimationFrame(() => window.location.reload());
    }, [selectedDiagramId]);
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

    useEffect(() => {
        if (!isCommandOpen) return;
        const read = () => {
            try {
                const fraw = localStorage.getItem('diagramMenu.favorites');
                const fparsed: unknown = fraw ? JSON.parse(fraw) : [];
                const favorites = Array.isArray(fparsed) ? fparsed.map(String) : [];
                const rraw = localStorage.getItem('diagramMenu.recent');
                const rparsed: unknown = rraw ? JSON.parse(rraw) : [];
                const recent = Array.isArray(rparsed) ? rparsed.map(String) : [];
                const opraw = localStorage.getItem('commandPalette.recent');
                const opparsed: unknown = opraw ? JSON.parse(opraw) : [];
                const recentOps = Array.isArray(opparsed) ? opparsed.map(String).filter(id => String(id).startsWith('op:')) : [];
                queueMicrotask(() => {
                    setCommandFavorites(favorites);
                    setCommandRecent(recent);
                    setCommandRecentOps(recentOps.slice(0, 8));
                });
            } catch { void 0; }
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
        const onKeyDown = (e: KeyboardEvent) => {
            const mod = e.ctrlKey || e.metaKey;
            if (e.key === 'Escape') {
                try {
                    if (document.fullscreenElement) {
                        e.preventDefault();
                        handleFsControl();
                    }
                } catch (error) {
                    if (process.env.NODE_ENV === 'development') {
                        console.error('Failed to exit fullscreen on Escape', error);
                    }
                }
            }
            // [NEW] Debug Panel Toggle (Ctrl+Shift+D)
            if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
                e.preventDefault();
                setShowDebugPanel(prev => !prev);
            }

            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                setIsCommandOpen(true);
            }

            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                setIsSettingsOpen(true);
            }

            // Global Actions (Command Palette matches)
            if (e.altKey && (e.key === 'n' || e.key === 'N')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'add-node' }}));
            }
            if (mod && (e.key === 'j' || e.key === 'J')) {
                e.preventDefault();
                const aiBtn = document.querySelector('[data-id="toolbar-ai-btn"]') || document.querySelector('.toolbar-button-ai');
                if (aiBtn) (aiBtn as HTMLButtonElement).click();
            }
            if (mod && e.shiftKey && (e.key === 'l' || e.key === 'L')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'smart-layout' }}));
            }
            if (mod && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'export-png' }}));
            }
            if (mod && e.shiftKey && (e.key === 't' || e.key === 'T')) {
                e.preventDefault();
                const themeBtn = document.querySelector('[data-id="toolbar-theme-btn"]');
                if (themeBtn) (themeBtn as HTMLButtonElement).click();
            }
            if (e.key === 'Escape' && isPresentationMode) {
                setIsPresentationMode(false);
                // 演示模式退出提示（使用 appMessage 避免 ConfigProvider 外调用崩溃）
                appMessage.info(t('diagramViewer.presentation.exit'));
            }
        };
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
                if (process.env.NODE_ENV === 'development') {
                    console.error('Failed to initialize edge mode from layered config', error);
                }
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
        try {
            const url = new URL(window.location.href);
            url.searchParams.set('diagram', String(id));
            window.open(url.toString(), '_blank');
        } catch {
            window.open(`/?diagram=${encodeURIComponent(String(id))}`, '_blank');
        }
    }, []);

    const commandItems: CommandItem[] = useMemo(() => {
        const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
        const mod = isMac ? '⌘' : 'Ctrl';
        const ops: CommandItem[] = [
            {
                id: 'op:shortcuts',
                group: 'actions',
                title: t('designer.commandItems.shortcuts', '快捷键 / Shortcuts'),
                keywords: ['快捷键', 'shortcuts', '帮助', 'help'],
                shortcut: '?',
                onSelect: () => setIsShortcutsOpen(true)
            },
            {
                id: 'op:settings',
                group: 'actions',
                title: t('designer.commandItems.settings', '配置面板 / Settings'),
                keywords: ['设置', '配置', 'drawer', 'settings'],
                shortcut: `${mod}+,`,
                onSelect: () => setIsSettingsOpen(true)
            },
            {
                id: 'op:toggleFullscreen',
                group: 'actions',
                title: isFullscreen ? t('designer.commandItems.exitFullscreen', '退出全屏 / Exit Fullscreen') : t('designer.commandItems.enterFullscreen', '进入全屏 / Fullscreen'),
                keywords: ['全屏', 'fullscreen'],
                shortcut: 'Esc',
                onSelect: () => handleToggleFullscreen()
            },
            {
                id: 'op:smartLayout',
                group: 'actions',
                title: t('designer.commandItems.smartLayout', '智能布局 / Smart Layout'),
                keywords: ['布局', '整理', 'layout', 'smart'],
                shortcut: `${mod}+Shift+L`,
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'smart-layout' }}))
            },
            {
                id: 'op:addNode',
                group: 'actions',
                title: t('designer.commandItems.addNode', '添加节点 / Add Node'),
                keywords: ['创建', '节点', 'add', 'node', 'create'],
                shortcut: `Alt+N`,
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'add-node' }}))
            },
            {
                id: 'op:triggerAi',
                group: 'actions',
                onSelect: () => {
                    const aiBtn = document.querySelector('[data-id="toolbar-ai-btn"]') || document.querySelector('.toolbar-button-ai');
                    if (aiBtn) (aiBtn as HTMLButtonElement).click();
                }
            },
            {
                id: 'op:importMermaid',
                group: 'actions',
                title: t('designer.commandItems.importMermaid', '从 Mermaid 导入 / Import Mermaid'),
                keywords: ['mermaid', 'import', 'code', 'markdown', '导入', '代码'],
                shortcut: `${mod}+Shift+M`,
                onSelect: () => setMermaidModalVisible(true)
            },
            {
                id: 'op:themeNext',
                group: 'actions',
                title: t('designer.commandItems.themeNext', '切换下一个主题 / Next Theme'),
                keywords: ['主题', 'theme', 'color', 'style'],
                shortcut: `${mod}+Shift+T`,
                onSelect: () => {
                    const themeBtn = document.querySelector('[data-id="toolbar-theme-btn"]');
                    if (themeBtn) (themeBtn as HTMLButtonElement).click();
                }
            },
            {
                id: 'op:exportPng',
                group: 'actions',
                title: t('designer.commandItems.exportPng', '导出 PNG / Export PNG'),
                keywords: ['导出', '图片', 'export', 'png', 'image'],
                shortcut: `${mod}+Shift+E`,
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'export-png' }}))
            },
            {
                id: 'op:clearCanvas',
                group: 'actions',
                title: t('designer.commandItems.clearCanvas', '清空画布 / Clear Canvas'),
                keywords: ['清空', '重置', 'clear', 'reset'],
                onSelect: () => window.dispatchEvent(new CustomEvent('editor:command', { detail: { action: 'clear-canvas' }}))
            },
            {
                id: 'op:docs',
                group: 'actions',
                title: t('designer.commandItems.docs', '文档 / Documentation'),
                keywords: ['docs', '文档', 'help'],
                onSelect: () => navigate('/docs'),
                onAltSelect: () => window.open('/docs', '_blank')
            },
            {
                id: 'op:manage',
                group: 'actions',
                title: t('designer.commandItems.manage', '管理 / Management'),
                keywords: ['manage', '管理', 'admin'],
                onSelect: () => navigate('/manage'),
                onAltSelect: () => window.open('/manage', '_blank')
            },
            {
                id: 'op:clearFavorites',
                group: 'actions',
                title: t('designer.commandItems.clearFavorites', '清空收藏 / Clear Favorites'),
                keywords: ['收藏', 'favorites', '清空'],
                onSelect: () => {
                    try { localStorage.setItem('diagramMenu.favorites', JSON.stringify([])); } catch { void 0; }
                    window.dispatchEvent(new CustomEvent('diagramMenuFavoritesChanged'));
                }
            }
        ];

        const opsById = new Map(ops.map(op => [op.id, op]));
        const recentOps: CommandItem[] = [];
        const recentOpSet = new Set<string>();
        for (const id of commandRecentOps) {
            const it = opsById.get(String(id));
            if (!it) continue;
            recentOpSet.add(String(id));
            recentOps.push({ ...it, group: 'recent' });
        }

        const opsRest = ops.filter(op => !recentOpSet.has(op.id));

        const byId = new Map(diagramDefinitions.map(d => [String(d.id), d]));
        const used = new Set<string>();
        const diagramOps: CommandItem[] = [];

        for (const id of commandFavorites) {
            const d = byId.get(String(id));
            if (!d) continue;
            used.add(String(d.id));
            diagramOps.push({
                id: `diagram:${d.id}`,
                group: 'favorites',
                title: d.name,
                description: d.description || undefined,
                keywords: [String(d.category || ''), ...(d.tags || [])].filter(Boolean),
                meta: [String(d.category || 'other')].filter(Boolean),
                onSelect: () => handleSelectDiagram(d.id),
                onAltSelect: () => openDiagramInNewTab(d.id)
            });
        }

        for (const id of commandRecent) {
            const d = byId.get(String(id));
            if (!d) continue;
            if (used.has(String(d.id))) continue;
            used.add(String(d.id));
            diagramOps.push({
                id: `diagram:${d.id}`,
                group: 'recent',
                title: d.name,
                description: d.description || undefined,
                keywords: [String(d.category || ''), ...(d.tags || [])].filter(Boolean),
                meta: [String(d.category || 'other')].filter(Boolean),
                onSelect: () => handleSelectDiagram(d.id),
                onAltSelect: () => openDiagramInNewTab(d.id)
            });
        }

        for (const d of diagramDefinitions) {
            if (used.has(String(d.id))) continue;
            diagramOps.push({
                id: `diagram:${d.id}`,
                group: 'diagrams',
                title: d.name,
                description: d.description || undefined,
                keywords: [String(d.category || ''), ...(d.tags || [])].filter(Boolean),
                meta: [String(d.category || 'other')].filter(Boolean),
                onSelect: () => handleSelectDiagram(d.id),
                onAltSelect: () => openDiagramInNewTab(d.id)
            });
        }

        return [...recentOps, ...opsRest, ...diagramOps];
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
                                                const provider = unifiedStorage.getProvider(providerName);
                                                const savedDiagram = await provider.loadDiagram(leafKey);
                                                if (savedDiagram && savedDiagram.content) {
                                                    const normalized = {
                                                        ...savedDiagram.content,
                                                        id: savedDiagram.id,
                                                        name: savedDiagram.title || savedDiagram.content.name,
                                                        metadata: {
                                                            ...(savedDiagram.content.metadata || {}),
                                                            title: savedDiagram.title,
                                                            cloud: { provider: providerName, id: savedDiagram.id, title: savedDiagram.title }
                                                        }
                                                    };
                                                    seedAutoSaveAndNavigate(normalized, savedDiagram.id);
                                                } else {
                                                    appMessage.error(t('storage.manager.noContent'));
                                                }
                                            } catch (e: any) {
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
                                                        const baseData = {
                                                            ...data.content,
                                                            id: data.id,
                                                            name: data.title || data.content.name,
                                                            metadata: {
                                                                ...(data.content.metadata || {}),
                                                                title: data.title
                                                            }
                                                        };
                                                        const { coerceToStandardDiagramData } = await import('@/core/utils/coerceDiagram');
                                                        const normalized = coerceToStandardDiagramData(baseData, { id: data.id, title: data.title });
                                                        seedAutoSaveAndNavigate(normalized, data.id);
                                                    } else {
                                                        appMessage.error('模板内容为空');
                                                    }
                                                }
                                            } catch (e: any) {
                                                appMessage.error(`加载失败: ${e.message}`);
                                            } finally {
                                                messageKey();
                                            }
                                        } else {
                                            if (rootGroup === 'local-workspace') {
                                                const d = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
                                                if (d) {
                                                    try {
                                                        const maps = JSON.parse(d);
                                                        const found = maps[leafKey];
                                                        if (found) {
                                                            const trueId = found.id || leafKey;
                                                            seedAutoSaveAndNavigate(found, trueId);
                                                            return;
                                                        }
                                                    } catch (e) { }
                                                }
                                            }
                                            
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
                                                try {
                                                    localStorage.removeItem(`flowchart-autosave-v2-${leafKey}`);
                                                    localStorage.removeItem(`GenericStandardDiagram.customPresets.${leafKey}`);
                                                } catch (e) {
                                                    console.warn('Failed to clear autosave data:', e);
                                                }
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
                <ShortcutsHelpModal
                    open={isShortcutsOpen}
                    onClose={() => setIsShortcutsOpen(false)}
                    getContainer={() => document.getElementById('app-root-layout') || document.body}
                />
                <CollaborationModal
                    open={collabModalVisible}
                    onClose={() => setCollabModalVisible(false)}
                    activeUsers={activeUsers || []}
                    roomName={roomName}
                />
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
                                                renderAIChatPanel={
                                                    <Suspense fallback={<div className="p-4 text-center text-gray-500">Loading AI...</div>}>
                                                        <AIChatView
                                                            onOpenConfig={() => setAiConfigVisible(true)}
                                                            pluginId={resolvedPluginId || 'flowchart-diagram'}
                                                            onPreviewJson={(json: string) => {
                                                                const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                if (bridge && bridge.importData) {
                                                                    try {
                                                                        const obj = JSON.parse(json);
                                                                        bridge.importData(obj, { keepHistory: true });
                                                                    } catch (e) {
                                                                        // ignore
                                                                    }
                                                                }
                                                            }}
                                                            onApplyJson={(json: string) => {
                                                                const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                if (bridge && bridge.importData) {
                                                                    try {
                                                                        const obj = JSON.parse(json);
                                                                        bridge.importData(obj, { keepHistory: true });
                                                                    } catch (e) {
                                                                        // ignore
                                                                    }
                                                                }
                                                            }}
                                                            diagramNodesRef={aiNodesRef as any}
                                                            diagramEdgesRef={aiEdgesRef as any}
                                                            canvasOps={{
                                                                onAddNode: (label, shape) => {
                                                                    const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                    if (bridge?.addNode) {
                                                                        return bridge.addNode({ label, shape });
                                                                    }
                                                                },
                                                                onDeleteNodes: (ids) => {
                                                                    const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                    if (bridge?.deleteNodes) {
                                                                        bridge.deleteNodes(ids);
                                                                    }
                                                                },
                                                                onConnectNodes: (source, target, label) => {
                                                                    const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                    if (bridge?.connectNodes) {
                                                                        bridge.connectNodes({ source, target, label });
                                                                    }
                                                                },
                                                                onAutoLayout: (strategy) => {
                                                                    const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                    if (bridge?.triggerLayout) {
                                                                        bridge.triggerLayout(strategy);
                                                                    }
                                                                },
                                                                onGroupNodes: (ids, name) => {
                                                                    const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                    if (bridge?.onGroupNodes) {
                                                                        bridge.onGroupNodes(ids, name);
                                                                    }
                                                                },
                                                                onAnalyze: () => {
                                                                    const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                    if (bridge?.onAnalyze) {
                                                                        return bridge.onAnalyze();
                                                                    }
                                                                    return { summary: t('diagramViewer.ai.analyzeError'), nodes: [], issues: [] };
                                                                },
                                                                onExport: (type) => {
                                                                    if (type === 'png') exportToPNG();
                                                                    else if (type === 'pdf') exportToPDF();
                                                                    else if (type === 'svg') exportToSVG();
                                                                    else if (type === 'gif') exportToGIF();
                                                                },
                                                                onSave: () => {
                                                                    handleDirectSave();
                                                                },
                                                                onShare: () => {
                                                                    setCollabModalVisible(true);
                                                                },
                                                                onUpdateTheme: (styles) => {
                                                                    let styleTag = document.getElementById('ai-dynamic-theme');
                                                                    if (!styleTag) {
                                                                        styleTag = document.createElement('style');
                                                                        styleTag.id = 'ai-dynamic-theme';
                                                                        document.head.appendChild(styleTag);
                                                                    }
                                                                    const cssVars = Object.entries(styles)
                                                                        .map(([key, value]) => `  --${key}: ${value} !important;`)
                                                                        .join('\n');
                                                                    styleTag.innerHTML = `:root {\n${cssVars}\n}`;
                                                                    appMessage.success(t('diagramViewer.aiThemeApplied'));
                                                                },
                                                                onTogglePresentation: (active) => {
                                                                    setIsPresentationMode(active);
                                                                    if (active && !isFullscreen) {
                                                                        handleToggleFullscreen();
                                                                    }
                                                                },
                                                                onAnimatePath: (ids, options) => {
                                                                    const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
                                                                    if (bridge?.animatePath) {
                                                                        bridge.animatePath(ids, options);
                                                                    }
                                                                }
                                                            }}
                                                            onClose={() => {
                                                                const aiBtn = document.querySelector('.toolbar-button-ai');
                                                                if (aiBtn) aiBtn.click();
                                                            }}
                                                        />
                                                    </Suspense>
                                                }
                                                onAiTabIntercept={useCallback(() => {
                                                    if (!hasFeature('ai-assistant')) {
                                                        showUpgradeModal(t('diagramViewer.aiAssistant'));
                                                        return false;
                                                    }
                                                    return true;
                                                }, [hasFeature, showUpgradeModal, t])}
                                                renderThemeSelector={
                                                    <EnhancedThemeSelector />
                                                }
                                                renderAIConfigModal={
                                                    <Suspense fallback={<div />}>
                                                        <AIConfigModal
                                                            open={aiConfigVisible}
                                                            onCancel={() => setAiConfigVisible(false)}
                                                            onSave={() => setAiConfigVisible(false)}
                                                        />
                                                    </Suspense>
                                                }
                                                renderShareDialog={
                                                    <ShareDialog
                                                        open={shareDialogOpen}
                                                        onClose={closeShareDialog}
                                                        diagramId={selectedDiagramId}
                                                        onEnsureSaved={ensureSaved}
                                                    />
                                                }
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

                            <CloudStorageManagerModal
                                open={cloudManagerVisible}
                                onCancel={() => setCloudManagerVisible(false)}
                                onSelect={(data) => {
                                    seedAutoSaveAndNavigate(data, data.id);
                                }}
                            />

                            <MermaidImportModal 
                                visible={mermaidModalVisible}
                                onClose={() => setMermaidModalVisible(false)}
                                onImport={handleImportMermaidNodes}
                            />
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
