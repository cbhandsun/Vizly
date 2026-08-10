import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import {
    FaUndo, FaRedo, FaSearchPlus, FaSearchMinus, FaCompressArrowsAlt,
    FaMagic, FaTh, FaKeyboard, FaBorderAll, FaBorderNone,
    FaSitemap, FaObjectGroup, FaRuler,
    FaEllipsisH, FaTrashAlt,
    FaMagnet, FaPen, FaStickyNote, FaMousePointer,
    FaFolderOpen, FaFileExport, FaHistory, FaMap, FaSearch,
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
import { getFlowchartZoomControlState } from './flowchartZoomControlState';
import { useKeyboardAccessibleDropdown } from './hooks/useKeyboardAccessibleDropdown';
import './ModernFlowchartToolbar.css';
import {
    COMMERCIAL_VIEWPORT_MODAL_CLASS,
    COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
    getViewportOverlayContainer,
} from '../ui/viewportOverlayPortal';

interface FlowchartToolbarProps {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onResetZoom?: () => void;
    onFitView: () => void;
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
    onZoomIn, onZoomOut, onResetZoom, onFitView,
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
    const [canvasSettingsOpen, setCanvasSettingsOpen] = useState(false);
    const canvasSettingsTriggerRef = useRef<HTMLButtonElement>(null);
    const hasHistoryEntries = typeof historyCount === 'number'
        && Number.isSafeInteger(historyCount)
        && historyCount > 0;
    const historyButtonLabel = hasHistoryEntries
        ? t('designer.toolbar.historyWithCount', { count: historyCount })
        : t('designer.toolbar.historyPanel');
    const layoutDropdown = useKeyboardAccessibleDropdown({
        overlayClassName: 'flowchart-layout-menu',
    });
    const moreDropdown = useKeyboardAccessibleDropdown({
        overlayClassName: isMobile ? 'flowchart-mobile-more-menu' : 'flowchart-more-menu',
    });
    const moreDropdownTriggerRef = moreDropdown.triggerRef;
    const handleMoreDropdownOpenChange = moreDropdown.handleOpenChange;
    const handleShowShortcutsFromCanvasSettings = useCallback(() => {
        setCanvasSettingsOpen(false);
        canvasSettingsTriggerRef.current?.focus();
        onShowShortcuts();
    }, [onShowShortcuts]);
    const handleShowShortcutsFromMoreMenu = useCallback(() => {
        handleMoreDropdownOpenChange(false, { source: 'menu' });
        moreDropdownTriggerRef.current?.focus();
        onShowShortcuts();
    }, [handleMoreDropdownOpenChange, moreDropdownTriggerRef, onShowShortcuts]);

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
    const zoomControlState = getFlowchartZoomControlState(zoomPercent);
    const normalizedZoomPercent = zoomControlState.percent;
    const zoomStatus = normalizedZoomPercent === undefined ? undefined : `${normalizedZoomPercent}%`;
    const zoomControlLabel = (label: string) => zoomStatus ? `${label} (${zoomStatus})` : label;
    const zoomResetButtonStyle: React.CSSProperties = isMobile
        ? { ...COMMERCIAL_MOBILE_TOUCH_STYLE, paddingInline: 4 }
        : { minWidth: 38, width: 'auto', paddingInline: 4 };

    const gridInfo = useMemo(() => {
        if (!showGrid) return {
            title: t('designer.toolbar.gridOff'),
            stateLabel: t('common.off'),
            icon: <FaBorderNone />,
        };
        switch (gridVariant) {
            case BackgroundVariant.Dots: return {
                title: t('designer.toolbar.gridDots'),
                stateLabel: t('designer.toolbar.gridStateDots', '点状'),
                icon: <FaTh />,
            };
            case BackgroundVariant.Lines: return {
                title: t('designer.toolbar.gridLines'),
                stateLabel: t('designer.toolbar.gridStateLines', '线状'),
                icon: <FaBorderAll />,
            };
            case BackgroundVariant.Cross: return {
                title: t('designer.toolbar.gridCross'),
                stateLabel: t('designer.toolbar.gridStateCross', '交叉'),
                icon: <FaTh style={{ transform: 'rotate(45deg)' }} />,
            };
            default: return {
                title: t('designer.toolbar.showGrid'),
                stateLabel: t('common.on'),
                icon: <FaTh />,
            };
        }
    }, [showGrid, gridVariant, t]);

    const handleResetLocalEditorState = useCallback(() => {
        const returnFocusTarget = moreDropdownTriggerRef.current;

        appModal.confirm({
            title: t('designer.toolbar.clearCacheTitle'),
            content: t('designer.toolbar.clearCacheContent'),
            okText: t('designer.toolbar.clearCacheConfirm'),
            cancelText: t('common.cancel'),
            autoFocusButton: 'cancel',
            rootClassName: `${COMMERCIAL_VIEWPORT_MODAL_CLASS} local-editor-reset-confirm`,
            getContainer: getViewportOverlayContainer,
            zIndex: COMMERCIAL_VIEWPORT_MODAL_Z_INDEX,
            okButtonProps: { danger: true },
            afterClose: () => {
                window.setTimeout(() => {
                    if (returnFocusTarget?.isConnected) {
                        returnFocusTarget.focus({ preventScroll: true });
                    }
                }, 0);
            },
            onOk: () => {
                const diagramId = coerceDiagramId(
                    getQueryOrHashParamFromLocation(window.location, 'diagram')
                ) || localStorage.getItem('diagramMenu.selectedDiagramId');

                clearFlowchartCache(diagramId);

                if (diagramId) {
                    try {
                        localStorage.setItem('diagramMenu.selectedDiagramId', diagramId);
                    } catch { void 0; }
                }

                window.location.reload();
            },
        });
    }, [moreDropdownTriggerRef, t]);

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
                label: t('designer.toolbar.creationTools', '操作工具'),
                type: 'group' as const,
                children: buildToolModeMenuItems({
                    isDrawingMode,
                    isMarqueeActive,
                    labels: {
                        drawing: isDrawingMode
                            ? t('designer.toolbar.drawingModeExit', '退出自由画笔 (Esc)')
                            : t('designer.toolbar.drawingMode', '自由画笔 (P)'),
                        marquee: isMarqueeActive
                            ? t('designer.toolbar.marqueeExit', '退出框选 (Esc)')
                            : t('designer.toolbar.marqueeEnter', '框选模式 (M)'),
                        mindMap: t('designer.toolbar.mindMap', '思维导图 (Shift+M)'),
                        pointer: t('designer.toolbar.pointer', '普通选择器 (V)'),
                        stickyNote: t('designer.toolbar.stickyNote', '便签 (S)'),
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
            label: t('designer.toolbar.searchCanvas', '搜索画布内容 (Ctrl+F)'),
            icon: <FaSearch />,
            onClick: onShowCanvasSearch,
        }, { type: 'divider' as const }] : []),
        {
            key: 'shortcuts',
            label: t('designer.toolbar.shortcuts'),
            icon: <FaKeyboard />,
            onClick: handleShowShortcutsFromMoreMenu,
        },
        { type: 'divider' as const },
        {
            key: 'clear-cache',
            label: t('designer.toolbar.clearCache'),
            icon: <FaTrashAlt />,
            danger: true,
            onClick: handleResetLocalEditorState,
        },
    ], [
        t, gridInfo, toggleGrid, showRuler, toggleRuler, toggleMinimap, showMinimap, isMobile,
        onToggleSnap, snapToGrid,
        handleShowShortcutsFromMoreMenu, onShowCanvasSearch, onImportClick, onExport, onActivatePointer, toggleSelectionMode,
        onToggleDrawingMode, onAddStickyNote, onAddMindMap, isMarqueeActive, isDrawingMode, handleResetLocalEditorState,
    ]);

    const selectedToolModeKey = resolveActiveToolModeKey(isMarqueeActive, isDrawingMode);
    const mobileMoreHasActiveTool = isMarqueeActive || isDrawingMode;
    const mobileMoreLabel = isMarqueeActive
        ? `${t('designer.toolbar.moreActions')} · ${t('designer.toolbar.marqueeExit', '退出框选 (Esc)')}`
        : isDrawingMode
            ? `${t('designer.toolbar.moreActions')} · ${t('designer.toolbar.drawingModeExit', '退出自由画笔 (Esc)')}`
            : t('designer.toolbar.moreActions');
    const mobileMoreIcon = isMarqueeActive
        ? <FaObjectGroup className="text-[14px]" />
        : isDrawingMode
            ? <FaPen className="text-[13px]" />
            : <FaEllipsisH className="text-[13px]" />;

    const moreMenu = useMemo(() => ({
        items: moreMenuItems,
        selectedKeys: [selectedToolModeKey],
        selectable: true,
        onKeyDown: moreDropdown.handleMenuKeyDown,
    }), [moreMenuItems, moreDropdown.handleMenuKeyDown, selectedToolModeKey]);

    const CanvasSettingsContent = (
        <FlowchartCanvasSettingsContent
            gridInfo={gridInfo}
            onShowShortcuts={handleShowShortcutsFromCanvasSettings}
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
                <Tooltip title={t('designer.toolbar.pointer', '普通选择器 (V)')}>
                    <Button 
                        type="text" 
                        onClick={onActivatePointer} 
                        aria-label={t('designer.toolbar.pointer', '普通选择器 (V)')}
                        aria-pressed={!isDrawingMode && !isMarqueeActive}
                        icon={<FaMousePointer className={`text-[12px] ${(!isDrawingMode && !isMarqueeActive) ? 'text-indigo-500' : 'text-slate-500'}`} />} 
                        className={`w-9 h-9 p-0 border-none transition-all ${(!isDrawingMode && !isMarqueeActive) ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`} 
                    />
                </Tooltip>
                <Tooltip title={isMarqueeActive ? t('designer.toolbar.marqueeExit', '退出框选 (Esc)') : t('designer.toolbar.marqueeEnter', '框选模式 (M)')}>
                    <Button 
                        type="text" 
                        onClick={toggleSelectionMode} 
                        aria-label={isMarqueeActive ? t('designer.toolbar.marqueeExit', '退出框选 (Esc)') : t('designer.toolbar.marqueeEnter', '框选模式 (M)')}
                        aria-pressed={isMarqueeActive}
                        icon={<FaObjectGroup className={`text-[14px] ${isMarqueeActive ? 'text-indigo-500' : 'text-slate-500'}`} />} 
                        className={`w-9 h-9 p-0 border-none transition-all ${isMarqueeActive ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`} 
                    />
                </Tooltip>
                <Tooltip title={isDrawingMode ? t('designer.toolbar.drawingModeExit', '退出自由画笔 (Esc)') : t('designer.toolbar.drawingMode', '自由画笔 (P)')}>
                    <Button 
                        type="text" 
                        onClick={onToggleDrawingMode} 
                        aria-label={isDrawingMode ? t('designer.toolbar.drawingModeExit', '退出自由画笔 (Esc)') : t('designer.toolbar.drawingMode', '自由画笔 (P)')}
                        aria-pressed={isDrawingMode}
                        icon={<FaPen className={`text-[13px] ${isDrawingMode ? 'text-indigo-500' : 'text-slate-500'}`} />} 
                        className={`w-9 h-9 p-0 border-none transition-all ${isDrawingMode ? 'bg-white dark:bg-slate-800 shadow-sm text-indigo-500' : 'hover:bg-slate-200 dark:hover:bg-white/5'}`} 
                    />
                </Tooltip>
            </div>
            
            <div className="w-[1px] h-4 bg-slate-200 dark:bg-white/10 mx-1" />
            
            <div className="flex items-center gap-1">
                <Tooltip title={t('designer.toolbar.stickyNote', '便签 (S)')}>
                    <Button type="text" aria-label={t('designer.toolbar.stickyNote', '便签 (S)')} onClick={onAddStickyNote} icon={<FaStickyNote className="text-[14px] text-amber-500" />} className="w-9 h-9 p-0 border-none hover:bg-slate-200 dark:hover:bg-white/5" />
                </Tooltip>
                <Tooltip title={t('designer.toolbar.mindMap', '思维导图 (Shift+M)')}>
                    <Button type="text" aria-label={t('designer.toolbar.mindMap', '思维导图 (Shift+M)')} onClick={onAddMindMap} icon={<FaSitemap className="text-[14px] text-sky-500" />} className="w-9 h-9 p-0 border-none hover:bg-slate-200 dark:hover:bg-white/5" />
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
                        <Tooltip title={historyButtonLabel}>
                            <Button
                                type="text"
                                aria-label={historyButtonLabel}
                                icon={<FaHistory size={13} />}
                                onClick={onShowHistory}
                                className={tbtn}
                            />
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
                        <Button type="text" aria-label={zoomControlLabel(t('designer.toolbar.zoomIn'))} icon={<FaSearchPlus size={13} />} onClick={onZoomIn} disabled={zoomControlState.zoomInDisabled} className={zoomControlState.zoomInDisabled ? tbtnDisabled : tbtn} style={mobileToolbarButtonStyle} />
                    </Tooltip>
                    <Tooltip title={t('designer.toolbar.zoomOut')}>
                        <Button type="text" aria-label={zoomControlLabel(t('designer.toolbar.zoomOut'))} icon={<FaSearchMinus size={13} />} onClick={onZoomOut} disabled={zoomControlState.zoomOutDisabled} className={zoomControlState.zoomOutDisabled ? tbtnDisabled : tbtn} style={mobileToolbarButtonStyle} />
                    </Tooltip>
                    <Tooltip title={t('designer.toolbar.fitView')}>
                        <Button type="text" aria-label={zoomControlLabel(t('designer.toolbar.fitView'))} icon={<FaCompressArrowsAlt size={13} />} onClick={onFitView} className={tbtn} style={mobileToolbarButtonStyle} />
                    </Tooltip>
                    {zoomStatus && onResetZoom && (
                        <Tooltip title={t('designer.toolbar.resetZoom')}>
                            <Button
                                type="text"
                                aria-label={zoomControlLabel(t('designer.toolbar.resetZoom'))}
                                onClick={onResetZoom}
                                disabled={zoomControlState.resetDisabled}
                                className={zoomControlState.resetDisabled ? tbtnDisabled : tbtn}
                                style={zoomResetButtonStyle}
                            >
                                <span aria-hidden="true" className="tabular-nums">{zoomStatus}</span>
                            </Button>
                        </Tooltip>
                    )}
                    {zoomStatus && !onResetZoom && (
                        <span
                            aria-label={zoomStatus}
                            className="text-[10px] sm:text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 min-w-[30px] sm:min-w-[32px] text-center tabular-nums"
                        >
                            {zoomStatus}
                        </span>
                    )}
                    {zoomStatus && (
                        <span role="status" aria-label={zoomStatus} aria-live="polite" aria-atomic="true" className="sr-only">
                            {zoomStatus}
                        </span>
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
                                aria-pressed={Boolean(snapToGrid)}
                                onClick={onToggleSnap}
                                icon={<FaMagnet className="text-[13px]" />}
                                className={snapToGrid ? tbtnActive : tbtn}
                            />
                        </Tooltip>
                    )}

                    <Popover
                        content={CanvasSettingsContent}
                        trigger="click"
                        placement="bottomRight"
                        open={canvasSettingsOpen}
                        onOpenChange={setCanvasSettingsOpen}
                        destroyOnHidden
                    >
                        <Tooltip title={t('designer.toolbar.canvasSettings', '画布设置')}>
                            <Button
                                ref={canvasSettingsTriggerRef}
                                type="text"
                                aria-label={t('designer.toolbar.canvasSettings', '画布设置')}
                                aria-expanded={canvasSettingsOpen}
                                icon={
                                    <div className="relative">
                                        <FaBorderAll className="text-[13px]" />
                                        {(showRuler || showMinimap) && (
                                            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-[#1a73e8] rounded-full" />
                                        )}
                                    </div>
                                }
                                className={canvasSettingsOpen ? tbtnActive : tbtn}
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
                            data-flowchart-search-focus-return={onShowCanvasSearch ? 'true' : undefined}
                            data-advanced-export-focus-return={onExport ? 'true' : undefined}
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
                    getPopupContainer={(triggerNode) => triggerNode.ownerDocument.body}
                    overlayClassName="flowchart-mobile-more-menu"
                    open={moreDropdown.open}
                    onOpenChange={moreDropdown.handleOpenChange}
                >
                    <DropdownMenuTriggerButton
                        ref={moreDropdown.triggerRef}
                        data-flowchart-import-focus-return={onImportClick ? 'true' : undefined}
                        data-flowchart-search-focus-return={onShowCanvasSearch ? 'true' : undefined}
                        data-advanced-export-focus-return={onExport ? 'true' : undefined}
                        ariaLabel={mobileMoreLabel}
                        open={moreDropdown.open}
                        onTriggerKeyDown={moreDropdown.handleTriggerKeyDown}
                        icon={mobileMoreIcon}
                        className={mobileMoreHasActiveTool ? tbtnActive : tbtn}
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
