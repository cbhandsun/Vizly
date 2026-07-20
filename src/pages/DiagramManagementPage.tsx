import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import App from 'antd/es/app';
import type { MenuProps } from 'antd/es/menu';
import { coerceDiagramId, getQueryOrHashParamFromLocation, type LocationLike } from '@/core/utils/inputBoundary';
import { Cloud, Database, ExternalLink, Pencil, Trash2, User } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { DiagramMetadata } from '../services/storage/types';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import type { ManageStorageProvider } from '@/components/ui/ManageTopToolbar';
import { useAuth } from '@/context/useAuth';
import {
    coerceFilterView,
    createTemplateSeed,
    filterAndSortItems,
    loadDataRegistry,
    loadSupabaseClient,
    loadUnifiedStorage,
    loadWorkspaceItems,
    readStoredCloudProvider,
    type FilterViewType,
    type SortKey,
    type TemplateKey,
    type UnifiedDiagramItem,
    type ViewMode,
} from './diagramManagementPage.helpers';
import './WorkspaceDashboard.css';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { upsertDiagramConfigIndex } from '@/core/utils/diagramTypeStorage';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { WorkspaceCompactHeader } from './WorkspaceCompactHeader';
import { WorkspaceDiagramCollection } from './WorkspaceDiagramCollection';
import { WorkspaceGlobalHeader } from './WorkspaceGlobalHeader';

const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};

const WorkspaceDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const browserLocation = typeof window === 'undefined' ? null : window.location as LocationLike;
    const { user } = useAuth();
    const { modal } = App.useApp();
    const initialView = coerceFilterView(searchParams.get('view') || getQueryOrHashParamFromLocation(browserLocation, 'view'));
    
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [activeView, setActiveView] = useState<FilterViewType>(initialView);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortKey, setSortKey] = useState<SortKey>('updated');
    
    const [unifiedItems, setUnifiedItems] = useState<UnifiedDiagramItem[]>([]);
    const [cloudProvider, setCloudProvider] = useState<ManageStorageProvider>(() => {
        const p = searchParams.get('provider');
        if (p === 's3' || p === 'supabase') return p;
        return readStoredCloudProvider();
    });

    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; item: UnifiedDiagramItem } | null>(null);
    const ctxMenuRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = useCallback((e: React.MouseEvent, item: UnifiedDiagramItem) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY, item });
    }, []);

    const openDiagramInNewTab = useCallback((item: UnifiedDiagramItem) => {
        const rawId = item.id || (item.raw as { id?: unknown })?.id;
        const diagramId = coerceDiagramId(rawId);
        if (!diagramId) {
            appMessage.error('Unable to open diagram: missing diagram id.');
            return;
        }
        window.open(`/?diagram=${encodeURIComponent(diagramId)}`, '_blank', 'noopener,noreferrer');
    }, []);

    const navigateToDiagram = useCallback((id: unknown) => {
        const diagramId = coerceDiagramId(id);
        if (!diagramId) {
            appMessage.error('Unable to open diagram: missing diagram id.');
            return;
        }
        navigate(`/?diagram=${encodeURIComponent(diagramId)}`);
    }, [navigate]);

    // Dismiss on click outside or Escape
    useEffect(() => {
        if (!ctxMenu) return;
        const dismiss = () => setCtxMenu(null);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
        document.addEventListener('click', dismiss);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('click', dismiss);
            document.removeEventListener('keydown', onKey);
        };
    }, [ctxMenu]);

    const loadAllData = useCallback(async () => {
        setLoading(true);
        try {
            const nextItems = await loadWorkspaceItems(activeView, cloudProvider, user);
            setUnifiedItems(nextItems);
        } catch (error) {
            safeLog.error('Failed to load dashboard data', redactSensitiveLogValue(error));
            appMessage.error("Failed to load workspace data");
        } finally {
            setLoading(false);
        }
    }, [activeView, cloudProvider, user]);

    useEffect(() => {
        loadAllData();
    }, [loadAllData]);

    // --- Actions ---
    const handleOpenDiagram = async (item: UnifiedDiagramItem) => {
        if (item.source === 'local') {
            const raw = item.raw as StandardDiagramData;
            navigateToDiagram(raw.id);
            return;
        }

        if (item.source === 'supabase' && !user) {
            setIsAuthModalOpen(true);
            return;
        }

        // template 和 general_template 都来自 Supabase system_templates，统一处理
        if (item.source === 'template' || item.source === 'general_template') {
            const templateId = coerceDiagramId(asRecord(item.raw).id);
            if (!templateId) {
                appMessage.error('模版标识无效，无法加载。');
                return;
            }
            const messageKey = appMessage.loading('正在加载模版...', 0);
            try {
                const supabase = await loadSupabaseClient();
                if (supabase) {
                    const { data, error } = await supabase
                        .from('system_templates')
                        .select('content, title, id')
                        .eq('id', templateId)
                        .single();
                    if (!error && data && data.content) {
                        const dataRegistry = await loadDataRegistry();
                        await dataRegistry.initialize();
                        const localService = dataRegistry.getDataService();
                        const clonedId = crypto.randomUUID();
                        const cloned = localService.registerRemoteDiagram(data.content, {
                            id: clonedId,
                            title: data.title,
                        }, true, {
                            id: clonedId,
                            name: data.title,
                            metadata: { title: data.title },
                        });
                        try {
                            upsertDiagramConfigIndex(localStorage, {
                                id: cloned.id,
                                type: cloned.type || 'flowchart',
                                name: cloned.name,
                                updatedAt: Date.now(),
                            });
                        } catch { /* ignore */ }
                        try { localStorage.removeItem(`flowchart-autosave-v2-${cloned.id}`); } catch (_e) {}
                        navigateToDiagram(cloned.id);
                    } else {
                        appMessage.error('模版内容为空，请确认 Supabase 数据已迁移。');
                    }
                }
            } catch (error: unknown) {
                safeLog.error('Failed to load template', redactSensitiveLogValue(error));
                appMessage.error('加载模版失败，请稍后重试。');
            } finally {
                messageKey();
            }
            return;
        }


        const hide = appMessage.loading("Loading diagram from cloud...", 0);
        try {
            const [unifiedStorage, dataRegistry] = await Promise.all([
                loadUnifiedStorage(),
                loadDataRegistry(),
            ]);
            await dataRegistry.initialize();
            const rawObj = item.raw as DiagramMetadata;
            const savedDiagram = await unifiedStorage.loadDiagram(rawObj.id);
            if (savedDiagram) {
                const localService = dataRegistry.getDataService();
                const normalized = localService.registerRemoteDiagram(savedDiagram.content, {
                    id: savedDiagram.id,
                    title: savedDiagram.title,
                }, true, {
                    id: savedDiagram.id,
                    name: savedDiagram.title,
                    metadata: {
                        title: savedDiagram.title,
                        updatedAt: savedDiagram.updated_at,
                        cloud: {
                            provider: item.source,
                            id: savedDiagram.id,
                            title: savedDiagram.title,
                            openedAt: new Date().toISOString()
                        }
                    },
                    isReadonly: item.role === 'viewer'
                });
                // 回写 type 索引，防止刷新后设计器无法识别图表类型
                try {
                    upsertDiagramConfigIndex(localStorage, {
                        id: savedDiagram.id,
                        type: normalized.type || 'flowchart',
                        name: normalized.name,
                        updatedAt: Date.now()
                    });
                } catch { /* ignore */ }
                navigateToDiagram(savedDiagram.id);
            } else {
                appMessage.error("Diagram not found in cloud storage.");
            }
        } catch (error: unknown) {
            safeLog.error('Failed to open cloud diagram', redactSensitiveLogValue(error));
            appMessage.error('Failed to open diagram.');
        } finally {
            hide();
        }
    };

    const handleDeleteDiagram = async (e: { stopPropagation: () => void }, item: UnifiedDiagramItem) => {
        e.stopPropagation();
        modal.confirm({
            title: 'Delete Document',
            content: 'Are you sure you want to completely erase this document? This cannot be undone.',
            okText: 'Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    if (item.source === 'local') {
                        const dataRegistry = await loadDataRegistry();
                        await dataRegistry.initialize();
                        const localService = dataRegistry.getDataService();
                        const rawObj = item.raw as StandardDiagramData;
                        localService.deleteDiagram(rawObj.id);
                    } else {
                        const unifiedStorage = await loadUnifiedStorage();
                        const rawObj = item.raw as DiagramMetadata;
                        await unifiedStorage.deleteDiagram(rawObj.id);
                    }
                    appMessage.success('Deleted successfully');
                    loadAllData();
                } catch (_error) {
                    appMessage.error("Failed to delete diagram.");
                }
            }
        });
    };

    // Advanced Creation Router mapping to correct domains
    const handleCreateTemplate = async (templateKey: TemplateKey) => {
        const templateData = createTemplateSeed(templateKey);

        if (templateData) {
            const dataRegistry = await loadDataRegistry();
            await dataRegistry.initialize();
            const localService = dataRegistry.getDataService();
            const cloned = JSON.parse(JSON.stringify(templateData));
            cloned.id = crypto.randomUUID(); // ensure fresh ID
            // Ensure type is always set for consistent plugin routing
            if (!cloned.type) {
                const TYPE_DEFAULTS: Record<string, string> = {
                    flowchart: 'flowchart', architecture: 'architecture',
                    mindmap: 'mindmap', timeline: 'timeline', blank: 'flowchart'
                };
                cloned.type = TYPE_DEFAULTS[templateKey] || 'flowchart';
            }
            localService.registerDiagram(cloned);
            // Persist diagram type index to localStorage so DiagramViewer
            // can resolve the correct plugin even after a page refresh.
            try {
                upsertDiagramConfigIndex(localStorage, {
                    id: cloned.id,
                    type: cloned.type,
                    name: cloned.name,
                    updatedAt: Date.now(),
                });
            } catch { /* ignore storage errors */ }
            navigateToDiagram(cloned.id);
        }
    };

    // --- Computed Views ---
    const filteredItems = useMemo(
        () => filterAndSortItems(unifiedItems, activeView, searchTerm, sortKey),
        [unifiedItems, activeView, searchTerm, sortKey]
    );

    // --- Settings Menu ---
    const settingsMenu: MenuProps['items'] = [
        {
            key: 's3',
            label: 'Use S3 Cloud Storage',
            icon: <Cloud size={16} strokeWidth={2} />,
            onClick: async () => {
                const unifiedStorage = await loadUnifiedStorage();
                unifiedStorage.setProvider('s3');
                setCloudProvider('s3');
                appMessage.info('Switched purely to S3 Backend');
            }
        },
        {
            key: 'supabase',
            label: 'Use Supabase (Social)',
            icon: <Database size={16} strokeWidth={2} />,
            onClick: async () => {
                const unifiedStorage = await loadUnifiedStorage();
                unifiedStorage.setProvider('supabase');
                setCloudProvider('supabase');
                appMessage.info('Switched purely to Supabase');
            }
        },
        { type: 'divider' },
        {
            key: 'login',
            label: user ? `Logged in as ${user.email}` : 'Login via Supabase',
            icon: <User size={16} strokeWidth={2} />,
            onClick: () => !user && setIsAuthModalOpen(true)
        }
    ];

    return (
        <div className="workspace-dashboard">
            <WorkspaceGlobalHeader
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                onNavigateHome={() => navigate('/manage')}
                settingsMenu={settingsMenu}
                isAuthenticated={Boolean(user)}
                avatarUrl={typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined}
            />
            {/* Main Content Viewport */}
            <main className="workspace-main">
                
                {!searchTerm && (
                    <WorkspaceCompactHeader
                        documentCount={unifiedItems.length}
                        onCreateTemplate={handleCreateTemplate}
                    />
                )}
                <WorkspaceDiagramCollection
                    activeView={activeView}
                    onActiveViewChange={setActiveView}
                    unifiedItems={unifiedItems}
                    filteredItems={filteredItems}
                    sortKey={sortKey}
                    onSortKeyChange={setSortKey}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    loading={loading}
                    onOpenDiagram={handleOpenDiagram}
                    onOpenDiagramInNewTab={openDiagramInNewTab}
                    onContextMenu={handleContextMenu}
                    onDeleteDiagram={handleDeleteDiagram}
                    onCreateBlank={() => handleCreateTemplate('blank')}
                />
            </main>

            {/* Context Menu (Phase 1.3) */}
            {ctxMenu && (
                <div
                    ref={ctxMenuRef}
                    className="diagram-context-menu"
                    style={{ left: ctxMenu.x, top: ctxMenu.y }}
                    onClick={e => e.stopPropagation()}
                >
                    <button className="ctx-menu-item" onClick={() => { handleOpenDiagram(ctxMenu.item); setCtxMenu(null); }}>
                        <Pencil size={14} strokeWidth={2} /> Open
                    </button>
                    <button className="ctx-menu-item" onClick={() => {
                        openDiagramInNewTab(ctxMenu.item);
                        setCtxMenu(null);
                    }}>
                        <ExternalLink size={14} strokeWidth={2} /> Open in new tab
                    </button>
                    {ctxMenu.item.role === 'owner' && (
                        <>
                            <div className="ctx-menu-divider" />
                            <button className="ctx-menu-item danger" onClick={(e) => { handleDeleteDiagram(e, ctxMenu.item); setCtxMenu(null); }}>
                                <Trash2 size={14} strokeWidth={2} /> Delete
                            </button>
                        </>
                    )}
                </div>
            )}

            {isAuthModalOpen && (
                <React.Suspense fallback={null}>
                    <AuthModal open={isAuthModalOpen} onCancel={() => setIsAuthModalOpen(false)} />
                </React.Suspense>
            )}
        </div>
    );
};

export default WorkspaceDashboardPage;
