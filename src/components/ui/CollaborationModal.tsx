import React, { useState } from 'react';
import { Modal, Input, Button, List, Typography, Badge, Avatar } from 'antd';
import { CopyOutlined, TeamOutlined } from '@ant-design/icons';
import { buildCollaborationShareUrl } from './collaborationUrl';
import type { ActiveCollaborator } from '../diagrams/collaboration/YjsProviderHooks';

export interface CollaborationModalProps {
    open: boolean;
    onClose: () => void;
    activeUsers: ActiveCollaborator[];
    roomName: string;
}

export const CollaborationModal: React.FC<CollaborationModalProps> = ({
    open,
    onClose,
    activeUsers,
    roomName,
}) => {
    const [copied, setCopied] = useState(false);

    // Build the shareable URL
    const shareUrl = typeof window !== 'undefined'
        ? buildCollaborationShareUrl(window.location, roomName)
        : '';

    const handleCopy = () => {
        if (!shareUrl) return;
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <TeamOutlined className="text-blue-500" />
                    <span>实时协作 (Beta)</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            getContainer={() => document.getElementById('app-root-layout') || document.body}
            footer={null}
            destroyOnHidden
            width={480}
            className="modern-glass-modal"
        >
            <div className="flex flex-col gap-4 py-4">
                <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                    <Typography.Text className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
                        邀请链接
                    </Typography.Text>
                    <div className="flex gap-2">
                        <Input 
                            value={shareUrl} 
                            readOnly 
                            className="bg-white/80 dark:bg-slate-800/80" 
                        />
                        <Button 
                            type="primary" 
                            icon={<CopyOutlined />} 
                            onClick={handleCopy}
                        >
                            {copied ? '已复制' : '复制'}
                        </Button>
                    </div>
                    <Typography.Text type="secondary" className="text-xs mt-2 block">
                        将此链接发送给团队成员，即可在同一画板实时白板协作（鼠标指针实时同步）。
                    </Typography.Text>
                </div>

                <div className="mt-2">
                    <Typography.Text className="block mb-3 font-medium text-gray-700 dark:text-gray-300">
                        当前在线 ({activeUsers.length})
                    </Typography.Text>
                    <List
                        className="bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-gray-700 max-h-[200px] overflow-y-auto"
                        size="small"
                        dataSource={activeUsers}
                        renderItem={item => (
                            <List.Item className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Avatar 
                                        style={{ backgroundColor: item.user?.color || '#ccc' }}
                                        size="small"
                                    >
                                        {item.user?.name?.charAt(0)?.toUpperCase()}
                                    </Avatar>
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {item.user?.name || 'Unknown User'}
                                    </span>
                                    {item.isLocal && (
                                        <Badge count="你" style={{ backgroundColor: '#52c41a' }} />
                                    )}
                                </div>
                            </List.Item>
                        )}
                        locale={{ emptyText: '当前房间内没有在线成员' }}
                    />
                </div>
            </div>
        </Modal>
    );
};
