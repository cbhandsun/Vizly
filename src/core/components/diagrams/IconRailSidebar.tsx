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
import { IconRailDrawerResizeHandle } from './IconRailDrawerResizeHandle';
import {
    resolveIconRailRequestedPanel,
    shouldAutoOpenShapesPanel,
    type MobileIconRailPanelRequest,
} from './iconRailSidebarState';
import { createIconRailDrawerStyle } from './iconRailSidebarLayout';
import type { NodeTemplate } from './hooks/useNodeTemplates';
import type { LayerConfig } from './hooks/useLayerManagement';
import type { DataNode } from 'antd/es/tree';
import {
    bindIconRailEscapeClose,
    focusIconRailDrawerEntry,
    trapIconRailDrawerTab,
    type IconRailDrawerFocusTarget,
} from './iconRailKeyboard';
import {
    countNavigatorSearchMatches,
    normalizeNavigatorSearchQuery,
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
    const drawerRef = useRef<HTMLDivElement>(null);
    const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
    const shouldFocusDrawerRef = useRef(false);
    const drawerFocusTargetRef = useRef<IconRailDrawerFocusTarget>('default');
    const drawerId = React.useId();
    const drawerTitleId = React.useId();
    const navigatorSearchStatusId = React.useId();
    const [searchTerm, setSearchTerm] = useState('');
    const panelZoom = usePanelZoom({ storageKey: 'designer.sidebar.zoom', defaultScale: 1, minScale: 0.75, maxScale: 1.35 });
    const getPluginPanelTitle = useCallback((panel: { id: string; title: string }) => {
        if (panel.id === 'shapes') return t('designer.sidebar.basic');
        if (panel.id === 'icons') return t('designer.sidebar.iconLibrary');
        if (panel.id === 'arch-components') return t('designer.sidebar.architectureComponents');
        if (panel.id === 'arch-linter') return t('designer.sidebar.architectureLinter');
        return panel.title;
    }, [t]);

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
        const term = normalizeNavigatorSearchQuery(searchTerm);

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
    const navigatorSearchQuery = normalizeNavigatorSearchQuery(searchTerm);
    const navigatorSearchMatchCount = useMemo(
        () => countNavigatorSearchMatches(navigatorTreeData),
        [navigatorTreeData],
    );
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

    const closeDrawer = useCallback((restoreFocus = true) => {
        const returnFocus = restoreFocus ? drawerReturnFocusRef.current : null;
        drawerReturnFocusRef.current = null;
        shouldFocusDrawerRef.current = false;
        drawerFocusTargetRef.current = 'default';
        setActivePanel(null);
        if (returnFocus) {
            window.setTimeout(() => {
                if (returnFocus.isConnected) returnFocus.focus();
            }, 0);
        }
    }, []);

    const openPanelFromTrigger = useCallback((
        panel: string,
        trigger: HTMLElement,
        focusTarget: IconRailDrawerFocusTarget = 'default',
    ) => {
        drawerReturnFocusRef.current = trigger;
        drawerFocusTargetRef.current = focusTarget;
        shouldFocusDrawerRef.current = true;
        setActivePanel(panel);
    }, []);

    const togglePanel = useCallback((panel: string, trigger: HTMLElement) => {
        if (activePanel === panel) {
            closeDrawer();
            return;
        }
        openPanelFromTrigger(panel, trigger);
    }, [activePanel, closeDrawer, openPanelFromTrigger]);

    useEffect(() => {
        if (!requestedPanel) return;
        const timer = window.setTimeout(() => {
            const resolvedPanel = resolveIconRailRequestedPanel(requestedPanel);
            if (resolvedPanel) {
                const trigger = document.activeElement;
                if (trigger instanceof HTMLElement && trigger !== document.body) {
                    drawerReturnFocusRef.current = trigger;
                    drawerFocusTargetRef.current = 'default';
                    shouldFocusDrawerRef.current = true;
                }
                setActivePanel(resolvedPanel);
            } else {
                closeDrawer(false);
            }
            onRequestedPanelHandled?.();
        }, 0);
        return () => window.clearTimeout(timer);
    }, [closeDrawer, onRequestedPanelHandled, requestedPanel]);

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

    useEffect(() => {
        if (!activePanel || !shouldFocusDrawerRef.current) return;
        const timer = window.setTimeout(() => {
            const drawer = drawerRef.current;
            if (!drawer) return;
            focusIconRailDrawerEntry(drawer, drawerFocusTargetRef.current);
            drawerFocusTargetRef.current = 'default';
            shouldFocusDrawerRef.current = false;
        }, 0);
        return () => window.clearTimeout(timer);
    }, [activePanel]);

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
        { key: 'comments', icon: <FaRegComment />, label: t('designer.sidebar.comments') },
        ...(onCreateLayer ? [{ key: 'layers', icon: <FaStream />, label: t('designer.sidebar.layers') }] : []),
        ...(templates && templates.length > 0 ? [{
            key: 'templates',
            icon: <FaStar />,
            label: t('designer.sidebar.templatesWithCount', { count: templates.length }),
        }] : []),
    ], [t, onCreateLayer, templates]);

    const railButtons = useMemo(() => [
        ...pluginPanels.map(p => ({ key: p.id, icon: p.icon, label: getPluginPanelTitle(p) })),
        ...builtInButtons
    ], [pluginPanels, builtInButtons, getPluginPanelTitle]);

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
                                placeholder={t('designer.sidebar.searchNodes')}
                                aria-label={t('designer.sidebar.searchNodes')}
                                aria-describedby={navigatorSearchQuery ? navigatorSearchStatusId : undefined}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                maxLength={256}
                                allowClear={{ clearIcon: <AccessibleInputClearIcon label={t('designer.sidebar.clearSearch')} /> }}
                                size="small"
                            />
                            {navigatorSearchQuery ? (
                                <Text
                                    id={navigatorSearchStatusId}
                                    role="status"
                                    aria-live="polite"
                                    className="navigator-search-status"
                                    type="secondary"
                                >
                                    {t('designer.sidebar.searchResultsStatus', {
                                        count: navigatorSearchMatchCount,
                                    })}
                                </Text>
                            ) : null}
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
                        <CommentPanel
                            activePageId={activePageId}
                            activePageName={activePageName}
                            onStartCommentMode={isMobile ? () => closeDrawer(false) : undefined}
                        />
                    </React.Suspense>
                );
            default:
                return null;
        }
    };

    const getDrawerTitle = () => {
        const customPanel = pluginPanels.find(p => p.id === activePanel);
        if (customPanel) return getPluginPanelTitle(customPanel);

        switch (activePanel) {
            case 'navigator': return t('designer.sidebar.navigator');
            case 'layers': return t('designer.sidebar.layers');
            case 'templates': return t('designer.sidebar.templatesWithCount', { count: templates?.length || 0 });
            case 'comments': return t('designer.sidebar.comments');
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
                            aria-haspopup="dialog"
                            aria-expanded={activePanel === btn.key}
                            aria-controls={activePanel === btn.key ? drawerId : undefined}
                            onClick={(event) => togglePanel(btn.key, event.currentTarget)}
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
                        aria-haspopup="dialog"
                        aria-expanded={activePanel === 'shapes'}
                        aria-controls={activePanel === 'shapes' ? drawerId : undefined}
                        onClick={(event) => {
                            if (activePanel !== 'shapes') {
                                openPanelFromTrigger('shapes', event.currentTarget, 'search');
                                return;
                            }
                            drawerReturnFocusRef.current = event.currentTarget;
                            const drawer = drawerRef.current;
                            if (drawer) focusIconRailDrawerEntry(drawer, 'search');
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
                    <div className="side-drawer-backdrop" onClick={() => closeDrawer()} />
                    <div 
                        id={drawerId}
                        ref={drawerRef}
                        className={`side-drawer ${isMobile ? 'mobile-drawer' : ''}`} 
                        style={createIconRailDrawerStyle(isMobile, drawerWidth)}
                        role="dialog"
                        aria-modal={isMobile || undefined}
                        aria-labelledby={drawerTitleId}
                        tabIndex={-1}
                        onKeyDown={(event) => {
                            if (isMobile) trapIconRailDrawerTab(event, event.currentTarget);
                        }}
                    >
                        <div className="side-drawer-header">
                            <div id={drawerTitleId} className="side-drawer-header-title">
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
                                    data-icon-rail-initial-focus="true"
                                    icon={<FaTimes />}
                                    onClick={() => closeDrawer()}
                                />
                            </Flex>
                        </div>
                        <div className="side-drawer-body" onWheel={activePanel === 'shapes' ? panelZoom.onWheel : undefined}>
                            {renderDrawerContent()}
                        </div>
                        {!isMobile && (
                            <IconRailDrawerResizeHandle
                                currentWidth={drawerWidth}
                                label={t('designer.sidebar.resizeDrawer')}
                                hint={t('designer.sidebar.resizeDrawerHint')}
                                onResize={setDrawerWidth}
                                onMouseDown={startDrawerResize}
                            />
                        )}
                    </div>
                </>
            )}
        </>
    );
};
