import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import App from 'antd/es/app';
import type { MenuProps } from 'antd/es/menu';
import { coerceDiagramId, getQueryOrHashParamFromLocation, type LocationLike } from '@/core/utils/inputBoundary';
import { Cloud, Database, ExternalLink, Pencil, Trash2, User } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ManageStorageProvider } from '@/components/ui/ManageTopToolbar';
import { useAuth } from '@/context/useAuth';
import {
    coerceFilterView,
    filterAndSortItems,
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
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { WorkspaceCompactHeader } from './WorkspaceCompactHeader';
import { WorkspaceDiagramCollection } from './WorkspaceDiagramCollection';
import { WorkspaceGlobalHeader } from './WorkspaceGlobalHeader';
import { createWorkspaceDiagramActions } from './diagramManagementActions';

const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

const workspaceDiagramActions = createWorkspaceDiagramActions();

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
        const isTemplate = item.source === 'template' || item.source === 'general_template';
        const needsLoadingMessage = item.source !== 'local' && !(item.source === 'supabase' && !user);
        const hide = needsLoadingMessage
            ? appMessage.loading(isTemplate ? '正在加载模版...' : 'Loading diagram from cloud...', 0)
            : null;
        try {
            const result = await workspaceDiagramActions.openDiagram(item, Boolean(user));
            switch (result.kind) {
                case 'navigate':
                    navigateToDiagram(result.diagramId);
                    break;
                case 'auth-required':
                    setIsAuthModalOpen(true);
                    break;
                case 'invalid-id':
                    appMessage.error(isTemplate ? '模版标识无效，无法加载。' : 'Unable to open diagram: missing diagram id.');
                    break;
                case 'not-found':
                    appMessage.error(isTemplate ? '模版内容为空，请确认 Supabase 数据已迁移。' : 'Diagram not found in cloud storage.');
                    break;
                case 'unavailable':
                    appMessage.error(isTemplate ? '模版服务暂不可用。' : 'Cloud storage is unavailable.');
                    break;
            }
        } catch (error: unknown) {
            safeLog.error('Failed to open workspace diagram', redactSensitiveLogValue(error));
            appMessage.error(isTemplate ? '加载模版失败，请稍后重试。' : 'Failed to open diagram.');
        } finally {
            hide?.();
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
                    const result = await workspaceDiagramActions.deleteDiagram(item);
                    if (result === 'invalid-id') {
                        appMessage.error('Unable to delete diagram: missing diagram id.');
                        return;
                    }
                    appMessage.success('Deleted successfully');
                    loadAllData();
                } catch (error: unknown) {
                    safeLog.error('Failed to delete workspace diagram', redactSensitiveLogValue(error));
                    appMessage.error("Failed to delete diagram.");
                }
            }
        });
    };

    // Advanced Creation Router mapping to correct domains
    const handleCreateTemplate = async (templateKey: TemplateKey) => {
        try {
            const diagramId = await workspaceDiagramActions.createDiagram(templateKey);
            if (diagramId) navigateToDiagram(diagramId);
        } catch (error: unknown) {
            safeLog.error('Failed to create workspace diagram', redactSensitiveLogValue(error));
            appMessage.error('Failed to create diagram.');
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
