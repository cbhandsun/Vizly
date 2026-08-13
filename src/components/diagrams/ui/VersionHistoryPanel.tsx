import React, { useRef, useState } from 'react';
import { Alert, Drawer, Button, Empty, Input, List, Typography, Space, Tooltip, Badge, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, UndoOutlined, EyeOutlined } from '@ant-design/icons';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { useReactFlow } from '@xyflow/react';
import {
    normalizeVersionMessage,
    VERSION_MESSAGE_MAX_LENGTH,
} from './versionHistoryInput';
import './VersionHistoryPanel.css';

const { Text, Title } = Typography;

const VERSION_HISTORY_FOCUS_RETURN_SELECTOR = '[data-version-history-focus-return]';

interface VersionHistoryPanelProps {
    diagramId: string;
    isOpen: boolean;
    onClose: () => void;
}

export const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
    diagramId,
    isOpen,
    onClose
}) => {
    const { t, i18n } = useTranslation();
    const { setNodes, setEdges, getNodes, getEdges } = useReactFlow();
    const {
        versions,
        loading,
        loadError,
        previewVersion,
        loadVersions,
        saveVersion,
        enterPreview,
        exitPreview,
        restoreVersion
    } = useVersionHistory(diagramId);

    const [commitMessage, setCommitMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null);
    const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
    const mutationLockRef = useRef(false);
    const isMutationPending = isSaving || restoringVersionId !== null;

    const handleClose = () => {
        if (mutationLockRef.current) return;
        const previewBase = exitPreview();
        if (previewBase) {
            setNodes(previewBase.nodes);
            setEdges(previewBase.edges);
        }
        onClose();

        window.requestAnimationFrame(() => {
            const returnTarget = document.querySelector<HTMLButtonElement>(
                VERSION_HISTORY_FOCUS_RETURN_SELECTOR,
            );
            if (!returnTarget?.isConnected || returnTarget.disabled) return;
            returnTarget.focus();
        });
    };

    const handleSave = async () => {
        if (mutationLockRef.current || previewVersion) return;
        mutationLockRef.current = true;
        setIsSaving(true);
        try {
            const saved = await saveVersion(normalizeVersionMessage(
                commitMessage,
                t('designer.versionHistoryPanel.defaultMessage'),
            ));
            if (saved) setCommitMessage('');
        } finally {
            mutationLockRef.current = false;
            setIsSaving(false);
        }
    };

    const handleRestore = async (versionId: string) => {
        if (mutationLockRef.current) return;
        mutationLockRef.current = true;
        setRestoringVersionId(versionId);
        try {
            const success = await restoreVersion(versionId, setNodes, setEdges);
            if (success) {
                mutationLockRef.current = false;
                handleClose();
            }
        } finally {
            mutationLockRef.current = false;
            setRestoringVersionId(null);
        }
    };

    const handlePreview = async (versionId: string) => {
        if (previewingVersionId || mutationLockRef.current) return;
        if (previewVersion?.id === versionId) {
            const previewBase = exitPreview();
            if (previewBase) {
                setNodes(previewBase.nodes);
                setEdges(previewBase.edges);
            }
            return;
        }
        setPreviewingVersionId(versionId);
        try {
            await enterPreview(versionId, setNodes, setEdges, getNodes(), getEdges());
        } finally {
            setPreviewingVersionId(null);
        }
    };

    return (
        <Drawer
            title={t('designer.versionHistoryPanel.title')}
            closable={isMutationPending
                ? false
                : { 'aria-label': t('designer.versionHistoryPanel.close') }}
            placement="right"
            onClose={handleClose}
            open={isOpen}
            rootClassName="version-history-drawer"
            getContainer={() => document.body}
            zIndex={2200}
            size="default"
            styles={{
                header: { padding: '16px 20px', borderBottom: '1px solid #f0f0f0' },
                body: { padding: 0, display: 'flex', flexDirection: 'column' },
                mask: { background: 'transparent', cursor: 'not-allowed' },
            }}
            mask={Boolean(previewVersion)}
            maskClosable={false}
            keyboard={!isMutationPending}
        >
            {/* Create Snapshot Area */}
            <div style={{ padding: '20px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <Title level={5} style={{ marginTop: 0, fontSize: 14 }}>
                    {t('designer.versionHistoryPanel.createTitle')}
                </Title>
                <div className="version-history-create-row">
                    <Input 
                        aria-label={t('designer.versionHistoryPanel.messageLabel')}
                        aria-describedby={previewVersion
                            ? 'version-history-message-hint version-history-preview-notice'
                            : 'version-history-message-hint'}
                        placeholder={t('designer.versionHistoryPanel.messagePlaceholder')}
                        value={commitMessage}
                        onChange={e => setCommitMessage(e.target.value)}
                        onPressEnter={handleSave}
                        disabled={Boolean(previewVersion) || isMutationPending}
                        maxLength={VERSION_MESSAGE_MAX_LENGTH}
                    />
                    <Button 
                        className="version-history-save"
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={handleSave}
                        loading={isSaving}
                        disabled={Boolean(previewVersion) || restoringVersionId !== null}
                    >
                        {t('designer.versionHistoryPanel.save')}
                    </Button>
                </div>
                <Text
                    id="version-history-message-hint"
                    type="secondary"
                    className="version-history-message-hint"
                >
                    {t('designer.versionHistoryPanel.messageHint', {
                        defaultMessage: t('designer.versionHistoryPanel.defaultMessage'),
                    })}
                </Text>
            </div>

            {/* Preview Banner */}
            {previewVersion && (
                <div
                    id="version-history-preview-notice"
                    role="status"
                    style={{
                        padding: '12px 20px',
                        background: '#e6f4ff',
                        borderBottom: '1px solid #91caff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}
                >
                    <Space orientation="vertical" size={0}>
                        <Space>
                            <EyeOutlined style={{ color: '#1677ff' }} />
                            <Text strong style={{ color: '#1677ff', fontSize: 13 }}>
                                {t('designer.versionHistoryPanel.previewing', { message: previewVersion.message })}
                            </Text>
                        </Space>
                        <Text style={{ color: '#1677ff', fontSize: 12 }}>
                            {t('designer.versionHistoryPanel.previewReadonly')}
                        </Text>
                    </Space>
                    <Button
                        size="small"
                        onClick={() => {
                            const previewBase = exitPreview();
                            if (previewBase) {
                                setNodes(previewBase.nodes);
                                setEdges(previewBase.edges);
                            }
                        }}
                    >{t('designer.versionHistoryPanel.exitPreview')}</Button>
                </div>
            )}

            {/* Timeline List */}
            {loadError && versions.length > 0 && (
                <Alert
                    className="version-history-load-error"
                    role="alert"
                    type="error"
                    showIcon
                    title={t('designer.versionHistoryPanel.loadErrorTitle')}
                    description={t('designer.versionHistoryPanel.loadErrorDescription')}
                    action={(
                        <Button
                            icon={<ReloadOutlined />}
                            aria-label={t('designer.versionHistoryPanel.retry')}
                            loading={loading}
                            onClick={() => void loadVersions()}
                        >
                            {t('designer.versionHistoryPanel.retry')}
                        </Button>
                    )}
                />
            )}
            <List
                loading={loading}
                itemLayout="horizontal"
                dataSource={versions}
                locale={{
                    emptyText: loadError ? (
                        <Alert
                            className="version-history-load-error"
                            role="alert"
                            type="error"
                            showIcon
                            title={t('designer.versionHistoryPanel.loadErrorTitle')}
                            description={t('designer.versionHistoryPanel.loadErrorDescription')}
                            action={(
                                <Button
                                    icon={<ReloadOutlined />}
                                    aria-label={t('designer.versionHistoryPanel.retry')}
                                    loading={loading}
                                    onClick={() => void loadVersions()}
                                >
                                    {t('designer.versionHistoryPanel.retry')}
                                </Button>
                            )}
                        />
                    ) : (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={(
                                <Space orientation="vertical" size={4}>
                                    <Text strong>{t('designer.versionHistoryPanel.emptyTitle')}</Text>
                                    <Text type="secondary" className="version-history-empty-description">
                                        {t('designer.versionHistoryPanel.emptyDescription')}
                                    </Text>
                                </Space>
                            )}
                        />
                    ),
                }}
                style={{ flex: 1, overflowY: 'auto' }}
                renderItem={(item, index) => {
                    const isLatest = index === 0;
                    const isPreviewing = previewVersion?.id === item.id;
                    
                    return (
                        <List.Item
                            actions={[
                                <Button
                                    key="preview"
                                    className="version-history-action"
                                    type={isPreviewing ? 'primary' : 'default'}
                                    aria-label={isPreviewing
                                        ? t('designer.versionHistoryPanel.exitPreviewVersion', { message: item.message })
                                        : t('designer.versionHistoryPanel.previewVersion', { message: item.message })}
                                    icon={<EyeOutlined />}
                                    loading={previewingVersionId === item.id}
                                    disabled={isMutationPending}
                                    onClick={() => void handlePreview(item.id)}
                                >
                                    {isPreviewing
                                        ? t('designer.versionHistoryPanel.exitPreview')
                                        : t('designer.versionHistoryPanel.preview')}
                                </Button>,
                                <Popconfirm
                                    key="restore"
                                    title={t('designer.versionHistoryPanel.restoreTitle')}
                                    description={t('designer.versionHistoryPanel.restoreDescription')}
                                    onConfirm={() => void handleRestore(item.id)}
                                    okText={t('designer.versionHistoryPanel.restore')}
                                    cancelText={t('designer.versionHistoryPanel.cancel')}
                                >
                                    <Tooltip title={t('designer.versionHistoryPanel.restoreTooltip')}>
                                        <Button
                                            className="version-history-action"
                                            aria-label={t('designer.versionHistoryPanel.restoreVersion', {
                                                message: item.message,
                                            })}
                                            type="text"
                                            icon={<UndoOutlined />}
                                            loading={restoringVersionId === item.id}
                                            disabled={isMutationPending}
                                        />
                                    </Tooltip>
                                </Popconfirm>
                            ]}
                            className="version-history-list-item"
                            style={{
                                padding: '16px 20px',
                                background: isPreviewing ? '#f0f5ff' : 'transparent',
                                borderLeft: isPreviewing ? '3px solid #1677ff' : '3px solid transparent',
                                transition: 'all 0.2s'
                            }}
                        >
                            <List.Item.Meta
                                avatar={
                                    <Badge dot color={isLatest ? "#10b981" : "#d9d9d9"}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: '#f5f5f5', display: 'flex', 
                                            alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            <Clock size={16} color="#8c8c8c" strokeWidth={2} />
                                        </div>
                                    </Badge>
                                }
                                title={
                                    <Space>
                                        <Text strong>{item.message || t('designer.versionHistoryPanel.unnamed')}</Text>
                                        {isLatest && (
                                            <Badge
                                                count={t('designer.versionHistoryPanel.latest')}
                                                style={{ backgroundColor: '#52c41a' }}
                                            />
                                        )}
                                    </Space>
                                }
                                description={
                                    <Space orientation="vertical" size={0}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {new Date(item.createdAt).toLocaleString(
                                                i18n.resolvedLanguage || i18n.language,
                                            )}
                                        </Text>
                                        {item.authorId && item.authorId !== 'anonymous' && (
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                {t('designer.versionHistoryPanel.createdBy', {
                                                    author: item.authorId,
                                                })}
                                            </Text>
                                        )}
                                    </Space>
                                }
                            />
                        </List.Item>
                    );
                }}
            />
        </Drawer>
    );
};
