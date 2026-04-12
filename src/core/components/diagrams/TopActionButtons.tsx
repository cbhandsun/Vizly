import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Space, Button, Dropdown, Tooltip, MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import {
    FaFileExport, FaFolderOpen, FaShareAlt, FaCloudUploadAlt, FaSave,
    FaPlay, FaImage, FaFileCode, FaFilePdf, FaFilm, FaProjectDiagram,
    FaCode, FaHistory, FaExchangeAlt, FaBars, FaCog, FaLock, FaUnlock
} from 'react-icons/fa';

interface TopActionButtonsProps {
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
}

export const TopActionButtons: React.FC<TopActionButtonsProps> = ({
    onExportJSON, onExportPNG, onExportSVG, onExportPDF, onExportGIF, onExportMermaid,
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
}) => {
    const { t } = useTranslation();

    const exportMenu: MenuProps['items'] = [
        { key: 'png', label: '导出为 PNG', icon: <FaImage />, onClick: onExportPNG, disabled: !onExportPNG },
        { key: 'svg', label: '导出为 SVG', icon: <FaFileCode />, onClick: onExportSVG, disabled: !onExportSVG },
        { key: 'pdf', label: '导出为 PDF', icon: <FaFilePdf />, onClick: onExportPDF, disabled: !onExportPDF },
        { key: 'gif', label: '导出为 GIF', icon: <FaFilm />, onClick: onExportGIF, disabled: !onExportGIF },
        { type: 'divider' as const },
        { key: 'json', label: '导出为 JSON', icon: <FaFileExport />, onClick: onExportJSON },
        { key: 'mermaid', label: '导出为 Mermaid', icon: <FaProjectDiagram />, onClick: onExportMermaid, disabled: !onExportMermaid },
        ...((extraExportItems && (extraExportItems as any[]).length > 0) ? [{ type: 'divider' as const }, ...(extraExportItems as any[])] : [])
    ];

    const moreMenu: MenuProps['items'] = [
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
    ];

    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const target = document.getElementById('vizly-plugin-right-island-portal');
        if (target) {
            setPortalTarget(target);
        }
    }, []);

    const content = (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {onStartPresentation && (
                <Tooltip title="演示模式">
                    <Button 
                        type="text" 
                        icon={<FaPlay className="text-[12px]" />} 
                        onClick={onStartPresentation}
                        style={{ width: 32, height: 32, borderRadius: '6px', border: 'none', background: 'transparent' }}
                        className="flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-indigo-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    />
                </Tooltip>
            )}

            {onShowDiff && (
                <Tooltip title="差异对比">
                    <Button 
                        type="text" 
                        icon={<FaExchangeAlt className="text-[12px]" />} 
                        onClick={onShowDiff}
                        style={{ width: 32, height: 32, borderRadius: '6px', border: 'none', background: 'transparent' }}
                        className="flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-indigo-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    />
                </Tooltip>
            )}

            {onShowHistory && (
                <Tooltip title="历史记录">
                    <Button 
                        type="text" 
                        icon={<FaHistory className="text-[12px]" />} 
                        onClick={onShowHistory}
                        style={{ width: 32, height: 32, borderRadius: '6px', border: 'none', background: 'transparent' }}
                        className="flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-indigo-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    />
                </Tooltip>
            )}

            {onShare && (
                <Button 
                    type="primary" 
                    icon={<FaShareAlt className="text-[12px]" />} 
                    onClick={onShare}
                    style={{ height: 32, borderRadius: 9999, border: 'none', padding: '0 12px', fontSize: 13, background: 'var(--designer-primary, #6366f1)', boxShadow: '0 2px 8px rgba(99, 102, 241, 0.25)' }}
                    className="flex items-center gap-1.5 transition-transform active:scale-95 ml-1"
                >
                    {t('designer.toolbar.share', '分享')}
                </Button>
            )}

            {extraActionItems}
            {children}
        </div>
    );

    if (portalTarget) {
        return createPortal(content, portalTarget);
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

            <Dropdown menu={{ items: exportMenu }} placement="bottomRight">
                <Button type="text" icon={<FaFileExport />}>导出</Button>
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
                <Dropdown menu={{ items: moreMenu }} placement="bottomRight">
                    <Button type="text" icon={<FaBars />} />
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
        </div>
    );
};
