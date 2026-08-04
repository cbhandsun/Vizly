import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Select, Space, Typography, Tooltip, List, Tag, Popconfirm, Spin, theme, Tabs, Input, Avatar, Empty, Alert } from 'antd';
import { FaCopy, FaLink, FaTrash, FaUserPlus } from 'react-icons/fa';
import { LinkOutlined, TeamOutlined, UserOutlined, CheckCircleFilled, SafetyOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { shareService, ShareRecord, CollaboratorRecord } from '@/services/ShareService';
import { useAuth } from '@/context/useAuth';
import { appMessage } from '@/core/utils/antdStaticBridge';
import {
    logShareDialogLoadFailure,
    logShareDialogMutationFailure,
} from '@/components/shareDialogLogging';
import { tryCopyShareUrl } from '@/components/shareClipboard';
import { parseCollaboratorEmail } from '@/services/shareInvitationBoundary';
import {
    COMMERCIAL_VIEWPORT_MODAL_CLASS,
    COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
    getViewportOverlayContainer,
} from '@/core/components/ui/viewportOverlayPortal';
import './ShareDialog.css';

const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

const { Text } = Typography;

interface ShareDialogProps {
    open: boolean;
    onClose: () => void;
    diagramId: string;
    /** 确保图表已保存到云端后才能分享。返回云端 UUID 或 false。 */
    onEnsureSaved: () => Promise<string | false>;
}

type ExpirationOption = 'never' | '1day' | '7days' | '30days';
type InviteRole = 'viewer' | 'editor';

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
    const [activeTab, setActiveTab] = useState('invite');
    const [authModalOpen, setAuthModalOpen] = useState(false);

    // Link Share State
    const [expiration, setExpiration] = useState<ExpirationOption>('never');
    const [shares, setShares] = useState<ShareRecord[]>([]);
    const [loadingLink, setLoadingLink] = useState(false);
    const [creatingLink, setCreatingLink] = useState(false);
    const [shareLinkResult, setShareLinkResult] = useState<{ url: string; copied: boolean } | null>(null);
    const [sharesLoadFailed, setSharesLoadFailed] = useState(false);
    const [linkMutationFailed, setLinkMutationFailed] = useState(false);
    const sharesLoadRequestRef = useRef(0);
    const pendingCreatedSharesRef = useRef<ShareRecord[]>([]);

    // Collaboration State
    const [collaborators, setCollaborators] = useState<CollaboratorRecord[]>([]);
    const [loadingCollabs, setLoadingCollabs] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteEmailTouched, setInviteEmailTouched] = useState(false);
    const [inviteRole, setInviteRole] = useState<InviteRole>('viewer');
    const [inviting, setInviting] = useState(false);
    const [inviteStatus, setInviteStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [collaboratorsLoadFailed, setCollaboratorsLoadFailed] = useState(false);

    const parsedInviteEmail = useMemo(
        () => parseCollaboratorEmail(inviteEmail),
        [inviteEmail],
    );

    // 云端 UUID（保存后获得，用于替代本地 diagramId）
    const [cloudDiagramId, setCloudDiagramId] = useState<string | null>(null);
    const effectiveId = cloudDiagramId || diagramId;

    // Load Data
    const loadShares = useCallback(async () => {
        if (!open || !effectiveId || !isValidUuid(effectiveId)) return;
        const requestId = ++sharesLoadRequestRef.current;
        setLoadingLink(true);
        setSharesLoadFailed(false);
        try {
            const list = await shareService.listSharesForDiagram(effectiveId);
            if (requestId === sharesLoadRequestRef.current) {
                const listedIds = new Set(list.map(share => share.id));
                const pendingForDiagram = pendingCreatedSharesRef.current.filter(
                    share => share.diagram_id === effectiveId && !listedIds.has(share.id),
                );
                pendingCreatedSharesRef.current = pendingCreatedSharesRef.current.filter(
                    share => share.diagram_id !== effectiveId || !listedIds.has(share.id),
                );
                setShares([...pendingForDiagram, ...list]);
            }
        } catch (error) {
            logShareDialogLoadFailure('shares', error);
            if (requestId === sharesLoadRequestRef.current) setSharesLoadFailed(true);
        } finally { setLoadingLink(false); }
    }, [open, effectiveId]);

    const loadCollaborators = useCallback(async () => {
        if (!open || !effectiveId || !isValidUuid(effectiveId)) return;
        setLoadingCollabs(true);
        setCollaboratorsLoadFailed(false);
        try {
            const list = await shareService.listCollaborators(effectiveId);
            setCollaborators(list);
        } catch (error) {
            logShareDialogLoadFailure('collaborators', error);
            setCollaboratorsLoadFailed(true);
        } finally { setLoadingCollabs(false); }
    }, [open, effectiveId]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            void loadShares();
            void loadCollaborators();
            setShareLinkResult(null);
            setLinkMutationFailed(false);
            setInviteStatus('idle');
            setInviteEmailTouched(false);
        });
        return () => { cancelled = true; };
    }, [open, loadShares, loadCollaborators]);

    // ===== Link Tab Actions =====
    const handleCreateLink = useCallback(async () => {
        if (!user) { appMessage.warning(t('share.loginRequired')); return; }
        setCreatingLink(true);
        setLinkMutationFailed(false);
        try {
            const savedId = await onEnsureSaved();
            if (!savedId) {
                setLinkMutationFailed(true);
                return;
            }
            setCloudDiagramId(savedId);
            const record = await shareService.createShareLink({ diagramId: savedId, userId: user.id, expiresAt: getExpiresAt(expiration) });
            const url = shareService.buildShareUrl(record.share_token);
            // A cloud-ID transition can start a list request while creation is in flight.
            // Invalidate that older response before preserving the newly created record.
            sharesLoadRequestRef.current += 1;
            pendingCreatedSharesRef.current = [record, ...pendingCreatedSharesRef.current];
            setShares(prev => [record, ...prev]);
            const copied = await tryCopyShareUrl(url);
            setShareLinkResult({ url, copied });
            if (copied) {
                appMessage.success(t('share.copied'));
            } else {
                appMessage.warning(t('share.copyUnavailable', '链接已生成，请手动复制'));
            }
        } catch (error) {
            logShareDialogMutationFailure('createShareLink', error);
            setLinkMutationFailed(true);
            appMessage.error(t('share.generateFailed', '无法生成分享链接，请稍后重试'));
        } finally {
            setCreatingLink(false);
        }
    }, [user, expiration, onEnsureSaved, t]);

    const handleCopy = useCallback(async (shareToken: string) => {
        const url = shareService.buildShareUrl(shareToken);
        const copied = await tryCopyShareUrl(url);
        if (copied) {
            appMessage.success(t('share.copied'));
        } else {
            appMessage.error(t('share.copyFailed', '复制失败，请手动选择链接'));
        }
    }, [t]);

    const handleRevokeShare = useCallback(async (shareId: string) => {
        try {
            await shareService.revokeShare(shareId);
            appMessage.success(t('share.revoked'));
            pendingCreatedSharesRef.current = pendingCreatedSharesRef.current.filter(share => share.id !== shareId);
            setShares(prev => prev.filter(s => s.id !== shareId));
        } catch (error) {
            logShareDialogMutationFailure('revokeShare', error);
            appMessage.error('Failed to revoke');
        }
    }, [t]);

    // ===== Invite Tab Actions =====
    const handleInvite = useCallback(async () => {
        if (!user) { appMessage.warning(t('share.loginRequired')); return; }
        const targetEmail = parseCollaboratorEmail(inviteEmail);
        if (!targetEmail.ok) {
            setInviteEmailTouched(true);
            return;
        }
        setInviting(true);
        setInviteStatus('idle');
        try {
            const savedId = await onEnsureSaved();
            if (!savedId) {
                setInviteStatus('error');
                return;
            }
            setCloudDiagramId(savedId);
            const res = await shareService.addCollaborator(savedId, targetEmail.email, inviteRole);
            if (res.success) {
                appMessage.success(t('share.inviteSuccess'));
                setInviteEmail('');
                setInviteEmailTouched(false);
                setInviteStatus('success');
                await loadCollaborators();
            } else {
                logShareDialogMutationFailure('addCollaborator', new Error('Collaborator invite was rejected'));
                setInviteStatus('error');
                appMessage.error(t('share.inviteFailedSafe', '邀请失败，请稍后重试'));
            }
        } catch (error) {
            logShareDialogMutationFailure('addCollaborator', error);
            setInviteStatus('error');
            appMessage.error(t('share.inviteFailedSafe', '邀请失败，请稍后重试'));
        } finally {
            setInviting(false);
        }
    }, [user, inviteEmail, inviteRole, onEnsureSaved, loadCollaborators, t]);

    const handleRemoveCollab = useCallback(async (targetUserId: string) => {
        try {
            await shareService.removeCollaborator(effectiveId, targetUserId);
            appMessage.success(t('share.removeSuccess'));
            setCollaborators(prev => prev.filter(c => c.user_id !== targetUserId));
        } catch (error) {
            logShareDialogMutationFailure('removeCollaborator', error);
            appMessage.error('Failed to remove collaborator');
        }
    }, [effectiveId, t]);

    // 输入框动态边框色
    const inputBorderStyle: React.CSSProperties = inviteStatus === 'success'
        ? { borderColor: token.colorSuccess, boxShadow: `0 0 0 2px ${token.colorSuccessBg}`, transition: 'all 0.3s' }
        : inviteStatus === 'error'
            ? { borderColor: token.colorError, boxShadow: `0 0 0 2px ${token.colorErrorBg}`, transition: 'all 0.3s' }
            : {};

    const inviteEmailError = inviteEmailTouched && !parsedInviteEmail.ok
        ? t(
            parsedInviteEmail.reason === 'required'
                ? 'share.emailRequired'
                : parsedInviteEmail.reason === 'too-long'
                    ? 'share.emailTooLong'
                    : 'share.emailInvalid',
        )
        : null;

    const loginRequiredAlert = !user ? (
        <Alert
            type="warning"
            showIcon
            title={t('share.loginRequired')}
            description={t('share.loginRequiredHint', '登录后将返回当前分享流程，不会丢失图表。')}
            action={(
                <Button
                    type="primary"
                    icon={<LoginOutlined />}
                    aria-label={t('share.loginAction', '立即登录')}
                    onClick={() => setAuthModalOpen(true)}
                >
                    {t('share.loginAction', '立即登录')}
                </Button>
            )}
            style={{ marginBottom: 16 }}
        />
    ) : null;

    // ===== UI Renders =====
    const items = [
        {
            key: 'invite',
            label: <span><TeamOutlined style={{ marginRight: 6 }} />{t('share.tabs.invite')}</span>,
            children: (
                <div style={{ paddingTop: 8 }}>
                    {loginRequiredAlert}
                    <div className="share-dialog-invite-controls">
                        <Input
                            className="share-dialog-invite-email"
                            placeholder={t('share.inviteInput')}
                            value={inviteEmail}
                            onChange={(e) => {
                                setInviteEmail(e.target.value);
                                setInviteStatus('idle');
                            }}
                            onBlur={() => setInviteEmailTouched(true)}
                            onPressEnter={() => {
                                if (parsedInviteEmail.ok) void handleInvite();
                                else setInviteEmailTouched(true);
                            }}
                            status={inviteEmailError ? 'error' : undefined}
                            aria-invalid={Boolean(inviteEmailError)}
                            aria-describedby="share-dialog-email-help"
                            disabled={!user}
                            style={inputBorderStyle}
                        />
                        <Select<InviteRole> value={inviteRole} onChange={setInviteRole} aria-label={t('share.roleLabel')} disabled={!user}>
                            <Select.Option value="viewer">{t('share.roleViewer')}</Select.Option>
                            <Select.Option value="editor">{t('share.roleEditor')}</Select.Option>
                        </Select>
                        <Button type="primary" icon={<FaUserPlus />} loading={inviting} onClick={handleInvite} disabled={!user || !parsedInviteEmail.ok}>
                            {t('share.inviteBtn')}
                        </Button>
                    </div>
                    <Text
                        id="share-dialog-email-help"
                        className="share-dialog-field-help"
                        type={inviteEmailError ? 'danger' : 'secondary'}
                        role={inviteEmailError ? 'alert' : undefined}
                    >
                        {inviteEmailError || t('share.inviteHint')}
                    </Text>

                    {inviteStatus === 'error' && (
                        <Alert
                            className="share-dialog-recovery-alert"
                            type="error"
                            showIcon
                            title={t('share.inviteFailedSafe')}
                            description={t('share.inviteRetryHint')}
                        />
                    )}

                    <Text type="secondary" strong style={{ display: 'block', marginBottom: 12 }}>{t('share.collaborators')}</Text>
                    {loadingCollabs ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : collaboratorsLoadFailed ? (
                        <Alert
                            className="share-dialog-recovery-alert"
                            type="error"
                            showIcon
                            title={t('share.collaboratorsLoadFailed')}
                            description={t('share.loadRetryHint')}
                            action={<Button aria-label={t('common.retry')} onClick={() => void loadCollaborators()}>{t('common.retry')}</Button>}
                        />
                    ) : collaborators.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            styles={{ image: { height: 48 } }}
                            description={
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    输入邮箱邀请协作者查看此图表
                                </Text>
                            }
                        />
                    ) : (
                        <List
                            className="share-dialog-list"
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
                    <div className="share-dialog-link-controls">
                        <Select
                            value={expiration}
                            onChange={setExpiration}
                            options={[
                                { value: 'never', label: t('share.never') },
                                { value: '1day', label: t('share.1day') },
                                { value: '7days', label: t('share.7days') },
                                { value: '30days', label: t('share.30days') },
                            ]}
                            aria-label={t('share.expiration')}
                            disabled={!user}
                        />
                        <Button type="primary" icon={<FaLink />} loading={creatingLink} onClick={handleCreateLink} disabled={!user}>
                            {t('share.generateLink')}
                        </Button>
                    </div>
                    {loginRequiredAlert}

                    {/* 链接复制成功高亮提示 */}
                    {shareLinkResult && (
                        <Alert
                            type={shareLinkResult.copied ? 'success' : 'warning'}
                            showIcon
                            icon={shareLinkResult.copied ? <CheckCircleFilled /> : undefined}
                            title={shareLinkResult.copied ? '链接已复制到剪贴板' : '链接已生成，请手动复制'}
                            description={
                                <Text copyable={{ text: shareLinkResult.url }} style={{ fontSize: 12, wordBreak: 'break-all' }}>
                                    {shareLinkResult.url}
                                </Text>
                            }
                            style={{ marginBottom: 16 }}
                            closable
                            onClose={() => setShareLinkResult(null)}
                        />
                    )}

                    {linkMutationFailed && (
                        <Alert
                            className="share-dialog-recovery-alert"
                            type="error"
                            showIcon
                            title={t('share.generateFailed')}
                            description={t('share.generateRetryHint')}
                        />
                    )}

                    <Text type="secondary" strong style={{ display: 'block', marginBottom: 12 }}>分享链接历史</Text>
                    {loadingLink ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : sharesLoadFailed ? (
                        <Alert
                            className="share-dialog-recovery-alert"
                            type="error"
                            showIcon
                            title={t('share.linksLoadFailed')}
                            description={t('share.loadRetryHint')}
                            action={<Button aria-label={t('common.retry')} onClick={() => void loadShares()}>{t('common.retry')}</Button>}
                        />
                    ) : shares.length === 0 ? (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            styles={{ image: { height: 48 } }}
                            description={
                                <Text type="secondary" style={{ fontSize: 13 }}>
                                    生成公开链接，任何拥有链接的人都可查看
                                </Text>
                            }
                        />
                    ) : (
                        <List
                            className="share-dialog-list"
                            size="small"
                            dataSource={shares}
                            renderItem={item => {
                                const url = shareService.buildShareUrl(item.share_token);
                                const isExpired = item.expires_at && new Date(item.expires_at) < new Date();
                                return (
                                    <List.Item
                                        actions={[
                                            <Tooltip title={t('share.copyLink')} key="copy">
                                                <Button aria-label={t('share.copyLink')} type="text" size="small" icon={<FaCopy />} onClick={() => handleCopy(item.share_token)} />
                                            </Tooltip>,
                                            <Popconfirm key="revoke" title={t('share.revokeConfirm')} onConfirm={() => handleRevokeShare(item.id)} okText={t('share.revokeShare')}>
                                                <Tooltip title={t('share.revokeShare')}><Button aria-label={t('share.revokeShare')} type="text" size="small" danger icon={<FaTrash />} /></Tooltip>
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
        <>
            <Modal
                open={open}
                onCancel={onClose}
                getContainer={getViewportOverlayContainer}
                rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} share-dialog-viewport-modal`}
                zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}
                title={
                    <Space>
                        <SafetyOutlined style={{ color: token.colorPrimary }} />
                        <span>{t('share.title')}</span>
                    </Space>
                }
                footer={
                    <Text type="secondary" className="share-dialog-footer-note">
                        <LockOutlined aria-hidden="true" style={{ marginRight: 6 }} />
                        分享的图表可随时撤销访问权限
                    </Text>
                }
                width={600}
                styles={{ body: { padding: '0 var(--glass-padding-md, 24px) var(--glass-padding-md, 24px)' } }}
            >
                <Tabs defaultActiveKey="invite" activeKey={activeTab} onChange={setActiveTab} items={items} />
            </Modal>
            {authModalOpen && (
                <React.Suspense fallback={null}>
                    <AuthModal
                        open={authModalOpen}
                        onCancel={() => setAuthModalOpen(false)}
                        onAuthenticated={() => setAuthModalOpen(false)}
                        zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX + 100}
                    />
                </React.Suspense>
            )}
        </>
    );
};

export default ShareDialog;
