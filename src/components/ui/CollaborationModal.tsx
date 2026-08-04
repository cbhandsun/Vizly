import React, { useCallback, useState } from 'react';
import { Alert, Modal, Input, Button, List, Typography, Badge, Avatar } from 'antd';
import { CopyOutlined, TeamOutlined } from '@ant-design/icons';
import { buildCollaborationShareUrl } from './collaborationUrl';
import type { ActiveCollaborator } from '../diagrams/collaboration/YjsProviderHooks';
import type { DiagramCollaborationStatus } from '@/core/types/diagram-components';
import { useTranslation } from 'react-i18next';
import { tryCopyShareUrl } from '@/components/shareClipboard';
import {
    COMMERCIAL_VIEWPORT_MODAL_CLASS,
    COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
    getViewportOverlayContainer,
} from '@/core/components/ui/viewportOverlayPortal';
import './CollaborationModal.css';

export interface CollaborationModalProps {
    open: boolean;
    onClose: () => void;
    activeUsers: ActiveCollaborator[];
    roomName: string;
    status: DiagramCollaborationStatus;
}

export const CollaborationModal: React.FC<CollaborationModalProps> = ({
    open,
    onClose,
    activeUsers,
    roomName,
    status,
}) => {
    const { t } = useTranslation();
    const [copyState, setCopyState] = useState<{
        roomName: string;
        status: 'idle' | 'copying' | 'copied' | 'failed';
    }>({ roomName, status: 'idle' });

    // Build the shareable URL
    const shareUrl = typeof window !== 'undefined'
        ? buildCollaborationShareUrl(window.location, roomName)
        : '';

    const currentCopyStatus = copyState.roomName === roomName ? copyState.status : 'idle';
    const copied = currentCopyStatus === 'copied';
    const copying = currentCopyStatus === 'copying';
    const copyFailed = currentCopyStatus === 'failed';
    const inviteReady = status === 'connected';

    const handleCopy = useCallback(async () => {
        if (!shareUrl) return;
        setCopyState({ roomName, status: 'copying' });
        const didCopy = await tryCopyShareUrl(shareUrl);
        setCopyState({ roomName, status: didCopy ? 'copied' : 'failed' });
    }, [roomName, shareUrl]);

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <TeamOutlined className="text-blue-500" />
                    <span>{t('collaboration.modalTitle')}</span>
                </div>
            }
            open={open}
            onCancel={onClose}
            afterOpenChange={(nextOpen) => {
                if (!nextOpen) setCopyState({ roomName, status: 'idle' });
            }}
            getContainer={getViewportOverlayContainer}
            rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} collaboration-viewport-modal`}
            zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}
            footer={null}
            destroyOnHidden
            width={480}
            className="modern-glass-modal"
        >
            <div className="flex flex-col gap-4 py-4">
                {inviteReady ? (
                    <div className="bg-blue-50/50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                        <Typography.Text className="block mb-2 font-medium text-gray-700 dark:text-gray-300">
                            {t('collaboration.inviteLink')}
                        </Typography.Text>
                        <div className="collaboration-copy-row">
                            <Input
                                value={shareUrl}
                                readOnly
                                aria-label={t('collaboration.inviteLink')}
                                className="bg-white/80 dark:bg-slate-800/80"
                            />
                            <Button
                                type="primary"
                                icon={<CopyOutlined />}
                                onClick={handleCopy}
                                loading={copying}
                                aria-label={copied
                                    ? t('collaboration.copied')
                                    : copyFailed
                                        ? t('collaboration.retryCopy')
                                        : t('collaboration.copy')}
                            >
                                {copied
                                    ? t('collaboration.copied')
                                    : copyFailed
                                        ? t('collaboration.retryCopy')
                                        : t('collaboration.copy')}
                            </Button>
                        </div>
                        <Typography.Text type="secondary" className="text-xs mt-2 block">
                            {t('collaboration.inviteDescription')}
                        </Typography.Text>
                        {copyFailed && (
                            <Alert
                                className="collaboration-copy-alert"
                                type="warning"
                                showIcon
                                title={t('collaboration.copyFailed')}
                                description={t('collaboration.copyFallback')}
                            />
                        )}
                    </div>
                ) : (
                    <Alert
                        type={status === 'disconnected' ? 'error' : 'warning'}
                        showIcon
                        title={t(`collaboration.${status}`)}
                        description={t(`collaboration.inviteStatus.${status}`)}
                    />
                )}

                <div className="mt-2">
                    <Typography.Text className="block mb-3 font-medium text-gray-700 dark:text-gray-300">
                        {t('collaboration.currentOnline', { count: activeUsers.length })}
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
                                    <span className="collaboration-user-name text-sm font-medium text-gray-700 dark:text-gray-300">
                                        {item.user?.name || t('collaboration.unknownUser')}
                                    </span>
                                    {item.isLocal && (
                                        <Badge count={t('collaboration.localUser')} style={{ backgroundColor: '#52c41a' }} />
                                    )}
                                </div>
                            </List.Item>
                        )}
                        locale={{ emptyText: t('collaboration.noOnlineUsers') }}
                    />
                </div>
            </div>
        </Modal>
    );
};
