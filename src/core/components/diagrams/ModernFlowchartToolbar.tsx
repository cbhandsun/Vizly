import React, { useState, useRef, useCallback, useEffect } from 'react';
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
}

export const ModernFlowchartToolbar: React.FC<FlowchartToolbarProps> = ({
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

    const getActiveLayoutKey = () => {
        if (!lastDomainStrategy) return undefined;
        if (lastDomainStrategy === 'force') return 'force';
        if (lastDomainStrategy === 'domain-vertical') return 'domain-vertical';
        if (lastDomainStrategy === 'domain-horizontal') return 'domain-horizontal';
        if (lastDomainDirection) {
            return `${lastDomainStrategy}-${lastDomainDirection.toLowerCase()}`;
        }
        return lastDomainStrategy;
    };
    
    const activeLayoutKey = getActiveLayoutKey();
    const activeNodeLayoutKey = lastNodeLayout ? `node-${lastNodeLayout}` : undefined;
    const selectedLayoutKeys = [activeLayoutKey, activeNodeLayoutKey].filter(Boolean) as string[];

    const layoutMenu: MenuProps['items'] = [
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
    ];

    const getGridInfo = () => {
        if (!showGrid) return { title: t('designer.toolbar.gridOff'), icon: <FaBorderNone /> };
        switch (gridVariant) {
            case BackgroundVariant.Dots: return { title: t('designer.toolbar.gridDots'), icon: <FaTh /> };
            case BackgroundVariant.Lines: return { title: t('designer.toolbar.gridLines'), icon: <FaBorderAll /> };
            case BackgroundVariant.Cross: return { title: t('designer.toolbar.gridCross'), icon: <FaTh style={{ transform: 'rotate(45deg)' }} /> };
            default: return { title: t('designer.toolbar.showGrid'), icon: <FaTh /> };
        }
    };
    const gridInfo = getGridInfo();

    // ---- "更多"菜单：低频功能收纳 ----
    const moreMenuItems: MenuProps['items'] = [
        {
            key: 'file-group', label: '文件操作', type: 'group' as const, children: [
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
            key: 'view-group', label: '视图控制', type: 'group' as const, children: [
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
                    icon: <FaMap />, // We'll use FaMap from the existing react-icons/fa which should be imported
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
            label: '清除本地缓存',
            icon: <FaTrashAlt />,
            danger: true,
            onClick: () => {
                appModal.confirm({
                    title: '清除缓存',
                    content: '将清除所有本地缓存数据（包括设置和自动保存），页面将自动刷新。确定继续？',
                    okText: '确认清除',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: () => {
                        // 1. 抢救当前进度 ID（从 URL 查询参数 或 LocalStorage 中临时保存）
                        const urlParams = new URLSearchParams(window.location.search);
                        let diagramId = urlParams.get('diagram');
                        if (!diagramId) {
                            diagramId = localStorage.getItem('diagramMenu.selectedDiagramId');
                        }

                        // 2. 彻底执行出厂化清理
                        localStorage.clear();
                        sessionStorage.clear();

                        // 3. 携带记忆 ID 执行原地硬刷新，防止路由由于失去 LocalStorage 而回退到第一张图(也就是主页)
                        if (diagramId) {
                            window.location.href = `${window.location.pathname}?diagram=${diagramId}`;
                        } else {
                            window.location.reload();
                        }
                    },
                });
            },
        },
    ];

    // 计算工具栏样式
    const toolbarStyle: React.CSSProperties = position
        ? {
            position: 'absolute',
            left: position.x,
            top: position.y,
            transform: 'none',
            zIndex: 1010,
            boxShadow: isDragging ? '0 12px 40px rgba(31, 38, 135, 0.25)' : '0 8px 32px rgba(31, 38, 135, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(12px) saturate(180%)',
            borderRadius: 99,
            padding: '2px 12px',
            transition: isDragging ? 'none' : 'box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            cursor: isDragging ? 'grabbing' : 'default',
        }
        : {
            position: 'absolute',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1010,
            boxShadow: 'var(--designer-shadow, 0 8px 32px rgba(31, 38, 135, 0.15))',
            border: '1px solid var(--designer-border, rgba(255, 255, 255, 0.2))',
            background: 'var(--designer-panel-bg, rgba(255, 255, 255, 0.7))',
            backdropFilter: 'var(--designer-blur, blur(12px) saturate(180%))',
            borderRadius: 99,
            padding: '2px 12px',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        };

    return (
        <div ref={toolbarRef} style={toolbarStyle} className="modern-toolbar" role="toolbar" aria-label="图表工具栏">
            {/* 内部 Flex 容器 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* 拖动手柄 */}
                <div
                    onMouseDown={handleMouseDown}
                    onDoubleClick={handleDoubleClick}
                    title={t('designer.toolbar.dragToMove')}
                    role="separator"
                    aria-roledescription="拖动手柄"
                    style={{
                        cursor: isDragging ? 'grabbing' : 'grab',
                        padding: '4px 6px 4px 2px',
                        marginRight: 4,
                        display: 'flex',
                        alignItems: 'center',
                        color: 'rgba(0, 0, 0, 0.35)',
                        transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(0, 0, 0, 0.65)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(0, 0, 0, 0.35)')}
                >
                    <FaGripVertical size={14} />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {/* ── 创作工具栏 (Creation Tools) ── */}
                    {onActivatePointer && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 4, paddingRight: 6, borderRight: '1px solid var(--designer-border)' }}>
                            <Tooltip title="普通选择器 (V)">
                                <Button 
                                    type={!isDrawingMode && !isMarqueeActive ? 'primary' : 'text'} 
                                    icon={<FaMousePointer />} 
                                    onClick={onActivatePointer}
                                />
                            </Tooltip>
                            
                            {toggleSelectionMode && (
                            <Tooltip title={isMarqueeActive ? "退出框选模式 (Esc)" : "框选模式 (S)"}>
                                <Button 
                                    type={isMarqueeActive ? 'primary' : 'text'} 
                                    icon={<FaRegObjectGroup />} 
                                    onClick={toggleSelectionMode}
                                />
                            </Tooltip>
                            )}

                            {onToggleDrawingMode && (
                                <Tooltip title="自由画笔 (P)">
                                    <Button 
                                        type={isDrawingMode ? 'primary' : 'text'} 
                                        icon={<FaPen />} 
                                        onClick={onToggleDrawingMode}
                                    />
                                </Tooltip>
                            )}

                            {onAddStickyNote && (
                                <Tooltip title="便签 (S)">
                                    <Button 
                                        type="text" 
                                        icon={<FaStickyNote />} 
                                        onClick={onAddStickyNote}
                                        style={{ color: '#F59E0B' }}
                                    />
                                </Tooltip>
                            )}

                            {onAddMindMap && (
                                <Tooltip title="思维导图 (M)">
                                    <Button 
                                        type="text" 
                                        icon={<FaProjectDiagram />} 
                                        onClick={onAddMindMap}
                                        style={{ color: '#8B5CF6' }}
                                    />
                                </Tooltip>
                            )}

                            {setIsCommentMode && (
                                <Tooltip title={isCommentMode ? "退出评论模式 (C)" : "评论模式 (C)"}>
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

                    {/* ── 历史 ── */}
                    <Tooltip title={t('designer.toolbar.undo')}>
                        <Button type="text" icon={<FaUndo />} onClick={onUndo} disabled={!canUndo} aria-label={t('designer.toolbar.undo')} />
                    </Tooltip>
                    <Tooltip title={t('designer.toolbar.redo')}>
                        <Button type="text" icon={<FaRedo />} onClick={onRedo} disabled={!canRedo} aria-label={t('designer.toolbar.redo')} />
                    </Tooltip>

                    {!hideZoomControls && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4, paddingLeft: 6, borderLeft: '1px solid var(--designer-border)' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4, paddingLeft: 6, borderLeft: '1px solid var(--designer-border)' }}>
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


                    {/* ── AI 助手 ── */}
                    {onToggleAI && (
                        <Tooltip title={<>{t('aiChat.title')} {showAiCrown && <span style={{ marginLeft: 4, fontSize: '13px' }} title="Pro 功能">👑</span>}</>}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4, paddingLeft: 6, borderLeft: '1px solid var(--designer-border)' }}>
                            <Tooltip title={highlightMainFlow ? '取消高亮主链路' : '高亮主干链路'}>
                                <Button
                                    type={highlightMainFlow ? 'primary' : 'text'}
                                    ghost={highlightMainFlow}
                                    icon={<FaProjectDiagram />}
                                    onClick={onToggleHighlightMainFlow}
                                    aria-label={highlightMainFlow ? '取消高亮主链路' : '高亮主干链路'}
                                    aria-pressed={highlightMainFlow}
                                />
                            </Tooltip>
                            {onToggleShowOnlyMainFlow && (
                                <Tooltip title={showOnlyMainFlow ? '恢复完整链路体验' : '过滤精简直视主干'}>
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

                    {children}

                    {/* ── 更多菜单（低频功能） ── */}
                    <Dropdown menu={{ items: moreMenuItems }} placement="top" trigger={['click']} styles={{ root: { minWidth: 220, whiteSpace: 'nowrap' } }}>
                        <Tooltip title="更多操作">
                            <Button type="text" icon={<FaEllipsisH />} aria-label="更多操作" />
                        </Tooltip>
                    </Dropdown>

                    {(!hideGridControls || !hideLayoutControls) && (
                        <>
                            {/* ── 状态信息区域（合并自 DiagramStatusBar） ── */}
                            {(selectedNodesCount !== undefined || zoomPercent !== undefined) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap', marginLeft: 4, paddingLeft: 6, borderLeft: '1px solid var(--designer-border)' }}>
                                        {!hideGridControls && (selectedNodesCount || 0) > 0 && (
                                            <span style={{ color: '#1890ff', fontWeight: 500 }}>
                                                {selectedNodesCount}↗
                                            </span>
                                        )}
                                        {!hideGridControls && onToggleSnap && (
                                            <Tooltip title={snapToGrid ? '网格吸附：开' : '网格吸附：关'}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    onClick={onToggleSnap}
                                                    icon={<FaMagnet size={10} />}
                                                    style={{
                                                        color: snapToGrid ? '#1976d2' : 'rgba(0,0,0,0.3)',
                                                        fontSize: 10,
                                                        width: 22, height: 22,
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            </div>
        </div>
    );
};
