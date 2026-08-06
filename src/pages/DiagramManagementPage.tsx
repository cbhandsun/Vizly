import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import App from 'antd/es/app';
import type { MenuProps } from 'antd/es/menu';
import { coerceDiagramId, getQueryOrHashParamFromLocation, type LocationLike } from '@/core/utils/inputBoundary';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ManageStorageProvider } from '@/components/ui/ManageTopToolbar';
import { useAuth } from '@/context/useAuth';
import {
    coerceFilterView,
    filterAndSortItems,
    loadWorkspaceItems,
    readStoredCloudProvider,
    type FilterViewType,
    type SortKey,
    type TemplateKey,
    type UnifiedDiagramItem,
    type ViewMode,
} from './diagramManagementPage.helpers';
import './WorkspaceDashboard.css';
import './WorkspaceDashboard.mobile.css';
import { appMessage } from '@/core/utils/antdStaticBridge';
import { safeLog } from '@/core/utils/consoleCleanup';
import { redactSensitiveLogValue } from '@/core/utils/logSecurity';
import { WorkspaceCompactHeader } from './WorkspaceCompactHeader';
import { WorkspaceDiagramCollection } from './WorkspaceDiagramCollection';
import { WorkspaceGlobalHeader } from './WorkspaceGlobalHeader';
import { WorkspaceContextMenu } from './WorkspaceContextMenu';
import { createWorkspaceDeleteConfirmation } from './workspaceDeleteConfirmation';
import { createWorkspaceDiagramActions } from './diagramManagementActions';
import { createWorkspaceSettingsMenu } from './workspaceSettingsMenu';
import { useWorkspaceSearch } from './useWorkspaceSearch';

const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

const workspaceDiagramActions = createWorkspaceDiagramActions();

const WorkspaceDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchParams] = useSearchParams();
    const browserLocation = typeof window === 'undefined' ? null : window.location as LocationLike;
    const { user } = useAuth();
    const { modal } = App.useApp();
    const initialView = coerceFilterView(searchParams.get('view') || getQueryOrHashParamFromLocation(browserLocation, 'view'));
    
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [activeView, setActiveView] = useState<FilterViewType>(initialView);
    const [loading, setLoading] = useState(true);
    const { searchTerm, searchQuery, searchInputRef, updateSearchTerm, clearSearch } = useWorkspaceSearch();
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [sortKey, setSortKey] = useState<SortKey>('updated');
    
    const [unifiedItems, setUnifiedItems] = useState<UnifiedDiagramItem[]>([]);
    const [cloudProvider] = useState<ManageStorageProvider>(() => {
        const p = searchParams.get('provider');
        if (p === 's3' || p === 'supabase') return p;
        return readStoredCloudProvider();
    });

    const [ctxMenu, setCtxMenu] = useState<{
        x: number;
        y: number;
        item: UnifiedDiagramItem;
        returnFocusTarget: HTMLElement | null;
    } | null>(null);
    const workspaceMainRef = useRef<HTMLElement>(null);

    const handleContextMenu = useCallback((e: React.MouseEvent, item: UnifiedDiagramItem) => {
        e.preventDefault();
        e.stopPropagation();
        const eventTarget = e.target instanceof HTMLElement
            ? e.target.closest<HTMLElement>('button')
            : null;
        const fallbackTarget = e.currentTarget.querySelector<HTMLElement>(
            '.diagram-card-primary-action, .diagram-list-primary-action',
        );
        setCtxMenu({
            x: e.clientX,
            y: e.clientY,
            item,
            returnFocusTarget: eventTarget ?? fallbackTarget,
        });
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
        let cancelled = false;
        queueMicrotask(() => {
            if (!cancelled) void loadAllData();
        });
        return () => { cancelled = true; };
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

    const handleDeleteDiagram = (
        e: { stopPropagation: () => void },
        item: UnifiedDiagramItem,
        returnFocusTarget: HTMLElement | null = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null,
    ) => {
        e.stopPropagation();
        modal.confirm(createWorkspaceDeleteConfirmation({
            title: t('workspace.deleteConfirmTitle'),
            description: t('workspace.deleteConfirmDescription'),
            deleteLabel: t('common.delete'),
            cancelLabel: t('common.cancel'),
            returnFocusTarget,
            fallbackFocusTarget: workspaceMainRef.current,
            deleteItem: () => workspaceDiagramActions.deleteDiagram(item),
            reloadItems: loadAllData,
            onInvalidId: () => appMessage.error('Unable to delete diagram: missing diagram id.'),
            onSuccess: () => appMessage.success(t('workspace.deleteSuccess')),
            onFailure: (error: unknown) => {
                safeLog.error('Failed to delete workspace diagram', redactSensitiveLogValue(error));
                appMessage.error(t('workspace.deleteFailed'));
            },
        }));
    };

    // Advanced Creation Router mapping to correct domains
    const handleCreateTemplate = async (templateKey: TemplateKey) => {
        try {
            const requestedName = templateKey === 'flowchart'
                ? t('workspace.untitledFlowchart')
                : undefined;
            const diagramId = await workspaceDiagramActions.createDiagram(templateKey, requestedName);
            if (diagramId) navigateToDiagram(diagramId);
        } catch (error: unknown) {
            safeLog.error('Failed to create workspace diagram', redactSensitiveLogValue(error));
            appMessage.error('Failed to create diagram.');
        }
    };

    // --- Computed Views ---
    const filteredItems = useMemo(
        () => filterAndSortItems(unifiedItems, activeView, searchQuery, sortKey),
        [unifiedItems, activeView, searchQuery, sortKey]
    );

    // --- Settings Menu ---
    const settingsMenu: MenuProps['items'] = useMemo(
        () => createWorkspaceSettingsMenu({
            accountLabel: user?.email
                ? t('workspace.signedInAs', { email: user.email })
                : t('workspace.signIn'),
            isAuthenticated: Boolean(user),
            onOpenSignIn: () => setIsAuthModalOpen(true),
            onOpenStorageSettings: () => navigate('/storage-config'),
            storageSettingsLabel: t('workspace.storageSettings'),
        }),
        [navigate, t, user],
    );

    return (
        <div className="workspace-dashboard">
            <WorkspaceGlobalHeader
                searchTerm={searchTerm}
                onSearchTermChange={updateSearchTerm}
                searchInputRef={searchInputRef}
                searchResultCount={filteredItems.length}
                onClearSearch={clearSearch}
                onNavigateHome={() => navigate('/manage')}
                settingsMenu={settingsMenu}
                isAuthenticated={Boolean(user)}
                avatarUrl={typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined}
            />
            {/* Main Content Viewport */}
            <main
                ref={workspaceMainRef}
                className="workspace-main"
                tabIndex={-1}
                aria-label={t('workspace.title')}
            >
                
                {!searchQuery && (
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
                    searchQuery={searchQuery}
                    onClearSearch={clearSearch}
                />
            </main>

            {/* Context Menu (Phase 1.3) */}
            {ctxMenu && (
                <WorkspaceContextMenu
                    key={`${ctxMenu.item.source}:${ctxMenu.item.id}:${ctxMenu.x}:${ctxMenu.y}`}
                    x={ctxMenu.x}
                    y={ctxMenu.y}
                    item={ctxMenu.item}
                    returnFocusTarget={ctxMenu.returnFocusTarget}
                    onOpen={handleOpenDiagram}
                    onOpenInNewTab={openDiagramInNewTab}
                    onDelete={handleDeleteDiagram}
                    onDismiss={() => setCtxMenu(null)}
                />
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
