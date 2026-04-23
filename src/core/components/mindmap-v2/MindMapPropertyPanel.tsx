/**
 * MindMapPropertyPanel.tsx — 节点属性面板 v3
 * 新增：Icons/Markers、Tags 彩色标签、BranchColor 连线颜色
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    Input, InputNumber, Divider, Typography, Space, Button, Tooltip, Popover, Tag,
} from 'antd';
import {
    FontSizeOutlined, DeleteOutlined, PlusOutlined, EditOutlined,
    LinkOutlined, FileTextOutlined, SmileOutlined, TagsOutlined, RobotOutlined,
} from '@ant-design/icons';
import type { NodeObj, TagObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { VIZLY_THEME_OPTIONS } from './theme';
import { expandNodeWithAI, getAncestorPath } from './mindmapAIService';

const { Text } = Typography;
const { TextArea } = Input;

// ─── 图标分组 ─────────────────────────────────────────────────────────────────
const ICON_GROUPS: Record<string, string[]> = {
    '优先级': ['🔴', '🟠', '🟡', '🟢', '🔵'],
    '状态':   ['✅', '⬜', '🔄', '❌', '⏸️', '🚀'],
    '标注':   ['⭐', '💡', '❓', '❗', '📌', '🔒', '💬', '🎯'],
    '情绪':   ['👍', '👎', '👀', '🤔', '💪', '🙌'],
    '数字':   ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'],
};

// ─── 预设标签 ─────────────────────────────────────────────────────────────────
const PRESET_TAGS: TagObj[] = [
    { text: '重要', style: { background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' } },
    { text: '待办', style: { background: '#dbeafe', color: '#1e40af', borderColor: '#93c5fd' } },
    { text: '完成', style: { background: '#d1fae5', color: '#065f46', borderColor: '#6ee7b7' } },
    { text: '风险', style: { background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' } },
    { text: '想法', style: { background: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' } },
    { text: '问题', style: { background: '#f3f4f6', color: '#374151', borderColor: '#d1d5db' } },
];

const QUICK_COLORS = [
    '#6366f1', '#8b5cf6', '#06b6d4', '#10b981',
    '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#ffffff', '#1e293b',
];

// ─── ColorSwatch ──────────────────────────────────────────────────────────────
const ColorSwatch: React.FC<{
    value?: string; onChange: (c: string) => void; withTransparent?: boolean;
}> = ({ value, onChange, withTransparent }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {withTransparent && (
            <button title="透明" onClick={() => onChange('')}
                style={{ width: 22, height: 22, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                    border: value === '' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: 'repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/8px 8px' }} />
        )}
        {QUICK_COLORS.map(c => (
            <button key={c} title={c} onClick={() => onChange(c)} style={{
                width: 22, height: 22, borderRadius: 5, background: c, cursor: 'pointer', flexShrink: 0,
                border: value === c ? '2px solid #6366f1' : '1px solid rgba(0,0,0,0.1)',
            }} />
        ))}
        <label title="自定义" style={{ width: 22, height: 22, borderRadius: 5, cursor: 'pointer',
            border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 12, color: '#94a3b8', overflow: 'hidden' }}>
            +<input type="color" value={value || '#6366f1'}
                onChange={e => onChange(e.target.value)}
                style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }} />
        </label>
    </div>
);

// ─── Row ──────────────────────────────────────────────────────────────────────
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>{label}</Text>
        {children}
    </div>
);

// ─── IconsPicker popover ───────────────────────────────────────────────────────
const IconsPicker: React.FC<{ icons: string[]; onToggle: (icon: string) => void }> = ({ icons, onToggle }) => (
    <div style={{ width: 260 }}>
        {Object.entries(ICON_GROUPS).map(([group, emojis]) => (
            <div key={group} style={{ marginBottom: 8 }}>
                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>{group}</Text>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {emojis.map(emoji => (
                        <button key={emoji} onClick={() => onToggle(emoji)}
                            title={icons.includes(emoji) ? '点击移除' : '点击添加'}
                            style={{
                                fontSize: 18, cursor: 'pointer', border: 'none', padding: '2px 4px',
                                borderRadius: 6, background: icons.includes(emoji)
                                    ? 'rgba(99,102,241,0.15)' : 'transparent',
                                outline: icons.includes(emoji) ? '2px solid #6366f1' : 'none',
                                transition: 'all 0.15s',
                            }}>
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        ))}
    </div>
);

// ─── Node Property Panel ───────────────────────────────────────────────────────
const NodePropertyPanel: React.FC<{ node: NodeObj }> = ({ node }) => {
    const mind = getMindElixirInstance();
    const [topic, setTopic] = useState(node.topic || '');
    const parseFontSize = (n: NodeObj) => parseInt(n.style?.fontSize ?? '14', 10) || 14;
    const [fontSize, setFontSize] = useState(() => parseFontSize(node));
    const [textColor, setTextColor] = useState(node.style?.color ?? '');
    const [bgColor, setBgColor] = useState(node.style?.background ?? '');
    const [branchColor, setBranchColor] = useState(node.branchColor ?? '');
    const [hyperLink, setHyperLink] = useState(node.hyperLink ?? '');
    const [note, setNote] = useState(node.note ?? '');
    const [imageUrl, setImageUrl] = useState(node.image?.url ?? '');
    const [icons, setIcons] = useState<string[]>((node.icons as string[]) ?? []);
    const [tags, setTags] = useState<TagObj[]>(() => {
        return (node.tags ?? []).map(t => typeof t === 'string' ? { text: t } : t as TagObj);
    });
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        setTopic(node.topic || '');
        setFontSize(parseFontSize(node));
        setTextColor(node.style?.color ?? '');
        setBgColor(node.style?.background ?? '');
        setBranchColor(node.branchColor ?? '');
        setHyperLink(node.hyperLink ?? '');
        setNote(node.note ?? '');
        setImageUrl(node.image?.url ?? '');
        setIcons((node.icons as string[]) ?? []);
        setTags((node.tags ?? []).map(t => typeof t === 'string' ? { text: t } : t as TagObj));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.id]);

    const reshape = useCallback((patch: Partial<NodeObj>) => {
        if (!mind) return;
        try {
            const tpcEl = mind.findEle(node.id);
            if (tpcEl) mind.reshapeNode(tpcEl, { ...node, ...patch } as NodeObj);
        } catch (e) { console.warn('[Panel] reshapeNode:', e); }
    }, [mind, node]);

    const handleTopicBlur = useCallback(() => {
        if (!mind || !topic.trim()) return;
        try {
            const tpcEl = mind.findEle(node.id);
            if (tpcEl) mind.setNodeTopic(tpcEl, topic);
        } catch (e) { console.warn('[Panel] setNodeTopic:', e); }
    }, [mind, node.id, topic]);

    const handleIconToggle = useCallback((emoji: string) => {
        const next = icons.includes(emoji)
            ? icons.filter(i => i !== emoji)
            : [...icons, emoji];
        setIcons(next);
        reshape({ icons: next });
    }, [icons, reshape]);

    const handleTagAdd = useCallback((tagObj: TagObj) => {
        if (tags.some(t => t.text === tagObj.text)) return;
        const next = [...tags, tagObj];
        setTags(next);
        reshape({ tags: next });
    }, [tags, reshape]);

    const handleTagRemove = useCallback((text: string) => {
        const next = tags.filter(t => t.text !== text);
        setTags(next);
        reshape({ tags: next });
    }, [tags, reshape]);

    const handleTagInputConfirm = useCallback(() => {
        const t = tagInput.trim();
        if (!t) return;
        handleTagAdd({ text: t, style: { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' } });
        setTagInput('');
    }, [tagInput, handleTagAdd]);

    const isRoot = !node.parent;

    // AI expand state
    const [aiExpanding, setAiExpanding] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiError, setAiError] = useState('');

    const handleAIExpand = useCallback(async () => {
        if (!mind || aiExpanding) return;
        setAiExpanding(true);
        setAiSuggestions([]);
        setAiError('');
        try {
            const data = mind.getData();
            const ancestorPath = getAncestorPath(data.nodeData, node.id);
            const mapTitle = data.nodeData.topic;
            const result = await expandNodeWithAI({ node, ancestorPath, count: 5, mapTitle });
            if (result.error) { setAiError(result.error); }
            else { setAiSuggestions(result.topics); }
        } catch (e: any) {
            setAiError(e?.message ?? '未知错误');
        } finally {
            setAiExpanding(false);
        }
    }, [mind, node, aiExpanding]);

    const handleAIApply = useCallback(async (topic: string) => {
        if (!mind) return;
        try {
            const tpcEl = mind.findEle(node.id);
            if (!tpcEl) return;
            mind.selectNode(tpcEl);
            await mind.addChild(tpcEl, { topic, id: mind.generateNewObj?.().id ?? `n_${Date.now()}` } as NodeObj);
        } catch (e) { console.warn('[AI Expand] addChild:', e); }

    }, [mind, node]);

    return (
        <div style={{ padding: '12px 16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>

                <Text strong style={{ fontSize: 13 }}>{isRoot ? '📍 根节点' : '📝 节点属性'}</Text>
                <Space size={2}>
                    <Tooltip title="添加子节点 (Tab)">
                        <Button size="small" type="text" icon={<PlusOutlined />}
                            onClick={() => { try { const el = mind?.findEle(node.id); if (el) { mind!.selectNode(el); mind!.addChild(el); } } catch {} }} />
                    </Tooltip>
                    {!isRoot && <Tooltip title="添加兄弟节点 (Enter)">
                        <Button size="small" type="text" icon={<PlusOutlined rotate={90} />}
                            onClick={() => { try { const el = mind?.findEle(node.id); if (el) { mind!.selectNode(el); mind!.insertSibling('after', el); } } catch {} }} />
                    </Tooltip>}
                    {!isRoot && <Tooltip title="删除节点 (Delete)">
                        <Button size="small" type="text" danger icon={<DeleteOutlined />}
                            onClick={() => { try { const el = mind?.findEle(node.id); if (el) { mind!.selectNode(el); mind!.removeNodes([el]); } } catch {} }} />
                    </Tooltip>}
                </Space>
            </div>

            <Button size="small" type="dashed" icon={<EditOutlined />}
                onClick={() => { try { const el = mind?.findEle(node.id); if (el) mind?.beginEdit(el); } catch {} }}
                style={{ width: '100%', marginBottom: 8 }}>
                双击画布编辑文字 (F2)
            </Button>

            {/* AI Expand */}
            <Popover
                trigger="click"
                placement="left"
                open={aiSuggestions.length > 0 || !!aiError}
                onOpenChange={v => { if (!v) { setAiSuggestions([]); setAiError(''); } }}
                title={<span style={{ fontSize: 12 }}>🤖 AI 建议子主题（点击添加）</span>}
                content={
                    <div style={{ width: 220 }}>
                        {aiError && <div style={{ color: '#ef4444', fontSize: 12 }}>{aiError}</div>}
                        {aiSuggestions.map(s => (
                            <div key={s} onClick={() => handleAIApply(s)}
                                style={{ padding: '5px 8px', cursor: 'pointer', borderRadius: 6,
                                    fontSize: 13, marginBottom: 3,
                                    background: 'rgba(99,102,241,0.05)',
                                    border: '1px solid rgba(99,102,241,0.12)',
                                    transition: 'background 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.15)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.05)')}
                            >
                                <PlusOutlined style={{ marginRight: 6, color: '#6366f1', fontSize: 10 }} />
                                {s}
                            </div>
                        ))}
                    </div>
                }
            >
                <Button size="small" type="primary" ghost icon={<RobotOutlined />}
                    onClick={handleAIExpand} loading={aiExpanding}
                    style={{ width: '100%', marginBottom: 14 }}>
                    AI 扩展子主题
                </Button>
            </Popover>

            {/* Icons 已选 + picker */}
            {icons.length > 0 && (
                <div style={{ marginBottom: 10, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {icons.map(ic => (
                        <button key={ic} onClick={() => handleIconToggle(ic)}
                            title="点击移除"
                            style={{ fontSize: 18, cursor: 'pointer', border: '1px solid #e2e8f0',
                                borderRadius: 6, padding: '1px 4px', background: 'rgba(99,102,241,0.08)' }}>
                            {ic}
                        </button>
                    ))}
                </div>
            )}

            {/* Topic */}
            <Row label="节点文字（失焦保存）">
                <TextArea value={topic} onChange={e => setTopic(e.target.value)}
                    onBlur={handleTopicBlur}
                    onPressEnter={e => { e.preventDefault(); handleTopicBlur(); }}
                    autoSize={{ minRows: 1, maxRows: 4 }} style={{ fontSize: 13 }} />
            </Row>

            {/* Icons picker */}
            <Row label="图标 Markers">
                <Popover trigger="click" placement="left"
                    content={<IconsPicker icons={icons} onToggle={handleIconToggle} />}
                    title={<span style={{ fontSize: 12 }}>选择图标（可多选）</span>}>
                    <Button size="small" icon={<SmileOutlined />} style={{ width: '100%' }}>
                        {icons.length > 0 ? `已选 ${icons.length} 个图标` : '添加图标...'}
                    </Button>
                </Popover>
            </Row>

            {/* Tags */}
            <Row label="标签 Tags">
                <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {tags.map(t => (
                        <Tag key={t.text} closable onClose={() => handleTagRemove(t.text)}
                            style={{ ...(t.style as React.CSSProperties ?? {}), margin: 0 }}>
                            {t.text}
                        </Tag>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {PRESET_TAGS.map(pt => (
                        <button key={pt.text} onClick={() => handleTagAdd(pt)}
                            style={{ ...(pt.style as React.CSSProperties ?? {}),
                                border: `1px solid ${(pt.style as any)?.borderColor ?? '#e2e8f0'}`,
                                borderRadius: 4, fontSize: 11, padding: '1px 7px',
                                cursor: 'pointer', opacity: tags.some(t => t.text === pt.text) ? 0.4 : 1 }}>
                            {pt.text}
                        </button>
                    ))}
                </div>
                <Input size="small" placeholder="输入自定义标签 + Enter"
                    prefix={<TagsOutlined style={{ color: '#94a3b8' }} />}
                    value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onPressEnter={handleTagInputConfirm}
                    onBlur={handleTagInputConfirm} />
            </Row>

            <Divider style={{ margin: '10px 0' }} />

            {/* Font size */}
            <Row label="字体大小">
                <InputNumber min={10} max={48} value={fontSize}
                    onChange={v => { if (!v) return; setFontSize(v); reshape({ style: { ...node.style, fontSize: `${v}px` } }); }}
                    suffix="px" style={{ width: '100%' }} prefix={<FontSizeOutlined />} />
            </Row>

            {/* Text color */}
            <Row label="文字颜色">
                <ColorSwatch value={textColor} onChange={c => { setTextColor(c); reshape({ style: { ...node.style, color: c || undefined } }); }} withTransparent />
            </Row>

            {/* Background color */}
            <Row label="节点背景色">
                <ColorSwatch value={bgColor} onChange={c => { setBgColor(c); reshape({ style: { ...node.style, background: c || undefined } }); }} withTransparent />
            </Row>

            {/* Branch color */}
            <Row label="连线颜色">
                <ColorSwatch value={branchColor} onChange={c => { setBranchColor(c); reshape({ branchColor: c || undefined }); }} withTransparent />
            </Row>

            <Divider style={{ margin: '10px 0' }} />

            {/* HyperLink */}
            <Row label="超链接">
                <Input prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="https://..." value={hyperLink} size="small"
                    onChange={e => setHyperLink(e.target.value)}
                    onBlur={() => reshape({ hyperLink: hyperLink.trim() || undefined })}
                    onPressEnter={() => reshape({ hyperLink: hyperLink.trim() || undefined })} />
            </Row>

            {/* Note */}
            <Row label="备注">
                <TextArea placeholder="添加备注..." value={note}
                    onChange={e => setNote(e.target.value)}
                    onBlur={() => reshape({ note: note.trim() || undefined })}
                    autoSize={{ minRows: 2, maxRows: 5 }} style={{ fontSize: 12 }} />
            </Row>

            {/* Image — URL input + local file upload */}
            <Row label="节点图片">
                <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                    <Input prefix={<span style={{ fontSize: 11, color: '#94a3b8' }}>🖼️</span>}
                        placeholder="https://... 或点击上传" value={imageUrl} size="small"
                        style={{ flex: 1 }}
                        onChange={e => setImageUrl(e.target.value)}
                        onBlur={() => {
                            const url = imageUrl.trim();
                            reshape({ image: url ? { url, width: 160, height: 100, fit: 'contain' } : undefined });
                        }}
                        onPressEnter={() => {
                            const url = imageUrl.trim();
                            reshape({ image: url ? { url, width: 160, height: 100, fit: 'contain' } : undefined });
                        }} />
                    {/* Local file upload */}
                    <label title="从本地上传图片" style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 24, borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                        background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                        fontSize: 13,
                    }}>
                        📁
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = ev => {
                                    const dataUrl = ev.target?.result as string;
                                    if (!dataUrl) return;
                                    setImageUrl(dataUrl);
                                    reshape({ image: { url: dataUrl, width: 160, height: 100, fit: 'contain' } });
                                };
                                reader.readAsDataURL(file);
                                e.target.value = '';
                            }} />
                    </label>
                </div>
                {imageUrl && (
                    <div style={{ marginTop: 2, borderRadius: 6, overflow: 'hidden',
                        border: '1px solid rgba(99,102,241,0.15)', position: 'relative' }}>
                        <img src={imageUrl} alt="预览"
                            style={{ width: '100%', maxHeight: 100, objectFit: 'contain',
                                display: 'block', background: '#f8fafc' }}
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        <button onClick={() => { setImageUrl(''); reshape({ image: undefined }); }}
                            style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20,
                                borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: '#fff',
                                border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: '20px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    </div>
                )}
            </Row>

            <Divider style={{ margin: '10px 0' }} />

            {/* Keyboard cheatsheet */}
            <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)',
                borderRadius: 8, padding: '8px 12px', fontSize: 11.5, color: 'rgba(0,0,0,0.5)', lineHeight: 2 }}>
                {[['Tab','添加子节点'],['Enter','添加兄弟节点'],['Delete','删除节点'],['F2','编辑文字'],['Ctrl+Z','撤销']].map(([k,d])=>(
                    <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <kbd style={{ display: 'inline-block', padding: '1px 5px', background: '#f1f5f9',
                            border: '1px solid #e2e8f0', borderBottom: '2px solid #cbd5e1',
                            borderRadius: 4, fontSize: 10.5, fontFamily: 'monospace',
                            color: '#475569', minWidth: 40, textAlign: 'center' }}>{k}</kbd>
                        <span>{d}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Canvas Panel ─────────────────────────────────────────────────────────────
const CanvasPanel: React.FC<{ activeTheme: string; onThemeChange: (k: string) => void }> = ({ activeTheme, onThemeChange }) => (
    <div style={{ padding: '12px 16px' }}>
        <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>🎨 画布主题</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {VIZLY_THEME_OPTIONS.map(opt => {
                const isActive = activeTheme === opt.key;
                return (
                    <button key={opt.key} onClick={() => onThemeChange(opt.key)} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                        border: `2px solid ${isActive ? '#6366f1' : 'transparent'}`,
                        borderRadius: 10, background: isActive ? 'rgba(99,102,241,0.08)' : 'rgba(0,0,0,0.02)',
                        cursor: 'pointer', width: '100%', textAlign: 'left', transition: 'all 0.18s ease',
                    }}>
                        <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                            background: opt.theme.cssVar['--main-bgcolor'],
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }} />
                        <div>
                            <div style={{ fontWeight: 500, fontSize: 13, color: '#1e293b' }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: isActive ? '#6366f1' : '#94a3b8', fontWeight: isActive ? 500 : 400 }}>
                                {isActive ? '✓ 当前主题' : opt.theme.name}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
        <Divider style={{ margin: '16px 0 10px' }} />
        <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.08)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'rgba(0,0,0,0.45)', lineHeight: 1.9 }}>
            <div>💡 点击节点可编辑属性</div>
            <div>📋 右键节点打开操作菜单</div>
            <div>⌨️ Tab 键添加子节点</div>
            <div>🖱️ 滚轮缩放 / 拖拽平移</div>
        </div>
    </div>
);

// ─── Main export ──────────────────────────────────────────────────────────────
interface MindMapPropertyPanelProps {
    activeTheme: string;
    onThemeChange: (key: string) => void;
}

const MindMapPropertyPanel: React.FC<MindMapPropertyPanelProps> = ({ activeTheme, onThemeChange }) => {
    const [selectedNode, setSelectedNode] = useState<NodeObj | null>(null);
    const [, setTick] = useState(0);
    useEffect(() => subscribeMindElixir(() => setTick(t => t + 1)), []);
    const mind = getMindElixirInstance();

    useEffect(() => {
        if (!mind) return;
        const onSelectNodes = (nodes: NodeObj[]) => setSelectedNode(nodes[0] ?? null);
        const onSelectNewNode = (n: NodeObj) => setSelectedNode(n);
        const onUnselect = () => setSelectedNode(null);
        mind.bus.addListener('selectNodes', onSelectNodes);
        mind.bus.addListener('selectNewNode', onSelectNewNode);
        mind.bus.addListener('unselectNodes', onUnselect);
        return () => {
            mind.bus.removeListener('selectNodes', onSelectNodes);
            mind.bus.removeListener('selectNewNode', onSelectNewNode);
            mind.bus.removeListener('unselectNodes', onUnselect);
        };
    }, [mind]);

    return (
        <div style={{ height: '100%', overflowY: 'auto' }}>
            {selectedNode
                ? <NodePropertyPanel key={selectedNode.id} node={selectedNode} />
                : <CanvasPanel activeTheme={activeTheme} onThemeChange={onThemeChange} />}
        </div>
    );
};

export default MindMapPropertyPanel;
