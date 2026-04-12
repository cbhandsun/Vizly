import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Modal, Button, Select, Space, Typography, App, Tooltip, List, Tag, Popconfirm, Spin, theme, Tabs, Input, Avatar, Empty, Alert } from 'antd';
import { FaCopy, FaLink, FaTrash, FaUserPlus } from 'react-icons/fa';
import { LinkOutlined, TeamOutlined, UserOutlined, CheckCircleFilled, SafetyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { shareService, ShareRecord, CollaboratorRecord } from '@/services/ShareService';
import { useAuth } from '@/context/AuthContext';

const { Text } = Typography;

interface ShareDialogProps {
    open: boolean;
    onClose: () => void;
    diagramId: string;
    /** 确保图表已保存到云端后才能分享。返回云端 UUID 或 false。 */
    onEnsureSaved: () => Promise<string | false>;
}

type ExpirationOption = 'never' | '1day' | '7days' | '30days';

function getExpiresAt(option: ExpirationOption): Date | null {
    const now = new Date();
    switch (option) {
        case '1day': return new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        case '7days': return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        case '30days': return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        default: return null;
    }
}

/** 相对时间格式化 */
function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(dateStr).toLocaleDateString();
}

const isValidUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const ShareDialog: React.FC<ShareDialogProps> = ({ open, onClose, diagramId, onEnsureSaved }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const { user } = useAuth();
    const { message } = App.useApp();
    const [activeTab, setActiveTab] = useState('invite');

    // Link Share State
    const [expiration, setExpiration] = useState<ExpirationOption>('never');
    const [shares, setShares] = useState<ShareRecord[]>([]);
    const [loadingLink, setLoadingLink] = useState(false);
    const [creatingLink, setCreatingLink] = useState(false);
    const [justCopiedUrl, setJustCopiedUrl] = useState<string | null>(null);

    // Collaboration State
    const [collaborators, setCollaborators] = useState<CollaboratorRecord[]>([]);
    const [loadingCollabs, setLoadingCollabs] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'viewer' | 'editor'>('viewer');
    const [inviting, setInviting] = useState(false);
    const [inviteStatus, setInviteStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const inviteInputRef = useRef<any>(null);

    // 云端 UUID（保存后获得，用于替代本地 diagramId）
    const [cloudDiagramId, setCloudDiagramId] = useState<string | null>(null);
    const effectiveId = cloudDiagramId || diagramId;

    // Load Data
    const loadShares = useCallback(async () => {
        if (!open || !effectiveId || !isValidUuid(effectiveId)) return;
        setLoadingLink(true);
        try {
            const list = await shareService.listSharesForDiagram(effectiveId);
            setShares(list);
        } catch { } finally { setLoadingLink(false); }
    }, [open, effectiveId]);

    const loadCollaborators = useCallback(async () => {
        if (!open || !effectiveId || !isValidUuid(effectiveId)) return;
        setLoadingCollabs(true);
        try {
            const list = await shareService.listCollaborators(effectiveId);
            setCollaborators(list);
        } catch (err) { } finally { setLoadingCollabs(false); }
    }, [open, effectiveId]);

    useEffect(() => {
        if (open) {
            loadShares();
            loadCollaborators();
            setJustCopiedUrl(null);
            setInviteStatus('idle');
        }
    }, [open, loadShares, loadCollaborators]);

    // ===== Link Tab Actions =====
    const handleCreateLink = useCallback(async () => {
        if (!user) { message.warning(t('share.loginRequired')); return; }
        setCreatingLink(true);
        try {
            const savedId = await onEnsureSaved();
            if (!savedId) { message.error(t('export.cloudSaveFailed')); return; }
            setCloudDiagramId(savedId);
            const record = await shareService.createShareLink({ diagramId: savedId, userId: user.id, expiresAt: getExpiresAt(expiration) });
            const url = shareService.buildShareUrl(record.share_token);
            await navigator.clipboard.writeText(url);
            setJustCopiedUrl(url);
            setTimeout(() => setJustCopiedUrl(null), 5000);
            setShares(prev => [record, ...prev]);
        } catch (err) {
            message.error(String(err));
        } finally {
            setCreatingLink(false);
        }
    }, [user, expiration, onEnsureSaved, t]);

    const handleCopy = useCallback(async (shareToken: string) => {
        const url = shareService.buildShareUrl(shareToken);
        await navigator.clipboard.writeText(url);
        message.success(t('share.copied'));
    }, [t]);

    const handleRevokeShare = useCallback(async (shareId: string) => {
        try {
            await shareService.revokeShare(shareId);
            message.success(t('share.revoked'));
            setShares(prev => prev.filter(s => s.id !== shareId));
        } catch { message.error('Failed to revoke'); }
    }, [t]);

    // ===== Invite Tab Actions =====
    const handleInvite = useCallback(async () => {
        if (!user) { message.warning(t('share.loginRequired')); return; }
        if (!inviteEmail.trim()) return;
        setInviting(true);
        setInviteStatus('idle');
        try {
            const savedId = await onEnsureSaved();
            if (!savedId) { message.error(t('export.cloudSaveFailed')); return; }
            setCloudDiagramId(savedId);
            const res = await shareService.addCollaborator(savedId, inviteEmail.trim(), inviteRole);
            if (res.success) {
                message.success(t('share.inviteSuccess'));
                setInviteEmail('');
                setInviteStatus('success');
                setTimeout(() => setInviteStatus('idle'), 1500);
                await loadCollaborators();
            } else {
                setInviteStatus('error');
                setTimeout(() => setInviteStatus('idle'), 2000);
                message.error(t('share.inviteFailed', { error: res.error || 'Unknown' }));
            }
        } catch (err: any) {
            setInviteStatus('error');
            setTimeout(() => setInviteStatus('idle'), 2000);
            message.error(t('share.inviteFailed', { error: err.message || String(err) }));
        } finally {
            setInviting(false);
        }
    }, [user, inviteEmail, inviteRole, onEnsureSaved, loadCollaborators, t]);

    const handleRemoveCollab = useCallback(async (targetUserId: string) => {
        try {
            await shareService.removeCollaborator(effectiveId, targetUserId);
            message.success(t('share.removeSuccess'));
            setCollaborators(prev => prev.filter(c => c.user_id !== targetUserId));
        } catch { message.error('Failed to remove collaborator'); }
    }, [effectiveId, t]);

    // 输入框动态边框色
    const inputBorderStyle: React.CSSProperties = inviteStatus === 'success'
        ? { borderColor: token.colorSuccess, boxShadow: `0 0 0 2px ${token.colorSuccessBg}`, transition: 'all 0.3s' }
        : inviteStatus === 'error'
            ? { borderColor: token.colorError, boxShadow: `0 0 0 2px ${token.colorErrorBg}`, transition: 'all 0.3s' }
            : {};

    // ===== UI Renders =====
    const items = [
        {
            key: 'invite',
            label: <span><TeamOutlined style={{ marginRight: 6 }} />{t('share.tabs.invite')}</span>,
            children: (
                <div style={{ paddingTop: 8 }}>
                    <Space.Compact style={{ width: '100%', marginBottom: 24 }}>
                        <Input
                            ref={inviteInputRef}
                            placeholder={t('share.inviteInput')}
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            onPressEnter={handleInvite}
                            style={inputBorderStyle}
                        />
                        <Select value={inviteRole} onChange={setInviteRole as any} style={{ width: 120 }}>
                            <Select.Option value="viewer">{t('share.roleViewer')}</Select.Option>
                            <Select.Option value="editor" disabled>{t('share.roleEditor')}</Select.Option>
                        </Select>
                        <Button type="primary" icon={<FaUserPlus />} loading={inviting} onClick={handleInvite} disabled={!user || !inviteEmail.trim()}>
                            {t('share.inviteBtn')}
                        </Button>
                    </Space.Compact>

                    <Text type="secondary" strong style={{ display: 'block', marginBottom: 12 }}>{t('share.collaborators')}</Text>
                    {loadingCollabs ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : collaborators.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            imageStyle={{ height: 48 }}
                            description={
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    输入邮箱邀请协作者查看此图表
                                </Text>
                            }
                        />
                    ) : (
                        <List
                            size="small"
                            dataSource={collaborators}
                            renderItem={item => {
                                const isSelf = item.user_id === user?.id;
                                return (
                                    <List.Item
                                        actions={[
                                            !isSelf && (
                                                <Popconfirm
                                                    key="remove"
                                                    title="确认移除此协作者？"
                                                    onConfirm={() => handleRemoveCollab(item.user_id)}
                                                    okText="移除"
                                                    cancelText="取消"
                                                >
                                                    <Button size="small" type="text" danger icon={<FaTrash style={{ fontSize: 11 }} />}>
                                                        {t('share.remove')}
                                                    </Button>
                                                </Popconfirm>
                                            )
                                        ].filter(Boolean) as React.ReactNode[]}
                                    >
                                        <List.Item.Meta
                                            avatar={<Avatar icon={<UserOutlined />} style={{ backgroundColor: token.colorPrimary }} />}
                                            title={
                                                <Space>
                                                    <Text>{item.email || item.user_id}</Text>
                                                    {isSelf && <Tag color="blue">{t('share.you')}</Tag>}
                                                    {item.role === 'owner' && <Tag color="gold">{t('share.owner')}</Tag>}
                                                </Space>
                                            }
                                            description={<Text type="secondary" style={{ fontSize: 12 }}>{item.role === 'viewer' ? t('share.roleViewer') : t('share.roleEditor')}</Text>}
                                        />
                                    </List.Item>
                                );
                            }}
                        />
                    )}
                </div>
            )
        },
        {
            key: 'link',
            label: <span><LinkOutlined style={{ marginRight: 6 }} />{t('share.tabs.link')}</span>,
            children: (
                <div style={{ paddingTop: 8 }}>
                    <Space style={{ width: '100%', marginBottom: 16 }}>
                        <Select
                            value={expiration}
                            onChange={setExpiration}
                            options={[
                                { value: 'never', label: t('share.never') },
                                { value: '1day', label: t('share.1day') },
                                { value: '7days', label: t('share.7days') },
                                { value: '30days', label: t('share.30days') },
                            ]}
                            style={{ width: 140 }}
                        />
                        <Button type="primary" icon={<FaLink />} loading={creatingLink} onClick={handleCreateLink} disabled={!user}>
                            {t('share.generateLink')}
                        </Button>
                    </Space>
                    {!user && <Text type="warning" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>{t('share.loginRequired')}</Text>}

                    {/* 链接复制成功高亮提示 */}
                    {justCopiedUrl && (
                        <Alert
                            type="success"
                            showIcon
                            icon={<CheckCircleFilled />}
                            message="链接已复制到剪贴板"
                            description={
                                <Text copyable={{ text: justCopiedUrl }} style={{ fontSize: 12, wordBreak: 'break-all' }}>
                                    {justCopiedUrl}
                                </Text>
                            }
                            style={{ marginBottom: 16 }}
                            closable
                            onClose={() => setJustCopiedUrl(null)}
                        />
                    )}

                    <Text type="secondary" strong style={{ display: 'block', marginBottom: 12 }}>分享链接历史</Text>
                    {loadingLink ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : shares.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            imageStyle={{ height: 48 }}
                            description={
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    生成公开链接，任何拥有链接的人都可查看
                                </Text>
                            }
                        />
                    ) : (
                        <List
                            size="small"
                            dataSource={shares}
                            renderItem={item => {
                                const url = shareService.buildShareUrl(item.share_token);
                                const isExpired = item.expires_at && new Date(item.expires_at) < new Date();
                                return (
                                    <List.Item
                                        actions={[
                                            <Tooltip title={t('share.copyLink')} key="copy">
                                                <Button type="text" size="small" icon={<FaCopy />} onClick={() => handleCopy(item.share_token)} />
                                            </Tooltip>,
                                            <Popconfirm key="revoke" title={t('share.revokeConfirm')} onConfirm={() => handleRevokeShare(item.id)} okText={t('share.revokeShare')}>
                                                <Tooltip title={t('share.revokeShare')}><Button type="text" size="small" danger icon={<FaTrash />} /></Tooltip>
                                            </Popconfirm>,
                                        ]}
                                    >
                                        <List.Item.Meta
                                            title={
                                                <Text
                                                    copyable={{ text: url }}
                                                    style={{
                                                        fontSize: 12,
                                                        maxWidth: 300,
                                                        wordBreak: 'break-all',
                                                        ...(isExpired ? { textDecoration: 'line-through', opacity: 0.5 } : {}),
                                                    }}
                                                >
                                                    {url}
                                                </Text>
                                            }
                                            description={
                                                <Space size={8}>
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        {formatRelativeTime(item.created_at)}
                                                    </Text>
                                                    {item.expires_at ? (
                                                        <Tag
                                                            color={isExpired ? 'red' : 'blue'}
                                                            style={{ fontSize: 11 }}
                                                        >
                                                            {isExpired ? '已过期' : `${t('share.expiresAt')}: ${new Date(item.expires_at).toLocaleDateString()}`}
                                                        </Tag>
                                                    ) : <Tag color="green" style={{ fontSize: 11 }}>{t('share.never')}</Tag>}
                                                </Space>
                                            }
                                        />
                                    </List.Item>
                                );
                            }}
                        />
                    )}
                </div>
            )
        }
    ];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            title={
                <Space>
                    <SafetyOutlined style={{ color: token.colorPrimary }} />
                    <span>{t('share.title')}</span>
                </Space>
            }
            footer={
                <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center' }}>
                    🔒 分享的图表可随时撤销访问权限
                </Text>
            }
            width={560}
        >
            <Tabs defaultActiveKey="invite" activeKey={activeTab} onChange={setActiveTab} items={items} />
        </Modal>
    );
};

export default ShareDialog;
