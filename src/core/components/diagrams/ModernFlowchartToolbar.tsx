import React, { useState, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import {
    FaUndo, FaRedo, FaSearchPlus, FaSearchMinus, FaCompressArrowsAlt,
    FaMagic, FaTh, FaKeyboard, FaBorderAll, FaBorderNone,
    FaSitemap, FaObjectGroup, FaRuler,
    FaEllipsisH, FaTrashAlt,
    FaMagnet, FaPen, FaStickyNote, FaMousePointer,
    FaFolderOpen, FaFileExport, FaMap, FaSearch,
} from 'react-icons/fa';
import { BackgroundVariant } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Tooltip, Button, Dropdown, MenuProps, Popover, Grid } from 'antd';
import { appModal } from '../../utils/antdStaticBridge';
import { clearFlowchartCache } from '../../utils/clearFlowchartCache';
import { coerceDiagramId, getQueryOrHashParamFromLocation } from '../../utils/inputBoundary';
import { FlowchartAlignmentTools } from './FlowchartAlignmentTools';
import { FlowchartCanvasSettingsContent } from './FlowchartCanvasSettingsContent';
import { DropdownMenuTriggerButton } from './DropdownMenuTriggerButton';
import { buildFlowchartLayoutMenuModel } from './flowchartToolbarLayoutMenu';
import { buildToolModeMenuItems, resolveActiveToolModeKey } from './flowchartToolbarToolModeMenu';
import { useKeyboardAccessibleDropdown } from './hooks/useKeyboardAccessibleDropdown';

interface FlowchartToolbarProps {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitView: () => void;
    onFitWidth?: () => void;
    autoRouting: boolean;
    toggleAutoRouting: () => void;
    showGrid: boolean;
    gridVariant?: BackgroundVariant;
    toggleGrid: () => void;
    onShowShortcuts: () => void;
    onShowCanvasSearch?: () => void;
    /** 域感知策略布局回调（统一入口） */
    onStrategyLayout?: (strategyName: string, nodeLayout?: string, direction?: 'TB' | 'LR') => void;
    /** 当前选中的域布局策略 */
    lastDomainStrategy?: string;
    /** 当前选中的域布局方向 */
    lastDomainDirection?: 'TB' | 'LR';
    /** 当前选中的域内节点排布 */
    lastNodeLayout?: string;
    showRuler: boolean;
    toggleRuler: () => void;
    showMinimap?: boolean;
    toggleMinimap?: () => void;
    onToggleAI?: () => void;
    aiChatActive?: boolean;
    showAiCrown?: boolean;
    // --- 底部状态信息（合并自 DiagramStatusBar）---
    nodeCount?: number;
    edgeCount?: number;
    selectedNodesCount?: number;
    selectedEdgesCount?: number;
    zoomPercent?: number;
    snapToGrid?: boolean;
    onToggleSnap?: () => void;
    /** 主链路高亮 */
    highlightMainFlow?: boolean;
    onToggleHighlightMainFlow?: () => void;
    /** 仅显示主链路 */
    showOnlyMainFlow?: boolean;
    onToggleShowOnlyMainFlow?: () => void;
    children?: React.ReactNode;
    hideZoomControls?: boolean;
    hideLayoutControls?: boolean;
    hideGridControls?: boolean;
    hideFlowFocusControls?: boolean;
    hideUndoRedoControls?: boolean;
    // --- 文件操作 (File IO) ---
    onImportClick?: () => void;
    onExport?: () => void;
    
    // --- 创造工具 (Drawing & Creation Tools) ---
    isDrawingMode?: boolean;
    isMarqueeActive?: boolean;
    toggleSelectionMode?: () => void;
    onToggleDrawingMode?: () => void;
    onActivatePointer?: () => void;
    onAddStickyNote?: () => void;
    onAddMindMap?: () => void;

    // --- Phase 11: Comments ---
    isCommentMode?: boolean;
    setIsCommentMode?: (v: boolean) => void;
    // --- Phase 1.4: History Panel ---
    onShowHistory?: () => void;
    historyCount?: number;

    // --- Alignment & Distribution ---
    onAlign?: (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
    onDistribute?: (type: 'horizontal' | 'vertical') => void;
}

const COMMERCIAL_MOBILE_TOUCH_STYLE: React.CSSProperties = {
    minWidth: 'var(--commercial-touch-target, 44px)',
    width: 'var(--commercial-touch-target, 44px)',
    height: 'var(--commercial-touch-target, 44px)',
};

export const ModernFlowchartToolbar: React.FC<FlowchartToolbarProps> = memo(({
    canUndo, canRedo, onUndo, onRedo,
    onZoomIn, onZoomOut, onFitView,
    autoRouting, toggleAutoRouting,
    showGrid, gridVariant, toggleGrid,
    onShowShortcuts,
    onShowCanvasSearch,
    onStrategyLayout,
    lastDomainStrategy,
    lastDomainDirection,
    lastNodeLayout,
    showRuler,
    toggleRuler,
    showMinimap,
    toggleMinimap,
    selectedNodesCount,
    zoomPercent,
    snapToGrid,
    onToggleSnap,
    children,
    hideZoomControls,
    hideLayoutControls,
    hideGridControls,
    hideUndoRedoControls,
    isDrawingMode,
    isMarqueeActive,
    toggleSelectionMode,
    onToggleDrawingMode,
    onActivatePointer,
    onAddStickyNote,
    onAddMindMap,
    onImportClick,
    onExport,
    onShowHistory,
    historyCount,
    onAlign,
    onDistribute,
}) => {
    const { t } = useTranslation();
    const screens = Grid.useBreakpoint();
    const isMobile = !screens.md;
    const onLabel = t('common.on');
    const offLabel = t('common.off');

    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const [contextPortalTarget, setContextPortalTarget] = useState<HTMLElement | null>(null);
    const [bottomPortalTarget, setBottomPortalTarget] = useState<HTMLElement | null>(null);
    const layoutDropdown = useKeyboardAccessibleDropdown({
        overlayClassName: 'flowchart-layout-menu',
    });
    const moreDropdown = useKeyboardAccessibleDropdown({
        overlayClassName: isMobile ? 'flowchart-mobile-more-menu' : 'flowchart-more-menu',
    });

    useEffect(() => {
        const timer = window.setTimeout(() => {
            const target = document.getElementById('vizly-plugin-center-island-portal');
            if (target) setPortalTarget(target);
            const contextTarget = document.getElementById('vizly-plugin-context-toolbar-portal');
            if (contextTarget) setContextPortalTarget(contextTarget);
            const bottomTarget = document.getElementById('vizly-plugin-bottom-island-portal');
            if (bottomTarget) setBottomPortalTarget(bottomTarget);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    const layoutMenuModel = useMemo(() => buildFlowchartLayoutMenuModel({
        lastDomainDirection,
        lastDomainStrategy,
        lastNodeLayout,
        onStrategyLayout,
        translate: (key, fallback) => t(key, fallback),
    }), [lastDomainDirection, lastDomainStrategy, lastNodeLayout, onStrategyLayout, t]);

    const layoutBaseLabel = t('designer.flowchart.layout.tooltip', '自动布局');
    const layoutTriggerLabel = layoutMenuModel.statusText
        ? `${layoutBaseLabel}：${layoutMenuModel.statusText}`
        : layoutBaseLabel;

    const gridInfo = useMemo(() => {
        if (!showGrid) return { title: t('designer.toolbar.gridOff'), icon: <FaBorderNone /> };
        switch (gridVariant) {
            case BackgroundVariant.Dots: return { title: t('designer.toolbar.gridDots'), icon: <FaTh /> };
            case BackgroundVariant.Lines: return { title: t('designer.toolbar.gridLines'), icon: <FaBorderAll /> };
            case BackgroundVariant.Cross: return { title: t('designer.toolbar.gridCross'), icon: <FaTh style={{ transform: 'rotate(45deg)' }} /> };
            default: return { title: t('designer.toolbar.showGrid'), icon: <FaTh /> };
        }
    }, [showGrid, gridVariant, t]);

    // ---- "更多"菜单：低频功能收纳 ----
    const moreMenuItems: MenuProps['items'] = useMemo(() => [
        {
            key: 'file-group', label: t('designer.toolbar.fileGroup'), type: 'group' as const, children: [
                ...(onImportClick ? [{
                    key: 'import',
                    label: t('designer.toolbar.import', '打开本地 JSON...'),
                    icon: <FaFolderOpen />,
                    onClick: onImportClick,
                }] : []),
                ...(onExport ? [{
                    key: 'export',
                    label: t('designer.toolbar.export', '导出 JSON...'),
                    icon: <FaFileExport />,
                    onClick: onExport,
                }] : []),
            ]
        },
        { type: 'divider' as const },
        {
            key: 'view-group', label: t('designer.toolbar.viewGroup'), type: 'group' as const, children: [
                {
                    key: 'grid',
                    label: gridInfo.title,
                    icon: gridInfo.icon,
                    onClick: toggleGrid,
                },
                ...(isMobile && onToggleSnap ? [{
                    key: 'snap',
                    label: snapToGrid ? t('designer.toolbar.snapOn') : t('designer.toolbar.snapOff'),
                    icon: <FaMagnet />,
                    onClick: onToggleSnap,
                }] : []),
                {
                    key: 'ruler',
                    label: showRuler ? t('designer.toolbar.hideRuler') : t('designer.toolbar.showRuler'),
                    icon: <FaRuler />,
                    onClick: toggleRuler,
                },
                ...(toggleMinimap ? [{
                    key: 'minimap',
                    label: showMinimap ? t('designer.toolbar.hideMinimap', '隐藏小地图') : t('designer.toolbar.showMinimap', '显示小地图'),
                    icon: <FaMap />,
                    onClick: toggleMinimap,
                }] : []),
            ]
        },
        ...((onActivatePointer || toggleSelectionMode || onToggleDrawingMode || onAddStickyNote || onAddMindMap) ? [
            { type: 'divider' as const },
            {
                key: 'creation-group',
                label: t('toolbar.creationTools', '操作工具'),
                type: 'group' as const,
                children: buildToolModeMenuItems({
                    isDrawingMode,
                    isMarqueeActive,
                    labels: {
                        drawing: isDrawingMode
                            ? t('toolbar.drawingModeExit', '退出自由画笔 (Esc)')
                            : t('toolbar.drawingMode', '自由画笔 (P)'),
                        marquee: isMarqueeActive
                            ? t('toolbar.marqueeExit', '退出框选 (Esc)')
                            : t('toolbar.marqueeEnter', '框选模式 (M)'),
                        mindMap: t('toolbar.mindMap', '思维导图 (Shift+M)'),
                        pointer: t('toolbar.pointer', '普通选择器 (V)'),
                        stickyNote: t('toolbar.stickyNote', '便签 (S)'),
                    },
                    onActivatePointer,
                    onAddMindMap,
                    onAddStickyNote,
                    onToggleDrawingMode,
                    toggleSelectionMode,
                }),
            },
        ] : []),
        { type: 'divider' as const },
        ...(onShowCanvasSearch ? [{
            key: 'canvas-search',
            label: t('designer.toolbar.searchCanvas', '搜索画布节点 (Ctrl+F)'),
            icon: <FaSearch />,
            onClick: onShowCanvasSearch,
        }, { type: 'divider' as const }] : []),
        {
            key: 'shortcuts',
            label: t('designer.toolbar.shortcuts'),
            icon: <FaKeyboard />,
            onClick: onShowShortcuts,
        },
        { type: 'divider' as const },
        {
            key: 'clear-cache',
            label: t('designer.toolbar.clearCache'),
            icon: <FaTrashAlt />,
            danger: true,
            onClick: () => {
                appModal.confirm({
                    title: t('designer.toolbar.clearCacheTitle'),
                    content: t('designer.toolbar.clearCacheContent'),
                    okText: t('designer.toolbar.clearCacheConfirm'),
                    cancelText: t('common.cancel'),
                    okButtonProps: { danger: true },
                    onOk: () => {
                        // 1. 先读取当前选中的图表 ID（localStorage 清空前）
                        const diagramId = coerceDiagramId(
                            getQueryOrHashParamFromLocation(window.location, 'diagram')
                        )
                            || localStorage.getItem('diagramMenu.selectedDiagramId');

                        // 2. 只清理流程图设计器缓存，避免误删 AI 配置、存储密钥和其他图的自动保存
                        clearFlowchartCache(diagramId);

                        // 3. 把图表 ID 写回 localStorage，让应用重启后能正常恢复
                        // 这样无需依赖 URL 参数，与 useDiagramHostStorage 的读取逻辑完全对齐
                        if (diagramId) {
                            try {
                                localStorage.setItem('diagramMenu.selectedDiagramId', diagramId);
                            } catch { void 0; }
                        }

                        // 4. 硬刷新（不携带 URL 参数，避免参数遗留）
                        window.location.reload();
                    },
                });
            },
        },
    ], [
        t, gridInfo, toggleGrid, showRuler, toggleRuler, toggleMinimap, showMinimap, isMobile,
        onToggleSnap, snapToGrid,
        onShowShortcuts, onShowCanvasSearch, onImportClick, onExport, onActivatePointer, toggleSelectionMode,
        onToggleDrawingMode, onAddStickyNote, onAddMindMap, isMarqueeActive, isDrawingMode,
    ]);

    const selectedToolModeKey = resolveActiveToolModeKey(isMarqueeActive, isDrawingMode);

    const moreMenu = useMemo(() => ({
        items: moreMenuItems,
        selectedKeys: [selectedToolModeKey],
        selectable: true,
        onKeyDown: moreDropdown.handleMenuKeyDown,
    }), [moreMenuItems, moreDropdown.handleMenuKeyDown, selectedToolModeKey]);

    const CanvasSettingsContent = (
        <FlowchartCanvasSettingsContent
            gridInfo={gridInfo}
            onShowShortcuts={onShowShortcuts}
            showGrid={showGrid}
            showMinimap={showMinimap}
            showRuler={showRuler}
            toggleGrid={toggleGrid}
            toggleMinimap={toggleMinimap}
            toggleRuler={toggleRuler}
        />
    );

    const CreationTools = (
        <div className="flex items-center gap-1.5 p-1">
            <div className="flex items-center gap-1">
                <Tooltip title={t('toolbar.pointer', '普通选择器 (V)')}>
                    <Button 
                        type="text" 
                        onClick={onActivatePointer} 
                        aria-label={t('toolbar.pointer', '普通选择器 (V)')}
                        aria-pressed={!isDrawingMode && !isMarqueeActive}
                        icon={<FaMousePointer className={`text-[12px] ${(!isDrawingMode && !isMarqueeActive) ? 'text-indigo-500' : 'text-slate-500'}`} />} 
                        className={`w-9 h-9 p-0 border-none transition-all ${(!isDrawingMode && !isMarqueeActive) ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`} 
                    />
                </Tooltip>
                <Tooltip title={isMarqueeActive ? t('toolbar.marqueeExit', '退出框选 (Esc)') : t('toolbar.marqueeEnter', '框选模式 (M)')}>
                    <Button 
                        type="text" 
                        onClick={toggleSelectionMode} 
                        aria-label={isMarqueeActive ? t('toolbar.marqueeExit', '退出框选 (Esc)') : t('toolbar.marqueeEnter', '框选模式 (M)')}
                        aria-pressed={isMarqueeActive}
                        icon={<FaObjectGroup className={`text-[14px] ${isMarqueeActive ? 'text-indigo-500' : 'text-slate-500'}`} />} 
                        className={`w-9 h-9 p-0 border-none transition-all ${isMarqueeActive ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`} 
                    />
                </Tooltip>
                <Tooltip title={isDrawingMode ? t('toolbar.drawingModeExit', '退出自由画笔 (Esc)') : t('toolbar.drawingMode', '自由画笔 (P)')}>
                    <Button 
                        type="text" 
                        onClick={onToggleDrawingMode} 
                        aria-label={isDrawingMode ? t('toolbar.drawingModeExit', '退出自由画笔 (Esc)') : t('toolbar.drawingMode', '自由画笔 (P)')}
                        aria-pressed={isDrawingMode}
                        icon={<FaPen className={`text-[13px] ${isDrawingMode ? 'text-indigo-500' : 'text-slate-500'}`} />} 
                        className={`w-9 h-9 p-0 border-none transition-all ${isDrawingMode ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`} 
                    />
                </Tooltip>
            </div>
            
            <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />
            
            <div className="flex items-center gap-1">
                <Tooltip title={t('toolbar.stickyNote', '便签 (S)')}>
                    <Button type="text" onClick={onAddStickyNote} icon={<FaStickyNote className="text-[14px] text-amber-500" />} className="w-9 h-9 p-0 border-none hover:bg-slate-200 dark:hover:bg-white/5" />
                </Tooltip>
                <Tooltip title={t('toolbar.mindMap', '思维导图 (Shift+M)')}>
                    <Button type="text" onClick={onAddMindMap} icon={<FaSitemap className="text-[14px] text-sky-500" />} className="w-9 h-9 p-0 border-none hover:bg-slate-200 dark:hover:bg-white/5" />
                </Tooltip>
            </div>
        </div>
    );

    // 统一按钮样式
    const tbtn = "w-8 h-8 p-0 border-none text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] rounded-[6px] transition-colors";
    const tbtnActive = "w-8 h-8 p-0 border-none bg-[#e8f0fe] dark:bg-[rgba(138,180,248,0.15)] text-[#1a73e8] dark:text-[#8ab4f8] rounded-[6px] transition-colors hover:bg-[#d2e3fc] dark:hover:bg-[rgba(138,180,248,0.22)]";
    const tbtnDisabled = "w-8 h-8 p-0 border-none text-slate-300 dark:text-slate-600 rounded-[6px] cursor-not-allowed";
    const dividerCls = "w-[1px] h-4 bg-slate-200/80 dark:bg-white/10 mx-0.5 flex-shrink-0";
    const mobileToolbarButtonStyle = isMobile ? COMMERCIAL_MOBILE_TOUCH_STYLE : undefined;

    const MainWorkflowTools = (
        <div className="flex items-center gap-0.5">
            {/* ── Undo / Redo ── */}
            {!isMobile && !hideUndoRedoControls && (
                <>
                    <Tooltip title={t('designer.toolbar.undo')}>
                        <Button type="text" aria-label={t('designer.toolbar.undo')} icon={<FaUndo size={13} />} onClick={onUndo} disabled={!canUndo} className={canUndo ? tbtn : tbtnDisabled} />
                    </Tooltip>
                    {onShowHistory && screens.md && (
                        <Tooltip title={historyCount ? t('designer.toolbar.historyWithCount', { count: historyCount }) : t('designer.toolbar.historyPanel')}>
                            <Button type="text" size="small" aria-label={t('designer.toolbar.historyPanel')} onClick={onShowHistory} className="w-4 h-8 p-0 border-none text-[8px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-transparent flex items-center justify-center">▾</Button>
                        </Tooltip>
                    )}
                    <Tooltip title={t('designer.toolbar.redo')}>
                        <Button type="text" aria-label={t('designer.toolbar.redo')} icon={<FaRedo size={13} />} onClick={onRedo} disabled={!canRedo} className={canRedo ? tbtn : tbtnDisabled} />
                    </Tooltip>
                    <div className={dividerCls} />
                </>
            )}

            {/* ── Zoom ── */}
            {!hideZoomControls && (
                <>
                    <Tooltip title={t('designer.toolbar.zoomIn')}>
                        <Button type="text" aria-label={t('designer.toolbar.zoomIn')} icon={<FaSearchPlus size={13} />} onClick={onZoomIn} className={tbtn} style={mobileToolbarButtonStyle} />
                    </Tooltip>
                    <Tooltip title={t('designer.toolbar.zoomOut')}>
                        <Button type="text" aria-label={t('designer.toolbar.zoomOut')} icon={<FaSearchMinus size={13} />} onClick={onZoomOut} className={tbtn} style={mobileToolbarButtonStyle} />
                    </Tooltip>
                    <Tooltip title={t('designer.toolbar.fitView')}>
                        <Button type="text" aria-label={t('designer.toolbar.fitView')} icon={<FaCompressArrowsAlt size={13} />} onClick={onFitView} className={tbtn} style={mobileToolbarButtonStyle} />
                    </Tooltip>
                    {zoomPercent !== undefined && screens.lg && (
                        <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 min-w-[32px] text-center tabular-nums">{zoomPercent}%</span>
                    )}
                    <div className={dividerCls} />
                </>
            )}

            {/* ── Layout + Routing ── */}
            {!hideLayoutControls && (
                <>
                    <Dropdown
                        menu={{
                            items: layoutMenuModel.items,
                            selectedKeys: layoutMenuModel.selectedKeys,
                            selectable: true,
                            onKeyDown: layoutDropdown.handleMenuKeyDown,
                        }}
                        placement="bottom"
                        trigger={['click']}
                        open={layoutDropdown.open}
                        onOpenChange={layoutDropdown.handleOpenChange}
                        overlayClassName="flowchart-layout-menu"
                    >
                        <DropdownMenuTriggerButton
                            ref={layoutDropdown.triggerRef}
                            ariaLabel={layoutTriggerLabel}
                            open={layoutDropdown.open}
                            onTriggerKeyDown={layoutDropdown.handleTriggerKeyDown}
                            icon={<FaSitemap size={13} />}
                            className={tbtn}
                            style={mobileToolbarButtonStyle}
                        />
                    </Dropdown>
                    <Tooltip title={autoRouting ? t('designer.toolbar.autoRouting') + ' ' + onLabel : t('designer.toolbar.autoRouting') + ' ' + offLabel}>
                        <Button
                            type="text"
                            aria-label={autoRouting ? t('designer.toolbar.autoRouting') + ' ' + onLabel : t('designer.toolbar.autoRouting') + ' ' + offLabel}
                            aria-pressed={autoRouting}
                            icon={<FaMagic size={13} />}
                            onClick={toggleAutoRouting}
                            className={autoRouting ? tbtnActive : tbtn}
                            style={mobileToolbarButtonStyle}
                        />
                    </Tooltip>
                    <div className={dividerCls} />
                </>
            )}

            {/* ── Canvas Helpers: Snap · Settings · More ── */}
            {screens.md && (
                <>
                    {!hideGridControls && onToggleSnap && (
                        <Tooltip title={snapToGrid ? t('designer.toolbar.snapOn') : t('designer.toolbar.snapOff')}>
                            <Button
                                type="text"
                                aria-label={snapToGrid ? t('designer.toolbar.snapOn') : t('designer.toolbar.snapOff')}
                                onClick={onToggleSnap}
                                icon={<FaMagnet className="text-[13px]" />}
                                className={snapToGrid ? tbtnActive : tbtn}
                            />
                        </Tooltip>
                    )}

                    <Popover content={CanvasSettingsContent} trigger="click" placement="bottomRight">
                        <Tooltip title={t('toolbar.canvasSettings', '画布设置')}>
                            <Button
                                type="text"
                                aria-label={t('toolbar.canvasSettings', '画布设置')}
                                icon={
                                    <div className="relative">
                                        <FaBorderAll className="text-[13px]" />
                                        {(showRuler || showMinimap) && (
                                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#1a73e8] rounded-full" />
                                        )}
                                    </div>
                                }
                                className={tbtn}
                            />
                        </Tooltip>
                    </Popover>

                    <Dropdown
                        menu={moreMenu}
                        placement="bottomRight"
                        trigger={['click']}
                        open={moreDropdown.open}
                        onOpenChange={moreDropdown.handleOpenChange}
                        overlayClassName="flowchart-more-menu"
                    >
                        <DropdownMenuTriggerButton
                            ref={moreDropdown.triggerRef}
                            data-flowchart-import-focus-return={onImportClick ? 'true' : undefined}
                            ariaLabel={t('designer.toolbar.moreActions')}
                            open={moreDropdown.open}
                            onTriggerKeyDown={moreDropdown.handleTriggerKeyDown}
                            icon={<FaEllipsisH className="text-[13px]" />}
                            className={tbtn}
                        />
                    </Dropdown>
                </>
            )}

            {isMobile && (
                <Dropdown
                    menu={moreMenu}
                    placement="bottomRight"
                    trigger={['click']}
                    autoAdjustOverflow
                    overlayClassName="flowchart-mobile-more-menu"
                    open={moreDropdown.open}
                    onOpenChange={moreDropdown.handleOpenChange}
                >
                    <DropdownMenuTriggerButton
                        ref={moreDropdown.triggerRef}
                        data-flowchart-import-focus-return={onImportClick ? 'true' : undefined}
                        ariaLabel={t('designer.toolbar.moreActions')}
                        open={moreDropdown.open}
                        onTriggerKeyDown={moreDropdown.handleTriggerKeyDown}
                        icon={<FaEllipsisH className="text-[13px]" />}
                        className={tbtn}
                        style={mobileToolbarButtonStyle}
                    />
                </Dropdown>
            )}

            {children && (
                <div className="flex items-center ml-1 pl-2 border-l border-slate-200/60 dark:border-white/10">
                    {children}
                </div>
            )}
        </div>
    );

    if (!portalTarget) return null;

    return (
        <>
            {createPortal(MainWorkflowTools, portalTarget)}
            {!isMobile && contextPortalTarget && (selectedNodesCount || 0) > 1 && createPortal(
                <FlowchartAlignmentTools
                    isMobile={isMobile}
                    selectedNodesCount={selectedNodesCount || 0}
                    onAlign={onAlign}
                    onDistribute={onDistribute}
                />,
                contextPortalTarget,
            )}
            {bottomPortalTarget && createPortal(CreationTools, bottomPortalTarget)}
        </>
    );
});

ModernFlowchartToolbar.displayName = 'ModernFlowchartToolbar';
