import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dropdown, Tooltip, MenuProps, Grid } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    FaShareAlt, FaCloudUploadAlt, FaSave, FaPlay, FaFileExport, FaCheckCircle,
    FaCode, FaHistory, FaExchangeAlt, FaCog, FaLock, FaUnlock,
    FaMagic, FaRegComment, FaEllipsisH, FaRobot
} from 'react-icons/fa';
import { CollaborationAvatars } from './ui/CollaborationAvatars';
import { ApiOutlined } from '@ant-design/icons';
import type { ReactFlowRenderSnapshot } from '../../rendering/reactFlowScene';

const AdvancedExportModal = React.lazy(() => import('./ui/AdvancedExportModal').then(module => ({
    default: module.AdvancedExportModal,
})));
const PluginManagerModal = React.lazy(() => import('./ui/PluginManagerModal').then(module => ({
    default: module.PluginManagerModal,
})));

interface TopActionButtonsProps {
    diagramId?: string;
    onEditJson?: () => void;
    onStartPresentation?: () => void;
    onShowDiff?: () => void;
    onSaveToCloud?: () => Promise<void>;
    onDirectSave?: () => Promise<void>;
    isDirectSaveDisabled?: boolean;
    extraActionItems?: React.ReactNode;
    onShare?: () => void;
    onShowHistory?: () => void;
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
}

export const TopActionButtons: React.FC<TopActionButtonsProps> = ({
    diagramId, onEditJson,
    onStartPresentation, onShowDiff,
    onSaveToCloud, onDirectSave, isDirectSaveDisabled, extraActionItems, onShare, onShowHistory,
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
}) => {
    const { t } = useTranslation();
    const screens = Grid.useBreakpoint();
    const isSmallMobile = !screens.md;

    // [Fix] Modals must render regardless of portal vs fallback path.
    // Extract them here so both branches can render the portal content + these modals.
    const modals = (
        <>
            {exportModalVisible && (
                <React.Suspense fallback={null}>
                    <AdvancedExportModal
                        visible
                        onClose={() => setExportModalVisible(false)}
                        diagramId={diagramId}
                        getReactFlowSnapshot={getReactFlowSnapshot}
                    />
                </React.Suspense>
            )}
            {pluginManagerVisible && (
                <React.Suspense fallback={null}>
                    <PluginManagerModal
                        visible
                        onClose={() => setPluginManagerVisible(false)}
                    />
                </React.Suspense>
            )}
        </>
    );

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
            onClick: onEditJson,
        }] : []),
        ...(onShowDiff ? [{
            key: 'diff',
            label: t('designer.toolbar.diffView'),
            icon: <FaExchangeAlt />,
            onClick: onShowDiff,
        }] : []),
        ...(onShowHistory ? [{
            key: 'history',
            label: t('designer.toolbar.historyPanel'),
            icon: <FaHistory />,
            onClick: onShowHistory,
        }] : []),
        ...(onSmartOptimize ? [{
            key: 'smart-optimize',
            label: t('designer.toolbar.smartOptimize'),
            icon: <FaMagic />,
            onClick: onSmartOptimize,
        }] : []),
        ];
        const toolItems: NonNullable<MenuProps['items']> = [
        ...(onOpenSettings ? [{
            key: 'settings',
            label: t('designer.toolbar.settings', '设置'),
            icon: <FaCog />,
            onClick: onOpenSettings,
        }] : []),
        ...(onToggleAI ? [{
            key: 'ai',
            label: t('aiChat.title', 'AI 助手'),
            icon: <FaRobot />,
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
        {
            key: 'comments',
            label: isCommentMode
                ? t('designer.toolbar.commentModeExit')
                : t('designer.toolbar.commentMode'),
            icon: <FaRegComment />,
            onClick: () => setIsCommentMode(!isCommentMode),
        },
        ...(onReadonlyChange ? [{
            key: 'readonly',
            label: isReadonly
                ? t('designer.toolbar.unlockCanvas', '解锁画布')
                : t('designer.toolbar.lockCanvas', '锁定画布'),
            icon: isReadonly ? <FaUnlock /> : <FaLock />,
            onClick: () => onReadonlyChange(!isReadonly),
        }] : []),
        ];
        const sections = [
            viewItems,
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
        isCommentMode,
        isReadonly,
        isYjsSynced,
        onEditJson,
        onOpenSettings,
        onReadonlyChange,
        onShowDiff,
        onShowHistory,
        onSmartOptimize,
        onStartPresentation,
        onToggleAI,
        setIsCommentMode,
        setPluginManagerVisible,
        t,
    ]);

    const saveMenu: MenuProps['items'] = useMemo(() => [
        ...(onDirectSave ? [{
            key: 'direct-save',
            label: isDirectSaveDisabled
                ? t('designer.toolbar.directSaveDisabled')
                : t('designer.toolbar.directSave', '覆盖保存'),
            icon: <FaSave />,
            disabled: isDirectSaveDisabled,
            onClick: onDirectSave,
        }] : []),
        ...(onSaveToCloud ? [{
            key: 'cloud-save',
            label: t('designer.toolbar.saveToCloud', '保存到云端'),
            icon: <FaCloudUploadAlt />,
            onClick: onSaveToCloud,
        }] : []),
    ], [isDirectSaveDisabled, onDirectSave, onSaveToCloud, t]);

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

    const content = (
        <div className="flex items-center gap-0.5">
            {saveMenu.length > 0 && (
                <Dropdown menu={{ items: saveMenu }} placement="bottomRight" trigger={['click']}>
                    <Tooltip title={t('designer.toolbar.saveOptions')}>
                        <Button
                            type="text"
                            aria-label={t('designer.toolbar.saveOptions')}
                            icon={<FaSave className="text-[13px]" />}
                            className={tbtn}
                        />
                    </Tooltip>
                </Dropdown>
            )}

            {onShare && (
                <Button
                    type="primary"
                    icon={<FaShareAlt className="text-[11px]" />}
                    onClick={onShare}
                    className="flex items-center gap-1 transition-transform active:scale-95 ml-0.5"
                    style={{ height: 28, borderRadius: 9999, border: 'none', padding: isSmallMobile ? '0 8px' : '0 12px', fontSize: 12, background: 'var(--designer-primary, #1a73e8)', boxShadow: '0 1px 4px rgba(26,115,232,0.3)' }}
                >
                    <span className="hidden xl:inline">{t('designer.toolbar.share')}</span>
                </Button>
            )}

            <CollaborationAvatars />

            {documentMenu.length > 0 && (
                <Dropdown menu={{ items: documentMenu }} placement="bottomRight" trigger={['click']}>
                    <Tooltip title={t('designer.toolbar.documentActions')}>
                        <Button
                            type="text"
                            aria-label={t('designer.toolbar.documentActions')}
                            icon={<FaEllipsisH className="text-[13px]" />}
                            className={aiChatActive || isCommentMode ? tbtnActive : tbtn}
                        />
                    </Tooltip>
                </Dropdown>
            )}

            {extraActionItems}
        </div>
    );

    const contextContent = children ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
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
