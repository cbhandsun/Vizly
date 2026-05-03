import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import {
    FaUndo, FaRedo, FaSearchPlus, FaSearchMinus, FaCompressArrowsAlt, FaArrowsAltH,
    FaMagic, FaTh, FaKeyboard, FaBorderAll, FaBorderNone,
    FaSitemap, FaObjectGroup, FaRegObjectGroup, FaRuler, FaGripVertical,
    FaEllipsisH, FaTrashAlt, FaProjectDiagram,
    FaMagnet, FaPen, FaStickyNote, FaMousePointer,
    FaFolderOpen, FaFileExport, FaMap, FaRegComment
} from 'react-icons/fa';
import { BackgroundVariant } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Tooltip, Button, Dropdown, MenuProps, Popover } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { appModal } from '../../utils/antdStaticBridge';

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
}

export const ModernFlowchartToolbar: React.FC<FlowchartToolbarProps> = memo(({
    canUndo, canRedo, onUndo, onRedo,
    onZoomIn, onZoomOut, onFitView, onFitWidth,
    autoRouting, toggleAutoRouting,
    showGrid, gridVariant, toggleGrid,
    onShowShortcuts,
    onStrategyLayout,
    lastDomainStrategy,
    lastDomainDirection,
    lastNodeLayout,
    showRuler,
    toggleRuler,
    showMinimap,
    toggleMinimap,
    onToggleAI,
    aiChatActive,
    showAiCrown,
    nodeCount,
    edgeCount,
    selectedNodesCount,
    selectedEdgesCount,
    zoomPercent,
    snapToGrid,
    onToggleSnap,
    highlightMainFlow,
    onToggleHighlightMainFlow,
    showOnlyMainFlow,
    onToggleShowOnlyMainFlow,
    children,
    hideZoomControls,
    hideLayoutControls,
    hideGridControls,
    hideFlowFocusControls,
    isDrawingMode,
    isMarqueeActive,
    toggleSelectionMode,
    onToggleDrawingMode,
    onActivatePointer,
    onAddStickyNote,
    onAddMindMap,
    onImportClick,
    onExport,
    isCommentMode,
    setIsCommentMode,
    onShowHistory,
    historyCount,
}) => {
    const { t } = useTranslation();
    const onLabel = t('common.on');
    const offLabel = t('common.off');

    // 拖动功能状态
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const toolbar = toolbarRef.current;
        if (!toolbar) return;

        const rect = toolbar.getBoundingClientRect();
        const currentX = position?.x ?? rect.left;
        const currentY = position?.y ?? rect.top;

        dragStartRef.current = {
            x: currentX,
            y: currentY,
            startX: e.clientX,
            startY: e.clientY
        };
        setIsDragging(true);
    }, [position]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!dragStartRef.current) return;

            const deltaX = e.clientX - dragStartRef.current.startX;
            const deltaY = e.clientY - dragStartRef.current.startY;

            setPosition({
                x: dragStartRef.current.x + deltaX,
                y: dragStartRef.current.y + deltaY
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            dragStartRef.current = null;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // 重置位置（双击拖动手柄）
    const handleDoubleClick = useCallback(() => {
        setPosition(null);
    }, []);

    const activeLayoutKey = useMemo(() => {
        if (!lastDomainStrategy) return undefined;
        if (lastDomainStrategy === 'force') return 'force';
        if (lastDomainStrategy === 'domain-vertical') return 'domain-vertical';
        if (lastDomainStrategy === 'domain-horizontal') return 'domain-horizontal';
        if (lastDomainDirection) {
            return `${lastDomainStrategy}-${lastDomainDirection.toLowerCase()}`;
        }
        return lastDomainStrategy;
    }, [lastDomainStrategy, lastDomainDirection]);

    const activeNodeLayoutKey = lastNodeLayout ? `node-${lastNodeLayout}` : undefined;
    const selectedLayoutKeys = useMemo(
        () => [activeLayoutKey, activeNodeLayoutKey].filter(Boolean) as string[],
        [activeLayoutKey, activeNodeLayoutKey]
    );

    const layoutMenu: MenuProps['items'] = useMemo(() => [
        // ── 树形布局 ──
        {
            key: 'group-tree', label: t('designer.flowchart.layout.treeGroup', '树形布局'), type: 'group' as const, children: [
                {
                    key: 'tree-tb',
                    label: t('designer.flowchart.layout.treeTB', '↕ 树形 (上→下)'),
                    icon: <FaSitemap />,
                    onClick: () => onStrategyLayout?.('tree', undefined, 'TB')
                },
                {
                    key: 'tree-lr',
                    label: t('designer.flowchart.layout.treeLR', '↔ 树形 (左→右)'),
                    icon: <FaSitemap style={{ transform: 'rotate(-90deg)' }} />,
                    onClick: () => onStrategyLayout?.('tree', undefined, 'LR')
                },
            ]
        },
        // ── 力导向 ──
        { type: 'divider' as const },
        {
            key: 'group-force', label: t('designer.flowchart.layout.forceGroup', '力导向'), type: 'group' as const, children: [
                {
                    key: 'force',
                    label: t('designer.flowchart.layout.force', '⊙ 力导向'),
                    onClick: () => onStrategyLayout?.('force', undefined, 'TB')
                },
            ]
        },
        // ── 域感知布局（仅当回调可用时显示）──
        ...(onStrategyLayout ? [
            { type: 'divider' as const },
            {
                key: 'group-domain', label: t('designer.flowchart.layout.domainGroup', '域感知布局'), type: 'group' as const, children: [
                    {
                        key: 'domain-dagre-lr',
                        label: t('designer.flowchart.layout.domainDagreLR', '◈ DomainDagre (左→右)'),
                        icon: <FaRegObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                        onClick: () => onStrategyLayout('domain-dagre', lastNodeLayout, 'LR')
                    },
                    {
                        key: 'domain-dagre-tb',
                        label: t('designer.flowchart.layout.domainDagreTB', '◈ DomainDagre (上→下) (默认)'),
                        icon: <FaRegObjectGroup />,
                        onClick: () => onStrategyLayout('domain-dagre', lastNodeLayout, 'TB')
                    },
                    { type: 'divider' as const },
                    {
                        key: 'domain-vertical',
                        label: t('designer.flowchart.layout.domainVertical', '▥ DomainVertical (上→下)'),
                        icon: <FaObjectGroup />,
                        onClick: () => onStrategyLayout('domain-vertical', lastNodeLayout, 'TB')
                    },
                    {
                        key: 'domain-horizontal',
                        label: t('designer.flowchart.layout.domainHorizontal', '▦ DomainHorizontal (左→右)'),
                        icon: <FaObjectGroup style={{ transform: 'rotate(-90deg)' }} />,
                        onClick: () => onStrategyLayout('domain-horizontal', lastNodeLayout, 'LR')
                    },
                ]
            },
            // ── 域内节点排布 ──
            { type: 'divider' as const },
            {
                key: 'group-node-layout', label: t('designer.flowchart.layout.nodeLayoutGroup', '域内节点排布'), type: 'group' as const, children: [
                    {
                        key: 'node-flow',
                        label: t('designer.flowchart.layout.nodeFlow', '▷ 流式'),
                        onClick: () => onStrategyLayout(lastDomainStrategy || 'domain-dagre', 'flow', lastDomainDirection || 'TB')
                    },
                    {
                        key: 'node-grid',
                        label: t('designer.flowchart.layout.nodeGrid', '⊞ 网格'),
                        onClick: () => onStrategyLayout(lastDomainStrategy || 'domain-dagre', 'grid', lastDomainDirection || 'TB')
                    },
                    {
                        key: 'node-horizontal',
                        label: t('designer.flowchart.layout.nodeHorizontal', '⊟ 水平'),
                        onClick: () => onStrategyLayout(lastDomainStrategy || 'domain-dagre', 'horizontal', lastDomainDirection || 'TB')
                    },
                    {
                        key: 'node-vertical',
                        label: t('designer.flowchart.layout.nodeVertical', '⊞ 垂直'),
                        onClick: () => onStrategyLayout(lastDomainStrategy || 'domain-dagre', 'vertical', lastDomainDirection || 'TB')
                    },
                    {
                        key: 'node-dagre',
                        label: t('designer.flowchart.layout.nodeDagre', '◈ Dagre分层 (默认)'),
                        onClick: () => onStrategyLayout(lastDomainStrategy || 'domain-dagre', 'dagre', lastDomainDirection || 'TB')
                    },
                ]
            },
        ] : []),
    ], [t, onStrategyLayout, lastNodeLayout, lastDomainStrategy, lastDomainDirection]);

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
        { type: 'divider' as const },
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
                        const urlParams = new URLSearchParams(window.location.search);
                        const diagramIdFromUrl = urlParams.get('diagram');
                        const diagramId = diagramIdFromUrl
                            || localStorage.getItem('diagramMenu.selectedDiagramId');

                        // 2. 彻底清空所有缓存
                        localStorage.clear();
                        sessionStorage.clear();

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
    ], [t, gridInfo, showRuler, toggleRuler, toggleMinimap, showMinimap, onShowShortcuts, onImportClick, onExport]);

    // 计算工具栏样式
    const toolbarStyle: React.CSSProperties = position
        ? {
            position: 'absolute',
            left: position.x,
            top: position.y,
            transform: 'none',
            zIndex: 1010,
            transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            cursor: isDragging ? 'grabbing' : 'default',
        }
        : {
            position: 'absolute',
            bottom: 32,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1010,
            transition: 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            animation: 'toolbarEnter 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        };

    return (
        <div ref={toolbarRef} style={toolbarStyle} className="modern-toolbar flex items-center justify-center gap-4 pointer-events-none" role="toolbar" aria-label={t('designer.toolbar.toolbarAriaLabel')}>
            
                <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                {/* 拖动手柄 */}
                <div
                    onMouseDown={handleMouseDown}
                    onDoubleClick={handleDoubleClick}
                    title={t('designer.toolbar.dragToMove')}
                    role="separator"
                    aria-roledescription={t('designer.toolbar.dragHandle')}
                    className="toolbar-drag-handle"
                    style={{
                        cursor: isDragging ? 'grabbing' : 'grab',
                        padding: '4px 8px',
                        marginRight: 6,
                        display: 'flex',
                        alignItems: 'center',
                        color: 'rgba(0, 0, 0, 0.25)',
                        transition: 'all 0.3s ease',
                    }}
                >
                    <FaGripVertical size={16} />
                </div>
                
                {/* ── 创作工具栏 (Creation Tools) ── */}
                    {onActivatePointer && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2,   /* borderRight: removed */ }}>
                            <Tooltip title={t('designer.toolbar.pointer')}>
                                <Button 
                                    type={!isDrawingMode && !isMarqueeActive ? 'primary' : 'text'} 
                                    icon={<FaMousePointer />} 
                                    onClick={onActivatePointer}
                                />
                            </Tooltip>
                            
                            {toggleSelectionMode && (
                            <Tooltip title={isMarqueeActive ? t('designer.toolbar.marqueeExit') : t('designer.toolbar.marqueeEnter')}>
                                <Button 
                                    type={isMarqueeActive ? 'primary' : 'text'} 
                                    icon={<FaRegObjectGroup />} 
                                    onClick={toggleSelectionMode}
                                />
                            </Tooltip>
                            )}

                            {onToggleDrawingMode && (
                                <Tooltip title={t('designer.toolbar.drawingMode')}>
                                    <Button 
                                        type={isDrawingMode ? 'primary' : 'text'} 
                                        icon={<FaPen />} 
                                        onClick={onToggleDrawingMode}
                                    />
                                </Tooltip>
                            )}

                            {onAddStickyNote && (
                                <Tooltip title={t('designer.toolbar.stickyNote')}>
                                    <Button 
                                        type="text" 
                                        icon={<FaStickyNote />} 
                                        onClick={onAddStickyNote}
                                        style={{ color: '#F59E0B' }}
                                    />
                                </Tooltip>
                            )}

                            {onAddMindMap && (
                                <Tooltip title={t('designer.toolbar.mindMap')}>
                                    <Button 
                                        type="text" 
                                        icon={<FaProjectDiagram />} 
                                        onClick={onAddMindMap}
                                        style={{ color: '#8B5CF6' }}
                                    />
                                </Tooltip>
                            )}

                            {setIsCommentMode && (
                                <Tooltip title={isCommentMode ? t('designer.toolbar.commentModeExit') : t('designer.toolbar.commentMode')}>
                                    <Button 
                                        type={isCommentMode ? 'primary' : 'text'} 
                                        icon={<FaRegComment />} 
                                        onClick={() => setIsCommentMode(!isCommentMode)}
                                        style={{ color: isCommentMode ? undefined : '#10B981' }}
                                    />
                                </Tooltip>
                            )}
                        </div>
                    )}

                    </div>

                {/* ── 历史 ── */}
                <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                    {/* ── 历史 ── */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        <Tooltip title={t('designer.toolbar.undo')}>
                            <Button type="text" icon={<FaUndo />} onClick={onUndo} disabled={!canUndo} aria-label={t('designer.toolbar.undo')} style={{ borderRadius: '6px 0 0 6px' }} />
                        </Tooltip>
                        {onShowHistory && (
                            <Tooltip title={historyCount ? t('designer.toolbar.historyWithCount', { count: historyCount }) : t('designer.toolbar.historyPanel')}>
                                <Button
                                    type="text"
                                    size="small"
                                    onClick={onShowHistory}
                                    aria-label={t('designer.toolbar.historyPanel')}
                                    style={{
                                        width: 14,
                                        height: 32,
                                        padding: 0,
                                        borderRadius: '0 6px 6px 0',
                                        fontSize: 8,
                                        color: historyCount ? '#6366f1' : 'rgba(0,0,0,0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderLeft: '1px solid rgba(0,0,0,0.08)',
                                        marginLeft: 0,
                                    }}
                                >
                                    ▾
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                    <Tooltip title={t('designer.toolbar.redo')}>
                        <Button type="text" icon={<FaRedo />} onClick={onRedo} disabled={!canRedo} aria-label={t('designer.toolbar.redo')} />
                    </Tooltip>

                    {!hideZoomControls && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2,   /* borderLeft: removed */ }}>
                            {/* ── 视图 ── */}
                            <Tooltip title={t('designer.toolbar.zoomIn')}>
                                <Button type="text" icon={<FaSearchPlus />} onClick={onZoomIn} aria-label={t('designer.toolbar.zoomIn')} />
                            </Tooltip>
                            <Tooltip title={t('designer.toolbar.zoomOut')}>
                                <Button type="text" icon={<FaSearchMinus />} onClick={onZoomOut} aria-label={t('designer.toolbar.zoomOut')} />
                            </Tooltip>
                            <Tooltip title={t('designer.toolbar.fitView')}>
                                <Button type="text" icon={<FaCompressArrowsAlt />} onClick={onFitView} aria-label={t('designer.toolbar.fitView')} />
                            </Tooltip>
                            {onFitWidth && (
                                <Tooltip title={t('designer.toolbar.fitWidth', '适应宽度')}>
                                    <Button type="text" icon={<FaArrowsAltH />} onClick={onFitWidth} aria-label={t('designer.toolbar.fitWidth', '适应宽度')} />
                                </Tooltip>
                            )}
                        </div>
                    )}

                    {!hideLayoutControls && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2,   /* borderLeft: removed */ }}>
                            {/* ── 布局 + 路由 ── */}
                            <Dropdown menu={{ items: layoutMenu, selectedKeys: selectedLayoutKeys, selectable: true }} placement="top">
                                <Tooltip title={t('designer.flowchart.layout.tooltip')}>
                                    <Button type="text" icon={<FaSitemap />} aria-label={t('designer.flowchart.layout.tooltip')} />
                                </Tooltip>
                            </Dropdown>
                            <Tooltip title={`${t('designer.toolbar.autoRouting')} (${autoRouting ? onLabel : offLabel})`}>
                                <Button
                                    type={autoRouting ? 'primary' : 'text'}
                                    ghost={autoRouting}
                                    icon={<FaMagic />}
                                    onClick={toggleAutoRouting}
                                    aria-label={`${t('designer.toolbar.autoRouting')} (${autoRouting ? onLabel : offLabel})`}
                                    aria-pressed={autoRouting}
                                />
                            </Tooltip>
                        </div>
                    )}


                    </div>

                {/* ── AI 助手 ── */}
                <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                    {/* ── AI 助手 ── */}
                    {onToggleAI && (
                        <Tooltip title={<>{t('aiChat.title')} {showAiCrown && <span style={{  fontSize: '13px' }} title={t('common.proFeature')}>👑</span>}</>}>
                            <Button
                                type={aiChatActive ? 'primary' : 'text'}
                                ghost={aiChatActive}
                                icon={<RobotOutlined />}
                                onClick={onToggleAI}
                                aria-label={t('aiChat.title')}
                                aria-pressed={aiChatActive}
                            />
                        </Tooltip>
                    )}

                    {/* ── 主链路相关 (Flow Focus) ── */}
                    {!hideFlowFocusControls && onToggleHighlightMainFlow && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2,   /* borderLeft: removed */ }}>
                            <Tooltip title={highlightMainFlow ? t('designer.toolbar.unhighlightMainFlow') : t('designer.toolbar.highlightMainFlow')}>
                                <Button
                                    type={highlightMainFlow ? 'primary' : 'text'}
                                    ghost={highlightMainFlow}
                                    icon={<FaProjectDiagram />}
                                    onClick={onToggleHighlightMainFlow}
                                    aria-label={highlightMainFlow ? t('designer.toolbar.unhighlightMainFlow') : t('designer.toolbar.highlightMainFlow')}
                                    aria-pressed={highlightMainFlow}
                                />
                            </Tooltip>
                            {onToggleShowOnlyMainFlow && (
                                <Tooltip title={showOnlyMainFlow ? t('designer.toolbar.restoreFullFlow') : t('designer.toolbar.showOnlyMainFlow')}>
                                    <Button
                                        type={showOnlyMainFlow ? 'primary' : 'text'}
                                        ghost={showOnlyMainFlow}
                                        icon={<FaSitemap />}
                                        onClick={onToggleShowOnlyMainFlow}
                                    />
                                </Tooltip>
                            )}
                        </div>
                    )}
                </div>


                    

                    <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                    {/* ── 更多菜单（低频功能） ── */}
                    <Dropdown menu={{ items: moreMenuItems }} placement="top" trigger={['click']} styles={{ root: { minWidth: 220, whiteSpace: 'nowrap' } }}>
                        <Tooltip title={t('designer.toolbar.moreActions')}>
                            <Button type="text" icon={<FaEllipsisH />} aria-label={t('designer.toolbar.moreActions')} />
                        </Tooltip>
                    </Dropdown>

                    {(!hideGridControls || !hideLayoutControls) && (
                        <>
                            {/* ── 状态信息区域（合并自 DiagramStatusBar） ── */}
                            {(selectedNodesCount !== undefined || zoomPercent !== undefined) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap' }}>
                                        {!hideGridControls && (selectedNodesCount || 0) > 0 && (
                                            <span style={{ color: '#1890ff', fontWeight: 500 }}>
                                                {selectedNodesCount}↗
                                            </span>
                                        )}
                                        {!hideGridControls && onToggleSnap && (
                                            <Tooltip title={snapToGrid ? t('designer.toolbar.snapOn') : t('designer.toolbar.snapOff')}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    className={`toolbar-status-btn ${snapToGrid ? 'active' : ''}`}
                                                    onClick={onToggleSnap}
                                                    icon={<FaMagnet size={10} />}
                                                    style={{
                                                        color: snapToGrid ? '#1890ff' : 'rgba(0,0,0,0.3)',
                                                        fontSize: 10,
                                                        width: 24, height: 24,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        borderRadius: '6px',
                                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                    }}
                                                />
                                            </Tooltip>
                                        )}
                                        {!hideZoomControls && zoomPercent !== undefined && (
                                            <span style={{ fontFamily: 'monospace', minWidth: 36, textAlign: 'right' }}>{zoomPercent}%</span>
                                        )}
                                    </div>
                            )}
                        </>
                    )}
                </div>

                {children && (
                    <div className={`flex items-center gap-1 bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] rounded-[16px] px-3 py-1.5 ${isDragging ? 'shadow-[0_20px_60px_rgba(0,0,0,0.25)]' : 'shadow-[0_20px_40px_-10px_rgba(0,0,0,0.1)]'} pointer-events-auto`} style={{ pointerEvents: 'auto' }}>
                        {children}
                    </div>
                )}
        </div>
    );
});

ModernFlowchartToolbar.displayName = 'ModernFlowchartToolbar';
