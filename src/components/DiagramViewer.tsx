// @ts-nocheck
import React, { Suspense, useState, useRef, useEffect, ErrorInfo, ReactNode, lazy, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaCog } from 'react-icons/fa';
import Button from 'antd/es/button';
import Spin from 'antd/es/spin';
import Result from 'antd/es/result';
import { ConfigProvider } from 'antd';
import { useTranslation } from 'react-i18next';
import { useDiagramControls } from '@/core';
import { useUIState } from '@/core';
import { diagramDefinitions } from '../data/diagram-definitions';
import { DiagramSettingsPanel } from './ui/DiagramSettingsPanel';
import { EnhancedThemeSelector } from './ui/EnhancedThemeSelector';
import { DiagramThemeProvider } from '@/core/themes/DiagramThemeProvider';
import { useConfigIntegration, useConfigValue } from '@/core';
import { useDiagramHostStorage } from '@/core';
import { useSubscription } from '../context/SubscriptionContext';

import { DiagramControlBridge } from '@/core';
import { dispatchDiagramControl } from '@/core';
import { RoutingDebugPanel } from './debug/RoutingDebugPanel';
import { LayeredConfigManager, ConfigLayer } from '@/core';
import { DiagramLayout } from './layout/DiagramLayout';
import { CommandPalette, CommandItem } from '@/core';
import { createPortal } from 'react-dom';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { MdDragIndicator } from 'react-icons/md';
import { ShortcutsHelpModal } from '@/core';
import { useYjsCollaboration } from './diagrams/collaboration/YjsProviderHooks';
import { useCloudSave } from './diagrams/hooks/useCloudSave';
import AIConfigModal from './ai/AIConfigModal';
import { AIChatView } from './ai/AIChatPanel';
import ShareDialog from './diagrams/ShareDialog';
import { CloudOutlined, AppstoreOutlined, FolderOpenOutlined, LockOutlined, UnlockOutlined, HomeOutlined } from '@ant-design/icons';
import { Dropdown, Tooltip, Switch, message, Modal, Input } from 'antd';
import { CloudStorageManagerModal } from './storage/CloudStorageManagerModal';
import { dataService } from '@/services/DataService';
import { PRESET_MAP } from '@/data/standardized';
import { CUSTOM_PRESETS_STORAGE_KEY } from './diagrams/ui/TemplateCascaderMenu';
import { unifiedStorage } from '@/services/UnifiedStorageService';
import { tryAttachDiagramSnapshot } from '@/core';
import { invalidateRemoteDiagramPreview } from '@/core';
import { TemplateCascaderMenu } from './diagrams/ui/TemplateCascaderMenu';



import { DraggableSettingsPanel } from './ui/DraggableSettingsPanel';
import { resolvePluginId } from '@/core/plugins/registry';

import { ErrorBoundary } from './ui/ErrorBoundary';

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
    const [refreshNonce, setRefreshNonce] = useState(0);

    // =============== Phase 5: IoC 依赖注入层 =================
    const YJS_WS_URL = import.meta.env.VITE_YJS_WEBSOCKET_URL || 'ws://localhost:1234';
    const { isSynced: isYjsSynced, pushLocalChangesToYjs } = useYjsCollaboration({
        roomName: `room-${selectedDiagramId}`,
        serverUrl: YJS_WS_URL,
        token: jwtToken || 'guest',
        enabled: hasFeature('cloud-sync')
    });

    const { saveToCloud, shareDialogOpen, openShareDialog, closeShareDialog, ensureSaved } = useCloudSave(selectedDiagramId);
    const [aiConfigVisible, setAiConfigVisible] = useState(false);
    const [cloudManagerVisible, setCloudManagerVisible] = useState(false);

    const aiNodesRef = useMemo(() => ({
        get current() {
            return (window as any).__flowDataBridge?.[selectedDiagramId]?.getSnapshot()?.nodes || [];
        }
    }), [selectedDiagramId]);

    const aiEdgesRef = useMemo(() => ({
        get current() {
            return (window as any).__flowDataBridge?.[selectedDiagramId]?.getSnapshot()?.edges || [];
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
            const doc = dataService.getDiagram(selectedDiagramId);
            return doc?.type;
        } catch { return undefined; }
    }, [selectedDiagramId, selectedDiagram]);

    // Bridge: diagram.type → plugin registry ID
    // template type 值与 plugin.id 注册名之间存在历史差异，此映射表统一桥接
    const resolvedPluginId = resolvePluginId(docType);

    const SelectedDiagramComponent = useMemo(() => {
        if (selectedDiagram?.component) return selectedDiagram.component;

        if (resolvedPluginId) {
            // Dynamically load UnifiedDesigner for recognized plugin types
            return lazy(() => import('@/core').then(m => {
                return {
                    default: (props: any) => React.createElement(m.UnifiedDesigner, { ...props, pluginId: resolvedPluginId })
                };
            }));
        }

        // Fallback to FlowchartDesigner if not found
        return lazy(() => import('@/core').then(m => ({ default: m.FlowchartDesigner })));
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

    /** 更强大的多端另存为统筹逻辑 */
    const handleSaveTo = useCallback(async (target: 's3' | 'supabase' | 'local') => {
        const bridge = (window as any).__flowDataBridge?.[selectedDiagramId];
        if (!bridge || !bridge.nodes) {
            message.error('未找到图表数据，无法保存');
            return;
        }

        const defaultName = bridge.metadata?.title || bridge.name || selectedDiagramId;

        let newName = defaultName;
        // 使用简易模态交互提供命名的机会
        Modal.confirm({
            title: `另存为至 ${target.toUpperCase()}...`,
            content: (
                <div style={{ marginTop: 16 }}>
                    <p style={{ marginBottom: 8, color: '#666' }}>请输入图表名称：</p>
                    <Input
                        defaultValue={defaultName}
                        onChange={e => newName = e.target.value} />
                </div>
            ),
            onOk: async () => {
                if (!newName || !newName.trim()) {
                    message.error('名称不能为空');
                    return;
                }
                const nameStr = newName.trim();
                const hide = message.loading(`正在保存至 ${target}...`, 0);
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
                        const map = raw ? JSON.parse(raw) : {};
                        map[nameStr] = dataToSave;
                        localStorage.setItem(CUSTOM_PRESETS_STORAGE_KEY, JSON.stringify(map));
                        message.success('已存入本地模板库');

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
                        message.success('存入云端成功');
                    }
                } catch (e: any) {
                    message.error(`保存失败：${e.message || String(e)}`);
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
            const hide = message.loading(`覆盖保存至 ${cloudMeta.provider}...`, 0);
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
                message.success('覆盖保存成功');
            } catch (e: any) {
                message.error(`覆盖出错: ${e.message}`);
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



    // 构建通过 IoC 模式下发的商业级高级操作菜单
    const extraExportItems = useMemo(() => [
        {
            key: 'pro-export-pdf',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: '140px' }}>
                    <span>多页无缝 PDF 导出</span>
                    <span style={{ fontSize: '14px', marginLeft: 8 }} title="Pro 功能">👑</span>
                </div>
            ),
            onClick: () => {
                if (!hasFeature('export-pdf')) {
                    showUpgradeModal('多页无缝 PDF 导出');
                } else {
                    // TODO: 真正的云渲染
                }
            }
        },
        {
            key: 'pro-export-svg',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minWidth: '140px' }}>
                    <span>超高清矢量 SVG</span>
                    <span style={{ fontSize: '14px', marginLeft: 8 }} title="Pro 功能">👑</span>
                </div>
            ),
            onClick: () => {
                if (!hasFeature('export-hd-svg')) {
                    showUpgradeModal('超高清矢量 SVG 导出');
                } else {
                    // TODO: 真正的云渲染
                }
            }
        }
    ], [hasFeature, showUpgradeModal]);

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
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [handleFsControl]);

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
                title: t('designer.commandItems.shortcuts'),
                keywords: ['快捷键', 'shortcuts', '帮助', 'help'],
                shortcut: '?',
                onSelect: () => setIsShortcutsOpen(true)
            },
            {
                id: 'op:settings',
                group: 'actions',
                title: t('designer.commandItems.settings'),
                keywords: ['设置', '配置', 'drawer'],
                shortcut: `${mod}+,`,
                onSelect: () => setIsSettingsOpen(true)
            },
            {
                id: 'op:toggleFullscreen',
                group: 'actions',
                title: isFullscreen ? t('designer.commandItems.exitFullscreen') : t('designer.commandItems.enterFullscreen'),
                keywords: ['全屏', 'fullscreen'],
                shortcut: 'Esc',
                onSelect: () => handleToggleFullscreen()
            },

            {
                id: 'op:docs',
                group: 'actions',
                title: t('designer.commandItems.docs'),
                keywords: ['docs', '文档'],
                onSelect: () => navigate('/docs'),
                onAltSelect: () => window.open('/docs', '_blank')
            },
            {
                id: 'op:manage',
                group: 'actions',
                title: t('designer.commandItems.manage'),
                keywords: ['manage', '管理'],
                onSelect: () => navigate('/manage'),
                onAltSelect: () => window.open('/manage', '_blank')
            },
            {
                id: 'op:clearFavorites',
                group: 'actions',
                title: t('designer.commandItems.clearFavorites'),
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

                                        const seedAutoSaveAndNavigate = async (data: any, id: string) => {
                                            let processedData = data;
                                            
                                            // Check if it's a standardized data payload that requires auto-layout (no positional info)
                                            // Provide safe fallback checks if the node's position doesn't exist
                                            const needsAutoLayout = data && data.nodes && data.nodes.length > 0 && (!data.nodes[0].position || data.nodes[0].position.x === undefined);
                                            
                                            if (needsAutoLayout) {
                                                try {
                                                    const { standardDataToCanvas } = await import('@/core/components/diagrams/designerUtils');
                                                    const layoutResult = await standardDataToCanvas(data);
                                                    
                                                    processedData = {
                                                        ...data,
                                                        nodes: layoutResult.nodes,
                                                        edges: layoutResult.edges || data.edges || [],
                                                        // Ensure a layout config exists
                                                        layout: data.layout || { type: 'DomainDagreLayout', direction: 'TB' }
                                                    };
                                                } catch (err) {
                                                    console.warn('[DiagramViewer] Standard data layout fallback execution failed:', err);
                                                }
                                            }

                                            if (processedData && processedData.nodes) {
                                                const storageKey = `flowchart-autosave-v2-${id}`;
                                                localStorage.setItem(storageKey, JSON.stringify({
                                                    nodes: processedData.nodes,
                                                    edges: processedData.edges || [],
                                                    layout: processedData.layout,
                                                    metadata: processedData.metadata,
                                                    timestamp: Date.now(),
                                                    version: '1.0'
                                                }));
                                            }
                                            handleSelectDiagram(id);
                                        };

                                        if (rootGroup === 's3' || rootGroup === 'cloud') {
                                            const providerName = rootGroup === 's3' ? 's3' : 'supabase';
                                            const messageKey = message.loading(t('storage.manager.downloading'), 0);
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
                                                    seedAutoSaveAndNavigate(normalized, leafKey);
                                                } else {
                                                    message.error(t('storage.manager.noContent'));
                                                }
                                            } catch (e: any) {
                                                message.error("加载云端图表失败: " + e.message);
                                            } finally {
                                                messageKey();
                                            }
                                        } else if (rootGroup === 'local-workspace') {
                                            const d = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
                                            if (d) {
                                                try {
                                                    const maps = JSON.parse(d);
                                                    const found = maps[leafKey];
                                                    if (found) {
                                                        seedAutoSaveAndNavigate(found, leafKey);
                                                    }
                                                } catch (e) { }
                                            }
                                        } else {
                                            const preset = PRESET_MAP[leafKey];
                                            if (preset) {
                                                seedAutoSaveAndNavigate({
                                                    ...preset,
                                                    id: leafKey,
                                                    metadata: { ...preset.metadata, title: preset.name }
                                                }, leafKey);
                                            } else {
                                                handleSelectDiagram(leafKey);
                                            }
                                        }
                                    }}
                                />
                            </div>
                            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/20 mx-1" />

                            {selectedDiagramId === 'architecture-diagram' && (
                                <button
                                    className="flex items-center justify-center gap-1 px-2 py-1.5 bg-white/50 hover:bg-black/5 dark:bg-[#1e293b]/50 dark:hover:bg-white/10 text-xs font-medium text-gray-700 dark:text-gray-300 rounded-md transition-colors border-none outline-none cursor-pointer"
                                    onClick={() => dispatchDiagramControl('toggleFlowDirection', 'architecture-diagram')}
                                >
                                    {t('designer.viewer.toggleFlowDirection')}
                                </button>
                            )}
                            <button
                                className="flex items-center justify-center gap-1 px-2 py-1.5 bg-white/50 hover:bg-black/5 dark:bg-[#1e293b]/50 dark:hover:bg-white/10 text-xs font-medium text-gray-700 dark:text-gray-300 rounded-md transition-colors border-none outline-none cursor-pointer"
                                onClick={() => setCloudManagerVisible(true)}
                            >
                                <CloudOutlined /> 网盘 <span style={{ fontSize: '11px', opacity: 0.5 }}>👑</span>
                            </button>
                            <Tooltip title="防误触保护只读锁 (阅览展示推荐)">
                                <Switch
                                    size="small"
                                    checked={isReadonly}
                                    onChange={setIsReadonly}
                                    checkedChildren={<LockOutlined />}
                                    unCheckedChildren={<UnlockOutlined />}
                                    style={{ marginLeft: 4 }}
                                />
                            </Tooltip>
                        </>
                    ),
                    rightChildren: (
                        <>
                            <button
                                className={`flex items-center justify-center w-[30px] h-[30px] rounded-md transition-colors border-none outline-none cursor-pointer text-slate-600 dark:text-slate-400 ${isSettingsOpen ? 'bg-indigo-500/10 text-indigo-500' : 'bg-transparent hover:bg-indigo-500/10 hover:text-indigo-500'}`}
                                onClick={() => setIsSettingsOpen(prev => !prev)}
                                title={t('designer.viewer.moreSettings')}
                            >
                                <FaCog />
                            </button>
                            {/* 悬浮拖拽设置面板 Portal */}
                            {isSettingsOpen && <DraggableSettingsPanel
                                onClose={() => setIsSettingsOpen(false)}
                                title={t('designer.viewer.moreSettings')}
                            >
                                {settingsPanel}
                            </DraggableSettingsPanel>}
                        </>
                    )
                }}
                showMenu={false}
            >
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
                                                key={selectedDiagramId}
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
                                                onCloudSave={saveToCloud}
                                                onDirectSave={handleDirectSave}
                                                isDirectSaveDisabled={false}
                                                onSaveAsTo={handleSaveTo}
                                                shareDialogOpen={shareDialogOpen}
                                                onOpenShareDialog={openShareDialog}
                                                onCloseShareDialog={closeShareDialog}
                                                onEnsureSaved={ensureSaved}
                                                showAiCrown={true}
                                                renderAIChatPanel={
                                                    <AIChatView
                                                        onOpenConfig={() => setAiConfigVisible(true)}
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
                                                        onClose={() => {
                                                            const aiBtn = document.querySelector('.toolbar-button-ai');
                                                            if (aiBtn) aiBtn.click();
                                                        }}
                                                    />
                                                }
                                                onAiTabIntercept={useCallback(() => {
                                                    if (!hasFeature('ai-assistant')) {
                                                        showUpgradeModal('AI 架构助手');
                                                        return false;
                                                    }
                                                    return true;
                                                }, [hasFeature, showUpgradeModal])}
                                                renderThemeSelector={
                                                    <EnhancedThemeSelector />
                                                }
                                                renderAIConfigModal={
                                                    <AIConfigModal
                                                        open={aiConfigVisible}
                                                        onCancel={() => setAiConfigVisible(false)}
                                                        onSave={() => setAiConfigVisible(false)}
                                                    />
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

                                <CloudStorageManagerModal
                                    open={cloudManagerVisible}
                                    onCancel={() => setCloudManagerVisible(false)}
                                    onSelect={(data) => {
                                        handleSelectDiagram(data.id);
                                    }}
                                />
                            </ErrorBoundary>
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
