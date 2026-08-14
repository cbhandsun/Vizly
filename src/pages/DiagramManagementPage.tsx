import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import App from 'antd/es/app';
import type { MenuProps } from 'antd/es/menu';
import { coerceDiagramId, type LocationLike } from '@/core/utils/inputBoundary';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ManageStorageProvider } from '@/components/ui/ManageTopToolbar';
import { openDiagramViewerInNewTab } from '@/components/diagramViewerNavigation';
import { useAuth } from '@/context/useAuth';
import {
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
import {
    beginWorkspaceDeleteDialog,
    coerceWorkspaceDeleteTargetName,
    createWorkspaceDeleteConfirmation,
    finishWorkspaceDeleteDialog,
} from './workspaceDeleteConfirmation';
import { createWorkspaceDiagramActions } from './diagramManagementActions';
import { createWorkspaceSettingsMenu } from './workspaceSettingsMenu';
import { useWorkspaceSearch } from './useWorkspaceSearch';
import { focusFirstWorkspaceResult, focusWorkspaceTarget } from './workspaceMenuInteraction';
import { scheduleWorkspaceRouteFocus } from './workspaceRouteFocus';
import {
    beginWorkspaceDiagramCreate,
    beginWorkspaceDiagramOpen,
    finishWorkspaceDiagramCreate,
    finishWorkspaceDiagramOpen,
    navigateToCreatedWorkspaceDiagram,
} from './workspaceDiagramOpenState';
import {
    readWorkspaceDisplayPreferences,
    writeWorkspaceDisplayPreferences,
    type WorkspaceDisplayPreferences,
} from './workspaceDisplayPreferences';
import {
    createWorkspaceFilterSearchUpdate,
    resolveWorkspaceFilterView,
} from './workspaceFilterRoute';

const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

const workspaceDiagramActions = createWorkspaceDiagramActions();

const WorkspaceDashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const browserLocation = typeof window === 'undefined' ? null : window.location as LocationLike;
    const { user } = useAuth();
    const { modal } = App.useApp();
    const activeView = resolveWorkspaceFilterView(searchParams, browserLocation);
    
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isAuthModalMounted, setIsAuthModalMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const { searchTerm, searchQuery, searchInputRef, updateSearchTerm, clearSearch } = useWorkspaceSearch();
    const [displayPreferences, setDisplayPreferences] = useState<WorkspaceDisplayPreferences>(
        readWorkspaceDisplayPreferences,
    );
    const { viewMode, sortKey } = displayPreferences;
    const [openingDiagramKeys, setOpeningDiagramKeys] = useState<ReadonlySet<string>>(() => new Set());
    const [isCreatingDiagram, setIsCreatingDiagram] = useState(false);
    const workspaceResultsRef = useRef<HTMLDivElement>(null);
    
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
    const settingsTriggerRef = useRef<HTMLButtonElement>(null);
    const authReturnFocusTargetRef = useRef<HTMLElement | null>(null);
    const openingDiagramKeysRef = useRef(new Set<string>());
    const diagramCreateLockRef = useRef({ active: false });
    const deleteDialogLockRef = useRef({ active: false });

    const commitDisplayPreferences = useCallback((next: WorkspaceDisplayPreferences) => {
        setDisplayPreferences(next);
        writeWorkspaceDisplayPreferences(next);
    }, []);

    const handleViewModeChange = useCallback((nextViewMode: ViewMode) => {
        if (nextViewMode === displayPreferences.viewMode) return;
        commitDisplayPreferences({ ...displayPreferences, viewMode: nextViewMode });
    }, [commitDisplayPreferences, displayPreferences]);

    const handleSortKeyChange = useCallback((nextSortKey: SortKey) => {
        if (nextSortKey === displayPreferences.sortKey) return;
        commitDisplayPreferences({ ...displayPreferences, sortKey: nextSortKey });
    }, [commitDisplayPreferences, displayPreferences]);

    const handleActiveViewChange = useCallback((nextView: FilterViewType) => {
        const update = createWorkspaceFilterSearchUpdate(searchParams, nextView);
        if (!update.changed) return;
        setSearchParams(update.searchParams, { replace: false });
    }, [searchParams, setSearchParams]);

    useEffect(() => scheduleWorkspaceRouteFocus(() => workspaceMainRef.current), []);

    const openAuthModal = useCallback(() => {
        authReturnFocusTargetRef.current = typeof document !== 'undefined'
            && document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setIsAuthModalMounted(true);
        setIsAuthModalOpen(true);
    }, []);

    const closeAuthModal = useCallback(() => {
        setIsAuthModalOpen(false);
    }, []);

    const handleAuthModalAfterClose = useCallback(() => {
        setIsAuthModalMounted(false);
        const returnFocusTarget = authReturnFocusTargetRef.current;
        authReturnFocusTargetRef.current = null;
        requestAnimationFrame(() => {
            const restored = focusWorkspaceTarget(returnFocusTarget, settingsTriggerRef.current);
            if (!restored) focusWorkspaceTarget(workspaceMainRef.current);
        });
    }, []);

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
        const opened = openDiagramViewerInNewTab({
            id: diagramId,
            currentHref: window.location.href,
            openWindow: (url, target, features) => window.open(url, target, features),
            logFailure: (_id, error) => {
                safeLog.error('Failed to open workspace diagram in a new tab', redactSensitiveLogValue(error));
            },
        });
        if (opened) appMessage.success(t('workspace.openNewTabSuccess'));
        else appMessage.warning(t('workspace.openNewTabBlocked'));
    }, [t]);

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
        const openStart = beginWorkspaceDiagramOpen(openingDiagramKeysRef.current, item);
        if (openStart.kind === 'duplicate') return;
        if (openStart.kind === 'started') {
            setOpeningDiagramKeys(new Set(openingDiagramKeysRef.current));
        }
        const releaseOpenState = () => {
            if (finishWorkspaceDiagramOpen(openingDiagramKeysRef.current, openStart)) {
                setOpeningDiagramKeys(new Set(openingDiagramKeysRef.current));
            }
        };
        const isTemplate = item.source === 'template' || item.source === 'general_template';
        const needsLoadingMessage = item.source !== 'local' && !(item.source === 'supabase' && !user);
        const hide = needsLoadingMessage
            ? appMessage.loading(isTemplate ? '正在加载模版...' : 'Loading diagram from cloud...', 0)
            : null;
        try {
            const result = await workspaceDiagramActions.openDiagram(item, Boolean(user));
            releaseOpenState();
            switch (result.kind) {
                case 'navigate':
                    navigateToDiagram(result.diagramId);
                    break;
                case 'auth-required':
                    openAuthModal();
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
            releaseOpenState();
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
        if (!beginWorkspaceDeleteDialog(deleteDialogLockRef.current)) return;
        const deleteTargetName = coerceWorkspaceDeleteTargetName(
            item.title,
            t('workspace.untitledDiagram'),
        );
        const confirmation = createWorkspaceDeleteConfirmation({
            title: t('workspace.deleteConfirmTitle', { name: deleteTargetName }),
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
            onRefreshFailure: (error: unknown) => {
                safeLog.error('Workspace refresh failed after deleting a diagram', redactSensitiveLogValue(error));
                appMessage.error(t('workspace.deleteRefreshFailed'));
            },
            onAfterClose: () => {
                finishWorkspaceDeleteDialog(deleteDialogLockRef.current);
            },
        });
        try {
            modal.confirm(confirmation);
        } catch (error) {
            finishWorkspaceDeleteDialog(deleteDialogLockRef.current);
            throw error;
        }
    };

    // Advanced Creation Router mapping to correct domains
    const handleCreateTemplate = async (templateKey: TemplateKey) => {
        if (!beginWorkspaceDiagramCreate(diagramCreateLockRef.current)) return;
        setIsCreatingDiagram(true);
        let keepLockUntilNavigation = false;
        try {
            const requestedName = templateKey === 'flowchart'
                ? t('workspace.untitledFlowchart')
                : undefined;
            const diagramId = await workspaceDiagramActions.createDiagram(templateKey, requestedName);
            keepLockUntilNavigation = navigateToCreatedWorkspaceDiagram(diagramId, navigateToDiagram);
        } catch (error: unknown) {
            safeLog.error('Failed to create workspace diagram', redactSensitiveLogValue(error));
            appMessage.error('Failed to create diagram.');
        } finally {
            if (!keepLockUntilNavigation && finishWorkspaceDiagramCreate(diagramCreateLockRef.current)) {
                setIsCreatingDiagram(false);
            }
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
            onOpenSignIn: openAuthModal,
            onOpenStorageSettings: () => navigate('/storage-config'),
            storageSettingsLabel: t('workspace.storageSettings'),
        }),
        [navigate, openAuthModal, t, user],
    );

    return (
        <div className="workspace-dashboard">
            <WorkspaceGlobalHeader
                searchTerm={searchTerm}
                onSearchTermChange={updateSearchTerm}
                searchInputRef={searchInputRef}
                searchResultCount={filteredItems.length}
                onClearSearch={clearSearch}
                onNavigateToResults={() => focusFirstWorkspaceResult(workspaceResultsRef.current)}
                onNavigateHome={() => navigate('/manage')}
                settingsMenu={settingsMenu}
                settingsTriggerRef={settingsTriggerRef}
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
                        isCreating={isCreatingDiagram}
                        onCreateTemplate={handleCreateTemplate}
                    />
                )}
                <WorkspaceDiagramCollection
                    activeView={activeView}
                    onActiveViewChange={handleActiveViewChange}
                    unifiedItems={unifiedItems}
                    filteredItems={filteredItems}
                    sortKey={sortKey}
                    onSortKeyChange={handleSortKeyChange}
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                    loading={loading}
                    isCreatingDiagram={isCreatingDiagram}
                    openingDiagramKeys={openingDiagramKeys}
                    onOpenDiagram={handleOpenDiagram}
                    onOpenDiagramInNewTab={openDiagramInNewTab}
                    onContextMenu={handleContextMenu}
                    onDeleteDiagram={handleDeleteDiagram}
                    onCreateBlank={() => handleCreateTemplate('blank')}
                    searchQuery={searchQuery}
                    onClearSearch={clearSearch}
                    resultsRef={workspaceResultsRef}
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

            {isAuthModalMounted ? (
                <React.Suspense fallback={null}>
                    <AuthModal
                        open={isAuthModalOpen}
                        onCancel={closeAuthModal}
                        onAfterClose={handleAuthModalAfterClose}
                    />
                </React.Suspense>
            ) : null}
        </div>
    );
};

export default WorkspaceDashboardPage;
