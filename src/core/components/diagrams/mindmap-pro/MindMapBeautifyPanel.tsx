import React, { useMemo } from 'react';
import { PluginContext } from '../../../types/plugin';
import { Node, Edge } from '@xyflow/react';
import { Select, Form, Divider, Input, Tooltip } from 'antd';
import { LinkOutlined, CheckCircleFilled, SmileOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PALETTE } from '../hooks/useMindMapOrchestrator';

// Common emoji icons for mind map nodes
const EMOJI_ICONS = [
    '', '⭐', '💡', '🎯', '📌', '🔥', '✅', '❌', '⚠️', '🔑',
    '📋', '📊', '🚀', '💎', '🔍', '📝', '💬', '🤔', '👍', '🎉',
    '⚡', '🌟', '💰', '🏆', '🎓', '🔧', '📦', '🌈', '🎨', '🔮',
];

/** Icon picker — emoji grid */
const IconPicker: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {EMOJI_ICONS.map((emoji, i) => (
                <Tooltip key={i} title={emoji || '无图标'} placement="top" mouseEnterDelay={0.4}>
                    <div
                        onClick={() => onChange(emoji)}
                        style={{
                            width: 28, height: 28,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: emoji ? 16 : 11,
                            borderRadius: 6,
                            cursor: 'pointer',
                            border: value === emoji ? '1.5px solid #6366f1' : '1.5px solid transparent',
                            background: value === emoji ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                            transition: 'all 0.15s ease',
                            color: emoji ? 'inherit' : '#cbd5e1',
                        }}
                        onMouseEnter={e => { if (value !== emoji) { (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.04)'; } }}
                        onMouseLeave={e => { if (value !== emoji) { (e.currentTarget as HTMLElement).style.background = 'transparent'; } }}
                    >
                        {emoji || '✕'}
                    </div>
                </Tooltip>
            ))}
        </div>
    );
};

/** Color dot picker — row of clickable circles + custom picker */
const ColorPicker: React.FC<{
    value: string;
    onChange: (c: string) => void;
}> = ({ value, onChange }) => {
    return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {PALETTE.map(color => (
                <Tooltip key={color} title={color} placement="top" mouseEnterDelay={0.5}>
                    <div
                        onClick={() => onChange(color)}
                        style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            backgroundColor: color,
                            cursor: 'pointer',
                            border: value === color ? '2.5px solid white' : '2px solid transparent',
                            boxShadow: value === color
                                ? `0 0 0 2px ${color}, 0 2px 6px rgba(0,0,0,0.15)`
                                : '0 1px 4px rgba(0,0,0,0.12)',
                            transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        {value === color && (
                            <CheckCircleFilled style={{ fontSize: 11, color: 'white', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }} />
                        )}
                    </div>
                </Tooltip>
            ))}
            {/* Custom color input */}
            <Tooltip title="自定义颜色" placement="top">
                <div style={{ position: 'relative', width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, border: '1.5px dashed #d1d5db', cursor: 'pointer' }}>
                    <input
                        type="color"
                        value={value}
                        onChange={e => onChange(e.target.value)}
                        style={{ width: '200%', height: '200%', position: 'absolute', top: '-50%', left: '-50%', opacity: 0, cursor: 'pointer' }}
                    />
                    <div style={{ width: '100%', height: '100%', background: PALETTE.includes(value) ? 'transparent' : value, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {PALETTE.includes(value) && <span style={{ fontSize: 10, color: '#94a3b8' }}>+</span>}
                    </div>
                </div>
            </Tooltip>
        </div>
    );
};

/** Shape selector — visual buttons */
const ShapeSelector: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
    const shapes = [
        { key: 'underline', label: '下划线', preview: (color: string) => (
            <div style={{ width: 48, height: 22, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{ fontSize: 9, lineHeight: '14px', borderBottom: `2px solid ${color}`, padding: '0 4px', color: '#334155', fontWeight: 600 }}>Topic</div>
            </div>
        )},
        { key: 'pill', label: '胶囊', preview: (color: string) => (
            <div style={{ width: 48, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 9, border: `1.5px solid ${color}`, borderRadius: 999, padding: '1px 7px', color: color, fontWeight: 600 }}>Topic</div>
            </div>
        )},
        { key: 'box', label: '矩形', preview: (color: string) => (
            <div style={{ width: 48, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 9, border: `1.5px solid ${color}`, borderLeft: `3px solid ${color}`, borderRadius: '0 4px 4px 0', padding: '1px 5px', color: '#334155', fontWeight: 600 }}>Topic</div>
            </div>
        )},
    ];

    return (
        <div style={{ display: 'flex', gap: 6 }}>
            {shapes.map(s => (
                <Tooltip key={s.key} title={s.label} placement="top">
                    <div
                        onClick={() => onChange(s.key)}
                        style={{
                            flex: 1,
                            height: 38,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            border: value === s.key ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
                            background: value === s.key ? 'rgba(99, 102, 241, 0.06)' : '#fafafa',
                            cursor: 'pointer',
                            transition: 'all 0.18s ease',
                        }}
                    >
                        {s.preview(value === s.key ? '#6366f1' : '#94a3b8')}
                    </div>
                </Tooltip>
            ))}
        </div>
    );
};

/** Priority picker — compact dot style */
const PriorityPicker: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
    const opts = [
        { v: 0, label: '—', color: '#e2e8f0', textColor: '#94a3b8' },
        { v: 1, label: '!', color: '#3b82f6', textColor: 'white' },
        { v: 2, label: '!!', color: '#f59e0b', textColor: 'white' },
        { v: 3, label: '!!!', color: '#ef4444', textColor: 'white' },
    ];
    return (
        <div style={{ display: 'flex', gap: 6 }}>
            {opts.map(o => (
                <div
                    key={o.v}
                    onClick={() => onChange(o.v === value ? 0 : o.v)}
                    style={{
                        flex: 1,
                        height: 30,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                        background: value === o.v ? o.color : '#f8fafc',
                        color: value === o.v ? o.textColor : '#94a3b8',
                        border: value === o.v ? `1.5px solid ${o.color}` : '1.5px solid #e2e8f0',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.18s ease',
                        boxShadow: value === o.v ? `0 2px 8px ${o.color}40` : 'none',
                    }}
                >
                    {o.label}
                </div>
            ))}
        </div>
    );
};

/** Progress picker */
const ProgressPicker: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => {
    const steps = [0, 25, 50, 75, 100];
    return (
        <div style={{ display: 'flex', gap: 5 }}>
            {steps.map(s => {
                const isActive = value === s;
                const color = s === 100 ? '#10b981' : '#6366f1';
                return (
                    <div
                        key={s}
                        onClick={() => onChange(s === value ? 0 : s)}
                        style={{
                            flex: 1,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 5,
                            background: isActive ? color : '#f8fafc',
                            color: isActive ? 'white' : '#94a3b8',
                            border: isActive ? `1.5px solid ${color}` : '1.5px solid #e2e8f0',
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.18s ease',
                        }}
                    >
                        {s === 0 ? '—' : `${s}%`}
                    </div>
                );
            })}
        </div>
    );
};

export const MindMapBeautifyPanel: React.FC<{ ctx: PluginContext, selectedNodes: Node[], selectedEdges: Edge[] }> = ({ ctx, selectedNodes, selectedEdges }) => {
    const { getNodes, updateNodesBatch } = ctx;
    const { t } = useTranslation();

    // Root node: has depth===0 OR (depth undefined AND has direction prop)
    const rootNode = useMemo(() => {
        const allNodes = getNodes();
        return allNodes.find(n => n.type === 'mindmap' &&
            (n.data?.depth === 0 || (n.data?.depth === undefined && n.data?.direction !== undefined)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getNodes, selectedNodes.length]);

    if (selectedNodes.length === 0) return null;

    const activeNode = selectedNodes[0];

    // Layout fields (direction/pathStyle/shape) live on root node and propagate down
    // They must be updated on the ROOT, not on the selected node
    const handleLayoutUpdate = (field: string, value: any) => {
        if (!rootNode) return;
        updateNodesBatch([rootNode.id], { [field]: value });
    };

    // Branch color lives on each non-root node individually
    const handleColorUpdate = (value: string) => {
        const colorableIds = selectedNodes
            .filter(n => {
                const d = n.data?.depth as number | undefined;
                return !(d === 0 || (d === undefined && n.data?.direction !== undefined));
            })
            .map(n => n.id);
        if (colorableIds.length === 0) return;
        updateNodesBatch(colorableIds, { branchColor: value });
    };

    // Per-node fields (priority, progress, url, icon, note) apply to selected nodes
    const handleNodeUpdate = (field: string, value: any) => {
        if (!activeNode) return;
        const targetIds = selectedNodes.map(n => n.id);
        updateNodesBatch(targetIds, { [field]: value });
    };

    const handleIconUpdate = (emoji: string) => {
        if (!activeNode) return;
        const targetIds = selectedNodes.map(n => n.id);
        // Empty string means clear icon
        updateNodesBatch(targetIds, { icon: emoji || undefined });
    };

    const handleNoteUpdate = (note: string) => {
        if (!activeNode) return;
        const targetIds = selectedNodes.map(n => n.id);
        updateNodesBatch(targetIds, { note: note.trim() || undefined });
    };

    if (!activeNode) {
        return <div style={{ padding: 16, color: '#94a3b8', fontSize: 13 }}>未检测到节点</div>;
    }

    // Layout props: always read from root node (source of truth)
    const direction = (rootNode?.data?.direction as string) || 'LR';
    const shape = (rootNode?.data?.shape as string) || 'underline';
    const pathStyle = (rootNode?.data?.pathStyle as string) || 'bezier';
    // Per-node props: read from selected node
    const branchColor = (activeNode.data?.branchColor as string) || PALETTE[0];
    const priority = (activeNode.data?.priority as number) || 0;
    const progress = (activeNode.data?.progress as number) ?? 0;
    const icon = (activeNode.data?.icon as string) || '';
    const note = (activeNode.data?.note as string) || '';

    return (
        <div style={{ width: 300, padding: '16px 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                    width: 4, height: 16, borderRadius: 2,
                    background: 'linear-gradient(180deg, #6366f1, #a855f7)',
                    flexShrink: 0
                }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                    {t('plugins.mindmap.beautify.title')}
                </span>
            </div>

            {/* === 结构布局 === */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    {t('plugins.mindmap.beautify.layout')}
                </label>
                <Select
                    value={direction}
                    onChange={v => handleLayoutUpdate('direction', v)}
                    size="small"
                    style={{ width: '100%' }}
                    options={[
                        { label: '↔ 双向展开', value: 'LR' },
                        { label: '→ 向右展开', value: 'R' },
                        { label: '← 向左展开', value: 'L' },
                        { label: '🐟 鱼骨图', value: 'FISHBONE' },
                        { label: '↓ 向下展开', value: 'TB' },
                        { label: '↑ 向上展开', value: 'BT' },
                    ]}
                />
            </div>

            {/* === 节点形状 === */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    {t('plugins.mindmap.beautify.shape')}
                </label>
                <ShapeSelector value={shape} onChange={v => handleLayoutUpdate('shape', v)} />
            </div>

            {/* === 连线风格 === */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    {t('plugins.mindmap.beautify.pathStyle')}
                </label>
                <Select
                    value={pathStyle}
                    onChange={v => handleLayoutUpdate('pathStyle', v)}
                    size="small"
                    style={{ width: '100%' }}
                    options={[
                        { label: '贝塞尔曲线 (Bezier)', value: 'bezier' },
                        { label: '有机曲线 (Rounded)', value: 'rounded' },
                        { label: '折线/直角 (Step)', value: 'step' },
                        { label: '直线 (Straight)', value: 'straight' },
                    ]}
                />
            </div>

            {/* === 分支颜色 === */}
            <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
                    {t('plugins.mindmap.beautify.branchColor')}
                </label>
                <ColorPicker value={branchColor} onChange={c => handleColorUpdate(c)} />
            </div>

            <Divider style={{ margin: '4px 0 12px 0' }} />

            {/* === URL 链接 === */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    {t('plugins.mindmap.beautify.urlLink')}
                </label>
                <Input
                    prefix={<LinkOutlined style={{ color: '#6366f1', fontSize: 12 }} />}
                    placeholder={t('plugins.mindmap.beautify.urlPlaceholder')}
                    value={(activeNode.data?.url as string) || ''}
                    onChange={e => handleNodeUpdate('url', e.target.value || undefined)}
                    allowClear
                    size="small"
                />
            </div>

            {/* === 节点图标 === */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    节点图标
                    {icon && (
                        <span style={{ marginLeft: 8, fontSize: 14, verticalAlign: 'middle' }}>{icon}</span>
                    )}
                </label>
                <IconPicker value={icon} onChange={handleIconUpdate} />
            </div>

            {/* === 备注 === */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    备注
                </label>
                <Input.TextArea
                    placeholder="添加备注..."
                    value={note}
                    onChange={e => handleNoteUpdate(e.target.value)}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    size="small"
                    style={{ fontSize: 12 }}
                />
            </div>

            {/* === 优先级 === */}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    {t('plugins.mindmap.beautify.priority')}
                </label>
                <PriorityPicker value={priority} onChange={v => handleNodeUpdate('priority', v || undefined)} />
            </div>

            {/* === 进度 === */}
            <div style={{ marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                    {t('plugins.mindmap.beautify.progress')}
                </label>
                <ProgressPicker value={progress} onChange={v => handleNodeUpdate('progress', v || undefined)} />
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: '#c0c8d8', textAlign: 'center', lineHeight: 1.4 }}>
                {t('plugins.mindmap.beautify.hint')}
            </div>
        </div>
    );
};
