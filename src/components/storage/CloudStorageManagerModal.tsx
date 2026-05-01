import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Card, Button, Input, Space, message, Typography, Empty, Row, Col, Spin, Select, Popconfirm, Tabs, Tag, Checkbox } from 'antd';
import {
    CloudOutlined,
    EyeOutlined,
    DeleteOutlined,
    DatabaseOutlined,
    ReloadOutlined,
    TeamOutlined,
    CheckSquareOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { dataRegistry } from '../../data/DataRegistry';
import { unifiedStorage } from '../../services/UnifiedStorageService';
import { DiagramMetadata } from '../../services/storage/types';
import { StandardDiagramData } from '@/core';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { coerceToStandardDiagramDataWithReport } from '@/core';
import RemoteDiagramCover from '@/components/shared/RemoteDiagramCover';
import { shareService } from '@/services/ShareService';
import { appMessage } from '@/core/utils/antdStaticBridge';


const { Text } = Typography;
const { Search } = Input;
const { Meta } = Card;

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
    const [sharedDiagrams, setSharedDiagrams] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [sharedLoading, setSharedLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentProvider, setCurrentProvider] = useState(unifiedStorage.currentProviderId);
    const [activeTab, setActiveTab] = useState<string>('mine');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [batchMode, setBatchMode] = useState(false);
    const [batchDeleting, setBatchDeleting] = useState(false);

    // Initial Data Load
    useEffect(() => {
        if (open) {
            if (activeTab === 'mine') {
                loadCloudDiagrams();
            } else {
                loadSharedDiagrams();
            }
        }
    }, [open, currentProvider, user?.id, activeTab]);

    const loadSharedDiagrams = async () => {
        if (!user) {
            setSharedDiagrams([]);
            return;
        }
        setSharedLoading(true);
        try {
            const items = await shareService.listSharedWithMe();
            setSharedDiagrams(items);
        } catch (error) {
            console.error('Failed to load shared diagrams', error);
            setSharedDiagrams([]);
        } finally {
            setSharedLoading(false);
        }
    };

    const loadCloudDiagrams = async () => {
        if (!unifiedStorage.isConfigured()) {
            setCloudDiagrams([]);
            return;
        }
        if (currentProvider === 'supabase' && !user) {
            setCloudDiagrams([]);
            return;
        }
        setLoading(true);
        try {
            const items = await unifiedStorage.listDiagrams();
            setCloudDiagrams(items);
        } catch (error) {
            console.error("Failed to list diagrams", error);
            appMessage.error(t('storage.manager.loadFailed'));
            setCloudDiagrams([]);
        } finally {
            setLoading(false);
        }
    };

    const handleProviderChange = (value: 'supabase' | 's3') => {
        unifiedStorage.setProvider(value);
        setCurrentProvider(value);
        appMessage.info(t('storage.manager.providerSwitched', { provider: value === 's3' ? 'S3' : 'Supabase' }));
    };

    const handleOpenCloud = async (item: DiagramMetadata) => {
        if (currentProvider === 'supabase' && !user) {
            setIsAuthModalOpen(true);
            return;
        }
        const hide = appMessage.loading(t('storage.manager.downloading'), 0);
        try {
            const savedDiagram = await unifiedStorage.loadDiagram(item.id);
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
                const normalized: StandardDiagramData = {
                    ...report.diagram,
                    id: savedDiagram.id,
                    name: savedDiagram.title || report.diagram.name,
                    metadata: {
                        ...(report.diagram.metadata || {}),
                        title: savedDiagram.title || report.diagram.metadata?.title,
                        updatedAt: savedDiagram.updated_at,
                        cloud: {
                            provider: currentProvider,
                            id: savedDiagram.id,
                            title: savedDiagram.title,
                            openedAt: new Date().toISOString()
                        }
                    }
                };
                // 在设计器中打开时不注册到 dataService，避免触发 GenericStandardDiagram 布局
                // 检测：全局回调存在 OR 明确的 onOpenInDesigner prop
                const designerCallback = onOpenInDesigner || (window as any).__flowDesignerOpenCloud;
                if (!designerCallback) {
                    localService.registerDiagram(normalized);
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
                    navigate(`/?diagram=${savedDiagram.id}`);
                }
                appMessage.success(t('storage.manager.downloadedAndOpened'));
            } else {
                appMessage.error(t('storage.manager.noContent'));
            }
        } catch (error) {
            console.error(error);
            appMessage.error(error instanceof Error ? error.message : t('common.error'));
        } finally {
            hide();
        }
    };

    const handleDeleteCloud = async (id: string) => {
        try {
            await unifiedStorage.deleteDiagram(id);
            appMessage.success(t('storage.manager.deleted'));
            loadCloudDiagrams();
        } catch (e) {
            appMessage.error(t('storage.manager.deleteFailed'));
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        const ownedItems = filteredCloud.filter(d => !d.userId || d.userId === user?.id);
        if (selectedIds.size === ownedItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(ownedItems.map(d => d.id)));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return;
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
                    await unifiedStorage.deleteDiagram(id);
                    success++;
                } catch {
                    failed++;
                }
            }));
        }
        setBatchDeleting(false);
        setSelectedIds(new Set());
        appMessage.success(`已删除 ${success} 个${failed > 0 ? `，${failed} 个失败` : ''}`);
        loadCloudDiagrams();
    };

    const exitBatchMode = () => {
        setBatchMode(false);
        setSelectedIds(new Set());
    };

    const filteredCloud = cloudDiagrams.filter(d =>
        (d.title || d.id).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredShared = sharedDiagrams.filter(d =>
        (d.title || d.id).toLowerCase().includes(searchTerm.toLowerCase())
    );

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
        if (!unifiedStorage.isConfigured()) {
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
            <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '8px 4px' }}>
                {/* 批量操作栏 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, minHeight: 32 }}>
                    <Button
                        size="small"
                        type={batchMode ? 'primary' : 'default'}
                        icon={<CheckSquareOutlined />}
                        onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
                    >
                        {batchMode ? '退出多选' : '多选管理'}
                    </Button>
                    {batchMode && (
                        <Space size={4}>
                            <Button size="small" onClick={handleSelectAll}>
                                {selectedIds.size > 0 && selectedIds.size === filteredCloud.filter(d => !d.userId || d.userId === user?.id).length ? '取消全选' : '全选'}
                            </Button>
                            <Popconfirm
                                title={`确认删除 ${selectedIds.size} 个图表？`}
                                description="此操作不可撤销"
                                okText="删除"
                                cancelText="取消"
                                okButtonProps={{ danger: true }}
                                onConfirm={handleBatchDelete}
                            >
                                <Button size="small" danger disabled={selectedIds.size === 0} loading={batchDeleting}>
                                    删除选中 ({selectedIds.size})
                                </Button>
                            </Popconfirm>
                        </Space>
                    )}
                </div>
                <Spin spinning={loading}>
                    <Row gutter={[16, 16]}>
                        {filteredCloud.map((item) => {
                            const isOwner = !item.userId || item.userId === user?.id;
                            return (
                            <Col xs={24} sm={12} key={item.id}>
                                <div style={{ position: 'relative' }}>
                                    {batchMode && isOwner && (
                                        <Checkbox
                                            checked={selectedIds.has(item.id)}
                                            onChange={() => toggleSelect(item.id)}
                                            style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
                                        />
                                    )}
                                    <Card
                                        hoverable
                                        size="small"
                                        onClick={batchMode && isOwner ? () => toggleSelect(item.id) : undefined}
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
                                            <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleOpenCloud(item)}>{t('storage.manager.open')}</Button>,
                                            isOwner ? (
                                                <Popconfirm
                                                    title={t('storage.manager.confirmDeleteTitle')}
                                                    description={t('storage.manager.confirmDeleteDesc')}
                                                    okText={t('storage.manager.delete')}
                                                    cancelText={t('common.cancel')}
                                                    okButtonProps={{ danger: true }}
                                                    onConfirm={() => handleDeleteCloud(item.id)}
                                                >
                                                    <Button type="text" size="small" danger icon={<DeleteOutlined />}>{t('storage.manager.delete')}</Button>
                                                </Popconfirm>
                                            ) : (
                                                <Button type="text" size="small" disabled icon={<DeleteOutlined />}>无权限</Button>
                                            )
                                        ]}
                                    >
                                        <Meta
                                            avatar={<CloudOutlined style={{ fontSize: 20, color: isOwner ? '#52c41a' : '#1677ff' }} />}
                                            title={
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <span style={{ fontSize: 14 }}>{item.title}</span>
                                                    {!isOwner && <Tag color="blue" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>协作</Tag>}
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
                        {filteredCloud.length === 0 && !loading && (
                            <Col span={24}>
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('storage.manager.noCloudDiagrams')} />
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
                    description="登录后查看共享给你的图表"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => setIsAuthModalOpen(true)} icon={<DatabaseOutlined />}>
                        {t('auth.login')}
                    </Button>
                </Empty>
            );
        }

        return (
            <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '8px 4px' }}>
                <Spin spinning={sharedLoading}>
                    <Row gutter={[16, 16]}>
                        {filteredShared.map((item) => (
                            <Col xs={24} sm={12} key={item.id}>
                                <Card
                                    hoverable
                                    size="small"
                                    actions={[
                                        <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => handleOpenCloud(item)}>{t('storage.manager.open')}</Button>,
                                    ]}
                                >
                                    <Meta
                                        avatar={<TeamOutlined style={{ fontSize: 20, color: '#1677ff' }} />}
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 14 }}>{item.title}</span>
                                                <Tag color={item.role === 'editor' ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                                                    {item.role === 'editor' ? '可编辑' : '只读'}
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
                        {filteredShared.length === 0 && !sharedLoading && (
                            <Col span={24}>
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无共享图表" />
                            </Col>
                        )}
                    </Row>
                </Spin>
            </div>
        );
    };

    const modalTitle = useMemo(() => {
        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 32 }}>
                <span>{t('storage.manager.title')}</span>
                <Space>
                    <Select
                        value={currentProvider}
                        onChange={handleProviderChange}
                        size="small"
                        style={{ width: 120 }}
                        options={[
                            { value: 'supabase', label: <span><DatabaseOutlined /> Supabase</span> },
                            { value: 's3', label: <span><CloudOutlined /> S3</span> },
                        ]}
                    />
                    <Button size="small" icon={<ReloadOutlined />} onClick={loadCloudDiagrams} aria-label={t('storage.manager.refresh')} />
                </Space>
            </div>
        );
    }, [currentProvider, handleProviderChange, loadCloudDiagrams, t]);

    return (
        <>
        <Modal
            title={modalTitle}
            open={open}
            onCancel={onCancel}
            getContainer={() => document.getElementById('app-root-layout') || document.body}
            footer={null}
            width={800}
            styles={{ body: { padding: '0 var(--glass-padding-lg, 32px) var(--glass-padding-lg, 32px)' } }}
        >
            <div style={{ marginBottom: 12, marginTop: 16 }}>
                <Search
                    placeholder={t('storage.manager.searchPlaceholder')}
                    allowClear
                    onSearch={setSearchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ width: '100%' }}
                />
            </div>
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: 'mine',
                        label: <span><CloudOutlined /> 我的图表</span>,
                        children: renderMyDiagrams(),
                    },
                    {
                        key: 'shared',
                        label: <span><TeamOutlined /> 共享给我</span>,
                        children: renderSharedWithMe(),
                    },
                ]}
            />
        </Modal>
        <AuthModal open={isAuthModalOpen} onCancel={() => setIsAuthModalOpen(false)} />
        </>
    );
};
