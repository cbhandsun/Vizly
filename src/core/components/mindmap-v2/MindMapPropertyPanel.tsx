/**
 * MindMapPropertyPanel.tsx — 节点属性面板 v3
 * 新增：Icons/Markers、Tags 彩色标签、BranchColor 连线颜色
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    Input, InputNumber, Divider, Typography, Space, Button, Tooltip, Popover, Tag, Select,
} from 'antd';
import {
    FontSizeOutlined, DeleteOutlined, PlusOutlined, EditOutlined,
    LinkOutlined, SmileOutlined, TagsOutlined, RobotOutlined,
} from '@ant-design/icons';
import type { NodeObj, TagObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { expandNodeWithAI, getAncestorPath, summarizeNodeWithAI } from './mindmapAIService';
import {
    applyTaskMeta,
    getTaskMeta,
    type MindMapTaskMeta,
    type TaskPriority,
    type TaskStatus,
} from './mindmapTaskModel';
import { toSafeExternalUrl, toSafeImageUrl } from '../../utils/sanitizeHtml';
import { getImageFileImportError, IMAGE_DATA_URL_IMPORT_MAX_BYTES } from '../../utils/fileImportGuards';
import {
    cleanMindMapColor,
    cleanMindMapNodePatch,
    cleanMindMapTagObjects,
} from './mindmapNodePatchSecurity';
import {
    cleanMindMapIcons,
    cleanMindMapNote,
    cleanMindMapTopic,
} from './mindmapTreeSanitizer';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import {
    logMindmapPropertyAiAddChildFailure,
    logMindmapPropertyImageUploadRejected,
    logMindmapPropertyQuickActionFailure,
    logMindmapPropertyReshapeFailure,
    logMindmapPropertySetTopicFailure,
} from './mindmapPanelLogging';
import {
    CanvasPanel,
    ColorSwatch,
    IconsPicker,
    PropertyRow as Row,
} from './MindMapPropertyPanelControls';
import {
    PRESET_TAGS,
    TASK_PRIORITY_OPTIONS,
    TASK_STATUS_OPTIONS,
} from './mindMapPropertyPanelOptions';

const { Text } = Typography;
const { TextArea } = Input;
type ExtendedMindMapNode = NodeObj & {
    shapeClass?: string;
    branchWidth?: number;
    task?: MindMapTaskMeta;
};
type MindMapNodePatch = Partial<NodeObj> & Partial<Pick<ExtendedMindMapNode, 'shapeClass' | 'branchWidth' | 'task'>>;

const errorMessage = (error: unknown, fallback: string): string =>
    error instanceof Error && error.message ? error.message : fallback;

const tagBorderColor = (tag: TagObj): string => {
    const style = tag.style as Record<string, unknown> | undefined;
    return typeof style?.borderColor === 'string' ? style.borderColor : '#e2e8f0';
};

// ─── Node Property Panel ───────────────────────────────────────────────────────
const NodePropertyPanel: React.FC<{ node: NodeObj }> = ({ node }) => {
    const mind = getMindElixirInstance();
    const extendedNode = node as ExtendedMindMapNode;
    const [topic, setTopic] = useState(cleanMindMapTopic(node.topic, ''));
    const parseFontSize = (n: NodeObj) => parseInt(n.style?.fontSize ?? '14', 10) || 14;
    const [fontSize, setFontSize] = useState(() => parseFontSize(node));
    const [textColor, setTextColor] = useState(cleanMindMapColor(node.style?.color) ?? '');
    const [bgColor, setBgColor] = useState(cleanMindMapColor(node.style?.background) ?? '');
    const [branchColor, setBranchColor] = useState(cleanMindMapColor(node.branchColor) ?? '');
    const [hyperLink, setHyperLink] = useState(node.hyperLink ?? '');
    const [note, setNote] = useState(cleanMindMapNote(node.note) ?? '');
    const [imageUrl, setImageUrl] = useState(node.image?.url ?? '');
    const [icons, setIcons] = useState<string[]>(cleanMindMapIcons(node.icons) ?? []);
    const [tags, setTags] = useState<TagObj[]>(() => {
        return cleanMindMapTagObjects(node.tags) ?? [];
    });
    const [tagInput, setTagInput] = useState('');
    // ─ Shape & Line width ──────────────────────────────────────────────────────────
    const [shapeClass, setShapeClass] = useState<string>(extendedNode.shapeClass ?? '');
    const [branchWidth, setBranchWidth] = useState<number>(extendedNode.branchWidth ?? 0);
    const initialTask = getTaskMeta(node);
    const [taskStatus, setTaskStatus] = useState<TaskStatus>(initialTask.status);
    const [taskPriority, setTaskPriority] = useState<TaskPriority>(initialTask.priority);
    const [taskDueDate, setTaskDueDate] = useState(initialTask.dueDate ?? '');
    const [taskAssignee, setTaskAssignee] = useState(initialTask.assignee ?? '');
    const [taskProgress, setTaskProgress] = useState(initialTask.progress ?? 0);

    const [syncedNodeId, setSyncedNodeId] = useState(node.id);
    if (syncedNodeId !== node.id) {
        setSyncedNodeId(node.id);
        setTopic(cleanMindMapTopic(node.topic, ''));
        setFontSize(parseFontSize(node));
        setTextColor(cleanMindMapColor(node.style?.color) ?? '');
        setBgColor(cleanMindMapColor(node.style?.background) ?? '');
        setBranchColor(cleanMindMapColor(node.branchColor) ?? '');
        setHyperLink(node.hyperLink ?? '');
        setNote(cleanMindMapNote(node.note) ?? '');
        setImageUrl(node.image?.url ?? '');
        setIcons(cleanMindMapIcons(node.icons) ?? []);
        setTags(cleanMindMapTagObjects(node.tags) ?? []);
        setShapeClass(extendedNode.shapeClass ?? '');
        setBranchWidth(extendedNode.branchWidth ?? 0);
        const task = getTaskMeta(node);
        setTaskStatus(task.status);
        setTaskPriority(task.priority);
        setTaskDueDate(task.dueDate ?? '');
        setTaskAssignee(task.assignee ?? '');
        setTaskProgress(task.progress ?? 0);
    }

    const reshape = useCallback((patch: MindMapNodePatch) => {
        if (!mind) return;
        try {
            const tpcEl = mind.findEle(node.id);
            const cleanPatch = cleanMindMapNodePatch(patch as Partial<NodeObj> & Record<string, unknown>);
            if (tpcEl) mind.reshapeNode(tpcEl, { ...node, ...cleanPatch } as NodeObj);
        } catch (e) { logMindmapPropertyReshapeFailure(e); }
    }, [mind, node]);

    const saveImageUrl = useCallback(() => {
        const safeUrl = toSafeImageUrl(imageUrl);
        setImageUrl(safeUrl ?? '');
        reshape({ image: safeUrl ? { url: safeUrl, width: 160, height: 100, fit: 'contain' } : undefined });
    }, [imageUrl, reshape]);

    const saveHyperLink = useCallback(() => {
        const safeUrl = toSafeExternalUrl(hyperLink);
        setHyperLink(safeUrl ?? '');
        reshape({ hyperLink: safeUrl ?? undefined });
    }, [hyperLink, reshape]);

    const handleTopicBlur = useCallback(() => {
        if (!mind || !topic.trim()) return;
        const cleanTopic = cleanMindMapTopic(topic);
        setTopic(cleanTopic);
        try {
            const tpcEl = mind.findEle(node.id);
            if (tpcEl) mind.setNodeTopic(tpcEl, cleanTopic);
        } catch (e) { logMindmapPropertySetTopicFailure(e); }
    }, [mind, node.id, topic]);

    const handleIconToggle = useCallback((emoji: string) => {
        const next = cleanMindMapIcons(icons.includes(emoji)
            ? icons.filter(i => i !== emoji)
            : [...icons, emoji]) ?? [];
        setIcons(next);
        reshape({ icons: next });
    }, [icons, reshape]);

    const handleTagAdd = useCallback((tagObj: TagObj) => {
        if (tags.some(t => t.text === tagObj.text)) return;
        const next = cleanMindMapTagObjects([...tags, tagObj]) ?? [];
        setTags(next);
        reshape({ tags: next });
    }, [tags, reshape]);

    const handleTagRemove = useCallback((text: string) => {
        const next = cleanMindMapTagObjects(tags.filter(t => t.text !== text)) ?? [];
        setTags(next);
        reshape({ tags: next });
    }, [tags, reshape]);

    const handleTagInputConfirm = useCallback(() => {
        const t = tagInput.trim();
        if (!t) return;
        handleTagAdd({ text: t, style: { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' } });
        setTagInput('');
    }, [tagInput, handleTagAdd]);

    const updateTask = useCallback((patch: Partial<MindMapTaskMeta>) => {
        const draft = {
            ...node,
            tags: [...(node.tags ?? [])],
            task: { ...(extendedNode.task ?? {}) },
        } as ExtendedMindMapNode;
        const next = applyTaskMeta(draft, patch);
        setTaskStatus(next.status ?? 'todo');
        setTaskPriority(next.priority ?? '无');
        setTaskDueDate(next.dueDate ?? '');
        setTaskAssignee(next.assignee ?? '');
        setTaskProgress(next.progress ?? 0);
        reshape({ task: draft.task, tags: draft.tags });
    }, [extendedNode, node, reshape]);

    const isRoot = !node.parent;

    // AI expand state
    const [aiExpanding, setAiExpanding] = useState(false);
    const [aiSummarizing, setAiSummarizing] = useState(false);
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
        } catch (e: unknown) {
            setAiError(errorMessage(e, '未知错误'));
        } finally {
            setAiExpanding(false);
        }
    }, [mind, node, aiExpanding]);

    const handleAISummarize = useCallback(async () => {
        if (!mind || aiSummarizing || !node.children?.length) return;
        setAiSummarizing(true);
        setAiError('');
        try {
            const childrenTopics = node.children.map(child => child.topic || '');
            const result = await summarizeNodeWithAI(node.topic, childrenTopics);
            if ('error' in result) {
                setAiError(result.error);
                setAiSuggestions(['error']);
            } else if (result.topic && result.topic !== node.topic) {
                const tpcEl = mind.findEle(node.id);
                if (tpcEl) {
                    mind.setNodeTopic(tpcEl, cleanMindMapTopic(result.topic));
                }
            }
        } catch (e: unknown) {
            setAiError(errorMessage(e, '归纳失败'));
            setAiSuggestions(['error']);
        } finally {
            setAiSummarizing(false);
        }
    }, [mind, node, aiSummarizing]);

    const handleAIApply = useCallback(async (topic: string) => {
        if (!mind) return;
        try {
            const tpcEl = mind.findEle(node.id);
            if (!tpcEl) return;
            mind.selectNode(tpcEl);
            await mind.addChild(tpcEl, cleanMindMapChildNode({ label: topic }, mind.generateNewObj?.().id ?? `n_${Date.now()}`));
        } catch (e) { logMindmapPropertyAiAddChildFailure(e); }

    }, [mind, node]);

    return (
        <div style={{ padding: '12px 16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>

                <Text strong style={{ fontSize: 13 }}>{isRoot ? '📍 根节点' : '📝 节点属性'}</Text>
                <Space size={2}>
                    <Tooltip title="添加子节点 (Tab)">
                        <Button size="small" type="text" icon={<PlusOutlined />}
                            onClick={() => {
                                try {
                                    const el = mind?.findEle(node.id);
                                    if (el) { mind!.selectNode(el); mind!.addChild(el, cleanMindMapChildNode()); }
                                } catch (error) {
                                    logMindmapPropertyQuickActionFailure('addChild', error);
                                }
                            }} />
                    </Tooltip>
                    {!isRoot && <Tooltip title="添加兄弟节点 (Enter)">
                        <Button size="small" type="text" icon={<PlusOutlined rotate={90} />}
                            onClick={() => {
                                try {
                                    const el = mind?.findEle(node.id);
                                    if (el) { mind!.selectNode(el); mind!.insertSibling('after', el, cleanMindMapChildNode()); }
                                } catch (error) {
                                    logMindmapPropertyQuickActionFailure('addSibling', error);
                                }
                            }} />
                    </Tooltip>}
                    {!isRoot && <Tooltip title="删除节点 (Delete)">
                        <Button size="small" type="text" danger icon={<DeleteOutlined />}
                            onClick={() => {
                                try {
                                    const el = mind?.findEle(node.id);
                                    if (el) { mind!.selectNode(el); mind!.removeNodes([el]); }
                                } catch (error) {
                                    logMindmapPropertyQuickActionFailure('removeNode', error);
                                }
                            }} />
                    </Tooltip>}
                </Space>
            </div>

            <Button size="small" type="dashed" icon={<EditOutlined />}
                onClick={() => {
                    try {
                        const el = mind?.findEle(node.id);
                        if (el) mind?.beginEdit(el);
                    } catch (error) {
                        logMindmapPropertyQuickActionFailure('beginEdit', error);
                    }
                }}
                style={{ width: '100%', marginBottom: 8 }}>
                双击画布编辑文字 (F2)
            </Button>

            {/* AI Expand & AI Summarize */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                <Popover
                    trigger="click"
                    placement="left"
                    open={aiSuggestions.length > 0 || !!aiError}
                    onOpenChange={v => { if (!v) { setAiSuggestions([]); setAiError(''); } }}
                    title={<span style={{ fontSize: 12 }}>🤖 AI 建议子主题（点击添加）</span>}
                    content={
                        <div style={{ width: 220 }}>
                            {aiError && <div style={{ color: '#ef4444', fontSize: 12 }}>{aiError}</div>}
                            {aiSuggestions.map(s => {
                                if (s === 'error') return null;
                                return (
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
                                );
                            })}
                        </div>
                    }
                >
                    <Button size="small" type="primary" ghost icon={<RobotOutlined />}
                        onClick={handleAIExpand} loading={aiExpanding}
                        style={{ width: '100%' }}>
                        AI 扩展子主题
                    </Button>
                </Popover>

                {node.children && node.children.length > 0 && (
                    <Button size="small" type="dashed" icon={<RobotOutlined />}
                        onClick={handleAISummarize} loading={aiSummarizing}
                        style={{ width: '100%' }}>
                        AI 智能归纳节点
                    </Button>
                )}
            </div>

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
                                border: `1px solid ${tagBorderColor(pt)}`,
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

            <Row label="任务状态">
                <Select
                    size="small"
                    value={taskStatus}
                    options={TASK_STATUS_OPTIONS}
                    onChange={value => updateTask({ status: value })}
                    style={{ width: '100%' }}
                />
            </Row>

            <Row label="任务优先级">
                <Select
                    size="small"
                    value={taskPriority}
                    options={TASK_PRIORITY_OPTIONS}
                    onChange={value => updateTask({ priority: value })}
                    style={{ width: '100%' }}
                />
            </Row>

            <Row label="任务负责人">
                <Input
                    size="small"
                    value={taskAssignee}
                    placeholder="负责人"
                    onChange={e => setTaskAssignee(e.target.value)}
                    onBlur={() => updateTask({ assignee: taskAssignee.trim() })}
                    onPressEnter={() => updateTask({ assignee: taskAssignee.trim() })}
                />
            </Row>

            <Row label="截止日期">
                <Input
                    size="small"
                    type="date"
                    value={taskDueDate}
                    onChange={e => {
                        setTaskDueDate(e.target.value);
                        updateTask({ dueDate: e.target.value });
                    }}
                />
            </Row>

            <Row label="任务进度">
                <InputNumber
                    min={0}
                    max={100}
                    value={taskProgress}
                    suffix="%"
                    style={{ width: '100%' }}
                    onChange={value => updateTask({ progress: value ?? 0 })}
                />
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

            {/* Node shape */}
            <Row label="节点形状">
                <div style={{ display: 'flex', gap: 5 }}>
                    {[
                        { key: '',          label: '默认', preview: '▭' },
                        { key: 'oval',      label: '椭圆', preview: '◡' },
                        { key: 'rect',      label: '矩形', preview: '□' },
                        { key: 'underline', label: '下划线', preview: '□̲' },
                        { key: 'diamond',   label: '菱形', preview: '◇' },
                    ].map(({ key, label, preview }) => (
                        <button key={key || 'default'}
                            title={label}
                            onClick={() => {
                                setShapeClass(key);
                                reshape({ shapeClass: key || undefined });
                            }}
                            style={{
                                flex: 1, padding: '4px 2px', borderRadius: 6, cursor: 'pointer',
                                fontSize: 16, textAlign: 'center',
                                border: shapeClass === key
                                    ? '2px solid #6366f1'
                                    : '1px solid rgba(255,255,255,0.1)',
                                background: shapeClass === key
                                    ? 'rgba(99,102,241,0.15)'
                                    : 'rgba(255,255,255,0.04)',
                                color: shapeClass === key ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
                                transition: 'all 0.12s',
                            }}>
                            <div style={{ fontSize: 16, lineHeight: 1 }}>{preview}</div>
                            <div style={{ fontSize: 9, marginTop: 2, opacity: 0.7 }}>{label}</div>
                        </button>
                    ))}
                </div>
            </Row>

            {/* Branch line width */}
            <Row label="连线宽度">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[0, 1, 2, 4, 6].map(w => (
                        <button key={w}
                            title={w === 0 ? '默认' : `${w}px`}
                            onClick={() => { setBranchWidth(w); reshape({ branchWidth: w || undefined }); }}
                            style={{
                                flex: 1, height: 28, borderRadius: 5, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: branchWidth === w ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                                background: branchWidth === w ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                                transition: 'all 0.12s',
                            }}>
                            <div style={{
                                height: w === 0 ? 1.5 : Math.min(w, 6),
                                width: '80%',
                                background: branchWidth === w ? '#6366f1' : 'rgba(255,255,255,0.4)',
                                borderRadius: 3,
                            }} />
                        </button>
                    ))}
                </div>
            </Row>

            <Divider style={{ margin: '10px 0' }} />

            {/* HyperLink */}
            <Row label="超链接">
                <Input prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
                    placeholder="https://..." value={hyperLink} size="small"
                    onChange={e => setHyperLink(e.target.value)}
                    onBlur={saveHyperLink}
                    onPressEnter={saveHyperLink} />
            </Row>

            {/* Note */}
            <Row label="备注">
                <TextArea placeholder="添加备注..." value={note}
                    onChange={e => setNote(e.target.value)}
                    onBlur={() => {
                        const cleanNote = cleanMindMapNote(note);
                        setNote(cleanNote ?? '');
                        reshape({ note: cleanNote });
                    }}
                    autoSize={{ minRows: 2, maxRows: 5 }} style={{ fontSize: 12 }} />
            </Row>

            {/* Image — URL input + local file upload */}
            <Row label="节点图片">
                <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
                    <Input prefix={<span style={{ fontSize: 11, color: '#94a3b8' }}>🖼️</span>}
                        placeholder="https://... 或点击上传" value={imageUrl} size="small"
                        style={{ flex: 1 }}
                        onChange={e => setImageUrl(e.target.value)}
                        onBlur={saveImageUrl}
                        onPressEnter={saveImageUrl} />
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
                                const importError = getImageFileImportError(file, IMAGE_DATA_URL_IMPORT_MAX_BYTES);
                                if (importError) {
                                    logMindmapPropertyImageUploadRejected(importError);
                                    e.target.value = '';
                                    return;
                                }
                                const reader = new FileReader();
                                reader.onload = ev => {
                                    const dataUrl = ev.target?.result as string;
                                    const safeUrl = dataUrl ? toSafeImageUrl(dataUrl) : null;
                                    if (!safeUrl) return;
                                    setImageUrl(safeUrl);
                                    reshape({ image: { url: safeUrl, width: 160, height: 100, fit: 'contain' } });
                                };
                                reader.readAsDataURL(file);
                                e.target.value = '';
                            }} />
                    </label>
                </div>
                {toSafeImageUrl(imageUrl) && (
                    <div style={{ marginTop: 2, borderRadius: 6, overflow: 'hidden',
                        border: '1px solid rgba(99,102,241,0.15)', position: 'relative' }}>
                        <img src={toSafeImageUrl(imageUrl)!} alt="预览"
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
