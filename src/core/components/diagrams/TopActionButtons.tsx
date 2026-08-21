import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dropdown, Tooltip, MenuProps, Grid } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    FaShareAlt, FaCloudUploadAlt, FaSave, FaPlay, FaFileExport, FaCheckCircle,
    FaCode, FaHistory, FaExchangeAlt, FaCog, FaLock, FaUnlock,
    FaMagic, FaRegComment, FaEllipsisH, FaRobot, FaUsers
} from 'react-icons/fa';
import { CollaborationAvatars } from './ui/CollaborationAvatars';
import { ApiOutlined, LoadingOutlined } from '@ant-design/icons';
import type { ReactFlowRenderSnapshot } from '../../rendering/reactFlowScene';
import type { DiagramExportFormat, DiagramSaveAsTarget } from '../../types/diagram-components';
import { DOCUMENT_MENU_OVERLAY_CLASS } from './documentMenuKeyboard';
import { DropdownMenuTriggerButton } from './DropdownMenuTriggerButton';
import { useKeyboardAccessibleDropdown } from './hooks/useKeyboardAccessibleDropdown';
import { useExclusiveSaveActions } from './hooks/useExclusiveSaveActions';
import { focusAdvancedExportTrigger } from './advancedExportFocus';
import './TopActionButtons.css';

const SAVE_MENU_OVERLAY_CLASS = 'vizly-save-actions-menu';

const AdvancedExportModal = React.lazy(() => import('./ui/AdvancedExportModal').then(module => ({
    default: module.AdvancedExportModal,
})));
const PluginManagerModal = React.lazy(() => import('./ui/PluginManagerModal').then(module => ({
    default: module.PluginManagerModal,
})));

interface TopActionButtonsProps {
    diagramId?: string;
    diagramTitle?: string;
    onEditJson?: () => void;
    onStartPresentation?: () => void;
    onShowDiff?: () => void;
    onSaveToCloud?: () => Promise<void>;
    onDirectSave?: () => Promise<void>;
    onSaveAs?: (target: DiagramSaveAsTarget) => Promise<void>;
    isDirectSaveDisabled?: boolean;
    extraActionItems?: React.ReactNode;
    onShare?: () => void;
    onOpenCollaboration?: () => void;
    onShowHistory?: () => void;
    onOpenVersionHistory?: () => void;
    /** 右侧面板宽度偏移量，工具栏位置 = right: 20 + rightOffset */
    rightOffset?: number;
    children?: React.ReactNode;
    extraExportItems?: MenuProps['items'];
    extraMoreItems?: MenuProps['items'];
    isYjsSynced?: boolean;
    isReadonly?: boolean;
    onReadonlyChange?: (val: boolean) => void;
    onOpenSettings?: () => void;
    onSmartOptimize?: () => void;
    // ⭐ Phase 10: 提升的 Modal 控制状态
    exportModalVisible?: boolean;
    setExportModalVisible?: (val: boolean) => void;
    pluginManagerVisible?: boolean;
    setPluginManagerVisible?: (val: boolean) => void;
    isCommentMode?: boolean; // ⭐ Phase 11
    setIsCommentMode?: (val: boolean) => void;
    /** 是否禁用 Portal 渲染（避免与 ModernFlowchartToolbar 冲突） */
    disablePortal?: boolean;
    onToggleAI?: () => void;
    aiChatActive?: boolean;
    getReactFlowSnapshot?: () => ReactFlowRenderSnapshot | null | undefined;
    onExportPermissionCheck?: (format: DiagramExportFormat) => boolean;
}

const MODE_STATUS_BUTTON_STYLE: React.CSSProperties = {
    minHeight: 32,
    borderRadius: 9999,
    paddingInline: 12,
    fontSize: 12,
    fontWeight: 600,
};

const MOBILE_TOUCH_TARGET_STYLE: React.CSSProperties = {
    width: 'var(--commercial-touch-target, 44px)',
    minWidth: 'var(--commercial-touch-target, 44px)',
    height: 'var(--commercial-touch-target, 44px)',
    minHeight: 'var(--commercial-touch-target, 44px)',
};

export const TopActionButtons: React.FC<TopActionButtonsProps> = ({
    diagramId, diagramTitle, onEditJson,
    onStartPresentation, onShowDiff,
    onSaveToCloud, onDirectSave, onSaveAs, isDirectSaveDisabled, extraActionItems, onShare, onOpenCollaboration, onShowHistory, onOpenVersionHistory,
    rightOffset = 0,
    children,
    extraExportItems,
    extraMoreItems,
    isYjsSynced,
    isReadonly,
    onReadonlyChange,
    onOpenSettings,
    onSmartOptimize,
    // 解构新 Props
    exportModalVisible = false,
    setExportModalVisible = () => {},
    pluginManagerVisible = false,
    setPluginManagerVisible = () => {},
    isCommentMode = false,
    setIsCommentMode = () => {},
    disablePortal = false,
    onToggleAI,
    aiChatActive = false,
    getReactFlowSnapshot,
    onExportPermissionCheck,
}) => {
    const { t } = useTranslation();
    const menuInstanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const documentMenuId = `vizly-document-actions-menu-${menuInstanceId}`;
    const saveMenuId = `vizly-save-actions-menu-${menuInstanceId}`;
    const screens = Grid.useBreakpoint();
    const isSmallMobile = !screens.md;
    const {
        open: documentMenuOpen,
        triggerRef: documentMenuButtonRef,
        handleMenuKeyDown: handleDocumentMenuKeyDown,
        handleOpenChange: handleDocumentMenuOpenChange,
        handleTriggerKeyDown: handleDocumentMenuButtonKeyDown,
    } = useKeyboardAccessibleDropdown({
        overlayClassName: DOCUMENT_MENU_OVERLAY_CLASS,
    });

    const restoreDocumentMenuFocus = useCallback(() => {
        window.requestAnimationFrame(() => {
            const trigger = documentMenuButtonRef.current;
            if (!trigger?.isConnected || trigger.disabled) return;
            trigger.focus();
        });
    }, [documentMenuButtonRef]);

    const handleReadonlyToggle = useCallback(() => {
        if (!onReadonlyChange) return;
        const nextReadonly = !isReadonly;
        if (nextReadonly && isCommentMode) {
            setIsCommentMode(false);
        }
        onReadonlyChange(nextReadonly);
    }, [isCommentMode, isReadonly, onReadonlyChange, setIsCommentMode]);

    const handleReadonlyStatusExit = useCallback(() => {
        handleReadonlyToggle();
        restoreDocumentMenuFocus();
    }, [handleReadonlyToggle, restoreDocumentMenuFocus]);

    const handleCommentModeExit = useCallback(() => {
        setIsCommentMode(false);
        restoreDocumentMenuFocus();
    }, [restoreDocumentMenuFocus, setIsCommentMode]);

    const closePluginManager = useCallback(() => {
        setPluginManagerVisible(false);
        restoreDocumentMenuFocus();
    }, [restoreDocumentMenuFocus, setPluginManagerVisible]);

    const closeAdvancedExport = useCallback(() => {
        setExportModalVisible(false);
        window.requestAnimationFrame(() => {
            focusAdvancedExportTrigger();
        });
    }, [setExportModalVisible]);

    // [Fix] Modals must render regardless of portal vs fallback path.
    // Extract them here so both branches can render the portal content + these modals.
    const modals = (
        <>
            {exportModalVisible && (
                <React.Suspense fallback={null}>
                    <AdvancedExportModal
                        visible
                        onClose={closeAdvancedExport}
                        diagramId={diagramId}
                        diagramTitle={diagramTitle}
                        getReactFlowSnapshot={getReactFlowSnapshot}
                        onExportPermissionCheck={onExportPermissionCheck}
                    />
                </React.Suspense>
            )}
            {pluginManagerVisible && (
                <React.Suspense fallback={null}>
                    <PluginManagerModal
                        visible
                        onClose={closePluginManager}
                    />
                </React.Suspense>
            )}
        </>
    );

    const {
        handleCloudSave,
        handleDirectSave,
        pendingSaveTarget,
    } = useExclusiveSaveActions({ onCloudSave: onSaveToCloud, onDirectSave });

    const saveMenu: MenuProps['items'] = useMemo(() => [
        ...(onDirectSave ? [{
            key: 'direct-save',
            label: pendingSaveTarget === 'local'
                ? t('designer.saveStatus.local.saving')
                : isDirectSaveDisabled
                ? t('designer.toolbar.directSaveDisabled')
                : t('designer.toolbar.directSave', '覆盖保存'),
            icon: pendingSaveTarget === 'local' ? <LoadingOutlined spin aria-hidden="true" /> : <FaSave />,
            disabled: isDirectSaveDisabled || pendingSaveTarget !== null,
            onClick: handleDirectSave,
        }] : []),
        ...(onSaveToCloud ? [{
            key: 'cloud-save',
            label: pendingSaveTarget === 'cloud'
                ? t('designer.saveStatus.cloud.saving')
                : t('designer.toolbar.saveToCloud', '保存到云端'),
            icon: pendingSaveTarget === 'cloud' ? <LoadingOutlined spin aria-hidden="true" /> : <FaCloudUploadAlt />,
            disabled: pendingSaveTarget !== null,
            onClick: handleCloudSave,
        }] : []),
        ...(onSaveAs ? ([
            ['local', 'designer.toolbar.saveAsLocal', '另存为 — 本地'],
            ['s3', 'designer.toolbar.saveAsS3', '另存为 — S3'],
            ['supabase', 'designer.toolbar.saveAsSupabase', '另存为 — Supabase'],
        ] as const).map(([target, translationKey, fallback]) => ({
            key: `save-as-${target}`,
            label: t(translationKey, fallback),
            icon: <FaFileExport />,
            disabled: pendingSaveTarget !== null,
            onClick: () => onSaveAs(target),
        })) : []),
    ], [handleCloudSave, handleDirectSave, isDirectSaveDisabled, onDirectSave, onSaveAs, onSaveToCloud, pendingSaveTarget, t]);

    const documentMenu: MenuProps['items'] = useMemo(() => {
        const viewItems: NonNullable<MenuProps['items']> = [
            ...(onStartPresentation ? [{
            key: 'presentation',
            label: t('designer.toolbar.presentationMode'),
            icon: <FaPlay />,
            onClick: onStartPresentation,
        }] : []),
        ...(onEditJson ? [{
            key: 'edit-json',
            label: t('designer.toolbar.edit'),
            icon: <FaCode />,
            disabled: isReadonly,
            onClick: onEditJson,
        }] : []),
        ...(onShowDiff ? [{
            key: 'diff',
            label: t('designer.toolbar.diffView'),
            icon: <FaExchangeAlt />,
            onClick: onShowDiff,
        }] : []),
        ...(onShowHistory ? [{
            key: 'operation-history',
            label: t('designer.toolbar.operationHistory'),
            icon: <FaHistory />,
            onClick: onShowHistory,
        }] : []),
        ...(onOpenVersionHistory ? [{
            key: 'version-history',
            label: t('designer.toolbar.versionHistory'),
            icon: <FaHistory />,
            onClick: onOpenVersionHistory,
        }] : []),
        ...(onSmartOptimize ? [{
            key: 'smart-optimize',
            label: t('designer.toolbar.smartOptimize'),
            icon: <FaMagic />,
            disabled: isReadonly,
            onClick: onSmartOptimize,
        }] : []),
        ];
        const toolItems: NonNullable<MenuProps['items']> = [
        ...(onOpenSettings ? [{
            key: 'settings',
            label: t('common.settings'),
            icon: <FaCog />,
            onClick: onOpenSettings,
        }] : []),
        ...(onToggleAI ? [{
            key: 'ai',
            label: t('aiChat.title', 'AI 助手'),
            icon: <FaRobot />,
            disabled: isReadonly,
            onClick: onToggleAI,
        }] : []),
        ...((extraExportItems && extraExportItems.length > 0) ? [{
            key: 'plugin-export',
            label: t('designer.toolbar.pluginExport'),
            icon: <FaFileExport />,
            children: extraExportItems,
        }] : []),
        ...(isYjsSynced ? [{
            key: 'collaboration-connected',
            label: t('designer.toolbar.yjsSynced'),
            icon: <FaCheckCircle />,
            disabled: true,
        }] : []),
        {
            key: 'plugins',
            label: t('designer.toolbar.pluginManager'),
            icon: <ApiOutlined />,
            onClick: () => setPluginManagerVisible(true),
        },
        ];
        const collaborationItems: NonNullable<MenuProps['items']> = [
        ...(onOpenCollaboration ? [{
            key: 'live-collaboration',
            label: t('collaboration.menuItem'),
            icon: <FaUsers />,
            onClick: onOpenCollaboration,
        }] : []),
        {
            key: 'comments',
            label: isCommentMode
                ? t('designer.toolbar.commentModeExit')
                : t('designer.toolbar.commentMode'),
            icon: <FaRegComment />,
            disabled: isReadonly,
            onClick: () => setIsCommentMode(!isCommentMode),
        },
        ...(onReadonlyChange ? [{
            key: 'readonly',
            label: isReadonly
                ? t('designer.toolbar.unlockCanvas', '解锁画布')
                : t('designer.toolbar.lockCanvas', '锁定画布'),
            icon: isReadonly ? <FaUnlock /> : <FaLock />,
            onClick: handleReadonlyToggle,
        }] : []),
        ];
        const sections: NonNullable<MenuProps['items']>[] = [
            ...(isSmallMobile && saveMenu.length > 0 ? [[{
                key: 'file-group',
                label: t('designer.toolbar.fileGroup'),
                type: 'group' as const,
                children: saveMenu,
            }]] : []),
            ...(viewItems.length > 0 ? [[{
                key: 'view-group',
                label: t('designer.toolbar.viewGroup'),
                type: 'group' as const,
                children: viewItems,
            }]] : []),
            toolItems,
            collaborationItems,
            extraMoreItems || [],
        ].filter(section => section.length > 0);
        return sections.flatMap((section, index) => (
            index === 0
                ? section
                : [{ type: 'divider' as const, key: `document-section-${index}` }, ...section]
        ));
    }, [
        extraMoreItems,
        extraExportItems,
        handleReadonlyToggle,
        isCommentMode,
        isReadonly,
        isSmallMobile,
        isYjsSynced,
        onEditJson,
        onOpenSettings,
        onOpenCollaboration,
        onReadonlyChange,
        onShowDiff,
        onShowHistory,
        onOpenVersionHistory,
        onSmartOptimize,
        onStartPresentation,
        onToggleAI,
        setIsCommentMode,
        setPluginManagerVisible,
        saveMenu,
        t,
    ]);

    const {
        open: saveMenuOpen,
        triggerRef: saveMenuButtonRef,
        handleMenuKeyDown: handleSaveMenuKeyDown,
        handleOpenChange: handleSaveMenuOpenChange,
        handleTriggerKeyDown: handleSaveMenuButtonKeyDown,
    } = useKeyboardAccessibleDropdown({
        overlayClassName: SAVE_MENU_OVERLAY_CLASS,
    });

    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const [contextPortalTarget, setContextPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const target = document.getElementById('vizly-plugin-right-island-portal');
            if (target) {
                setPortalTarget(target);
            }
            const contextTarget = document.getElementById('vizly-plugin-context-toolbar-portal');
            if (contextTarget) {
                setContextPortalTarget(contextTarget);
            }
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    // 统一按钮样式 (与 ModernFlowchartToolbar 保持一致)
    const tbtn = "w-8 h-8 p-0 flex items-center justify-center border-none rounded-[6px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors";
    const tbtnActive = "w-8 h-8 p-0 flex items-center justify-center border-none rounded-[6px] bg-[#e8f0fe] dark:bg-[rgba(138,180,248,0.15)] text-[#1a73e8] dark:text-[#8ab4f8] transition-colors hover:bg-[#d2e3fc] dark:hover:bg-[rgba(138,180,248,0.22)]";
    const mobileTbtn = "w-[44px] min-w-[44px] h-[44px] min-h-[44px] p-0 flex items-center justify-center border-none rounded-[6px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors";
    const mobileTbtnActive = "w-[44px] min-w-[44px] h-[44px] min-h-[44px] p-0 flex items-center justify-center border-none rounded-[6px] bg-[#e8f0fe] dark:bg-[rgba(138,180,248,0.15)] text-[#1a73e8] dark:text-[#8ab4f8] transition-colors hover:bg-[#d2e3fc] dark:hover:bg-[rgba(138,180,248,0.22)]";

    const content = (
        <div className="flex items-center gap-0.5">
            {!isSmallMobile && saveMenu.length > 0 && (
                <Dropdown
                    menu={{
                        id: saveMenuId,
                        'aria-label': t('designer.toolbar.saveOptions'),
                        items: saveMenu,
                        onKeyDown: handleSaveMenuKeyDown,
                    }}
                    placement="bottomRight"
                    trigger={['click']}
                    open={saveMenuOpen}
                    onOpenChange={handleSaveMenuOpenChange}
                    overlayClassName={SAVE_MENU_OVERLAY_CLASS}
                >
                    <DropdownMenuTriggerButton
                        ref={saveMenuButtonRef}
                        data-cloud-save-focus-return="true"
                        ariaLabel={pendingSaveTarget
                            ? t(`designer.saveStatus.${pendingSaveTarget}.saving`)
                            : t('designer.toolbar.saveOptions')}
                        busy={pendingSaveTarget !== null}
                        menuId={saveMenuId}
                        open={saveMenuOpen}
                        onTriggerKeyDown={handleSaveMenuButtonKeyDown}
                        icon={pendingSaveTarget
                            ? <LoadingOutlined spin aria-hidden="true" className="text-[13px]" />
                            : <FaSave className="text-[13px]" />}
                        className={tbtn}
                    />
                </Dropdown>
            )}

            {onShare && (
                <Button
                    type="primary"
                    data-share-dialog-trigger
                    aria-label={t('designer.toolbar.share')}
                    icon={<FaShareAlt className="text-[11px]" />}
                    onClick={onShare}
                    className="flex items-center gap-1 transition-transform active:scale-95 ml-0.5"
                    style={{ height: 'var(--commercial-touch-target, 44px)', minWidth: 'var(--commercial-touch-target, 44px)', borderRadius: 9999, border: 'none', padding: isSmallMobile ? '0 12px' : '0 16px', fontSize: 12, background: 'var(--designer-primary, #1a73e8)', boxShadow: '0 1px 4px rgba(26,115,232,0.3)' }}
                >
                    <span className="hidden xl:inline">{t('designer.toolbar.share')}</span>
                </Button>
            )}

            {isCommentMode && !isReadonly && (
                <Tooltip title={t('designer.toolbar.commentModeHint')}>
                    <Button
                        type="primary"
                        ghost
                        aria-pressed="true"
                        aria-label={t('designer.toolbar.commentModeExit')}
                        icon={<FaRegComment aria-hidden="true" />}
                        onClick={handleCommentModeExit}
                        style={MODE_STATUS_BUTTON_STYLE}
                    >
                        {t('designer.toolbar.commentModeStatus')}
                    </Button>
                </Tooltip>
            )}

            {isReadonly && onReadonlyChange && (
                <Tooltip title={t('designer.toolbar.readonlyStatus')}>
                    <Button
                        type="default"
                        aria-label={t('designer.toolbar.unlockCanvas')}
                        icon={<FaUnlock aria-hidden="true" />}
                        onClick={handleReadonlyStatusExit}
                        style={MODE_STATUS_BUTTON_STYLE}
                    >
                        {t('designer.toolbar.readonlyStatusAction')}
                    </Button>
                </Tooltip>
            )}

            <CollaborationAvatars />

            {documentMenu.length > 0 && (
                <Dropdown
                    menu={{
                        id: documentMenuId,
                        'aria-label': t('designer.toolbar.documentActions'),
                        items: documentMenu,
                        onKeyDown: handleDocumentMenuKeyDown,
                    }}
                    placement="bottomRight"
                    trigger={['click']}
                    open={documentMenuOpen}
                    onOpenChange={handleDocumentMenuOpenChange}
                    getPopupContainer={(triggerNode) => triggerNode.ownerDocument.body}
                    classNames={{ root: DOCUMENT_MENU_OVERLAY_CLASS }}
                >
                    <Tooltip
                        title={t('designer.toolbar.documentActions')}
                        open={documentMenuOpen ? false : undefined}
                    >
                        <Button
                            ref={documentMenuButtonRef}
                            data-cloud-save-focus-return={isSmallMobile ? 'true' : undefined}
                            data-presentation-focus-return
                            data-diff-focus-return
                            data-history-focus-return
                            data-version-history-focus-return
                            data-json-editor-focus-return
                            data-command-palette-focus-return
                            data-collaboration-focus-return
                            data-settings-focus-return="fallback"
                            type="text"
                            aria-label={t('designer.toolbar.documentActions')}
                            aria-haspopup="menu"
                            aria-busy={pendingSaveTarget !== null}
                            aria-expanded={documentMenuOpen}
                            aria-controls={documentMenuId}
                            onKeyDown={handleDocumentMenuButtonKeyDown}
                            icon={<FaEllipsisH className="text-[13px]" />}
                            style={isSmallMobile ? MOBILE_TOUCH_TARGET_STYLE : undefined}
                            className={isSmallMobile
                                ? (aiChatActive || isCommentMode ? mobileTbtnActive : mobileTbtn)
                                : (aiChatActive || isCommentMode ? tbtnActive : tbtn)}
                        />
                    </Tooltip>
                </Dropdown>
            )}

            {extraActionItems}
        </div>
    );

    const contextContent = children ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', minWidth: 0, maxWidth: '100%', width: '100%' }}>
            {children}
        </div>
    ) : null;

    if (disablePortal) {
        return (
            <div className="flex items-center gap-1">
                {content}
                {modals}
            </div>
        );
    }

    if (portalTarget) {
        return (
            <>
                {createPortal(content, portalTarget)}
                {contextPortalTarget && contextContent ? createPortal(contextContent, contextPortalTarget) : null}
                {modals}
            </>
        );
    }

    // Fallback if portal missing
    return (
        <div
            className="glass-effect flex items-center gap-1"
            style={{
                position: 'absolute',
                top: 16,
                right: 24 + rightOffset,
                zIndex: 1010,
                padding: '4px 10px',
                borderRadius: 9999,
                background: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.7))',
                backdropFilter: 'var(--designer-blur, blur(12px) saturate(180%))',
                boxShadow: 'var(--designer-shadow, 0 8px 32px rgba(31, 38, 135, 0.15))',
                border: '1px solid var(--designer-border, rgba(255, 255, 255, 0.2))',
                transition: 'top 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1), right 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
            }}
        >
            {content}
            {modals}
        </div>
    );
};

TopActionButtons.displayName = 'TopActionButtons';
