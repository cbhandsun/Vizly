import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import { theme, Tooltip, Typography, Input, Button, Divider } from 'antd';
import { 
    SearchOutlined, AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined, 
    VerticalAlignTopOutlined, VerticalAlignMiddleOutlined, VerticalAlignBottomOutlined, 
    ColumnWidthOutlined, ColumnHeightOutlined, FullscreenOutlined, ApartmentOutlined 
} from '@ant-design/icons';
import { useState } from 'react';
import { 
    FaShapes, FaBox, FaLayerGroup, FaThLarge, FaImage, FaServer, 
    FaNetworkWired, FaLock, FaPlug, FaUser, FaEnvelope, FaBell, FaCog, 
    FaCode, FaTerminal, FaStream, FaChevronRight, FaCloud
} from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { DiagramTypePlugin, PluginContext, SidebarPanel } from '../types/plugin';
import { ShapePreview } from '../components/diagrams/ShapePreview';
import { IconExplorer } from '../components/diagrams/IconExplorer';
import { BaseDiagramPlugin } from '../sdk/BasePlugin';

const { Text } = Typography;
type NodeConfig = Record<string, unknown>;

export class FlowchartPlugin extends BaseDiagramPlugin implements DiagramTypePlugin {
    id = 'flowchart';
    name = '通用画布';
    version = '1.1.0';
    description = 'Vizly 的核心画布引擎，支持自由布局、智能连线与全量基础形状。适用于大多数通用绘图场景。';
    author = 'Vizly Core';
    category = 'Core';
    tags = ['General', 'Flowchart', 'Base'];
    brandColor = '#1890ff';

    async migrate(data: any, fromVersion: string | undefined): Promise<any> {
        const migratedData = await super.migrate(data, fromVersion);
        
        if (!fromVersion || fromVersion === '1.0') {
            if (Array.isArray(migratedData.nodes)) {
                migratedData.nodes = migratedData.nodes.map((n: any) => {
                    const metadata = n.metadata || {};
                    return {
                        ...n,
                        metadata: {
                            ...metadata,
                            shape: metadata.shape || 'rectangle'
                        }
                    };
                });
            }
        }
        return migratedData;
    }

    contributeToolbar(ctx: PluginContext) {
        return <FlowchartToolbar ctx={ctx} />;
    }

    contributeSidebarPanels(ctx: PluginContext): SidebarPanel[] {
        return [
            {
                id: 'shapes',
                title: '基础形状',
                icon: <FaShapes />,
                content: <FlowchartShapesPanel ctx={ctx} />,
            },
            {
                id: 'icons',
                title: '云端图标库',
                icon: <FaCloud />,
                content: <IconExplorer ctx={ctx} />,
            }
        ];
    }

    createNodeData(type: string): Record<string, any> {
        const CATEGORY_COLORS: Record<string, { main: string; border: string; text: string }> = {
            default:    { main: '#4A90D9', border: '#3A78C2', text: '#fff' },
            decision:   { main: '#F0B429', border: '#D9A21E', text: '#333' },
            process:    { main: '#47B881', border: '#3AA06F', text: '#fff' },
            data:       { main: '#7B61FF', border: '#6A4FE0', text: '#fff' },
            terminal:   { main: '#E85D75', border: '#D14D65', text: '#fff' },
            group:      { main: '#8492A6', border: '#707F94', text: '#fff' },
        };
        const palette = CATEGORY_COLORS[type] || CATEGORY_COLORS['default'];
        return {
            label: '新建节点',
            theme: palette
        };
    }
}

// ====== 流程图专属工具栏 ======
const FlowchartToolbar: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    if (!ctx) return null;

    const handleAlign = (direction: string) => {
        window.dispatchEvent(new CustomEvent('diagram:align', { detail: { direction } }));
    };

    const handleDistribute = (axis: 'horizontal' | 'vertical') => {
        window.dispatchEvent(new CustomEvent('diagram:distribute', { detail: { axis } }));
    };

    const handleFitView = () => {
        ctx.reactFlowInstance?.fitView({ duration: 600, padding: 0.25, minZoom: 0.55 });
    };

    const handleAutoLayout = () => {
        window.dispatchEvent(new CustomEvent('diagram:requestLayout', {
            detail: { strategy: 'DomainDagreLayout' }
        }));
    };

    const iconBtnStyle: React.CSSProperties = { fontSize: 13 };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 8px', borderLeft: '1px solid #e8e8e8', marginLeft: 8 }}>
            <Tooltip title="左对齐"><Button size="small" type="text" icon={<AlignLeftOutlined style={iconBtnStyle} />} onClick={() => handleAlign('left')} /></Tooltip>
            <Tooltip title="水平居中"><Button size="small" type="text" icon={<AlignCenterOutlined style={iconBtnStyle} />} onClick={() => handleAlign('center-h')} /></Tooltip>
            <Tooltip title="右对齐"><Button size="small" type="text" icon={<AlignRightOutlined style={iconBtnStyle} />} onClick={() => handleAlign('right')} /></Tooltip>
            <Tooltip title="顶对齐"><Button size="small" type="text" icon={<VerticalAlignTopOutlined style={iconBtnStyle} />} onClick={() => handleAlign('top')} /></Tooltip>
            <Tooltip title="垂直居中"><Button size="small" type="text" icon={<VerticalAlignMiddleOutlined style={iconBtnStyle} />} onClick={() => handleAlign('center-v')} /></Tooltip>
            <Tooltip title="底对齐"><Button size="small" type="text" icon={<VerticalAlignBottomOutlined style={iconBtnStyle} />} onClick={() => handleAlign('bottom')} /></Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 4px' }} />

            <Tooltip title="水平等距"><Button size="small" type="text" icon={<ColumnWidthOutlined style={iconBtnStyle} />} onClick={() => handleDistribute('horizontal')} /></Tooltip>
            <Tooltip title="垂直等距"><Button size="small" type="text" icon={<ColumnHeightOutlined style={iconBtnStyle} />} onClick={() => handleDistribute('vertical')} /></Tooltip>

            <Divider orientation="vertical" style={{ height: 16, margin: '0 4px' }} />

            <Tooltip title="自动布局"><Button size="small" type="text" icon={<ApartmentOutlined style={iconBtnStyle} />} onClick={handleAutoLayout} /></Tooltip>
            <Tooltip title="适应视口"><Button size="small" type="text" icon={<FullscreenOutlined style={iconBtnStyle} />} onClick={handleFitView} /></Tooltip>
        </div>
    );
};

// ---- 拖拽节点图库配置区 ----
export const FlowchartShapesPanel: React.FC<{ ctx: PluginContext }> = ({ ctx }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [search, setSearch] = useState('');

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

        try {
            const W = 140, H = 70;
            const dpr = window.devicePixelRatio || 2;
            const canvas = document.createElement('canvas');
            canvas.width = W * dpr;
            canvas.height = H * dpr;
            canvas.style.cssText = `width:${W}px;height:${H}px;position:fixed;left:-9999px;top:-9999px;pointer-events:none;`;
            document.body.appendChild(canvas);
            const ctxCanvas = canvas.getContext('2d');
            if (ctxCanvas) {
                ctxCanvas.scale(dpr, dpr);
                const themeColor = (config as any)?.theme?.main || '#3b82f6';
                const shape = (config as any)?.shape || 'rectangle';

                const hexToRgba = (hex: string, alpha: number) => {
                    const c = hex.replace('#', '');
                    const r = parseInt(c.substring(0, 2), 16);
                    const g = parseInt(c.substring(2, 4), 16);
                    const b = parseInt(c.substring(4, 6), 16);
                    return `rgba(${r},${g},${b},${alpha})`;
                };

                ctxCanvas.fillStyle = hexToRgba(themeColor, 0.15);
                ctxCanvas.strokeStyle = themeColor;
                ctxCanvas.lineWidth = 2;

                const drawShape = () => {
                    const w = W, h = H;
                    const cx = w / 2, cy = h / 2;
                    ctxCanvas.beginPath();
                    if (nodeType === 'arrowTimeline') {
                        const drawSegment = (x: number, y: number, sw: number, sh: number, isLast: boolean) => {
                            ctxCanvas.moveTo(x, y);
                            ctxCanvas.lineTo(x + sw - (isLast ? 0 : 8), y);
                            if (!isLast) {
                                ctxCanvas.lineTo(x + sw, y + sh / 2);
                                ctxCanvas.lineTo(x + sw - 8, y + sh);
                            } else {
                                ctxCanvas.lineTo(x + sw, y + sh);
                            }
                            ctxCanvas.lineTo(x, y + sh);
                            if (x > 10) {
                                ctxCanvas.lineTo(x + 8, y + sh / 2);
                            }
                            ctxCanvas.closePath();
                        };
                        ctxCanvas.fillStyle = hexToRgba('#1890ff', 0.2);
                        ctxCanvas.strokeStyle = '#1890ff';
                        drawSegment(10, cy - 10, w * 0.45, 20, false);
                        ctxCanvas.fill(); ctxCanvas.stroke();
                        
                        ctxCanvas.beginPath();
                        ctxCanvas.fillStyle = hexToRgba('#52c41a', 0.2);
                        ctxCanvas.strokeStyle = '#52c41a';
                        drawSegment(10 + w * 0.45, cy - 10, w * 0.45, 20, true);
                        ctxCanvas.fill(); ctxCanvas.stroke();
                        return;
                    }
                    switch (shape) {
                        case 'pill': ctxCanvas.roundRect(4, 4, w - 8, h - 8, (h - 8) / 2); break;
                        case 'diamond': ctxCanvas.moveTo(cx, 4); ctxCanvas.lineTo(w - 4, cy); ctxCanvas.lineTo(cx, h - 4); ctxCanvas.lineTo(4, cy); ctxCanvas.closePath(); break;
                        case 'ellipse': ctxCanvas.ellipse(cx, cy, cx - 6, cy - 6, 0, 0, Math.PI * 2); break;
                        case 'circle': ctxCanvas.arc(cx, cy, Math.min(cx, cy) - 6, 0, Math.PI * 2); break;
                        case 'triangle': ctxCanvas.moveTo(cx, 4); ctxCanvas.lineTo(w - 4, h - 4); ctxCanvas.lineTo(4, h - 4); ctxCanvas.closePath(); break;
                        case 'hexagon':
                        case 'preparation': ctxCanvas.moveTo(w * 0.25, 4); ctxCanvas.lineTo(w * 0.75, 4); ctxCanvas.lineTo(w - 4, cy); ctxCanvas.lineTo(w * 0.75, h - 4); ctxCanvas.lineTo(w * 0.25, h - 4); ctxCanvas.lineTo(4, cy); ctxCanvas.closePath(); break;
                        case 'star': {
                            const spikes = 5, outerR = Math.min(cx, cy) - 6, innerR = outerR * 0.42;
                            for (let i = 0; i < spikes * 2; i++) {
                                const r = i % 2 === 0 ? outerR : innerR;
                                const angle = (Math.PI / spikes) * i - Math.PI / 2;
                                const px = cx + Math.cos(angle) * r;
                                const py = cy + Math.sin(angle) * r;
                                i === 0 ? ctxCanvas.moveTo(px, py) : ctxCanvas.lineTo(px, py);
                            }
                            ctxCanvas.closePath();
                            break;
                        }
                        case 'parallelogram': ctxCanvas.moveTo(w * 0.2, h - 6); ctxCanvas.lineTo(w - 4, h - 6); ctxCanvas.lineTo(w * 0.8, 6); ctxCanvas.lineTo(4, 6); ctxCanvas.closePath(); break;
                        case 'trapezoid': ctxCanvas.moveTo(w * 0.15, 6); ctxCanvas.lineTo(w * 0.85, 6); ctxCanvas.lineTo(w - 4, h - 6); ctxCanvas.lineTo(4, h - 6); ctxCanvas.closePath(); break;
                        case 'manual-input': ctxCanvas.moveTo(w - 4, h * 0.2); ctxCanvas.lineTo(w - 4, h - 4); ctxCanvas.lineTo(4, h - 4); ctxCanvas.lineTo(4, 4); ctxCanvas.closePath(); break;
                        case 'off-page': ctxCanvas.moveTo(6, 6); ctxCanvas.lineTo(w - 6, 6); ctxCanvas.lineTo(w - 6, h * 0.65); ctxCanvas.lineTo(cx, h - 6); ctxCanvas.lineTo(6, h * 0.65); ctxCanvas.closePath(); break;
                        case 'delay': ctxCanvas.moveTo(6, 6); ctxCanvas.lineTo(w * 0.65, 6); ctxCanvas.arc(w * 0.65, cy, cy - 6, -Math.PI / 2, Math.PI / 2); ctxCanvas.lineTo(6, h - 6); ctxCanvas.closePath(); break;
                        case 'display': ctxCanvas.moveTo(w * 0.25, 6); ctxCanvas.lineTo(w * 0.75, 6); ctxCanvas.arc(w * 0.75, cy, cy - 6, -Math.PI / 2, Math.PI / 2); ctxCanvas.lineTo(w * 0.25, h - 6); ctxCanvas.lineTo(6, cy); ctxCanvas.closePath(); break;
                        case 'database':
                            ctxCanvas.ellipse(cx, h * 0.25, cx - 8, h * 0.15, 0, 0, Math.PI * 2);
                            ctxCanvas.fill(); ctxCanvas.stroke();
                            ctxCanvas.beginPath();
                            ctxCanvas.moveTo(8, h * 0.25);
                            ctxCanvas.lineTo(8, h * 0.75);
                            ctxCanvas.ellipse(cx, h * 0.75, cx - 8, h * 0.15, 0, Math.PI, 0, true);
                            ctxCanvas.lineTo(w - 8, h * 0.25);
                            break;
                        case 'rectangle':
                        default: ctxCanvas.roundRect(4, 4, w - 8, h - 8, 6); break;
                    }
                    ctxCanvas.fill();
                    ctxCanvas.stroke();
                };
                drawShape();

                const textColor = (config as any)?.theme?.text || '#fff';
                ctxCanvas.fillStyle = themeColor;
                ctxCanvas.globalAlpha = 0.9;
                ctxCanvas.font = `bold 12px Inter, system-ui, sans-serif`;
                ctxCanvas.textAlign = 'center';
                ctxCanvas.textBaseline = 'middle';
                const shortLabel = label.length > 10 ? label.slice(0, 9) + '…' : label;
                const tm = ctxCanvas.measureText(shortLabel);
                const tw = tm.width + 12, th = 18;
                ctxCanvas.globalAlpha = 0.85;
                ctxCanvas.fillStyle = themeColor;
                ctxCanvas.beginPath();
                ctxCanvas.roundRect(W / 2 - tw / 2, H / 2 - th / 2, tw, th, th / 2);
                ctxCanvas.fill();
                ctxCanvas.globalAlpha = 1;
                ctxCanvas.fillStyle = textColor;
                ctxCanvas.fillText(shortLabel, W / 2, H / 2 + 1);

                event.dataTransfer.setDragImage(canvas, W / 2, H / 2);
            }
            requestAnimationFrame(() => canvas.remove());
        } catch {}
    };
    
    const renderDraggableItem = (label: string, icon: React.ReactNode, type: string, typeName: string, config: NodeConfig) => {
        return (
            <Tooltip key={label} title={label} placement="right">
                <div
                    draggable
                    onDragStart={(event) => onDragStart(event, type, typeName, label, config)}
                    onClick={() => ctx.addNode(typeName, { label, ...config })}
                    style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '12px 8px', cursor: 'grab', 
                        border: '1px solid rgba(255, 255, 255, 0.4)',
                        borderRadius: 12, 
                        background: 'rgba(255, 255, 255, 0.6)', 
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        gap: 6, minHeight: 70,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                    }}
                    onMouseEnter={(e) => { 
                        e.currentTarget.style.borderColor = 'rgba(24, 144, 255, 0.4)'; 
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(24, 144, 255, 0.15)'; 
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                    }}
                    onMouseLeave={(e) => { 
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)'; 
                        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.02)'; 
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                        e.currentTarget.style.transform = 'none';
                    }}
                >
                    <div style={{ fontSize: 24, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))' }}>
                        {icon}
                    </div>
                    <Text style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.2, color: '#454d5d', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', fontWeight: 500 }}>
                        {label}
                    </Text>
                </div>
            </Tooltip>
        );
    };

    const ALL_ITEMS = [
        { category: 'basic', label: 'Circle', icon: <ShapePreview shape="circle" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'ellipse', icon: 'circle', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Rect', icon: <ShapePreview shape="rectangle" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'square', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Diamond', icon: <ShapePreview shape="diamond" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'diamond', icon: 'question', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Triangle', icon: <ShapePreview shape="triangle" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'triangle', icon: 'play', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Hexagon', icon: <ShapePreview shape="hexagon" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'hexagon', icon: 'hexagon', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Star', icon: <ShapePreview shape="star" color="#F59E0B" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'star', icon: 'star', theme: { main: '#FFC107', border: '#FFB300', text: '#fff' } } },
        { category: 'basic', label: 'Pill', icon: <ShapePreview shape="pill" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'pill', icon: 'play', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'basic', label: 'Note', icon: <ShapePreview shape="note" color="#F59E0B" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'note', icon: 'note', theme: { main: '#FFEB3B', border: '#FDD835', text: '#000' } } },
        { category: 'flow-control', label: t('designer.toolbar.start'), icon: <ShapePreview shape="pill" color="#4CAF50" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'pill', icon: 'play', theme: { main: '#4CAF50', border: '#43a047', text: '#fff' } } },
        { category: 'flow-control', label: t('designer.toolbar.process'), icon: <ShapePreview shape="rectangle" color="#2196F3" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'square', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'flow-control', label: t('designer.toolbar.decision'), icon: <ShapePreview shape="diamond" color="#ff9800" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'diamond', icon: 'question', theme: { main: '#ff9800', border: '#fb8c00', text: '#fff' } } },
        { category: 'flow-control', label: t('designer.toolbar.end'), icon: <ShapePreview shape="pill" color="#f44336" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'pill', icon: 'stop', theme: { main: '#f44336', border: '#e53935', text: '#fff' } } },
        { category: 'data-io', label: t('designer.toolbar.database'), icon: <ShapePreview shape="database" color="#9C27B0" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'database', icon: 'database', theme: { main: '#9C27B0', border: '#8e24aa', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.parallelogram'), icon: <ShapePreview shape="parallelogram" color="#00BCD4" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'parallelogram', icon: 'arrow', theme: { main: '#00BCD4', border: '#00ACC1', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.document'), icon: <ShapePreview shape="document" color="#2196F3" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'document', icon: 'file', theme: { main: '#2196F3', border: '#1e88e5', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.multiDocument'), icon: <ShapePreview shape="multi-document" color="#1565C0" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'multi-document', icon: 'file', theme: { main: '#1565C0', border: '#0D47A1', text: '#fff' } } },
        { category: 'data-io', label: t('designer.sidebar.cloud'), icon: <ShapePreview shape="cloud" color="#03A9F4" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'cloud', icon: 'cloud', theme: { main: '#03A9F4', border: '#039BE5', text: '#fff' } } },
        { category: 'data-io', label: t('designer.toolbar.module'), icon: <FaThLarge style={{ color: '#607d8b' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'th-large', theme: { main: '#607d8b', border: '#546e7a', text: '#fff' } } },
        { category: 'data-io', label: t('designer.toolbar.image'), icon: <FaImage style={{ color: '#795548' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'image', theme: { main: '#795548', border: '#6d4c41', text: '#fff' } } },
        { category: 'containers', label: t('designer.sidebar.domainGroup'), icon: <FaLayerGroup style={{ color: '#3F51B5' }} />, type: 'titleGroup', typeName: 'titleGroup', config: { themeColor: '#3F51B5', domainClass: 'core' } },
        { category: 'containers', label: t('designer.sidebar.subGroup'), icon: <FaBox style={{ color: '#673AB7' }} />, type: 'subGroup', typeName: 'subGroup', config: { themeColor: '#673AB7' } },
        { category: 'containers', label: 'Swimlane', icon: <FaStream style={{ color: '#6366f1' }} />, type: 'swimlane', typeName: 'swimlane', config: { label: 'Swimlane', direction: 'horizontal', lanes: [{ id: 'lane-1', label: '用户', color: '#3b82f6' }] } },
        { category: 'tech-icons', label: t('designer.sidebar.server'), icon: <FaServer style={{ color: '#455A64' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'server', theme: { main: '#455A64', border: '#37474F', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.network'), icon: <FaNetworkWired style={{ color: '#0288D1' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'network', theme: { main: '#0288D1', border: '#0277BD', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.security'), icon: <FaLock style={{ color: '#E65100' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'lock', theme: { main: '#E65100', border: '#BF360C', text: '#fff' } } },
        { category: 'tech-icons', label: 'API', icon: <FaPlug style={{ color: '#00897B' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'plug', theme: { main: '#00897B', border: '#00796B', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.user'), icon: <FaUser style={{ color: '#5C6BC0' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'ellipse', icon: 'user', theme: { main: '#5C6BC0', border: '#3F51B5', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.email'), icon: <FaEnvelope style={{ color: '#D32F2F' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'envelope', theme: { main: '#D32F2F', border: '#C62828', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.notification'), icon: <FaBell style={{ color: '#FF8F00' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'bell', theme: { main: '#FF8F00', border: '#FF6F00', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.settings'), icon: <FaCog style={{ color: '#78909C' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'cog', theme: { main: '#78909C', border: '#607D8B', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.code'), icon: <FaCode style={{ color: '#7B1FA2' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'code', theme: { main: '#7B1FA2', border: '#6A1B9A', text: '#fff' } } },
        { category: 'tech-icons', label: t('designer.sidebar.terminal'), icon: <FaTerminal style={{ color: '#212121' }} />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'rectangle', icon: 'terminal', theme: { main: '#212121', border: '#000', text: '#0f0' } } },
        { category: 'special', label: t('designer.sidebar.connector'), icon: <ShapePreview shape="circle" color="#E91E63" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'circle', icon: 'circle', theme: { main: '#E91E63', border: '#C2185B', text: '#fff' } } },
        { category: 'special', label: t('designer.sidebar.offPageConnector'), icon: <ShapePreview shape="off-page" color="#673AB7" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'off-page', icon: 'arrow', theme: { main: '#673AB7', border: '#512DA8', text: '#fff' } } },
        { category: 'special', label: t('designer.sidebar.internalStorage'), icon: <ShapePreview shape="internal-storage" color="#455A64" />, type: 'flowchart', typeName: 'flowchart', config: { shape: 'internal-storage', icon: 'database', theme: { main: '#455A64', border: '#37474F', text: '#fff' } } },
        { category: 'special', label: 'Arrow Timeline', icon: <FaChevronRight style={{ color: '#00BCD4' }} />, type: 'arrowTimeline', typeName: 'arrowTimeline', config: {} },
    ];

    const CATEGORIES_DEF = [
        { key: 'basic', title: t('designer.sidebar.basic') },
        { key: 'flow-control', title: t('designer.sidebar.flowControl') },
        { key: 'data-io', title: t('designer.sidebar.dataIO') },
        { key: 'containers', title: t('designer.sidebar.containers') },
        { key: 'tech-icons', title: t('designer.sidebar.techIcons') },
        { key: 'special', title: t('designer.sidebar.special') }
    ];

    const filteredItems = search.trim() 
        ? ALL_ITEMS.filter(it => it.label.toLowerCase().includes(search.toLowerCase()))
        : null;

    if (filteredItems) {
        return (
            <div style={{ padding: '8px 10px' }}>
                <Input
                    prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
                    placeholder="搜索组件..."
                    size="small"
                    allowClear
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ 
                        marginBottom: 10, 
                        borderRadius: 10, 
                        border: '1px solid rgba(0, 0, 0, 0.08)', 
                        background: 'rgba(255, 255, 255, 0.5)',
                        backdropFilter: 'blur(10px)',
                        padding: '6px 12px',
                        fontSize: '13px',
                        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.03)' 
                    }}
                />
                {filteredItems.length === 0 ? (
                    <div style={{ color: '#bfbfbf', textAlign: 'center', padding: 16, fontSize: 12 }}>无匹配组件</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                        {filteredItems.map(it => renderDraggableItem(it.label, it.icon, it.type, it.typeName, it.config as NodeConfig))}
                    </div>
                )}
            </div>
        );
    }

    const CategoryGroup = ({ cat }: { cat: {key: string, title: string} }) => {
        const [expanded, setExpanded] = useState(true);
        const childrenItems = ALL_ITEMS.filter(it => it.category === cat.key);
        if (childrenItems.length === 0) return null;
        
        return (
            <div style={{ marginBottom: 16 }}>
                <div 
                    onClick={() => setExpanded(!expanded)}
                    style={{ 
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                        padding: '6px 4px', cursor: 'pointer', userSelect: 'none',
                        color: '@text-color-secondary', fontWeight: 600, fontSize: 12, marginBottom: 8 
                    }}
                >
                    <span style={{ color: '#595959' }}>{cat.title}</span>
                    <span style={{ 
                        fontSize: 10, color: '#bfbfbf', transition: 'transform 0.2s', 
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' 
                    }}>▶</span>
                </div>
                <div style={{ 
                    display: expanded ? 'grid' : 'none', 
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 8 
                }}>
                    {childrenItems.map(it => renderDraggableItem(it.label, it.icon, it.type, it.typeName, it.config as NodeConfig))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '4px 8px' }}>
             <div style={{ 
                position: 'sticky', top: 0, zIndex: 10, 
                background: 'rgba(250, 250, 250, 0.8)', 
                backdropFilter: 'blur(8px)',
                paddingBottom: 12 
            }}>
                <Input
                    prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
                    placeholder="搜索组件..."
                    size="small"
                    allowClear
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ 
                        borderRadius: 10, 
                        border: '1px solid rgba(0, 0, 0, 0.08)', 
                        background: 'rgba(255, 255, 255, 0.5)',
                        backdropFilter: 'blur(10px)',
                        padding: '6px 12px',
                        fontSize: '13px',
                        boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.03)' 
                    }}
                />
            </div>
            
            <div style={{ marginTop: 4 }}>
                {CATEGORIES_DEF.map(cat => (
                    <CategoryGroup key={cat.key} cat={cat} />
                ))}
            </div>
        </div>
    );
};
