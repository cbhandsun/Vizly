import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Input, Typography, theme, Tooltip, Flex, Popover, Slider, Button, Empty, Tree } from 'antd';
import {
    FaCompass, FaStream, FaStar, FaSearch,
    FaPlay, FaBox, FaTimes,
    FaSearchPlus, FaSearchMinus, FaRegComment
} from 'react-icons/fa';
import { Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_COMMENT_PAGE_ID } from './commentPageScope';
import { FlowchartNodeData } from '../custom-nodes/FlowchartNode';
import { usePanelZoom } from '../../hooks/usePanelZoom';
import {
    clampIconRailDrawerWidth,
    persistIconRailDrawerWidth,
    readIconRailDrawerWidth,
} from './iconRailSidebarStorage';
import {
    resolveIconRailRequestedPanel,
    shouldAutoOpenShapesPanel,
    type MobileIconRailPanelRequest,
} from './iconRailSidebarState';
import { createIconRailDrawerStyle } from './iconRailSidebarLayout';
import type { NodeTemplate } from './hooks/useNodeTemplates';
import type { LayerConfig } from './hooks/useLayerManagement';
import type { DataNode } from 'antd/es/tree';
import { bindIconRailEscapeClose } from './iconRailKeyboard';
import {
    resolveNavigatorNodeLabel,
    resolveNavigatorNodeTypeLabelKey,
    resolveNavigatorSearchText,
} from './navigatorNodePresentation';
import './IconRailSidebar.css';
import { AccessibleInputClearIcon } from './AccessibleInputClearIcon';

const { Text } = Typography;

const LayerManagementPanel = React.lazy(() => import('./LayerManagementPanel').then(module => ({
    default: module.LayerManagementPanel,
})));
const NodeTemplatePanel = React.lazy(() => import('./NodeTemplatePanel').then(module => ({
    default: module.NodeTemplatePanel,
})));
const CommentPanel = React.lazy(() => import('./CommentPanel').then(module => ({
    default: module.CommentPanel,
})));

type _DrawerPanel = 'shapes' | 'navigator' | 'layers' | 'templates' | null;

interface IconRailSidebarProps {
    activePageId?: string;
    activePageName?: string;
    nodes?: Node[];
    onFocusNode?: (node: Node) => void;
    // Layer Management Props
    layers?: LayerConfig[];
    activeLayerId?: string | null;
    onSetActiveLayer?: (layerId: string) => void;
    onToggleLayerVisibility?: (layerId: string) => void;
    onToggleLayerLock?: (layerId: string) => void;
    onRenameLayer?: (layerId: string, newName: string) => boolean | void;
    onCreateLayer?: (name: string) => boolean | void;
    onDeleteLayer?: (layerId: string) => void;
    onReorderLayers?: (fromIndex: number, toIndex: number) => void;
    onSetLayerColor?: (layerId: string, color: string | undefined) => void;
    // 模板
    templates?: NodeTemplate[];
    groupedTemplates?: Record<string, NodeTemplate[]>;
    onUseTemplate?: (templateId: string) => void;
    onDeleteTemplate?: (templateId: string) => void;
    onRenameTemplate?: (templateId: string, name: string) => void;
    // 外部控制 Drawer 关闭（画布点击时）
    onDrawerVisibleChange?: (visible: boolean) => void;
    onDrawerWidthChange?: (width: number) => void;
    // 插件化面板注入
    pluginPanels?: { id: string; title: string; icon: React.ReactNode; content: React.ReactNode }[];
    isMobile?: boolean; // GAP-11
    autoOpenShapes?: boolean;
    requestedPanel?: MobileIconRailPanelRequest | null;
    onRequestedPanelHandled?: () => void;
}

type _NodeConfig = Record<string, unknown>;
type NavigatorNode = Node & { children: NavigatorNode[] };
interface NavigatorTreeNode extends DataNode {
    node: NavigatorNode;
    children?: NavigatorTreeNode[];
    isMatched: boolean;
}

export const IconRailSidebar: React.FC<IconRailSidebarProps> = ({
    activePageId = DEFAULT_COMMENT_PAGE_ID,
    activePageName = activePageId,
    nodes = [],
    onFocusNode,
    layers = [],
    activeLayerId = null,
    onSetActiveLayer,
    onToggleLayerVisibility,
    onToggleLayerLock,
    onRenameLayer,
    onCreateLayer,
    onDeleteLayer,
    onReorderLayers,
    onSetLayerColor,
    templates,
    groupedTemplates,
    onUseTemplate,
    onDeleteTemplate,
    onRenameTemplate,
    onDrawerVisibleChange,
    onDrawerWidthChange,
    pluginPanels = [],
    isMobile = false,
    autoOpenShapes = true,
    requestedPanel = null,
    onRequestedPanelHandled,
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const initialPanel = shouldAutoOpenShapesPanel({
            activePanel: null,
            alreadyAutoOpened: false,
            enabled: autoOpenShapes,
            isMobile,
            nodeCount: nodes.length,
        }) ? 'shapes' : null;
    const [activePanel, setActivePanel] = useState<string | null>(initialPanel);
    const autoOpenedEmptyPanelRef = useRef(initialPanel === 'shapes');
    const [searchTerm, setSearchTerm] = useState('');
    const panelZoom = usePanelZoom({ storageKey: 'designer.sidebar.zoom', defaultScale: 1, minScale: 0.75, maxScale: 1.35 });

    // ---- 导航树状结构生成 ----
    const { treeData: navigatorTreeData, expandedKeys: searchExpandedKeys } = useMemo(() => {
        // ⭐ 性能大优化：如果面板未打开，直接跳过庞大的树计算（拖拽节点时触发会导致卡顿）
        if (activePanel !== 'navigator' || !nodes || nodes.length === 0) return { treeData: [], expandedKeys: [] };

        const nodeMap = new Map<string, NavigatorNode>();
        nodes.forEach(n => nodeMap.set(n.id, { ...n, children: [] }));

        const roots: NavigatorNode[] = [];
        nodes.forEach(n => {
            const nodeWithChildren = nodeMap.get(n.id);
            if (!nodeWithChildren) return;
            if (n.parentId && nodeMap.has(n.parentId)) {
                nodeMap.get(n.parentId)?.children.push(nodeWithChildren);
            } else {
                roots.push(nodeWithChildren);
            }
        });

        const expandedKeys: string[] = [];
        const term = searchTerm.toLowerCase();

        const filterTree = (nodesToFilter: NavigatorNode[]): NavigatorTreeNode[] => {
            return nodesToFilter.flatMap(item => {
                const label = resolveNavigatorNodeLabel(item);
                const selfMatch = !term || resolveNavigatorSearchText(item).includes(term);
                
                const filteredChildren = filterTree(item.children || []);
                const hasMatchingChildren = filteredChildren.length > 0;

                if (!selfMatch && !hasMatchingChildren) {
                    return [];
                }

                if (term && hasMatchingChildren) {
                    expandedKeys.push(item.id);
                }

                return [{
                    key: item.id,
                    title: label,
                    node: item,
                    children: filteredChildren,
                    isMatched: selfMatch,
                }];
            });
        };

        return { treeData: filterTree(roots), expandedKeys };
    }, [nodes, searchTerm, activePanel]);
    const navigatorSelectedKeys = useMemo(
        () => nodes.filter(node => node.selected).map(node => node.id),
        [nodes],
    );

    const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
    const [autoExpandParent, setAutoExpandParent] = useState(true);

    useEffect(() => {
        if (searchTerm) {
            const timer = window.setTimeout(() => {
                setExpandedKeys(searchExpandedKeys);
                setAutoExpandParent(true);
            }, 0);
            return () => window.clearTimeout(timer);
        }
    }, [searchTerm, searchExpandedKeys]);

    const onExpand = (newExpandedKeys: React.Key[]) => {
        setExpandedKeys(newExpandedKeys);
        setAutoExpandParent(false);
    };

    // Drawer 可拖拽宽度
    const [drawerWidth, setDrawerWidth] = useState<number>(() => readIconRailDrawerWidth());
    const drawerDragRef = useRef<{ startX: number; startW: number } | null>(null);

    useEffect(() => {
        persistIconRailDrawerWidth(drawerWidth);
        onDrawerWidthChange?.(drawerWidth);
    }, [drawerWidth, onDrawerWidthChange]);

    // Drawer resize handle drag
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!drawerDragRef.current) return;
            const dx = e.clientX - drawerDragRef.current.startX;
            setDrawerWidth(clampIconRailDrawerWidth(drawerDragRef.current.startW + dx));
        };
        const onUp = () => { drawerDragRef.current = null; document.body.style.cursor = ''; document.body.style.userSelect = ''; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    }, []);

    const startDrawerResize = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        drawerDragRef.current = { startX: e.clientX, startW: drawerWidth };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [drawerWidth]);

    const togglePanel = useCallback((panel: string) => {
        setActivePanel(prev => prev === panel ? null : panel);
    }, []);

    const closeDrawer = useCallback(() => {
        setActivePanel(null);
    }, []);

    useEffect(() => {
        if (!requestedPanel) return;
        const timer = window.setTimeout(() => {
            setActivePanel(resolveIconRailRequestedPanel(requestedPanel));
            onRequestedPanelHandled?.();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [onRequestedPanelHandled, requestedPanel]);

    useEffect(() => {
        if (!shouldAutoOpenShapesPanel({
            activePanel,
            alreadyAutoOpened: autoOpenedEmptyPanelRef.current,
            enabled: autoOpenShapes,
            isMobile,
            nodeCount: nodes.length,
        })) return;

        const timer = window.setTimeout(() => {
            autoOpenedEmptyPanelRef.current = true;
            setActivePanel('shapes');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activePanel, autoOpenShapes, isMobile, nodes.length]);

    useEffect(() => {
        const offset = isMobile ? 0 : (activePanel ? 68 + drawerWidth : 68);
        document.documentElement.style.setProperty('--left-sidebar-offset', `${offset}px`);
        return () => {
            document.documentElement.style.setProperty('--left-sidebar-offset', '0px');
        };
    }, [activePanel, drawerWidth, isMobile]);

    // Effect to notify parent when activePanel changes (avoids rendering during render warning)
    useEffect(() => {
        onDrawerVisibleChange?.(activePanel !== null);
    }, [activePanel, onDrawerVisibleChange]);

    // Esc 键关闭 Drawer
    useEffect(() => {
        if (!activePanel) return;
        return bindIconRailEscapeClose(window, closeDrawer);
    }, [activePanel, closeDrawer]);

    // [O-2] Memoize rail button definitions — inline arrays rebuild on every render,
    // causing railButtons.map() children to create new object references and
    // Tooltip/button components to unnecessarily diff on each keystroke/drag.
    const builtInButtons = useMemo(() => [
        { key: 'navigator', icon: <FaCompass />, label: t('designer.sidebar.navigator') },
        { key: 'comments', icon: <FaRegComment />, label: '评论反馈' },
        ...(onCreateLayer ? [{ key: 'layers', icon: <FaStream />, label: t('designer.sidebar.layers') }] : []),
        ...(templates && templates.length > 0 ? [{ key: 'templates', icon: <FaStar />, label: `模板 (${templates.length})` }] : []),
    ], [t, onCreateLayer, templates]);

    const railButtons = useMemo(() => [
        ...pluginPanels.map(p => ({ key: p.id, icon: p.icon, label: p.title })),
        ...builtInButtons
    ], [pluginPanels, builtInButtons]);

    // ---- 渲染 Drawer 内容 ----
    const renderDrawerContent = () => {
        const customPanel = pluginPanels.find(p => p.id === activePanel);
        if (customPanel) {
            return customPanel.content;
        }

        switch (activePanel) {
            case 'navigator':
                return (
                    <Flex vertical style={{ height: '100%', overflow: 'hidden' }}>
                        <div className="side-drawer-search">
                            <Input
                                prefix={<FaSearch style={{ color: token.colorTextDescription }} />}
                                placeholder={t('designer.sidebar.search')}
                                aria-label={t('designer.sidebar.search')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                allowClear={{ clearIcon: <AccessibleInputClearIcon label={t('designer.sidebar.clearSearch')} /> }}
                                size="small"
                            />
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
                            {navigatorTreeData.length > 0 ? (
                                <Tree
                                    aria-label={t('designer.sidebar.navigator')}
                                    treeData={navigatorTreeData}
                                    selectedKeys={navigatorSelectedKeys}
                                    blockNode
                                    expandedKeys={expandedKeys}
                                    autoExpandParent={autoExpandParent}
                                    onExpand={onExpand}
                                    onSelect={(selectedKeys, info) => {
                                        const node = (info.node as NavigatorTreeNode).node;
                                        if (node) onFocusNode?.(node);
                                    }}
                                    titleRender={(rawTreeNode) => {
                                        const treeNode = rawTreeNode as NavigatorTreeNode;
                                        const node = treeNode.node;
                                        const data = node.data as Partial<FlowchartNodeData>;
                                        const label = resolveNavigatorNodeLabel(node);
                                        const typeLabel = t(
                                            `designer.sidebar.${resolveNavigatorNodeTypeLabelKey(node.type)}`
                                        );
                                        const icon = data?.icon;
                                        return (
                                            <div
                                                className="navigator-item"
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                    padding: '4px 0',
                                                    opacity: !searchTerm || treeNode.isMatched ? 1 : 0.4
                                                }}
                                            >
                                                <div style={{
                                                    width: 24, height: 24, flexShrink: 0,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    backgroundColor: data?.theme?.main || token.colorPrimary,
                                                    color: '#fff', borderRadius: 4, fontSize: 12
                                                }}>
                                                    {icon ? <FaPlay /> : <FaBox />}
                                                </div>
                                                <Flex vertical style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
                                                    <Text strong style={{ fontSize: 12, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                                        {label}
                                                    </Text>
                                                    <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.2 }}>{typeLabel}</Text>
                                                </Flex>
                                            </div>
                                        );
                                    }}
                                />
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('designer.sidebar.noNodesFound')} />
                            )}
                        </div>
                    </Flex>
                );
            case 'layers':
                return (
                    <React.Suspense fallback={null}>
                        <LayerManagementPanel
                            layers={layers}
                            activeLayerId={activeLayerId}
                            onSetActive={onSetActiveLayer || (() => { })}
                            onToggleVisibility={onToggleLayerVisibility || (() => { })}
                            onToggleLock={onToggleLayerLock || (() => { })}
                            onRename={onRenameLayer || (() => false)}
                            onCreate={onCreateLayer!}
                            onDelete={onDeleteLayer || (() => { })}
                            onReorder={onReorderLayers || (() => { })}
                            onSetColor={onSetLayerColor}
                        />
                    </React.Suspense>
                );
            case 'templates':
                return (
                    <React.Suspense fallback={null}>
                        <NodeTemplatePanel
                            templates={templates || []}
                            groupedTemplates={groupedTemplates || {}}
                            onUseTemplate={onUseTemplate || (() => { })}
                            onDeleteTemplate={onDeleteTemplate || (() => { })}
                            onRenameTemplate={onRenameTemplate || (() => { })}
                        />
                    </React.Suspense>
                );
            case 'comments':
                return (
                    <React.Suspense fallback={null}>
                        <CommentPanel activePageId={activePageId} activePageName={activePageName} />
                    </React.Suspense>
                );
            default:
                return null;
        }
    };

    const getDrawerTitle = () => {
        const customPanel = pluginPanels.find(p => p.id === activePanel);
        if (customPanel) return customPanel.title;

        switch (activePanel) {
            case 'navigator': return t('designer.sidebar.navigator');
            case 'layers': return t('designer.sidebar.layers');
            case 'templates': return `模板 (${templates?.length || 0})`;
            case 'comments': return '评论反馈';
            default: return '';
        }
    };

    return (
        <>
            {/* Icon Rail */}
            <div className="icon-rail">
                {railButtons.map((btn) => (
                    <Tooltip key={btn.key} title={btn.label} placement="right">
                        <button
                            type="button"
                            className={`icon-rail-btn ${activePanel === btn.key ? 'active' : ''}`}
                            aria-label={btn.label}
                            aria-pressed={activePanel === btn.key}
                            onClick={() => togglePanel(btn.key)}
                        >
                            {btn.icon}
                        </button>
                    </Tooltip>
                ))}

                <div className="icon-rail-divider" />

                {/* Zoom controls at bottom */}
                <div className="icon-rail-spacer" />
                <Tooltip title={t('designer.sidebar.searchComponents')} placement="right">
                    <button
                        type="button"
                        className={`icon-rail-btn ${activePanel === 'shapes' && searchTerm ? 'active' : ''}`}
                        aria-label={t('designer.sidebar.searchComponents')}
                        onClick={() => {
                            if (activePanel !== 'shapes') togglePanel('shapes');
                            // Focus the search input after panel opens
                        }}
                    >
                        <FaSearch />
                    </button>
                </Tooltip>
            </div>

            {/* Floating Drawer */}
            {activePanel && (
                <>
                    {/* 透明遮罩，点击关闭 */}
                    <div className="side-drawer-backdrop" onClick={closeDrawer} />
                    <div 
                        className={`side-drawer ${isMobile ? 'mobile-drawer' : ''}`} 
                        style={createIconRailDrawerStyle(isMobile, drawerWidth)}
                    >
                        <div className="side-drawer-header">
                            <div className="side-drawer-header-title">
                                {getDrawerTitle()}
                            </div>
                            <Flex align="center" gap={4}>
                                {activePanel === 'shapes' && (
                                    <>
                                        <Tooltip title={t('designer.sidebar.zoomOutHint')}>
                                            <Button
                                                type="text"
                                                size="small"
                                                aria-label={t('designer.sidebar.zoomOutHint')}
                                                icon={<FaSearchMinus aria-hidden="true" />}
                                                onClick={panelZoom.zoomOut}
                                                style={{ minWidth: 'var(--commercial-touch-target, 44px)', height: 'var(--commercial-touch-target, 44px)' }}
                                            />
                                        </Tooltip>
                                        <Popover
                                            trigger="click"
                                            placement="bottomRight"
                                            content={
                                                <div style={{ width: 160, padding: 4 }} onWheel={panelZoom.onWheel}>
                                                    <Slider
                                                        min={Math.round(panelZoom.minScale * 100)}
                                                        max={Math.round(panelZoom.maxScale * 100)}
                                                        step={1}
                                                        value={panelZoom.percent}
                                                        onChange={(v) => panelZoom.setPercent(Number(v))}
                                                    />
                                                </div>
                                            }
                                        >
                                            <Button
                                                type="text"
                                                size="small"
                                                aria-label={`${t('designer.sidebar.zoomLevel')} ${panelZoom.percent}%`}
                                                style={{ minWidth: 'var(--commercial-touch-target, 44px)', height: 'var(--commercial-touch-target, 44px)' }}
                                            >
                                                {panelZoom.percent}%
                                            </Button>
                                        </Popover>
                                        <Tooltip title={t('designer.sidebar.zoomInHint')}>
                                            <Button
                                                type="text"
                                                size="small"
                                                aria-label={t('designer.sidebar.zoomInHint')}
                                                icon={<FaSearchPlus aria-hidden="true" />}
                                                onClick={panelZoom.zoomIn}
                                                style={{ minWidth: 'var(--commercial-touch-target, 44px)', height: 'var(--commercial-touch-target, 44px)' }}
                                            />
                                        </Tooltip>
                                    </>
                                )}
                                <Button
                                    type="text"
                                    size="small"
                                    aria-label={t('common.close', '关闭')}
                                    icon={<FaTimes />}
                                    onClick={closeDrawer}
                                />
                            </Flex>
                        </div>
                        <div className="side-drawer-body" onWheel={activePanel === 'shapes' ? panelZoom.onWheel : undefined}>
                            {renderDrawerContent()}
                        </div>
                        {/* Resize Handle */}
                        {!isMobile && (
                            <div
                                onMouseDown={startDrawerResize}
                                style={{
                                    position: 'absolute',
                                    right: -3,
                                    top: 0,
                                    bottom: 0,
                                    width: 6,
                                    cursor: 'col-resize',
                                    zIndex: 120,
                                }}
                            />
                        )}
                    </div>
                </>
            )}
        </>
    );
};
