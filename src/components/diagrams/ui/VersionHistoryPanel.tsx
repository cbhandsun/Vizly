import React, { useState } from 'react';
import { Drawer, Button, Input, List, Typography, Space, Tooltip, Badge, Popconfirm } from 'antd';
import { PlusOutlined, UndoOutlined, EyeOutlined } from '@ant-design/icons';
import { Clock } from 'lucide-react';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { useReactFlow } from '@xyflow/react';
import {
    normalizeVersionMessage,
    VERSION_MESSAGE_MAX_LENGTH,
} from './versionHistoryInput';
import './VersionHistoryPanel.css';

const { Text, Title } = Typography;

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
    const { setNodes, setEdges, getNodes, getEdges } = useReactFlow();
    const {
        versions,
        loading,
        previewVersion,
        saveVersion,
        enterPreview,
        exitPreview,
        restoreVersion
    } = useVersionHistory(diagramId);

    const [commitMessage, setCommitMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null);
    const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);

    const handleSave = async () => {
        if (isSaving || previewVersion) return;
        setIsSaving(true);
        try {
            const saved = await saveVersion(normalizeVersionMessage(commitMessage));
            if (saved) setCommitMessage('');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRestore = async (versionId: string) => {
        if (restoringVersionId) return;
        setRestoringVersionId(versionId);
        try {
            const success = await restoreVersion(versionId, setNodes, setEdges);
            if (success) onClose();
        } finally {
            setRestoringVersionId(null);
        }
    };

    const handlePreview = async (versionId: string) => {
        if (previewingVersionId) return;
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
            title="版本历史"
            placement="right"
            onClose={() => {
                const previewBase = exitPreview();
                if (previewBase) {
                    setNodes(previewBase.nodes);
                    setEdges(previewBase.edges);
                }
                onClose();
            }}
            open={isOpen}
            rootClassName="version-history-drawer"
            getContainer={() => document.body}
            zIndex={2200}
            size="default"
            styles={{
                header: { padding: '16px 20px', borderBottom: '1px solid #f0f0f0' },
                body: { padding: 0, display: 'flex', flexDirection: 'column' }
            }}
            mask={false} // Don't block interactions behind it, user might want to see the preview
        >
            {/* Create Snapshot Area */}
            <div style={{ padding: '20px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <Title level={5} style={{ marginTop: 0, fontSize: 14 }}>创建新快照</Title>
                <div className="version-history-create-row">
                    <Input 
                        aria-label="版本备注（选填）"
                        aria-describedby={previewVersion
                            ? 'version-history-message-hint version-history-preview-notice'
                            : 'version-history-message-hint'}
                        placeholder="版本备注（选填，例如：添加了订单模块）"
                        value={commitMessage}
                        onChange={e => setCommitMessage(e.target.value)}
                        onPressEnter={handleSave}
                        disabled={Boolean(previewVersion)}
                        maxLength={VERSION_MESSAGE_MAX_LENGTH}
                    />
                    <Button 
                        className="version-history-save"
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={handleSave}
                        loading={isSaving}
                        disabled={Boolean(previewVersion)}
                    >
                        保存
                    </Button>
                </div>
                <Text
                    id="version-history-message-hint"
                    type="secondary"
                    className="version-history-message-hint"
                >
                    留空时将使用“手动保存的版本快照”
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
                            <Text strong style={{ color: '#1677ff', fontSize: 13 }}>正在预览：{previewVersion.message}</Text>
                        </Space>
                        <Text style={{ color: '#1677ff', fontSize: 12 }}>退出预览后才能创建新快照</Text>
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
                    >退出预览</Button>
                </div>
            )}

            {/* Timeline List */}
            <List
                loading={loading}
                itemLayout="horizontal"
                dataSource={versions}
                locale={{ emptyText: '暂无版本快照' }}
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
                                    aria-label={isPreviewing ? `退出预览：${item.message}` : `预览版本：${item.message}`}
                                    icon={<EyeOutlined />}
                                    loading={previewingVersionId === item.id}
                                    onClick={() => void handlePreview(item.id)}
                                >
                                    {isPreviewing ? '退出预览' : '预览'}
                                </Button>,
                                <Popconfirm
                                    key="restore"
                                    title="恢复版本"
                                    description="恢复后，当前未保存的更改将丢失。确定恢复此版本吗？"
                                    onConfirm={() => void handleRestore(item.id)}
                                    okText="恢复"
                                    cancelText="取消"
                                >
                                    <Tooltip title="恢复此版本">
                                        <Button
                                            className="version-history-action"
                                            aria-label={`恢复版本：${item.message}`}
                                            type="text"
                                            icon={<UndoOutlined />}
                                            loading={restoringVersionId === item.id}
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
                                        <Text strong>{item.message || '未命名快照'}</Text>
                                        {isLatest && <Badge count="最新" style={{ backgroundColor: '#52c41a' }} />}
                                    </Space>
                                }
                                description={
                                    <Space orientation="vertical" size={0}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {new Date(item.createdAt).toLocaleString()}
                                        </Text>
                                        {item.authorId && item.authorId !== 'anonymous' && (
                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                由 {item.authorId} 创建
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
