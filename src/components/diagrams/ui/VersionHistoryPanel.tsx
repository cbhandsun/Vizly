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

type VersionHistoryPanelOperation =
    | { diagramId: string; kind: 'save' }
    | { diagramId: string; kind: 'preview'; versionId: string }
    | { diagramId: string; kind: 'restore'; versionId: string };

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
    const [pendingOperation, setPendingOperation] = useState<VersionHistoryPanelOperation | null>(null);
    const operationRef = useRef<VersionHistoryPanelOperation | null>(null);
    const activeOperation = pendingOperation?.diagramId === diagramId ? pendingOperation : null;
    const isSaving = activeOperation?.kind === 'save';
    const previewingVersionId = activeOperation?.kind === 'preview'
        ? activeOperation.versionId
        : null;
    const restoringVersionId = activeOperation?.kind === 'restore'
        ? activeOperation.versionId
        : null;
    const isMutationPending = isSaving || restoringVersionId !== null;

    const startOperation = (operation: VersionHistoryPanelOperation) => {
        if (operationRef.current?.diagramId === diagramId) return false;
        operationRef.current = operation;
        setPendingOperation(operation);
        return true;
    };

    const finishOperation = (operation: VersionHistoryPanelOperation) => {
        if (operationRef.current === operation) operationRef.current = null;
        setPendingOperation(current => current === operation ? null : current);
    };

    const handleClose = () => {
        const currentOperation = operationRef.current?.diagramId === diagramId
            ? operationRef.current
            : null;
        if (currentOperation?.kind === 'save' || currentOperation?.kind === 'restore') return;
        if (currentOperation?.kind === 'preview') finishOperation(currentOperation);
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
        if (activeOperation || previewVersion) return;
        const operation: VersionHistoryPanelOperation = { diagramId, kind: 'save' };
        if (!startOperation(operation)) return;
        try {
            const saved = await saveVersion(normalizeVersionMessage(
                commitMessage,
                t('designer.versionHistoryPanel.defaultMessage'),
            ));
            if (saved) setCommitMessage('');
        } finally {
            finishOperation(operation);
        }
    };

    const handleRestore = async (versionId: string) => {
        if (activeOperation) return;
        const operation: VersionHistoryPanelOperation = { diagramId, kind: 'restore', versionId };
        if (!startOperation(operation)) return;
        try {
            const success = await restoreVersion(versionId, setNodes, setEdges);
            if (success) {
                finishOperation(operation);
                handleClose();
            }
        } finally {
            finishOperation(operation);
        }
    };

    const handlePreview = async (versionId: string) => {
        if (activeOperation) return;
        if (previewVersion?.id === versionId) {
            const previewBase = exitPreview();
            if (previewBase) {
                setNodes(previewBase.nodes);
                setEdges(previewBase.edges);
            }
            return;
        }
        const operation: VersionHistoryPanelOperation = { diagramId, kind: 'preview', versionId };
        if (!startOperation(operation)) return;
        try {
            await enterPreview(versionId, setNodes, setEdges, getNodes, getEdges);
        } finally {
            finishOperation(operation);
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
            mask={Boolean(previewVersion || previewingVersionId)}
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
                        disabled={Boolean(previewVersion) || activeOperation !== null}
                        maxLength={VERSION_MESSAGE_MAX_LENGTH}
                    />
                    <Button 
                        className="version-history-save"
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={handleSave}
                        loading={isSaving}
                        disabled={Boolean(previewVersion) || activeOperation !== null}
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
                                    disabled={activeOperation !== null}
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
                                            disabled={activeOperation !== null}
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
