import React, { useState } from 'react';
import { Drawer, Button, Input, List, Typography, Space, Tooltip, Badge, Popconfirm } from 'antd';
import { ClockCircleOutlined, PlusOutlined, UndoOutlined, EyeOutlined } from '@ant-design/icons';
import { useVersionHistory } from '../hooks/useVersionHistory';
import { useReactFlow } from '@xyflow/react';

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
    const { setNodes, setEdges } = useReactFlow();
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

    const handleSave = async () => {
        setIsSaving(true);
        await saveVersion(commitMessage.trim() || '手动保存的版本快照');
        setCommitMessage('');
        setIsSaving(false);
    };

    const handleRestore = async (versionId: string) => {
        const success = await restoreVersion(versionId, setNodes, setEdges);
        if (success) {
            onClose();
        }
    };

    return (
        <Drawer
            title="版本历史 (Version History)"
            placement="right"
            onClose={() => {
                exitPreview();
                onClose();
            }}
            open={isOpen}
            width={380}
            styles={{
                header: { padding: '16px 20px', borderBottom: '1px solid #f0f0f0' },
                body: { padding: 0, display: 'flex', flexDirection: 'column' }
            }}
            mask={false} // Don't block interactions behind it, user might want to see the preview
        >
            {/* Create Snapshot Area */}
            <div style={{ padding: '20px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <Title level={5} style={{ marginTop: 0, fontSize: 14 }}>创建新快照</Title>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Input 
                        placeholder="版本备注 (例如：添加了订单模块)" 
                        value={commitMessage}
                        onChange={e => setCommitMessage(e.target.value)}
                        onPressEnter={handleSave}
                    />
                    <Button 
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={handleSave}
                        loading={isSaving}
                    >
                        保存
                    </Button>
                </div>
            </div>

            {/* Preview Banner */}
            {previewVersion && (
                <div style={{
                    padding: '12px 20px',
                    background: '#e6f4ff',
                    borderBottom: '1px solid #91caff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <Space>
                        <EyeOutlined style={{ color: '#1677ff' }} />
                        <Text strong style={{ color: '#1677ff', fontSize: 13 }}>正在预览: {previewVersion.message}</Text>
                    </Space>
                    <Button size="small" onClick={exitPreview}>退出预览</Button>
                </div>
            )}

            {/* Timeline List */}
            <List
                loading={loading}
                itemLayout="horizontal"
                dataSource={versions}
                style={{ flex: 1, overflowY: 'auto' }}
                renderItem={(item, index) => {
                    const isLatest = index === 0;
                    const isPreviewing = previewVersion?.id === item.id;
                    
                    return (
                        <List.Item
                            actions={[
                                <Popconfirm
                                    key="restore"
                                    title="穿越确认"
                                    description="恢复后，当前未保存的更改将丢失。确定穿越回这个版本吗？"
                                    onConfirm={() => handleRestore(item.id)}
                                >
                                    <Tooltip title="恢复此版本">
                                        <Button type="text" size="small" icon={<UndoOutlined />} />
                                    </Tooltip>
                                </Popconfirm>
                            ]}
                            style={{
                                padding: '16px 20px',
                                cursor: 'pointer',
                                background: isPreviewing ? '#f0f5ff' : 'transparent',
                                borderLeft: isPreviewing ? '3px solid #1677ff' : '3px solid transparent',
                                transition: 'all 0.2s'
                            }}
                            onClick={() => {
                                if (isPreviewing) exitPreview();
                                else enterPreview(item.id);
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
                                            <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
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
                                    <Space direction="vertical" size={0}>
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
