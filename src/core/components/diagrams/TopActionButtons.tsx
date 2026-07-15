import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dropdown, Tooltip, MenuProps, Grid } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    FaFileExport, FaFolderOpen, FaShareAlt, FaCloudUploadAlt, FaSave,
    FaPlay, FaImage, FaFileCode, FaFilePdf, FaFilm, FaProjectDiagram,
    FaCode, FaHistory, FaExchangeAlt, _FaBars, FaCog, FaLock, FaUnlock,
    FaMagic, FaRegComment, FaEllipsisH, FaRobot
} from 'react-icons/fa';
import { CollaborationAvatars } from './ui/CollaborationAvatars';
import { AdvancedExportModal } from './ui/AdvancedExportModal';
import { PluginManagerModal } from './ui/PluginManagerModal';
import { ApiOutlined } from '@ant-design/icons';
import type { ReactFlowRenderSnapshot } from '../../rendering/reactFlowScene';

interface TopActionButtonsProps {
    diagramId?: string;
    onExportJSON: () => void;
    onExportPNG?: () => Promise<void>;
    onExportSVG?: () => Promise<void>;
    onExportPDF?: () => Promise<void>;
    onExportGIF?: () => Promise<void>;
    onExportMermaid?: () => void;
    onImportClick: () => void;
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
    diagramId, onExportJSON, onExportPNG, onExportSVG, onExportPDF, onExportGIF, onExportMermaid,
    onImportClick, onEditJson,
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
    const isMobile = !screens.lg;
    const isSmallMobile = !screens.md;

    // [Fix] Modals must render regardless of portal vs fallback path.
    // Extract them here so both branches can render the portal content + these modals.
    const modals = (
        <>
            <AdvancedExportModal 
                visible={exportModalVisible} 
                onClose={() => setExportModalVisible(false)} 
                diagramId={diagramId}
                getReactFlowSnapshot={getReactFlowSnapshot}
            />
            <PluginManagerModal 
                visible={pluginManagerVisible} 
                onClose={() => setPluginManagerVisible(false)} 
            />
        </>
    );

    // [M-4] Memoize menu items to avoid recreating on every render (Antd Dropdown does vdom diff on items ref).
    const exportMenu: MenuProps['items'] = useMemo(() => [
        { key: 'png', label: '导出为 PNG', icon: <FaImage />, onClick: onExportPNG, disabled: !onExportPNG },
        { key: 'svg', label: '导出为 SVG', icon: <FaFileCode />, onClick: onExportSVG, disabled: !onExportSVG },
        { key: 'pdf', label: '导出为 PDF', icon: <FaFilePdf />, onClick: onExportPDF, disabled: !onExportPDF },
        { key: 'gif', label: '导出为 GIF', icon: <FaFilm />, onClick: onExportGIF, disabled: !onExportGIF },
        { type: 'divider' as const },
        { key: 'json', label: '导出为 JSON', icon: <FaFileExport />, onClick: onExportJSON },
        { key: 'mermaid', label: '导出为 Mermaid', icon: <FaProjectDiagram />, onClick: onExportMermaid, disabled: !onExportMermaid },
        ...((extraExportItems && (extraExportItems as any[]).length > 0) ? [{ type: 'divider' as const }, ...(extraExportItems as any[])] : [])
    ], [onExportPNG, onExportSVG, onExportPDF, onExportGIF, onExportJSON, onExportMermaid, extraExportItems]);

    const moreMenu: MenuProps['items'] = useMemo(() => [
        ...(onEditJson ? [{
            key: 'edit-json',
            label: t('designer.toolbar.edit'),
            icon: <FaCode />,
            onClick: onEditJson,
        }] : []),
        ...(onShowDiff ? [{
            key: 'diff',
            label: '版本对比',
            icon: <FaExchangeAlt />,
            onClick: onShowDiff,
        }] : []),
        ...(onShowHistory ? [{
            key: 'history',
            label: '历史记录',
            icon: <FaHistory />,
            onClick: onShowHistory,
        }] : []),
        ...((extraMoreItems && (extraMoreItems as any[]).length > 0) ? [{ type: 'divider' as const }, ...(extraMoreItems as any[])] : [])
    ], [onEditJson, onShowDiff, onShowHistory, extraMoreItems, t]);

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

    // Generate more menu items dynamically for mobile
    const mobileMoreItems: MenuProps['items'] = useMemo(() => {
        if (!isMobile) return [];
        const items = [];
        
        if (onStartPresentation) {
            items.push({ key: 'presentation', label: t('designer.toolbar.presentationMode'), icon: <FaPlay />, onClick: onStartPresentation });
        }
        if (onShowDiff) {
            items.push({ key: 'diff-view', label: t('designer.toolbar.diffView'), icon: <FaExchangeAlt />, onClick: onShowDiff });
        }
        if (onSmartOptimize) {
            items.push({ key: 'smart-optimize', label: t('designer.toolbar.smartOptimize'), icon: <FaMagic className="text-purple-500" />, onClick: onSmartOptimize });
        }
        
        if (items.length > 0) items.push({ type: 'divider' as const });
        return items;
    }, [isMobile, onStartPresentation, onShowDiff, onSmartOptimize, t]);

    const combinedMoreMenu: MenuProps['items'] = useMemo(() => [
        ...mobileMoreItems,
        ...moreMenu
    ], [mobileMoreItems, moreMenu]);

    // 统一按钮样式 (与 ModernFlowchartToolbar 保持一致)
    const tbtn = "w-8 h-8 p-0 flex items-center justify-center border-none rounded-[6px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors";
    const tbtnActive = "w-8 h-8 p-0 flex items-center justify-center border-none rounded-[6px] bg-[#e8f0fe] dark:bg-[rgba(138,180,248,0.15)] text-[#1a73e8] dark:text-[#8ab4f8] transition-colors hover:bg-[#d2e3fc] dark:hover:bg-[rgba(138,180,248,0.22)]";
    const divider = <div className="w-[1px] h-4 bg-slate-200/80 dark:bg-white/10 mx-0.5 flex-shrink-0" />;

    const content = (
        <div className="flex items-center gap-0.5">
            {onStartPresentation && !isMobile && (
                <Tooltip title={t('designer.toolbar.presentationMode')}>
                    <Button type="text" icon={<FaPlay className="text-[13px]" />} onClick={onStartPresentation} className={tbtn} />
                </Tooltip>
            )}

            {onShowDiff && !isMobile && (
                <Tooltip title={t('designer.toolbar.diffView')}>
                    <Button type="text" icon={<FaExchangeAlt className="text-[13px]" />} onClick={onShowDiff} className={tbtn} />
                </Tooltip>
            )}

            {onShowHistory && (
                <Tooltip title={t('designer.toolbar.historyPanel')}>
                    <Button type="text" icon={<FaHistory className="text-[13px]" />} onClick={onShowHistory} className={tbtn} />
                </Tooltip>
            )}

            {divider}

            {onSaveToCloud && (
                <Tooltip title={t('designer.toolbar.saveToCloud', '保存到云端')}>
                    <Button type="text" icon={<FaCloudUploadAlt className="text-[13px]" />} onClick={onSaveToCloud} className={tbtn} />
                </Tooltip>
            )}

            {onDirectSave && (
                <Tooltip title={isDirectSaveDisabled ? t('designer.toolbar.saveDisabled') : t('designer.toolbar.directSave', '覆盖保存')}>
                    <Button type="text" icon={<FaSave className="text-[13px]" />} onClick={onDirectSave} disabled={isDirectSaveDisabled} className={isDirectSaveDisabled ? "w-8 h-8 p-0 flex items-center justify-center border-none rounded-[6px] text-slate-300 dark:text-slate-600 cursor-not-allowed" : tbtn} />
                </Tooltip>
            )}

            {onSmartOptimize && !isMobile && (
                <Tooltip title={t('designer.toolbar.smartOptimize')}>
                    <Button type="text" icon={<FaMagic className="text-[13px]" />} onClick={onSmartOptimize} className={tbtn} />
                </Tooltip>
            )}

            {onOpenSettings && (
                <Tooltip title={t('designer.toolbar.settings', '设置')}>
                    <Button type="text" icon={<FaCog className="text-[13px]" />} onClick={onOpenSettings} className={tbtn} />
                </Tooltip>
            )}

            {divider}

            {onToggleAI && (
                <Tooltip title={t('aiChat.title', 'AI 助手')}>
                    <Button type="text" icon={<FaRobot className="text-[13px]" />} onClick={onToggleAI} className={aiChatActive ? tbtnActive : tbtn} />
                </Tooltip>
            )}

            {!isSmallMobile && (
                <Tooltip title={t('designer.toolbar.pluginManager')}>
                    <Button type="text" icon={<ApiOutlined style={{ fontSize: 13 }} />} onClick={() => setPluginManagerVisible(true)} className={tbtn} />
                </Tooltip>
            )}

            {setIsCommentMode && (
                <Tooltip title={isCommentMode ? t('designer.toolbar.commentModeExit') : t('designer.toolbar.commentMode')}>
                    <Button type="text" icon={<FaRegComment className="text-[13px]" />} onClick={() => setIsCommentMode(!isCommentMode)} className={isCommentMode ? tbtnActive : tbtn} />
                </Tooltip>
            )}

            {isMobile && combinedMoreMenu.length > 0 && (
                <Dropdown menu={{ items: combinedMoreMenu }} placement="bottomRight" trigger={['click']}>
                    <Button type="text" icon={<FaEllipsisH className="text-[13px]" />} className={tbtn} />
                </Dropdown>
            )}

            {divider}

            <CollaborationAvatars />

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
            className="glass-effect"
            style={{
            position: 'absolute',
            top: 16,
            right: 24 + rightOffset,
            zIndex: 1010,
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            padding: '4px 10px',
            borderRadius: 9999,
            background: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.7))',
            backdropFilter: 'var(--designer-blur, blur(12px) saturate(180%))',
            boxShadow: 'var(--designer-shadow, 0 8px 32px rgba(31, 38, 135, 0.15))',
            border: '1px solid var(--designer-border, rgba(255, 255, 255, 0.2))',
            transition: 'top 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1), right 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.1)',
        }}>
            {onStartPresentation && (
                <Tooltip title="演示模式">
                    <Button 
                        type="text" 
                        icon={<FaPlay />} 
                        onClick={onStartPresentation} 
                    />
                </Tooltip>
            )}

            <Tooltip title={t('designer.toolbar.import')}>
                <Button 
                    type="text" 
                    icon={<FaFolderOpen />} 
                    onClick={onImportClick} 
                />
            </Tooltip>

            <Dropdown 
                menu={{ items: exportMenu }} 
                placement="bottomRight"
                getPopupContainer={(trigger) => trigger.parentElement!}
            >
                <Button type="text" icon={<FaFileExport />} onClick={() => setExportModalVisible(true)}>
                    {t('common.export', '导出')}
                </Button>
            </Dropdown>

            {onDirectSave && (
                <Tooltip title={isDirectSaveDisabled ? "当前状态无法直接保存" : "覆盖保存 (直接存储)"}>
                    <Button 
                        type="text" 
                        icon={<FaSave style={{ color: isDirectSaveDisabled ? '#ccc' : '#13c2c2' }} />} 
                        onClick={onDirectSave} 
                        disabled={isDirectSaveDisabled}
                    />
                </Tooltip>
            )}

            {extraActionItems}

            {!extraActionItems && !onDirectSave && onSaveToCloud && (
                <Tooltip title="保存到云端">
                    <Button 
                        type="text" 
                        icon={<FaCloudUploadAlt style={{ color: '#52c41a' }} />} 
                        onClick={onSaveToCloud} 
                    />
                </Tooltip>
            )}

            {onShare && (
                <Button 
                    type="primary" 
                    icon={<FaShareAlt />} 
                    onClick={onShare}
                    style={{ borderRadius: 99 }}
                >
                    分享
                </Button>
            )}

            {onReadonlyChange && (
                <Tooltip title={isReadonly ? "解锁画布" : "锁定防误触"}>
                    <Button 
                        type={isReadonly ? 'primary' : 'text'} 
                        danger={isReadonly}
                        icon={isReadonly ? <FaLock /> : <FaUnlock />} 
                        onClick={() => onReadonlyChange(!isReadonly)}
                        style={isReadonly ? { borderRadius: 99, padding: '4px 12px' } : {}}
                    >
                        {isReadonly ? '只读锁定' : ''}
                    </Button>
                </Tooltip>
            )}

            {moreMenu.length > 0 && (
            <Dropdown 
                menu={{ items: moreMenu }} 
                placement="bottomRight"
                getPopupContainer={(trigger) => trigger.parentElement!}
            >
                <Button type="text" icon={<FaEllipsisH />} />
            </Dropdown>
            )}
            
            {isYjsSynced && (
                <Tooltip title="云端协同已连接">
                    <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: 'rgba(82, 196, 26, 0.1)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#52c41a', boxShadow: '0 0 6px #52c41a' }} />
                    </div>
                </Tooltip>
            )}

            {children}

            {modals}
        </div>
    );
};

TopActionButtons.displayName = 'TopActionButtons';
