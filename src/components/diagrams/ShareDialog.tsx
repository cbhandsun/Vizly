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
    resolveShareDialogTabKeyboardTarget,
    type ShareDialogTabKey,
} from './shareDialogTabs';
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
function formatRelativeTime(dateStr: string, locale: string): string {
    const timestamp = Date.parse(dateStr);
    if (!Number.isFinite(timestamp)) return '';

    const diff = Math.max(0, Date.now() - timestamp);
    const minutes = Math.floor(diff / 60000);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (minutes < 1) return formatter.format(0, 'minute');
    if (minutes < 60) return formatter.format(-minutes, 'minute');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return formatter.format(-hours, 'hour');
    const days = Math.floor(hours / 24);
    if (days < 30) return formatter.format(-days, 'day');
    return new Intl.DateTimeFormat(locale).format(new Date(timestamp));
}

const isValidUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

const ShareDialog: React.FC<ShareDialogProps> = ({ open, onClose, diagramId, onEnsureSaved }) => {
    const { t, i18n } = useTranslation();
    const { token } = theme.useToken();
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<ShareDialogTabKey>('invite');
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [authModalMounted, setAuthModalMounted] = useState(false);
    const loginActionRef = useRef<HTMLButtonElement>(null);
    const tabsRootRef = useRef<HTMLDivElement>(null);
    const shouldRestoreTabFocusRef = useRef(false);

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

    const openAuthModal = useCallback(() => {
        setAuthModalMounted(true);
        setAuthModalOpen(true);
    }, []);

    const closeAuthModal = useCallback(() => {
        setAuthModalOpen(false);
    }, []);

    const handleAuthModalAfterClose = useCallback(() => {
        setAuthModalMounted(false);
        if (open && !user) loginActionRef.current?.focus();
    }, [open, user]);

    useEffect(() => {
        if (!open || !shouldRestoreTabFocusRef.current) return;
        shouldRestoreTabFocusRef.current = false;
        tabsRootRef.current
            ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
            ?.focus();
    }, [activeTab, open]);

    const handleTabChange = useCallback((key: string) => {
        if (key !== 'invite' && key !== 'link') return;
        shouldRestoreTabFocusRef.current = true;
        setActiveTab(key);
    }, []);

    const handleTabsKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'tab') return;

        const targetTab = resolveShareDialogTabKeyboardTarget(event.key, activeTab);
        if (!targetTab || targetTab === activeTab) return;

        event.preventDefault();
        event.stopPropagation();
        shouldRestoreTabFocusRef.current = true;
        setActiveTab(targetTab);
    }, [activeTab]);

    const setTabsRoot = useCallback((node: HTMLDivElement | null) => {
        tabsRootRef.current = node;
        node
            ?.querySelector<HTMLElement>('[role="tablist"]')
            ?.setAttribute('aria-label', t('share.modeLabel'));
    }, [t]);

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
            appMessage.error(t('share.revokeFailed'));
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
            appMessage.error(t('share.removeFailed'));
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
                    ref={loginActionRef}
                    className="share-dialog-login-action"
                    type="primary"
                    icon={<LoginOutlined />}
                    aria-label={t('share.loginAction', '立即登录')}
                    onClick={openAuthModal}
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
            label: <span><TeamOutlined aria-hidden="true" style={{ marginRight: 6 }} />{t('share.tabs.invite')}</span>,
            children: (
                <div style={{ paddingTop: 8 }}>
                    {loginRequiredAlert}
                    <div className="share-dialog-invite-controls">
                        <Input
                            className="share-dialog-invite-email"
                            aria-label={t('share.inviteInput')}
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
                                    {t('share.collaboratorsEmpty')}
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
                                                    title={t('share.removeConfirm')}
                                                    onConfirm={() => handleRemoveCollab(item.user_id)}
                                                    okText={t('share.remove')}
                                                    cancelText={t('common.cancel')}
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
            label: <span><LinkOutlined aria-hidden="true" style={{ marginRight: 6 }} />{t('share.tabs.link')}</span>,
            children: (
                <div style={{ paddingTop: 8 }}>
                    {loginRequiredAlert}
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

                    {/* 链接复制成功高亮提示 */}
                    {shareLinkResult && (
                        <Alert
                            type={shareLinkResult.copied ? 'success' : 'warning'}
                            showIcon
                            icon={shareLinkResult.copied ? <CheckCircleFilled /> : undefined}
                            title={shareLinkResult.copied ? t('share.copied') : t('share.copyUnavailable')}
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

                    <Text type="secondary" strong style={{ display: 'block', marginBottom: 12 }}>{t('share.linkHistory')}</Text>
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
                                    {t('share.linkEmpty')}
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
                                            <Popconfirm key="revoke" title={t('share.revokeConfirm')} onConfirm={() => handleRevokeShare(item.id)} okText={t('share.revokeShare')} cancelText={t('common.cancel')}>
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
                                                        {formatRelativeTime(item.created_at, i18n.resolvedLanguage || i18n.language)}
                                                    </Text>
                                                    {item.expires_at ? (
                                                        <Tag
                                                            color={isExpired ? 'red' : 'blue'}
                                                            style={{ fontSize: 11 }}
                                                        >
                                                            {isExpired
                                                                ? t('share.expired')
                                                                : `${t('share.expiresAt')}: ${new Date(item.expires_at).toLocaleDateString(i18n.resolvedLanguage || i18n.language)}`}
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
                closable={{ 'aria-label': t('share.closeDialog') }}
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
                        {t('share.footerNote')}
                    </Text>
                }
                width="min(600px, calc(100vw - 32px))"
                styles={{ body: { padding: '0 var(--glass-padding-md, 24px) var(--glass-padding-md, 24px)' } }}
            >
                <div ref={setTabsRoot} onKeyDownCapture={handleTabsKeyDown}>
                    <Tabs defaultActiveKey="invite" activeKey={activeTab} onChange={handleTabChange} items={items} />
                </div>
            </Modal>
            {authModalMounted ? (
                <React.Suspense fallback={null}>
                    <AuthModal
                        open={authModalOpen && open}
                        onCancel={closeAuthModal}
                        onAuthenticated={closeAuthModal}
                        onAfterClose={handleAuthModalAfterClose}
                        zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX + 100}
                    />
                </React.Suspense>
            ) : null}
        </>
    );
};

export default ShareDialog;
