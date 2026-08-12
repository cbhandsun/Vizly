import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Card, Button, Space, Typography, Empty, Row, Col, Spin, Popconfirm, Tabs, Tag, Checkbox } from 'antd';
import {
    CloudOutlined,
    EyeOutlined,
    DeleteOutlined,
    DatabaseOutlined,
    TeamOutlined,
    CheckSquareOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router';
import { dataRegistry } from '../../data/DataRegistry';
import { unifiedStorage } from '../../services/UnifiedStorageService';
import { DiagramMetadata } from '../../services/storage/types';
import type { StandardDiagramData } from '@/core/models/DiagramModels';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/useAuth';
import { coerceToStandardDiagramDataWithReport } from '@/core/utils/coerceDiagram';
import RemoteDiagramCover from '@/components/shared/RemoteDiagramCover';
import { shareService, type SharedWithMeRecord } from '@/services/ShareService';
import { appMessage } from '@/core/utils/antdStaticBridge';
import {
    logCloudStorageManagerBatchDeleteFailure,
    logCloudStorageManagerDeleteFailure,
    logCloudStorageManagerListFailure,
    logCloudStorageManagerOpenFailure,
    logCloudStorageManagerSharedLoadFailure,
} from '@/components/diagrams/hooks/diagramStorageLogging';
import {
    COMMERCIAL_VIEWPORT_MODAL_CLASS,
    COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
    getViewportOverlayContainer,
} from '@/core/components/ui/viewportOverlayPortal';
import type { StorageProviderType } from '@/services/UnifiedStorageService';
import { CloudStorageManagerSearch, CloudStorageManagerTitle } from './CloudStorageManagerControls';
import { CloudStorageRecoveryAlert } from './CloudStorageRecoveryAlert';
import { CloudStorageEmptyState } from './CloudStorageEmptyState';
import {
    createCloudStorageManagerScope,
    invalidateCloudStorageManagerScope,
    isOwnedCloudStorageItem,
    isCloudStorageManagerScopeCurrent,
    matchesCloudStorageSearch,
    resolveCloudStorageItemProvider,
    transitionCloudStorageManagerScope,
    type CloudStorageManagerTab,
} from './cloudStorageManagerScope';
import './CloudStorageManagerModal.css';


const { Text } = Typography;
const { Meta } = Card;
const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

interface CloudStorageManagerModalProps {
    open: boolean;
    onCancel: () => void;
    onSelect?: (data: StandardDiagramData) => void;
    /** 如果提供，云端图表将在设计器中打开（通过 standardDataToCanvas 转换） */
    onOpenInDesigner?: (data: StandardDiagramData) => void;
}

export const CloudStorageManagerModal: React.FC<CloudStorageManagerModalProps> = ({ open, onCancel, onSelect, onOpenInDesigner }) => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user } = useAuth();
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [cloudDiagrams, setCloudDiagrams] = useState<DiagramMetadata[]>([]);
    const [sharedDiagrams, setSharedDiagrams] = useState<SharedWithMeRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [sharedLoading, setSharedLoading] = useState(false);
    const [cloudLoadFailed, setCloudLoadFailed] = useState(false);
    const [sharedLoadFailed, setSharedLoadFailed] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentProvider, setCurrentProvider] = useState(unifiedStorage.currentProviderId);
    const [activeTab, setActiveTab] = useState<CloudStorageManagerTab>('mine');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [batchMode, setBatchMode] = useState(false);
    const [batchDeleting, setBatchDeleting] = useState(false);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const cloudListRequestRef = useRef(0);
    const sharedListRequestRef = useRef(0);
    const scopeRef = useRef(createCloudStorageManagerScope(unifiedStorage.currentProviderId));

    const storageActionBusy = batchDeleting || openingId !== null || deletingId !== null;

    const resetBatchSelection = useCallback(() => {
        setBatchMode(false);
        setSelectedIds(new Set());
    }, []);

    const loadSharedDiagrams = useCallback(async () => {
        const requestScope = scopeRef.current;
        const requestId = ++sharedListRequestRef.current;
        if (!user) {
            setSharedDiagrams([]);
            setSharedLoadFailed(false);
            setSharedLoading(false);
            return;
        }
        setSharedLoading(true);
        setSharedLoadFailed(false);
        try {
            const items = await shareService.listSharedWithMe();
            if (
                requestId === sharedListRequestRef.current
                && isCloudStorageManagerScopeCurrent(requestScope, scopeRef.current)
            ) {
                setSharedDiagrams(items);
            }
        } catch (error) {
            logCloudStorageManagerSharedLoadFailure(error);
            if (
                requestId === sharedListRequestRef.current
                && isCloudStorageManagerScopeCurrent(requestScope, scopeRef.current)
            ) {
                setSharedLoadFailed(true);
            }
        } finally {
            if (requestId === sharedListRequestRef.current) setSharedLoading(false);
        }
    }, [user]);

    const loadCloudDiagrams = useCallback(async () => {
        const requestScope = scopeRef.current;
        const requestId = ++cloudListRequestRef.current;
        const provider = unifiedStorage.getProvider(requestScope.providerId);
        if (!provider.isConfigured()) {
            setCloudDiagrams([]);
            setCloudLoadFailed(false);
            return;
        }
        if (requestScope.providerId === 'supabase' && !user) {
            setCloudDiagrams([]);
            setCloudLoadFailed(false);
            return;
        }
        setLoading(true);
        setCloudLoadFailed(false);
        try {
            const items = await provider.listDiagrams();
            if (
                requestId === cloudListRequestRef.current
                && isCloudStorageManagerScopeCurrent(requestScope, scopeRef.current)
            ) {
                setCloudDiagrams(items);
            }
        } catch (error) {
            logCloudStorageManagerListFailure(error);
            if (
                requestId === cloudListRequestRef.current
                && isCloudStorageManagerScopeCurrent(requestScope, scopeRef.current)
            ) {
                setCloudLoadFailed(true);
            }
        } finally {
            if (requestId === cloudListRequestRef.current) setLoading(false);
        }
    }, [user]);

    // Initial Data Load
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            if (activeTab === 'mine') {
                void loadCloudDiagrams();
            } else {
                void loadSharedDiagrams();
            }
        });
        return () => { cancelled = true; };
    }, [activeTab, currentProvider, loadCloudDiagrams, loadSharedDiagrams, open]);

    useEffect(() => {
        if (open) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            scopeRef.current = invalidateCloudStorageManagerScope(scopeRef.current);
            cloudListRequestRef.current += 1;
            sharedListRequestRef.current += 1;
            setLoading(false);
            setSharedLoading(false);
            setCloudLoadFailed(false);
            setSharedLoadFailed(false);
            resetBatchSelection();
        });
        return () => { cancelled = true; };
    }, [open, resetBatchSelection]);

    const handleProviderChange = useCallback((value: StorageProviderType) => {
        if (storageActionBusy || value === scopeRef.current.providerId) return;
        scopeRef.current = transitionCloudStorageManagerScope(scopeRef.current, {
            providerId: value,
            tab: scopeRef.current.tab,
        });
        cloudListRequestRef.current += 1;
        sharedListRequestRef.current += 1;
        setLoading(false);
        setSharedLoading(false);
        setCloudDiagrams([]);
        setCloudLoadFailed(false);
        resetBatchSelection();
        unifiedStorage.setProvider(value);
        setCurrentProvider(value);
        appMessage.info(t('storage.manager.providerSwitched', { provider: value === 's3' ? 'S3' : 'Supabase' }));
    }, [resetBatchSelection, storageActionBusy, t]);

    const handleTabChange = useCallback((value: string) => {
        if (storageActionBusy || (value !== 'mine' && value !== 'shared')) return;
        const nextTab = value as CloudStorageManagerTab;
        if (nextTab === scopeRef.current.tab) return;
        scopeRef.current = transitionCloudStorageManagerScope(scopeRef.current, {
            providerId: scopeRef.current.providerId,
            tab: nextTab,
        });
        cloudListRequestRef.current += 1;
        sharedListRequestRef.current += 1;
        setLoading(false);
        setSharedLoading(false);
        resetBatchSelection();
        setActiveTab(nextTab);
    }, [resetBatchSelection, storageActionBusy]);

    const handleOpenCloud = async (
        item: DiagramMetadata,
        requestedProvider = resolveCloudStorageItemProvider(activeTab, currentProvider),
    ) => {
        if (storageActionBusy) return;
        if (requestedProvider === 'supabase' && !user) {
            setIsAuthModalOpen(true);
            return;
        }
        const provider = unifiedStorage.getProvider(requestedProvider);
        setOpeningId(item.id);
        const hide = appMessage.loading(t('storage.manager.downloading'), 0);
        try {
            const savedDiagram = await provider.loadDiagram(item.id);
            if (savedDiagram && savedDiagram.content) {
                const localService = dataRegistry.getDataService();
                const report = coerceToStandardDiagramDataWithReport(savedDiagram.content, { id: savedDiagram.id, title: savedDiagram.title });
                const errors = report.issues.filter(x => x.level === 'error');
                const warns = report.issues.filter(x => x.level === 'warn');
                if (errors.length > 0) {
                    appMessage.error(t('common.remoteDataInvalid', { reason: errors.map(x => x.message).join('; ') }));
                    return;
                }
                if (warns.length > 0 && report.diagram.nodes.length > 0) {
                    appMessage.warning(t('common.remoteDataRepaired', { reason: warns.map(x => x.message).join('; ') }));
                }
                const normalized = localService.registerRemoteDiagram(savedDiagram.content, {
                    id: savedDiagram.id,
                    title: savedDiagram.title,
                }, false, {
                    id: savedDiagram.id,
                    name: savedDiagram.title || report.diagram.name,
                    metadata: {
                        ...(report.diagram.metadata || {}),
                        title: savedDiagram.title || report.diagram.metadata?.title,
                        updatedAt: savedDiagram.updated_at,
                        cloud: {
                            provider: requestedProvider,
                            id: savedDiagram.id,
                            title: savedDiagram.title,
                            openedAt: new Date().toISOString()
                        }
                    }
                });
                // 在设计器中打开时不注册到 dataService，避免触发 GenericStandardDiagram 布局
                // 检测：全局回调存在 OR 明确的 onOpenInDesigner prop
                const designerCallback = onOpenInDesigner || window.__flowDesignerOpenCloud;
                if (designerCallback) {
                    localService.deleteDiagram(normalized.id, false);
                }

                // Close modal and open
                onCancel();
                if (designerCallback) {
                    // 在设计器中打开（FlowchartDesigner 场景）
                    designerCallback(normalized);
                } else {
                    // 在标准流程图中打开
                    if (onSelect) {
                        onSelect(normalized);
                    }
                    navigate(`/?diagram=${encodeURIComponent(savedDiagram.id)}`);
                }
                appMessage.success(t('storage.manager.downloadedAndOpened'));
            } else {
                appMessage.error(t('storage.manager.noContent'));
            }
        } catch (error) {
            logCloudStorageManagerOpenFailure(error);
            appMessage.error(t('storage.manager.openFailed'));
        } finally {
            hide();
            setOpeningId(null);
        }
    };

    const handleDeleteCloud = async (id: string) => {
        if (storageActionBusy) return;
        const provider = unifiedStorage.getProvider(currentProvider);
        setDeletingId(id);
        try {
            await provider.deleteDiagram(id);
            appMessage.success(t('storage.manager.deleted'));
            void loadCloudDiagrams();
        } catch (error) {
            logCloudStorageManagerDeleteFailure(error);
            appMessage.error(t('storage.manager.deleteFailed'));
        } finally {
            setDeletingId(null);
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        const ownedItems = filteredCloud.filter(d => isOwnedCloudStorageItem(d, user?.id));
        if (selectedIds.size === ownedItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(ownedItems.map(d => d.id)));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0 || storageActionBusy) return;
        const provider = unifiedStorage.getProvider(currentProvider);
        setBatchDeleting(true);
        const ids = Array.from(selectedIds);
        let success = 0;
        let failed = 0;
        // 并行删除，最多 5 个并发
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 5) chunks.push(ids.slice(i, i + 5));
        for (const chunk of chunks) {
            await Promise.allSettled(chunk.map(async id => {
                try {
                    await provider.deleteDiagram(id);
                    success++;
                } catch (error) {
                    logCloudStorageManagerBatchDeleteFailure(id, error);
                    failed++;
                }
            }));
        }
        setBatchDeleting(false);
        setSelectedIds(new Set());
        if (success === 0 && failed > 0) {
            appMessage.error(t('storage.manager.batchDeleteAllFailed', { failed }));
        } else if (failed > 0) {
            appMessage.warning(t('storage.manager.batchDeletePartial', { success, failed }));
        } else {
            appMessage.success(t('storage.manager.batchDeleteSuccess', { success }));
        }
        void loadCloudDiagrams();
    };

    const exitBatchMode = () => {
        setBatchMode(false);
        setSelectedIds(new Set());
    };

    const handleSearchTermChange = (value: string) => { setSearchTerm(value); resetBatchSelection(); };

    const filteredCloud = cloudDiagrams.filter(item => matchesCloudStorageSearch(item, searchTerm));
    const filteredShared = sharedDiagrams.filter(item => matchesCloudStorageSearch(item, searchTerm));

    const renderMyDiagrams = () => {
        if (currentProvider === 'supabase' && !user) {
            return (
                <Empty
                    description={t('storage.manager.needLoginForSupabase')}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => setIsAuthModalOpen(true)} icon={<DatabaseOutlined />}>
                        {t('auth.login')}
                    </Button>
                </Empty>
            );
        }
        if (!unifiedStorage.getProvider(currentProvider).isConfigured()) {
            return (
                <Empty
                    description={t('storage.manager.providerNotConfigured', { provider: currentProvider === 's3' ? 'S3' : 'Supabase' })}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => {
                        onCancel();
                        navigate('/storage-config');
                    }}>{t('storage.manager.goConfig')}</Button>
                </Empty>
            );
        }

        return (
            <div className="cloud-storage-manager-list">
                {cloudLoadFailed && (
                    <CloudStorageRecoveryAlert
                        title={t('storage.manager.loadFailed')}
                        description={t('storage.manager.loadRetryHint')}
                        retryLabel={t('common.retry')}
                        loading={loading}
                        onRetry={() => void loadCloudDiagrams()}
                    />
                )}
                {/* 批量操作栏 */}
                <div className="cloud-storage-manager-batch-bar">
                    <Button
                        type={batchMode ? 'primary' : 'default'}
                        icon={<CheckSquareOutlined />}
                        onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
                        disabled={storageActionBusy}
                    >
                        {batchMode ? t('storage.manager.exitBatchMode') : t('storage.manager.batchMode')}
                    </Button>
                    {batchMode && (
                        <Space className="cloud-storage-manager-batch-actions" size={8} wrap>
                            <Button onClick={handleSelectAll} disabled={storageActionBusy}>
                                {selectedIds.size > 0 && selectedIds.size === filteredCloud.filter(d => isOwnedCloudStorageItem(d, user?.id)).length
                                    ? t('storage.manager.clearSelection')
                                    : t('storage.manager.selectAll')}
                            </Button>
                            <Popconfirm
                                title={t('storage.manager.batchDeleteTitle', { count: selectedIds.size })}
                                description={t('storage.manager.confirmDeleteDesc')}
                                okText={t('storage.manager.delete')}
                                cancelText={t('common.cancel')}
                                okButtonProps={{ danger: true }}
                                onConfirm={handleBatchDelete}
                            >
                                <Button danger disabled={selectedIds.size === 0 || storageActionBusy} loading={batchDeleting}>
                                    {t('storage.manager.deleteSelected', { count: selectedIds.size })}
                                </Button>
                            </Popconfirm>
                        </Space>
                    )}
                </div>
                <Spin spinning={loading}>
                    <Row gutter={[16, 16]}>
                        {filteredCloud.map((item) => {
                            const isOwner = isOwnedCloudStorageItem(item, user?.id);
                            return (
                            <Col xs={24} sm={12} key={item.id}>
                                <div style={{ position: 'relative' }}>
                                    {batchMode && isOwner && (
                                        <Checkbox
                                            checked={selectedIds.has(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                            className="cloud-storage-manager-checkbox"
                                            aria-label={t('storage.manager.selectDiagram', { title: item.title || item.id })}
                                        />
                                    )}
                                    <Card
                                        hoverable
                                        size="small"
                                        onClick={batchMode && isOwner ? () => toggleSelect(item.id) : undefined}
                                        role={batchMode && isOwner ? 'button' : undefined}
                                        tabIndex={batchMode && isOwner ? 0 : undefined}
                                        aria-pressed={batchMode && isOwner ? selectedIds.has(item.id) : undefined}
                                        onKeyDown={batchMode && isOwner ? event => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                toggleSelect(item.id);
                                            }
                                        } : undefined}
                                        style={{
                                            borderRadius: 12,
                                            overflow: 'hidden',
                                            backgroundColor: 'rgba(255, 255, 255, 0.45)',
                                            border: '1px solid rgba(0, 0, 0, 0.06)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            ...(batchMode && selectedIds.has(item.id) ? { borderColor: 'var(--color-primary-500, #6366f1)', boxShadow: '0 0 0 2px rgba(99, 102, 241, 0.15)' } : {}),
                                            ...(batchMode && !isOwner ? { opacity: 0.5 } : {})
                                        }}
                                        cover={<RemoteDiagramCover storageId={item.id} alt={item.title} height={110} cacheBuster={item.updatedAt?.getTime?.() ?? ''} />}
                                        actions={batchMode ? undefined : [
                                            <Button
                                                type="text"
                                                icon={<EyeOutlined />}
                                                loading={openingId === item.id}
                                                disabled={storageActionBusy && openingId !== item.id}
                                                onClick={() => void handleOpenCloud(item, currentProvider)}
                                            >
                                                {t('storage.manager.open')}
                                            </Button>,
                                            isOwner ? (
                                                <Popconfirm
                                                    title={t('storage.manager.confirmDeleteTitle')}
                                                    description={t('storage.manager.confirmDeleteDesc')}
                                                    okText={t('storage.manager.delete')}
                                                    cancelText={t('common.cancel')}
                                                    okButtonProps={{ danger: true }}
                                                    onConfirm={() => handleDeleteCloud(item.id)}
                                                >
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<DeleteOutlined />}
                                                        loading={deletingId === item.id}
                                                        disabled={storageActionBusy && deletingId !== item.id}
                                                    >
                                                        {t('storage.manager.delete')}
                                                    </Button>
                                                </Popconfirm>
                                            ) : (
                                                <Button type="text" disabled icon={<DeleteOutlined />}>{t('storage.manager.noPermission')}</Button>
                                            )
                                        ]}
                                    >
                                        <Meta
                                            avatar={<CloudOutlined style={{ fontSize: 20, color: isOwner ? '#52c41a' : '#1677ff' }} />}
                                            title={
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span style={{ fontSize: 14 }}>{item.title}</span>
                                                    {!isOwner && <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>{t('storage.manager.collaborative')}</Tag>}
                                                </div>
                                            }
                                            description={
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : t('storage.manager.unknownTime')}
                                                    </Text>
                                                    {item.size && <Text type="secondary" style={{ fontSize: 11 }}>{t('storage.manager.sizeKb', { kb: (item.size / 1024).toFixed(1) })}</Text>}
                                                </div>
                                            }
                                        />

                                    </Card>
                                </div>
                            </Col>
                        );})}
                        {filteredCloud.length === 0 && !loading && !cloudLoadFailed && (
                            <Col span={24}>
                                <CloudStorageEmptyState hasUnfilteredItems={cloudDiagrams.length > 0} searchTerm={searchTerm}
                                    defaultDescription={t('storage.manager.noCloudDiagrams')} onClearSearch={() => handleSearchTermChange('')} />
                            </Col>
                        )}
                    </Row>
                </Spin>
            </div>
        );
    };

    const renderSharedWithMe = () => {
        if (!user) {
            return (
                <Empty
                    description={t('storage.manager.sharedLoginRequired')}
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => setIsAuthModalOpen(true)} icon={<DatabaseOutlined />}>
                        {t('auth.login')}
                    </Button>
                </Empty>
            );
        }

        return (
            <div className="cloud-storage-manager-list">
                {sharedLoadFailed && (
                    <CloudStorageRecoveryAlert
                        title={t('storage.manager.sharedLoadFailed')}
                        description={t('storage.manager.loadRetryHint')}
                        retryLabel={t('common.retry')}
                        loading={sharedLoading}
                        onRetry={() => void loadSharedDiagrams()}
                    />
                )}
                <Spin spinning={sharedLoading}>
                    <Row gutter={[16, 16]}>
                        {filteredShared.map((item) => (
                            <Col xs={24} sm={12} key={item.id}>
                                <Card
                                    hoverable
                                    size="small"
                                    actions={[
                                        <Button
                                            type="text"
                                            icon={<EyeOutlined />}
                                            loading={openingId === item.id}
                                            disabled={storageActionBusy && openingId !== item.id}
                                            onClick={() => void handleOpenCloud(item, 'supabase')}
                                        >
                                            {t('storage.manager.open')}
                                        </Button>,
                                    ]}
                                >
                                    <Meta
                                        avatar={<TeamOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 14 }}>{item.title}</span>
                                                <Tag color={item.role === 'editor' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                                                    {item.role === 'editor' ? t('storage.manager.editable') : t('storage.manager.readOnly')}
                                                </Tag>
                                            </div>
                                        }
                                        description={
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : ''}
                                            </Text>
                                        }
                                    />
                                </Card>
                            </Col>
                        ))}
                        {filteredShared.length === 0 && !sharedLoading && !sharedLoadFailed && (
                            <Col span={24}>
                                <CloudStorageEmptyState hasUnfilteredItems={sharedDiagrams.length > 0} searchTerm={searchTerm}
                                    defaultDescription={t('storage.manager.noSharedDiagrams')} onClearSearch={() => handleSearchTermChange('')} />
                            </Col>
                        )}
                    </Row>
                </Spin>
            </div>
        );
    };

    const handleModalCancel = useCallback(() => {
        if (storageActionBusy) {
            appMessage.info(t('storage.manager.operationInProgress'));
            return;
        }
        scopeRef.current = invalidateCloudStorageManagerScope(scopeRef.current);
        cloudListRequestRef.current += 1;
        sharedListRequestRef.current += 1;
        resetBatchSelection();
        onCancel();
    }, [onCancel, resetBatchSelection, storageActionBusy, t]);

    return (
        <>
        <Modal
            title={(
                <CloudStorageManagerTitle
                    activeTab={activeTab}
                    currentProvider={currentProvider}
                    loading={loading}
                    operationBusy={storageActionBusy}
                    onProviderChange={handleProviderChange}
                    onRefresh={() => void loadCloudDiagrams()}
                />
            )}
            open={open}
            onCancel={handleModalCancel}
            getContainer={getViewportOverlayContainer}
            rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} cloud-storage-manager-modal`}
            zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}
            footer={null}
            width={800}
            maskClosable={!storageActionBusy}
            keyboard={!storageActionBusy}
        >
            <CloudStorageManagerSearch value={searchTerm} onChange={handleSearchTermChange} />
            <Tabs
                activeKey={activeTab}
                onChange={handleTabChange}
                items={[
                    {
                        key: 'mine',
                        label: <span><CloudOutlined /> {t('storage.manager.mineTab')}</span>,
                        disabled: storageActionBusy && activeTab !== 'mine',
                        children: renderMyDiagrams(),
                    },
                    {
                        key: 'shared',
                        label: <span><TeamOutlined /> {t('storage.manager.sharedTab')}</span>,
                        disabled: storageActionBusy && activeTab !== 'shared',
                        children: renderSharedWithMe(),
                    },
                ]}
            />
        </Modal>
        {isAuthModalOpen && (
            <React.Suspense fallback={null}>
                <AuthModal open={isAuthModalOpen} onCancel={() => setIsAuthModalOpen(false)} />
            </React.Suspense>
        )}
        </>
    );
};
