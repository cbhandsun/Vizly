import React, { useState, useMemo, useEffect } from 'react';
import { Layout, Input, Collapse, Typography, theme, Tooltip, Flex, Popover, Slider, Button, Tabs, List, Empty, Tree } from 'antd';
import {
    FaPlay, FaSquare, FaStop, FaDatabase, FaQuestion,
    FaLayerGroup, FaBox, FaThLarge, FaImage,
    FaKeyboard, FaSearch, FaChevronRight, FaChevronLeft, FaSearchPlus, FaSearchMinus,
    FaCompass, FaShapes, FaStream, FaStar,
    FaServer, FaNetworkWired, FaLock, FaPlug, FaUser, FaEnvelope, FaBell, FaCog, FaCode, FaTerminal
} from 'react-icons/fa';
import { Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { FlowchartNodeData } from '../custom-nodes/FlowchartNode';
import { ShapePreview } from './ShapePreview';
import { getUiScale } from '../shared/viewportStore';
import { PanelZoomApi, usePanelZoom } from '../../hooks/usePanelZoom';
import { LayerManagementPanel } from './LayerManagementPanel';
import { NodeTemplatePanel } from './NodeTemplatePanel';
import type { NodeTemplate } from './hooks/useNodeTemplates';
import type { LayerConfig } from './hooks/useLayerManagement';
import { useSidebarNavigatorTree } from './hooks/useSidebarNavigatorTree';
const { Sider } = Layout;
const { Text } = Typography;

interface FlowchartSidebarProps {
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    width?: number;
    collapsedWidth?: number;
    zoom?: PanelZoomApi;
    nodes?: Node[];
    onFocusNode?: (node: Node) => void;
    // Layer Management Props
    layers?: LayerConfig[];
    activeLayerId?: string | null;
    onSetActiveLayer?: (layerId: string) => void;
    onToggleLayerVisibility?: (layerId: string) => void;
    onToggleLayerLock?: (layerId: string) => void;
    onRenameLayer?: (layerId: string, newName: string) => void;
    onCreateLayer?: (name: string) => void;
    onDeleteLayer?: (layerId: string) => void;
    onReorderLayers?: (fromIndex: number, toIndex: number) => void;
    onSetLayerColor?: (layerId: string, color: string | undefined) => void;
    // 模板
    templates?: NodeTemplate[];
    groupedTemplates?: Record<string, NodeTemplate[]>;
    onUseTemplate?: (templateId: string) => void;
    onDeleteTemplate?: (templateId: string) => void;
    onRenameTemplate?: (templateId: string, name: string) => void;
}

type NodeConfig = Record<string, unknown>;

export const ModernFlowchartSidebar: React.FC<FlowchartSidebarProps> = ({
    isCollapsed, onToggleCollapse, width = 260, collapsedWidth = 56, zoom,
    nodes = [], onFocusNode,
    // Layer props with defaults
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
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [searchTerm, setSearchTerm] = useState('');
    const internalZoom = usePanelZoom({ storageKey: 'designer.sidebar.zoom', defaultScale: 1, minScale: 0.75, maxScale: 1.35 });
    const panelZoom = zoom ?? internalZoom;
    const showZoomControls = !zoom;

    // ---- 导航树状结构生成 ----
    const { navigatorTreeData, expandedKeys, autoExpandParent, onExpand } = useSidebarNavigatorTree(nodes, searchTerm);

    const onDragStart = (event: React.DragEvent, nodeType: string, typeName: string, label: string, config: NodeConfig) => {
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;

        event.dataTransfer.setData('application/reactflow', JSON.stringify({
            type: nodeType,
            typeName,
            label,
            config,
            offsetX,
            offsetY,
            clientWidth: rect.width,
            clientHeight: rect.height
        }));
        event.dataTransfer.effectAllowed = 'move';
    };

    const renderDraggableItem = (label: string, icon: React.ReactNode, type: string, typeName: string, config: NodeConfig) => {
        // Simple search filter
        if (searchTerm && !label.toLowerCase().includes(searchTerm.toLowerCase())) return null;

        return (
            <Tooltip title={label} placement="right">
                <div
                    draggable
                    onDragStart={(event) => onDragStart(event, type, typeName, label, config)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px 4px 6px',
                        cursor: 'grab',
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: token.borderRadius,
                        backgroundColor: token.colorBgContainer,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        width: '100%',
                        aspectRatio: '1',
                        gap: '2px',
                        position: 'relative',
                        overflow: 'hidden',
                        minWidth: 0
                    }}
                    onMouseEnter={(e) => {
                        const el = e.currentTarget;
                        el.style.borderColor = token.colorPrimary;
                        el.style.boxShadow = `0 4px 16px ${token.colorPrimaryBg}, 0 0 0 1px ${token.colorPrimaryBorder}`;
                        el.style.transform = 'translateY(-2px) scale(1.06)';
                    }}
                    onMouseLeave={(e) => {
                        const el = e.currentTarget;
                        el.style.borderColor = token.colorBorderSecondary;
                        el.style.boxShadow = 'none';
                        el.style.transform = 'none';
                    }}
                >
                    <div style={{ fontSize: 20, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
                    <Text style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.2, color: token.colorTextSecondary, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{label}</Text>
                </div>
            </Tooltip>
        );
    };

    const categories = [
        {
            key: 'basic',
            label: t('designer.sidebar.basic'),
            children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                    {renderDraggableItem('Circle', <ShapePreview shape="circle" />, 'flowchart', 'flowchart', { shape: 'ellipse', icon: 'circle' })}
                    {renderDraggableItem('Rect', <ShapePreview shape="rectangle" />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'square' })}
                    {renderDraggableItem('Diamond', <ShapePreview shape="diamond" />, 'flowchart', 'flowchart', { shape: 'diamond', icon: 'question' })}
                    {renderDraggableItem('Triangle', <ShapePreview shape="triangle" />, 'flowchart', 'flowchart', { shape: 'triangle', icon: 'play' })}
                    {renderDraggableItem('Hexagon', <ShapePreview shape="hexagon" />, 'flowchart', 'flowchart', { shape: 'hexagon', icon: 'hexagon' })}
                    {renderDraggableItem('Star', <ShapePreview shape="star" color="#F59E0B" />, 'flowchart', 'flowchart', { shape: 'star', icon: 'star', theme: { main: '#FFC107', border: '#FFB300', text: '#fff' } })}
                    {renderDraggableItem('Pill', <ShapePreview shape="pill" />, 'flowchart', 'flowchart', { shape: 'pill', icon: 'play' })}
                    {renderDraggableItem('Note', <ShapePreview shape="note" color="#F59E0B" />, 'flowchart', 'flowchart', { shape: 'note', icon: 'note', theme: { main: '#FFEB3B', border: '#FDD835', text: '#000' } })}
                </div>
            )
        },
        {
            key: 'flow-control',
            label: t('designer.sidebar.flowControl'),
            children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                    {renderDraggableItem(t('designer.toolbar.start'), <ShapePreview shape="pill" color="#4CAF50" />, 'flowchart', 'flowchart', { shape: 'pill', icon: 'play', theme: { main: '#4CAF50', border: '#43a047', text: '#fff' } })}
                    {renderDraggableItem(t('designer.toolbar.process'), <ShapePreview shape="rectangle" color="#2196F3" />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'square', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } })}
                    {renderDraggableItem(t('designer.toolbar.decision'), <ShapePreview shape="diamond" color="#ff9800" />, 'flowchart', 'flowchart', { shape: 'diamond', icon: 'question', theme: { main: '#ff9800', border: '#fb8c00', text: '#fff' } })}
                    {renderDraggableItem(t('designer.toolbar.end'), <ShapePreview shape="pill" color="#f44336" />, 'flowchart', 'flowchart', { shape: 'pill', icon: 'stop', theme: { main: '#f44336', border: '#e53935', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.preparation'), <ShapePreview shape="preparation" color="#9C27B0" />, 'flowchart', 'flowchart', { shape: 'preparation', icon: 'hexagon', theme: { main: '#9C27B0', border: '#8e24aa', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.delay'), <ShapePreview shape="delay" color="#FF5722" />, 'flowchart', 'flowchart', { shape: 'delay', icon: 'clock', theme: { main: '#FF5722', border: '#E64A19', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.manualInput'), <ShapePreview shape="manual-input" color="#009688" />, 'flowchart', 'flowchart', { shape: 'manual-input', icon: 'keyboard', theme: { main: '#009688', border: '#00897b', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.display'), <ShapePreview shape="display" color="#607d8b" />, 'flowchart', 'flowchart', { shape: 'display', icon: 'desktop', theme: { main: '#607d8b', border: '#546e7a', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.trapezoid'), <ShapePreview shape="trapezoid" color="#795548" />, 'flowchart', 'flowchart', { shape: 'trapezoid', icon: 'hand', theme: { main: '#795548', border: '#6d4c41', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.predefinedProcess'), <ShapePreview shape="predefined-process" color="#3F51B5" />, 'flowchart', 'flowchart', { shape: 'predefined-process', icon: 'square', theme: { main: '#3F51B5', border: '#303F9F', text: '#fff' } })}
                </div>
            )
        },
        {
            key: 'data-io',
            label: t('designer.sidebar.dataIO'),
            children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                    {renderDraggableItem(t('designer.toolbar.database'), <ShapePreview shape="database" color="#9C27B0" />, 'flowchart', 'flowchart', { shape: 'database', icon: 'database', theme: { main: '#9C27B0', border: '#8e24aa', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.parallelogram'), <ShapePreview shape="parallelogram" color="#00BCD4" />, 'flowchart', 'flowchart', { shape: 'parallelogram', icon: 'arrow', theme: { main: '#00BCD4', border: '#00ACC1', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.document'), <ShapePreview shape="document" color="#2196F3" />, 'flowchart', 'flowchart', { shape: 'document', icon: 'file', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.multiDocument'), <ShapePreview shape="multi-document" color="#1565C0" />, 'flowchart', 'flowchart', { shape: 'multi-document', icon: 'file', theme: { main: '#1565C0', border: '#0D47A1', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.cloud'), <ShapePreview shape="cloud" color="#03A9F4" />, 'flowchart', 'flowchart', { shape: 'cloud', icon: 'cloud', theme: { main: '#03A9F4', border: '#039BE5', text: '#fff' } })}
                    {renderDraggableItem(t('designer.toolbar.module'), <FaThLarge style={{ color: '#607d8b' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'th-large', theme: { main: '#607d8b', border: '#546e7a', text: '#fff' } })}
                    {renderDraggableItem(t('designer.toolbar.image'), <FaImage style={{ color: '#795548' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'image', theme: { main: '#795548', border: '#6d4c41', text: '#fff' } })}
                </div>
            )
        },
        {
            key: 'containers',
            label: t('designer.sidebar.containers'),
            children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                    {renderDraggableItem(t('designer.sidebar.domainGroup'), <FaLayerGroup style={{ color: '#3F51B5' }} />, 'titleGroup', 'titleGroup', { themeColor: '#3F51B5', domainClass: 'core' })}
                    {renderDraggableItem(t('designer.sidebar.subGroup'), <FaBox style={{ color: '#673AB7' }} />, 'subGroup', 'subGroup', { themeColor: '#673AB7' })}
                    {renderDraggableItem('Swimlane', <FaStream style={{ color: '#6366f1' }} />, 'swimlane', 'swimlane', { label: 'Swimlane', direction: 'horizontal', lanes: [{ id: 'lane-1', label: '用户', color: '#3b82f6' }, { id: 'lane-2', label: '系统', color: '#10b981' }, { id: 'lane-3', label: '第三方', color: '#f59e0b' }] })}
                </div>
            )
        },
        {
            key: 'tech-icons',
            label: t('designer.sidebar.techIcons'),
            children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                    {renderDraggableItem(t('designer.sidebar.server'), <FaServer style={{ color: '#455A64' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'server', theme: { main: '#455A64', border: '#37474F', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.network'), <FaNetworkWired style={{ color: '#0288D1' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'network', theme: { main: '#0288D1', border: '#0277BD', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.security'), <FaLock style={{ color: '#E65100' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'lock', theme: { main: '#E65100', border: '#BF360C', text: '#fff' } })}
                    {renderDraggableItem('API', <FaPlug style={{ color: '#00897B' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'plug', theme: { main: '#00897B', border: '#00796B', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.user'), <FaUser style={{ color: '#5C6BC0' }} />, 'flowchart', 'flowchart', { shape: 'ellipse', icon: 'user', theme: { main: '#5C6BC0', border: '#3F51B5', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.email'), <FaEnvelope style={{ color: '#D32F2F' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'envelope', theme: { main: '#D32F2F', border: '#C62828', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.notification'), <FaBell style={{ color: '#FF8F00' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'bell', theme: { main: '#FF8F00', border: '#FF6F00', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.settings'), <FaCog style={{ color: '#78909C' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'cog', theme: { main: '#78909C', border: '#607D8B', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.code'), <FaCode style={{ color: '#7B1FA2' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'code', theme: { main: '#7B1FA2', border: '#6A1B9A', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.terminal'), <FaTerminal style={{ color: '#212121' }} />, 'flowchart', 'flowchart', { shape: 'rectangle', icon: 'terminal', theme: { main: '#212121', border: '#000', text: '#0f0' } })}
                </div>
            )
        },
        {
            key: 'special',
            label: t('designer.sidebar.special'),
            children: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                    {renderDraggableItem(t('designer.sidebar.connector'), <ShapePreview shape="circle" color="#E91E63" />, 'flowchart', 'flowchart', { shape: 'circle', icon: 'circle', theme: { main: '#E91E63', border: '#C2185B', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.offPageConnector'), <ShapePreview shape="off-page" color="#673AB7" />, 'flowchart', 'flowchart', { shape: 'off-page', icon: 'arrow', theme: { main: '#673AB7', border: '#512DA8', text: '#fff' } })}
                    {renderDraggableItem(t('designer.sidebar.internalStorage'), <ShapePreview shape="internal-storage" color="#455A64" />, 'flowchart', 'flowchart', { shape: 'internal-storage', icon: 'database', theme: { main: '#455A64', border: '#37474F', text: '#fff' } })}
                    {renderDraggableItem('Arrow Timeline', <FaChevronRight style={{ color: '#00BCD4' }} />, 'arrowTimeline', 'arrowTimeline', {})}
                </div>
            )
        }
    ];

    return (
        <Sider
            collapsible
            collapsed={isCollapsed}
            onCollapse={onToggleCollapse}
            width={width}
            theme="light"
            collapsedWidth={collapsedWidth}
            trigger={null}
            style={{
                borderRight: `1px solid ${token.colorBorderSecondary}`,
                minHeight: 0,
                overflow: 'hidden',
                position: 'relative',
                zIndex: 100
            }}
        >
            {isCollapsed ? (
                <Flex vertical align="center" style={{ height: '100%', paddingTop: 12, gap: 12 }}>
                    <Tooltip title={t('designer.sidebar.components')} placement="right">
                        <div
                            onClick={onToggleCollapse}
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: token.borderRadius,
                                border: `1px solid ${token.colorBorderSecondary}`,
                                background: token.colorBgContainer,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: token.colorPrimary,
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                            className="sidebar-trigger-btn"
                        >
                            <FaChevronRight />
                        </div>
                    </Tooltip>
                </Flex>
            ) : (
                <Flex vertical style={{ height: '100%' }}>
                    <Flex justify="space-between" align="center" style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                        <Text strong>{t('designer.sidebar.components')}</Text>
                        <Flex align="center" gap={6}>
                            {showZoomControls && (
                                <>
                                    <Tooltip title={t('designer.sidebar.zoomOutHint')}>
                                        <Button type="text" size="small" icon={<FaSearchMinus />} onClick={panelZoom.zoomOut} />
                                    </Tooltip>
                                    <Popover
                                        trigger="click"
                                        placement="bottomRight"
                                        content={
                                            <div style={{ width: 200, padding: 8 }} onWheel={panelZoom.onWheel}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                                    <span style={{ fontSize: 12, color: token.colorTextSecondary }}>{t('designer.sidebar.zoom')}</span>
                                                    <Button size="small" type="text" onClick={panelZoom.reset}>
                                                        {t('designer.sidebar.reset')}
                                                    </Button>
                                                </div>
                                                <Slider
                                                    min={Math.round(panelZoom.minScale * 100)}
                                                    max={Math.round(panelZoom.maxScale * 100)}
                                                    step={1}
                                                    value={panelZoom.percent}
                                                    onChange={(v) => panelZoom.setPercent(Number(v))}
                                                />
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: token.colorTextTertiary }}>
                                                    <span>{Math.round(panelZoom.minScale * 100)}%</span>
                                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{panelZoom.percent}%</span>
                                                    <span>{Math.round(panelZoom.maxScale * 100)}%</span>
                                                </div>
                                            </div>
                                        }
                                    >
                                        <Button type="text" size="small">
                                            {panelZoom.percent}%
                                        </Button>
                                    </Popover>
                                    <Tooltip title={t('designer.sidebar.zoomInHint')}>
                                        <Button type="text" size="small" icon={<FaSearchPlus />} onClick={panelZoom.zoomIn} />
                                    </Tooltip>
                                </>
                            )}
                            <Tooltip title={t('designer.sidebar.components')}>
                                <Button type="text" size="small" icon={<FaChevronLeft />} onClick={onToggleCollapse} />
                            </Tooltip>
                        </Flex>
                    </Flex>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onWheel={panelZoom.onWheel}>
                        <div style={{ padding: '12px 16px 8px 16px' }}>
                            <Input
                                prefix={<FaSearch style={{ color: token.colorTextDescription }} />}
                                placeholder={t('designer.sidebar.search')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                allowClear
                                size="small"
                            />
                        </div>

                        <Tabs
                            size="small"
                            centered
                            tabBarStyle={{ marginBottom: 0 }}
                            items={[
                                {
                                    key: 'shapes',
                                    label: (
                                        <span>
                                            <FaShapes style={{ marginRight: 4 }} />
                                            {t('designer.sidebar.shapes')}
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ padding: 12, overflowY: 'auto' }}>
                                            <div style={{ zoom: panelZoom.scale } as React.CSSProperties}>
                                                <Collapse
                                                    ghost
                                                    defaultActiveKey={['flow-control', 'data-io', 'containers']}
                                                    items={categories}
                                                    expandIconPlacement="end"
                                                />
                                            </div>
                                        </div>
                                    )
                                },
                                {
                                    key: 'navigator',
                                    label: (
                                        <span>
                                            <FaCompass style={{ marginRight: 4 }} />
                                            {t('designer.sidebar.navigator')}
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ padding: '0 8px', overflowY: 'auto', flex: 1 }}>
                                            {navigatorTreeData.length > 0 ? (
                                                <Tree
                                                    treeData={navigatorTreeData}
                                                    blockNode
                                                    expandedKeys={expandedKeys}
                                                    autoExpandParent={autoExpandParent}
                                                    onExpand={onExpand}
                                                    onSelect={(selectedKeys, info) => {
                                                        const node = (info.node as any).node;
                                                        if (node) onFocusNode?.(node);
                                                    }}
                                                    titleRender={(treeNode: any) => {
                                                        const node = treeNode.node;
                                                        const data = node.data as Partial<FlowchartNodeData>;
                                                        const label = data?.label || node.id;
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
                                                                    <Text type="secondary" style={{ fontSize: 10, lineHeight: 1.2 }}>{node.type}</Text>
                                                                </Flex>
                                                            </div>
                                                        );
                                                    }}
                                                />
                                            ) : (
                                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('designer.sidebar.noNodesFound')} />
                                            )}
                                        </div>
                                    )
                                },
                                // Layers Tab (only show if layer props are provided)
                                ...(onCreateLayer ? [{
                                    key: 'layers',
                                    label: (
                                        <span>
                                            <FaStream style={{ marginRight: 4 }} />
                                            {t('designer.sidebar.layers')}
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                            <LayerManagementPanel
                                                layers={layers}
                                                activeLayerId={activeLayerId}
                                                onSetActive={onSetActiveLayer || (() => { })}
                                                onToggleVisibility={onToggleLayerVisibility || (() => { })}
                                                onToggleLock={onToggleLayerLock || (() => { })}
                                                onRename={onRenameLayer || (() => { })}
                                                onCreate={onCreateLayer}
                                                onDelete={onDeleteLayer || (() => { })}
                                                onReorder={onReorderLayers || (() => { })}
                                                onSetColor={onSetLayerColor}
                                            />
                                        </div>
                                    )
                                }] : []),
                                // Templates Tab (always visible for discoverability)
                                {
                                    key: 'templates',
                                    label: (
                                        <span>
                                            <FaStar style={{ marginRight: 4 }} />
                                            {t('designer.sidebar.templates', '模板')}{templates && templates.length > 0 ? ` (${templates.length})` : ''}
                                        </span>
                                    ),
                                    children: (
                                        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                                            <NodeTemplatePanel
                                                templates={templates || []}
                                                groupedTemplates={groupedTemplates || {}}
                                                onUseTemplate={onUseTemplate || (() => { })}
                                                onDeleteTemplate={onDeleteTemplate || (() => { })}
                                                onRenameTemplate={onRenameTemplate || (() => { })}
                                            />
                                        </div>
                                    )
                                }
                            ]}
                        />
                    </div>
                </Flex>
            )}
        </Sider>
    );
};
