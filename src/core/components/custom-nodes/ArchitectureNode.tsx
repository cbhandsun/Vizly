import React, { memo, useMemo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Icon } from '@iconify/react';
import {
    ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';

// ====== 数据定义 ======
export type ArchitectureNodeType =
    | 'system' | 'component' | 'database'
    | 'gateway' | 'microservice' | 'messageQueue'
    | 'cache' | 'storage' | 'frontend';

export interface MetricBadge {
    label: string;
    value: string | number;
    trend?: 'up' | 'down' | 'flat';
    status?: 'success' | 'warning' | 'danger' | 'normal';
}

export interface ArchitectureNodeData extends Record<string, unknown> {
    label: string;
    type: ArchitectureNodeType;
    icon?: string;
    description?: string;
    status?: 'normal' | 'warning' | 'error';
    themeColor?: string;
    metrics?: MetricBadge[];
    linterErrors?: string[];
}

// ====== 默认主题色映射 ======
const DEFAULT_COLORS: Record<ArchitectureNodeType, string> = {
    frontend: '#a0d911',
    gateway: '#722ed1',
    microservice: '#13c2c2',
    messageQueue: '#eb2f96',
    cache: '#f5222d',
    storage: '#fa8c16',
    database: '#1890ff',
    system: '#2f54eb',
    component: '#52c41a',
};

// ====== 专属 SVG 形状渲染器 ======

const GlassDefs: React.FC<{ color: string; idStr: string }> = ({ color, idStr }) => (
    <defs>
        <linearGradient id={`grad-${idStr}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={`stroke-${idStr}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={color} stopOpacity="0.4" />
        </linearGradient>
    </defs>
);

const useShapeId = (color: string) => color.replace('#', '');

/** 圆柱体 — database / cache */
const CylinderShape: React.FC<{ color: string; dashed?: boolean; label: string }> = ({ color, dashed, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 120 80" width="120" height="80" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <rect x="6" y="16" width="108" height="48"
                fill={`url(#grad-${idStr})`} stroke="none" />
            <line x1="6" y1="16" x2="6" y2="64" stroke={`url(#stroke-${idStr})`} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} />
            <line x1="114" y1="16" x2="114" y2="64" stroke={`url(#stroke-${idStr})`} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} />
            <ellipse cx="60" cy="64" rx="54" ry="14"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} />
            <ellipse cx="60" cy="16" rx="54" ry="14"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" strokeDasharray={dashed ? '4 3' : 'none'} />
            <text x="60" y="44" textAnchor="middle" fontSize="12" fontWeight="600" fill="#262626">{label.length > 12 ? label.slice(0, 11) + '…' : label}</text>
        </svg>
    );
};

/** 菱形/盾形 — gateway */
const DiamondShape: React.FC<{ color: string; label: string }> = ({ color, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 130 90" width="130" height="90" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <polygon points="65,4 126,45 65,86 4,45"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2.5" strokeLinejoin="round" />
            <text x="65" y="48" textAnchor="middle" fontSize="12" fontWeight="600" fill="#262626">{label.length > 10 ? label.slice(0, 9) + '…' : label}</text>
        </svg>
    );
};

/** 六边形 — microservice */
const HexagonShape: React.FC<{ color: string; label: string }> = ({ color, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 130 80" width="130" height="80" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <polygon points="30,4 100,4 126,40 100,76 30,76 4,40"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" strokeLinejoin="round" />
            <text x="65" y="44" textAnchor="middle" fontSize="12" fontWeight="600" fill="#262626">{label.length > 10 ? label.slice(0, 9) + '…' : label}</text>
        </svg>
    );
};

/** 管道形 — messageQueue */
const PipeShape: React.FC<{ color: string; label: string }> = ({ color, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 140 60" width="140" height="60" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <rect x="20" y="4" width="100" height="52" rx="4" ry="4"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" />
            <circle cx="20" cy="30" r="16" fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" />
            <circle cx="120" cy="30" r="16" fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" />
            <polygon points="114,24 126,30 114,36" fill={`url(#stroke-${idStr})`} opacity="0.8" />
            <text x="70" y="34" textAnchor="middle" fontSize="11" fontWeight="600" fill="#262626">{label.length > 10 ? label.slice(0, 9) + '…' : label}</text>
        </svg>
    );
};

/** 文件夹形状 — storage */
const FolderShape: React.FC<{ color: string; label: string }> = ({ color, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 120 80" width="120" height="80" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <path d="M4,18 L4,8 Q4,4 8,4 L40,4 L48,14 L112,14 Q116,14 116,18 L116,72 Q116,76 112,76 L8,76 Q4,76 4,72 Z"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" />
            <text x="60" y="50" textAnchor="middle" fontSize="12" fontWeight="600" fill="#262626">{label.length > 10 ? label.slice(0, 9) + '…' : label}</text>
        </svg>
    );
};

/** 浏览器窗口 — frontend */
const BrowserShape: React.FC<{ color: string; label: string }> = ({ color, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 130 80" width="130" height="80" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <rect x="4" y="4" width="122" height="72" rx="6" ry="6"
                fill="#ffffff99" stroke={`url(#stroke-${idStr})`} strokeWidth="2" />
            <rect x="4" y="4" width="122" height="20" rx="6" ry="6"
                fill={`url(#grad-${idStr})`} stroke="none" />
            <rect x="4" y="18" width="122" height="6" fill={`url(#grad-${idStr})`} stroke="none" />
            <circle cx="16" cy="14" r="3" fill="#ff5f57" />
            <circle cx="26" cy="14" r="3" fill="#febc2e" />
            <circle cx="36" cy="14" r="3" fill="#28c840" />
            <rect x="46" y="9" width="70" height="10" rx="3" ry="3" fill="#fff" opacity="0.8" />
            <text x="65" y="54" textAnchor="middle" fontSize="12" fontWeight="600" fill="#262626">{label.length > 10 ? label.slice(0, 9) + '…' : label}</text>
        </svg>
    );
};

/** 层叠矩形 — system */
const StackedRectShape: React.FC<{ color: string; label: string }> = ({ color, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 130 80" width="130" height="80" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <rect x="10" y="10" width="112" height="62" rx="4" ry="4"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="1.5" opacity="0.4" />
            <rect x="4" y="4" width="112" height="62" rx="4" ry="4"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" />
            <text x="60" y="40" textAnchor="middle" fontSize="12" fontWeight="600" fill="#262626">{label.length > 10 ? label.slice(0, 9) + '…' : label}</text>
        </svg>
    );
};

/** 齿轮矩形 — component */
const GearRectShape: React.FC<{ color: string; label: string }> = ({ color, label }) => {
    const idStr = useShapeId(color);
    return (
        <svg viewBox="0 0 130 70" width="130" height="70" style={{ display: 'block', overflow: 'visible' }}>
            <GlassDefs color={color} idStr={idStr} />
            <rect x="4" y="4" width="122" height="62" rx="4" ry="4"
                fill={`url(#grad-${idStr})`} stroke={`url(#stroke-${idStr})`} strokeWidth="2" />
            <circle cx="110" cy="16" r="10" fill={`url(#grad-${idStr})`} opacity="0.8" />
            <path d="M110,9 l1.5,2.5 h3 l-1.5,2.5 1.5,2.5 h-3 l-1.5,2.5 -1.5,-2.5 h-3 l1.5,-2.5 -1.5,-2.5 h3 z"
                fill={`url(#stroke-${idStr})`} opacity="0.9" />
            <text x="58" y="42" textAnchor="middle" fontSize="12" fontWeight="600" fill="#262626">{label.length > 10 ? label.slice(0, 9) + '…' : label}</text>
        </svg>
    );
};


// ====== 辅助工具 ======
const getTrendIcon = (trend: MetricBadge['trend']) => {
    switch (trend) {
        case 'up': return <ArrowUpOutlined style={{ color: '#f5222d', fontSize: 10 }} />;
        case 'down': return <ArrowDownOutlined style={{ color: '#52c41a', fontSize: 10 }} />;
        default: return <MinusOutlined style={{ color: '#8c8c8c', fontSize: 10 }} />;
    }
};

const getMetricColor = (status: MetricBadge['status']) => {
    switch (status) {
        case 'success': return '#52c41a';
        case 'warning': return '#faad14';
        case 'danger': return '#f5222d';
        default: return '#1890ff';
    }
};

// ====== 主组件 ======
const ArchitectureNode: React.FC<NodeProps<Node<ArchitectureNodeData>>> = ({ data, selected }) => {
    // 🛡️ 防御性编程：防止外部传入无效数据导致白屏 (GAP-01)
    if (!data) {
        console.warn('ArchitectureNode rendered without data');
        return <div style={{width: 130, height: 80, background: '#fafafa', border: '1px solid #d9d9d9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Invalid Node</div>;
    }

    const { label, type, icon, description, status = 'normal', themeColor, metrics = [], linterErrors = [] } = data;
    const color = themeColor || (type ? DEFAULT_COLORS[type] : null) || '#1890ff';

    const safeMetrics = Array.isArray(metrics) ? metrics : [];
    const safeLinterErrors = Array.isArray(linterErrors) ? linterErrors : [];

    const isError = status === 'error' || safeLinterErrors.length > 0;

    // 选中态外框样式
    const outerStyle: React.CSSProperties = useMemo(() => ({
        position: 'relative' as const,
        display: 'inline-flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        padding: 0,
        borderRadius: 8,
        background: 'transparent',
        outline: selected ? `2.5px solid #1890ff` : isError ? `2px dashed #f5222d` : 'none',
        outlineOffset: 3,
        transition: 'outline 0.2s, filter 0.25s',
        filter: selected ? 'drop-shadow(0 0 6px rgba(24,144,255,0.2))' : 'drop-shadow(0 4px 12px rgba(0,0,0,0.06))',
        cursor: 'grab',
    }), [selected, isError]);

    // 根据类型选择形状
    const shapeEl = useMemo(() => {
        const l = typeof label === 'string' ? label : (label ? String(label) : '未命名');
        switch (type) {
            case 'database': return <CylinderShape color={color} label={l} />;
            case 'cache': return <CylinderShape color={color} dashed label={l} />;
            case 'gateway': return <DiamondShape color={color} label={l} />;
            case 'microservice': return <HexagonShape color={color} label={l} />;
            case 'messageQueue': return <PipeShape color={color} label={l} />;
            case 'storage': return <FolderShape color={color} label={l} />;
            case 'frontend': return <BrowserShape color={color} label={l} />;
            case 'system': return <StackedRectShape color={color} label={l} />;
            case 'component': return <GearRectShape color={color} label={l} />;
            default: return <StackedRectShape color={color} label={l} />;
        }
    }, [type, color, label]);

    return (
        <div style={outerStyle}>
            {/* Linter 警示徽标 */}
            {safeLinterErrors.length > 0 && (
                <div style={{
                    position: 'absolute', top: -12, right: -12, zIndex: 10,
                    background: '#fff', borderRadius: '50%',
                    boxShadow: '0 2px 6px rgba(245,34,45,0.4)',
                }} title={safeLinterErrors.join('\n')}>
                    <ExclamationCircleOutlined style={{ color: '#f5222d', fontSize: 20 }} />
                </div>
            )}

            {/* 连接锚点 */}
            <Handle type="target" position={Position.Top} style={{ background: color, width: 8, height: 8, border: '2px solid #fff' }} />
            <Handle type="target" position={Position.Left} style={{ background: color, width: 8, height: 8, border: '2px solid #fff' }} />

            {/* 专属形状 SVG */}
            <div style={{ position: 'relative' }}>
                {shapeEl}
                {icon && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -75%)',
                        color: color,
                        fontSize: 24,
                        pointerEvents: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Icon icon={icon} />
                    </div>
                )}
            </div>

            {/* 描述区（仅在有描述时出现，且不与标题重复，挂在形状下方） */}
            {description && description !== label && (
                <div style={{
                    maxWidth: 140, padding: '4px 8px', fontSize: 11,
                    color: '#595959', lineHeight: 1.4, textAlign: 'center',
                    background: 'rgba(255,255,255,0.85)', borderRadius: 4,
                    marginTop: 2,
                }}>
                    {description}
                </div>
            )}

            {/* 实况数据探针区 */}
            {safeMetrics.length > 0 && (
                <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4,
                    justifyContent: 'center', marginTop: 4,
                }}>
                    {safeMetrics.map((m, idx) => (
                        <div key={idx} style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            background: '#fff', border: `1px solid ${getMetricColor(m.status)}50`,
                            padding: '1px 6px', borderRadius: 10, fontSize: 10,
                        }}>
                            <span style={{ color: '#8c8c8c' }}>{m.label}</span>
                            <strong style={{ color: getMetricColor(m.status) }}>{m.value}</strong>
                            {m.trend && getTrendIcon(m.trend)}
                        </div>
                    ))}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} style={{ background: color, width: 8, height: 8, border: '2px solid #fff' }} />
            <Handle type="source" position={Position.Right} style={{ background: color, width: 8, height: 8, border: '2px solid #fff' }} />
        </div>
    );
};

export default memo(ArchitectureNode);
