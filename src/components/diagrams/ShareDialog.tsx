import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Select, Space, Typography, Tooltip, List, Tag, Popconfirm, Spin, theme, Tabs, Input, Avatar, Empty, Alert } from 'antd';
import { FaCopy, FaLink, FaTrash, FaUserPlus } from 'react-icons/fa';
import { LinkOutlined, TeamOutlined, UserOutlined, CheckCircleFilled, SafetyOutlined, LockOutlined } from '@ant-design/icons';
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
import { ShareDialogLoginAlert } from './ShareDialogLoginAlert';
import type { DiagramEnsureSavedResult } from '@/core/types/diagram-components';
import { createShareDialogOperationGate } from '@/components/shareDialogOperationGate';
import {
    formatShareRelativeTime,
    getShareExpiresAt,
    isCloudDiagramId,
    resolveShareDiagramId,
    type ShareCloudDiagramScope,
    type ShareExpirationOption,
} from '@/components/shareDialogPresentation';
import './ShareDialog.css';

const AuthModal = React.lazy(() => import('@/components/auth/AuthModal').then(module => ({
    default: module.AuthModal,
})));

const { Text } = Typography;

interface ShareDialogProps {
    open: boolean;
    onClose: () => void;
    diagramId: string;
    /** 确保图表已保存到云端后才能分享，并保留取消与失败语义。 */
    onEnsureSaved: () => Promise<DiagramEnsureSavedResult>;
}

type InviteRole = 'viewer' | 'editor';

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
    const operationGateRef = useRef(createShareDialogOperationGate());

    // Link Share State
    const [expiration, setExpiration] = useState<ShareExpirationOption>('never');
    const [sharesData, setSharesData] = useState<{
        scopeKey: string | null;
        records: ShareRecord[];
    }>({ scopeKey: null, records: [] });
    const [loadingLink, setLoadingLink] = useState(false);
    const [creatingLink, setCreatingLink] = useState(false);
    const [shareLinkResult, setShareLinkResult] = useState<{ url: string; copied: boolean } | null>(null);
    const [sharesLoadFailed, setSharesLoadFailed] = useState(false);
    const [linkMutationFailed, setLinkMutationFailed] = useState(false);
    const sharesLoadRequestRef = useRef(0);
    const pendingCreatedSharesRef = useRef<ShareRecord[]>([]);

    // Collaboration State
    const [collaboratorsData, setCollaboratorsData] = useState<{
        scopeKey: string | null;
        records: CollaboratorRecord[];
    }>({ scopeKey: null, records: [] });
    const [loadingCollabs, setLoadingCollabs] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteEmailTouched, setInviteEmailTouched] = useState(false);
    const [inviteRole, setInviteRole] = useState<InviteRole>('viewer');
    const [inviting, setInviting] = useState(false);
    const [inviteStatus, setInviteStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [collaboratorsLoadFailed, setCollaboratorsLoadFailed] = useState(false);
    const collaboratorsLoadRequestRef = useRef(0);

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

    const handleDialogAfterOpenChange = useCallback((nextOpen: boolean) => {
        if (!nextOpen || user) return;
        loginActionRef.current?.focus();
    }, [user]);

    useEffect(() => {
        if (!open || user) return;
        const focusTimer = window.setTimeout(() => loginActionRef.current?.focus(), 0);
        return () => window.clearTimeout(focusTimer);
    }, [open, user]);

    useEffect(() => () => {
        operationGateRef.current.invalidate();
    }, [open, diagramId, user?.id]);

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
    const [cloudDiagramScope, setCloudDiagramScope] = useState<ShareCloudDiagramScope | null>(null);
    const effectiveId = resolveShareDiagramId(diagramId, cloudDiagramScope);
    const dataScopeKey = `${diagramId}:${user?.id ?? 'guest'}`;
    const sharesAreCurrent = sharesData.scopeKey === dataScopeKey;
    const collaboratorsAreCurrent = collaboratorsData.scopeKey === dataScopeKey;
    const currentShares = sharesAreCurrent ? sharesData.records : [];
    const currentCollaborators = collaboratorsAreCurrent ? collaboratorsData.records : [];

    // Load Data
    const loadShares = useCallback(async () => {
        const requestId = ++sharesLoadRequestRef.current;
        if (!open || !user || !effectiveId || !isCloudDiagramId(effectiveId)) return;
        setSharesData(previous => previous.scopeKey === dataScopeKey
            ? previous
            : { scopeKey: dataScopeKey, records: [] });
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
                setSharesData({ scopeKey: dataScopeKey, records: [...pendingForDiagram, ...list] });
            }
        } catch (error) {
            logShareDialogLoadFailure('shares', error);
            if (requestId === sharesLoadRequestRef.current) setSharesLoadFailed(true);
        } finally {
            if (requestId === sharesLoadRequestRef.current) setLoadingLink(false);
        }
    }, [dataScopeKey, effectiveId, open, user]);

    const loadCollaborators = useCallback(async (diagramIdOverride?: string) => {
        const requestId = ++collaboratorsLoadRequestRef.current;
        const targetDiagramId = diagramIdOverride || effectiveId;
        if (!open || !user || !targetDiagramId || !isCloudDiagramId(targetDiagramId)) return;
        setCollaboratorsData(previous => previous.scopeKey === dataScopeKey
            ? previous
            : { scopeKey: dataScopeKey, records: [] });
        setLoadingCollabs(true);
        setCollaboratorsLoadFailed(false);
        try {
            const list = await shareService.listCollaborators(targetDiagramId);
            if (requestId === collaboratorsLoadRequestRef.current) {
                setCollaboratorsData({ scopeKey: dataScopeKey, records: list });
            }
        } catch (error) {
            logShareDialogLoadFailure('collaborators', error);
            if (requestId === collaboratorsLoadRequestRef.current) setCollaboratorsLoadFailed(true);
        } finally {
            if (requestId === collaboratorsLoadRequestRef.current) setLoadingCollabs(false);
        }
    }, [dataScopeKey, effectiveId, open, user]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            void loadShares();
            void loadCollaborators();
            setSharesLoadFailed(false);
            setCollaboratorsLoadFailed(false);
            setShareLinkResult(null);
            setLinkMutationFailed(false);
            setInviteStatus('idle');
            setInviteEmailTouched(false);
            setCreatingLink(false);
            setInviting(false);
        });
        return () => { cancelled = true; };
    }, [open, loadShares, loadCollaborators]);

    // ===== Link Tab Actions =====
    const handleCreateLink = useCallback(async () => {
        if (!user) { appMessage.warning(t('share.loginRequired')); return; }
        const operation = operationGateRef.current.begin('create-link');
        if (!operation) return;
        setCreatingLink(true);
        setLinkMutationFailed(false);
        try {
            const saveResult = await onEnsureSaved();
            if (!operationGateRef.current.isCurrent(operation)) return;
            if (saveResult.status === 'cancelled') return;
            if (saveResult.status === 'failed') {
                setLinkMutationFailed(true);
                return;
            }
            const savedId = saveResult.diagramId;
            setCloudDiagramScope({ sourceDiagramId: diagramId, cloudDiagramId: savedId });
            const record = await shareService.createShareLink({ diagramId: savedId, userId: user.id, expiresAt: getShareExpiresAt(expiration) });
            if (!operationGateRef.current.isCurrent(operation)) return;
            const url = shareService.buildShareUrl(record.share_token);
            // A cloud-ID transition can start a list request while creation is in flight.
            // Invalidate that older response before preserving the newly created record.
            sharesLoadRequestRef.current += 1;
            pendingCreatedSharesRef.current = [record, ...pendingCreatedSharesRef.current];
            setSharesData(previous => ({
                scopeKey: dataScopeKey,
                records: [record, ...(previous.scopeKey === dataScopeKey ? previous.records : [])],
            }));
            const copied = await tryCopyShareUrl(url);
            setShareLinkResult({ url, copied });
            if (copied) {
                appMessage.success(t('share.copied'));
            } else {
                appMessage.warning(t('share.copyUnavailable', '链接已生成，请手动复制'));
            }
        } catch (error) {
            if (!operationGateRef.current.isCurrent(operation)) return;
            logShareDialogMutationFailure('createShareLink', error);
            setLinkMutationFailed(true);
            appMessage.error(t('share.generateFailed', '无法生成分享链接，请稍后重试'));
        } finally {
            if (operationGateRef.current.finish(operation)) setCreatingLink(false);
        }
    }, [dataScopeKey, diagramId, user, expiration, onEnsureSaved, t]);

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
            setSharesData(previous => ({
                ...previous,
                records: previous.records.filter(share => share.id !== shareId),
            }));
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
        const operation = operationGateRef.current.begin('invite');
        if (!operation) return;
        setInviting(true);
        setInviteStatus('idle');
        try {
            const saveResult = await onEnsureSaved();
            if (!operationGateRef.current.isCurrent(operation)) return;
            if (saveResult.status === 'cancelled') return;
            if (saveResult.status === 'failed') {
                setInviteStatus('error');
                return;
            }
            const savedId = saveResult.diagramId;
            setCloudDiagramScope({ sourceDiagramId: diagramId, cloudDiagramId: savedId });
            const res = await shareService.addCollaborator(savedId, targetEmail.email, inviteRole);
            if (!operationGateRef.current.isCurrent(operation)) return;
            if (res.success) {
                appMessage.success(t('share.inviteSuccess'));
                setInviteEmail('');
                setInviteEmailTouched(false);
                setInviteStatus('success');
                await loadCollaborators(savedId);
            } else {
                logShareDialogMutationFailure('addCollaborator', new Error('Collaborator invite was rejected'));
                setInviteStatus('error');
                appMessage.error(t('share.inviteFailedSafe', '邀请失败，请稍后重试'));
            }
        } catch (error) {
            if (!operationGateRef.current.isCurrent(operation)) return;
            logShareDialogMutationFailure('addCollaborator', error);
            setInviteStatus('error');
            appMessage.error(t('share.inviteFailedSafe', '邀请失败，请稍后重试'));
        } finally {
            if (operationGateRef.current.finish(operation)) setInviting(false);
        }
    }, [diagramId, user, inviteEmail, inviteRole, onEnsureSaved, loadCollaborators, t]);

    const handleRemoveCollab = useCallback(async (targetUserId: string) => {
        try {
            await shareService.removeCollaborator(effectiveId, targetUserId);
            appMessage.success(t('share.removeSuccess'));
            setCollaboratorsData(previous => ({
                ...previous,
                records: previous.records.filter(collaborator => collaborator.user_id !== targetUserId),
            }));
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
        <ShareDialogLoginAlert
            ref={loginActionRef}
            onAction={openAuthModal}
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
                        <Button type="primary" icon={<FaUserPlus />} loading={inviting} onClick={handleInvite} disabled={!user || !parsedInviteEmail.ok || creatingLink}>
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
                    {collaboratorsAreCurrent && loadingCollabs ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : collaboratorsAreCurrent && collaboratorsLoadFailed ? (
                        <Alert
                            className="share-dialog-recovery-alert"
                            type="error"
                            showIcon
                            title={t('share.collaboratorsLoadFailed')}
                            description={t('share.loadRetryHint')}
                            action={<Button aria-label={t('common.retry')} onClick={() => void loadCollaborators()}>{t('common.retry')}</Button>}
                        />
                    ) : currentCollaborators.length === 0 ? (
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
                            dataSource={currentCollaborators}
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
                        <Button type="primary" icon={<FaLink />} loading={creatingLink} onClick={handleCreateLink} disabled={!user || inviting}>
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
                    {sharesAreCurrent && loadingLink ? (
                        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
                    ) : sharesAreCurrent && sharesLoadFailed ? (
                        <Alert
                            className="share-dialog-recovery-alert"
                            type="error"
                            showIcon
                            title={t('share.linksLoadFailed')}
                            description={t('share.loadRetryHint')}
                            action={<Button aria-label={t('common.retry')} onClick={() => void loadShares()}>{t('common.retry')}</Button>}
                        />
                    ) : currentShares.length === 0 ? (
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
                            dataSource={currentShares}
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
                                                        {formatShareRelativeTime(item.created_at, i18n.resolvedLanguage || i18n.language)}
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
                onCancel={() => {
                    operationGateRef.current.invalidate();
                    setCreatingLink(false);
                    setInviting(false);
                    onClose();
                }}
                afterOpenChange={handleDialogAfterOpenChange}
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
