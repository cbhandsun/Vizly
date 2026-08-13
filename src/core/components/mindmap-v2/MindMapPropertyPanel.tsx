/**
 * MindMapPropertyPanel.tsx — 节点属性面板 v3
 * 新增：Icons/Markers、Tags 彩色标签、BranchColor 连线颜色
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
    Input, InputNumber, Divider, Typography, Space, Button, Tooltip, Tag, Select,
} from 'antd';
import {
    FontSizeOutlined, DeleteOutlined, PlusOutlined, EditOutlined,
    ApartmentOutlined, BorderOutlined, FileTextOutlined, GatewayOutlined,
    LinkOutlined, MinusOutlined, RadiusSettingOutlined, SelectOutlined, TagsOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
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
import {
    cleanMindMapColor,
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
    logMindmapPropertyQuickActionFailure,
    logMindmapPropertyReshapeFailure,
    logMindmapPropertySetTopicFailure,
} from './mindmapPanelLogging';
import {
    CanvasPanel,
    ColorSwatch,
    PropertyRow as Row,
} from './MindMapPropertyPanelControls';
import {
    createMindMapPropertyPanelOptions,
    MIND_MAP_PROPERTY_SHAPES,
    MIND_MAP_PROPERTY_SHORTCUTS,
} from './mindMapPropertyPanelOptions';
import { updateMindMapNodePatchAndRestoreSelection } from './mindMapNodeMutation';
import { useMindMapPropertySelection } from './useMindMapPropertySelection';
import { MindMapPropertyAISection } from './MindMapPropertyAISection';
import { isMindMapAIConfigurationError } from './mindMapAIErrorPresentation';
import { presentMindMapPropertyAIError } from './mindMapPropertyAIError';
import { MindMapPropertyMediaControls } from './MindMapPropertyMediaControls';
import { useMindMapNodeDeletion } from './useMindMapNodeDeletion';

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

const PropertyShapeIcon: React.FC<{ icon: typeof MIND_MAP_PROPERTY_SHAPES[number]['icon'] }> = ({ icon }) => {
    switch (icon) {
        case 'oval': return <RadiusSettingOutlined />;
        case 'rect': return <BorderOutlined />;
        case 'underline': return <MinusOutlined />;
        case 'diamond': return <GatewayOutlined />;
        default: return <SelectOutlined />;
    }
};

// ─── Node Property Panel ───────────────────────────────────────────────────────
const NodePropertyPanel: React.FC<{
    node: NodeObj;
    onRequestDelete: (node: NodeObj) => void;
}> = ({ node, onRequestDelete }) => {
    const { t } = useTranslation();
    const panelOptions = createMindMapPropertyPanelOptions(t);
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
            if (!tpcEl) return;
            void updateMindMapNodePatchAndRestoreSelection(
                mind,
                tpcEl,
                node,
                patch as Partial<NodeObj> & Record<string, unknown>,
            ).catch(logMindmapPropertyReshapeFailure);
        } catch (e) { logMindmapPropertyReshapeFailure(e); }
    }, [mind, node]);

    const applyImageUrl = useCallback((url: string) => {
        const safeUrl = toSafeImageUrl(url);
        setImageUrl(safeUrl ?? '');
        reshape({ image: safeUrl ? { url: safeUrl, width: 160, height: 100, fit: 'contain' } : undefined });
    }, [reshape]);

    const saveImageUrl = useCallback((): boolean => {
        const safeUrl = toSafeImageUrl(imageUrl);
        if (imageUrl.trim() && !safeUrl) return false;
        applyImageUrl(safeUrl ?? '');
        return true;
    }, [applyImageUrl, imageUrl]);

    const saveHyperLink = () => {
        const safeUrl = toSafeExternalUrl(hyperLink);
        setHyperLink(safeUrl ?? '');
        reshape({ hyperLink: safeUrl ?? undefined });
    };

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

    const handleTagInputConfirm = () => {
        const t = tagInput.trim();
        if (!t) return;
        handleTagAdd({ text: t, style: { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' } });
        setTagInput('');
    };

    const updateTask = (patch: Partial<MindMapTaskMeta>) => {
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
    };

    const isRoot = !node.parent;

    // AI expand state
    const [aiExpanding, setAiExpanding] = useState(false);
    const [aiSummarizing, setAiSummarizing] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiError, setAiError] = useState('');
    const [aiStatus, setAiStatus] = useState('');
    const [aiApplyingTopic, setAiApplyingTopic] = useState<string | null>(null);
    const [aiNeedsConfiguration, setAiNeedsConfiguration] = useState(false);

    const handleAIExpand = useCallback(async () => {
        if (!mind || aiExpanding) return;
        setAiExpanding(true);
        setAiSuggestions([]);
        setAiError('');
        setAiStatus('');
        setAiNeedsConfiguration(false);
        try {
            const data = mind.getData();
            const ancestorPath = getAncestorPath(data.nodeData, node.id);
            const mapTitle = data.nodeData.topic;
            const result = await expandNodeWithAI({ node, ancestorPath, count: 5, mapTitle });
            if (result.error) {
                setAiNeedsConfiguration(isMindMapAIConfigurationError(result.error));
                setAiError(presentMindMapPropertyAIError(result.error, key => t(key)));
            }
            else {
                const suggestions = [...new Set(result.topics)];
                setAiSuggestions(suggestions);
                setAiStatus(t('plugins.mindmap.propertyAI.generated', { count: suggestions.length }));
            }
        } catch (e: unknown) {
            setAiError(errorMessage(e, t('plugins.mindmap.propertyAI.expandFailed')));
        } finally {
            setAiExpanding(false);
        }
    }, [mind, node, aiExpanding, t]);

    const handleAISummarize = useCallback(async () => {
        if (!mind || aiSummarizing || !node.children?.length) return;
        setAiSummarizing(true);
        setAiError('');
        setAiStatus('');
        setAiNeedsConfiguration(false);
        try {
            const childrenTopics = node.children.map(child => child.topic || '');
            const result = await summarizeNodeWithAI(node.topic, childrenTopics);
            if ('error' in result) {
                setAiNeedsConfiguration(isMindMapAIConfigurationError(result.error));
                setAiError(presentMindMapPropertyAIError(result.error, key => t(key)));
            } else if (result.topic && result.topic !== node.topic) {
                const tpcEl = mind.findEle(node.id);
                if (tpcEl) {
                    mind.setNodeTopic(tpcEl, cleanMindMapTopic(result.topic));
                    setAiStatus(t('plugins.mindmap.propertyAI.summaryUpdated'));
                }
            } else {
                setAiStatus(t('plugins.mindmap.propertyAI.summaryUnchanged'));
            }
        } catch (e: unknown) {
            setAiError(errorMessage(e, t('plugins.mindmap.propertyAI.summarizeFailed')));
        } finally {
            setAiSummarizing(false);
        }
    }, [mind, node, aiSummarizing, t]);

    const handleAIApply = useCallback(async (topic: string) => {
        if (!mind || aiApplyingTopic) return;
        setAiApplyingTopic(topic);
        setAiError('');
        setAiStatus('');
        setAiNeedsConfiguration(false);
        try {
            const tpcEl = mind.findEle(node.id);
            if (!tpcEl) {
                setAiError(t('plugins.mindmap.propertyAI.applyUnavailable'));
                return;
            }
            mind.selectNode(tpcEl);
            await mind.addChild(tpcEl, cleanMindMapChildNode({ label: topic }, mind.generateNewObj?.().id ?? `n_${Date.now()}`));
            setAiSuggestions(current => current.filter(suggestion => suggestion !== topic));
            setAiStatus(t('plugins.mindmap.propertyAI.applied', { topic }));
        } catch (e) {
            logMindmapPropertyAiAddChildFailure(e);
            setAiError(t('plugins.mindmap.propertyAI.applyFailed'));
        } finally {
            setAiApplyingTopic(null);
        }

    }, [aiApplyingTopic, mind, node, t]);

    return (
        <div style={{ padding: '12px 16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>

                <Text strong style={{ fontSize: 13 }}>
                    {isRoot ? <ApartmentOutlined aria-hidden="true" /> : <FileTextOutlined aria-hidden="true" />}
                    {' '}{t(isRoot ? 'plugins.mindmap.propertyPanel.rootNode' : 'plugins.mindmap.propertyPanel.nodeProperties')}
                </Text>
                <Space size={2}>
                    <Tooltip title={t('plugins.mindmap.propertyPanel.addChild')}>
                        <Button size="small" type="text" icon={<PlusOutlined />}
                            aria-label={t('plugins.mindmap.propertyPanel.addChild')}
                            onClick={() => {
                                try {
                                    const el = mind?.findEle(node.id);
                                    if (el) { mind!.selectNode(el); mind!.addChild(el, cleanMindMapChildNode()); }
                                } catch (error) {
                                    logMindmapPropertyQuickActionFailure('addChild', error);
                                }
                            }} />
                    </Tooltip>
                    {!isRoot && <Tooltip title={t('plugins.mindmap.propertyPanel.addSibling')}>
                        <Button size="small" type="text" icon={<PlusOutlined rotate={90} />}
                            aria-label={t('plugins.mindmap.propertyPanel.addSibling')}
                            onClick={() => {
                                try {
                                    const el = mind?.findEle(node.id);
                                    if (el) { mind!.selectNode(el); mind!.insertSibling('after', el, cleanMindMapChildNode()); }
                                } catch (error) {
                                    logMindmapPropertyQuickActionFailure('addSibling', error);
                                }
                            }} />
                    </Tooltip>}
                    {!isRoot && <Tooltip title={t('plugins.mindmap.actions.deleteNode')}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />}
                            aria-label={t('plugins.mindmap.actions.deleteNode')}
                            onClick={() => onRequestDelete(node)} />
                    </Tooltip>}
                </Space>
            </div>

            <Button size="small" type="dashed" icon={<EditOutlined />}
                aria-label={t('plugins.mindmap.propertyPanel.editOnCanvas')}
                onClick={() => {
                    try {
                        const el = mind?.findEle(node.id);
                        if (el) mind?.beginEdit(el);
                    } catch (error) {
                        logMindmapPropertyQuickActionFailure('beginEdit', error);
                    }
                }}
                style={{ width: '100%', marginBottom: 8 }}>
                {t('plugins.mindmap.propertyPanel.editOnCanvas')}
            </Button>

            <MindMapPropertyAISection
                applyingTopic={aiApplyingTopic}
                error={aiError}
                expanding={aiExpanding}
                hasChildren={Boolean(node.children?.length)}
                needsConfiguration={aiNeedsConfiguration}
                status={aiStatus}
                suggestions={aiSuggestions}
                summarizing={aiSummarizing}
                onApplySuggestion={topic => { void handleAIApply(topic); }}
                onDismiss={() => { setAiSuggestions([]); setAiError(''); setAiNeedsConfiguration(false); }}
                onExpand={() => { void handleAIExpand(); }}
                onSummarize={() => { void handleAISummarize(); }}
            />

            {/* Topic */}
            <Row label={t('plugins.mindmap.propertyPanel.nodeText')}>
                <TextArea value={topic} onChange={e => setTopic(e.target.value)}
                    aria-label={t('plugins.mindmap.propertyPanel.nodeTextInput')}
                    onBlur={handleTopicBlur}
                    onPressEnter={e => { e.preventDefault(); handleTopicBlur(); }}
                    autoSize={{ minRows: 1, maxRows: 4 }} style={{ fontSize: 13 }} />
            </Row>

            <MindMapPropertyMediaControls
                key={node.id}
                icons={icons}
                imageUrl={imageUrl}
                onIconToggle={handleIconToggle}
                onImageChange={applyImageUrl}
                onImageUrlCommit={saveImageUrl}
                onImageUrlInput={setImageUrl}
            />

            {/* Tags */}
            <Row label={t('plugins.mindmap.propertyPanel.tags')}>
                <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {tags.map(t => (
                        <Tag key={t.text} closable onClose={() => handleTagRemove(t.text)}
                            style={{ ...(t.style as React.CSSProperties ?? {}), margin: 0 }}>
                            {t.text}
                        </Tag>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {panelOptions.presetTags.map(pt => (
                        <button key={pt.text} onClick={() => handleTagAdd(pt)}
                            type="button"
                            aria-label={t('plugins.mindmap.propertyPanel.addPresetTag', { tag: pt.text })}
                            disabled={tags.some(tag => tag.text === pt.text)}
                            style={{ ...(pt.style as React.CSSProperties ?? {}),
                                border: `1px solid ${tagBorderColor(pt)}`,
                                borderRadius: 4, fontSize: 11, padding: '1px 7px',
                                cursor: 'pointer', opacity: tags.some(t => t.text === pt.text) ? 0.4 : 1 }}>
                            {pt.text}
                        </button>
                    ))}
                </div>
                <Input size="small" placeholder={t('plugins.mindmap.propertyPanel.customTagPlaceholder')}
                    aria-label={t('plugins.mindmap.propertyPanel.customTagInput')}
                    prefix={<TagsOutlined style={{ color: '#94a3b8' }} />}
                    value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onPressEnter={handleTagInputConfirm}
                    onBlur={handleTagInputConfirm} />
            </Row>

            <Divider style={{ margin: '10px 0' }} />

            <Row label={t('plugins.mindmap.propertyPanel.taskStatus')}>
                <Select
                    aria-label={t('plugins.mindmap.propertyPanel.taskStatus')}
                    size="small"
                    value={taskStatus}
                    options={panelOptions.taskStatuses}
                    onChange={value => updateTask({ status: value })}
                    style={{ width: '100%' }}
                />
            </Row>

            <Row label={t('plugins.mindmap.propertyPanel.taskPriority')}>
                <Select
                    aria-label={t('plugins.mindmap.propertyPanel.taskPriority')}
                    size="small"
                    value={taskPriority}
                    options={panelOptions.taskPriorities}
                    onChange={value => updateTask({ priority: value })}
                    style={{ width: '100%' }}
                />
            </Row>

            <Row label={t('plugins.mindmap.propertyPanel.taskAssignee')}>
                <Input
                    aria-label={t('plugins.mindmap.propertyPanel.taskAssignee')}
                    size="small"
                    value={taskAssignee}
                    placeholder={t('plugins.mindmap.propertyPanel.taskAssigneePlaceholder')}
                    onChange={e => setTaskAssignee(e.target.value)}
                    onBlur={() => updateTask({ assignee: taskAssignee.trim() })}
                    onPressEnter={() => updateTask({ assignee: taskAssignee.trim() })}
                />
            </Row>

            <Row label={t('plugins.mindmap.propertyPanel.dueDate')}>
                <Input
                    aria-label={t('plugins.mindmap.propertyPanel.dueDate')}
                    size="small"
                    type="date"
                    value={taskDueDate}
                    onChange={e => {
                        setTaskDueDate(e.target.value);
                        updateTask({ dueDate: e.target.value });
                    }}
                />
            </Row>

            <Row label={t('plugins.mindmap.propertyPanel.taskProgress')}>
                <InputNumber
                    aria-label={t('plugins.mindmap.propertyPanel.taskProgress')}
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
            <Row label={t('plugins.mindmap.propertyPanel.fontSize')}>
                <InputNumber min={10} max={48} value={fontSize}
                    aria-label={t('plugins.mindmap.propertyPanel.fontSize')}
                    onChange={v => { if (!v) return; setFontSize(v); reshape({ style: { ...node.style, fontSize: `${v}px` } }); }}
                    suffix="px" style={{ width: '100%' }} prefix={<FontSizeOutlined />} />
            </Row>

            {/* Text color */}
            <Row label={t('plugins.mindmap.propertyPanel.textColor')}>
                <ColorSwatch value={textColor} onChange={c => { setTextColor(c); reshape({ style: { ...node.style, color: c || undefined } }); }} withTransparent />
            </Row>

            {/* Background color */}
            <Row label={t('plugins.mindmap.propertyPanel.backgroundColor')}>
                <ColorSwatch value={bgColor} onChange={c => { setBgColor(c); reshape({ style: { ...node.style, background: c || undefined } }); }} withTransparent />
            </Row>

            {/* Branch color */}
            <Row label={t('plugins.mindmap.propertyPanel.branchColor')}>
                <ColorSwatch value={branchColor} onChange={c => { setBranchColor(c); reshape({ branchColor: c || undefined }); }} withTransparent />
            </Row>

            {/* Node shape */}
            <Row label={t('plugins.mindmap.propertyPanel.nodeShape')}>
                <div style={{ display: 'flex', gap: 5 }}>
                    {MIND_MAP_PROPERTY_SHAPES.map(({ key, translationKey, icon }) => {
                        const label = t(`plugins.mindmap.propertyPanel.shapes.${translationKey}`);
                        return (
                        <button key={key || 'default'}
                            title={label}
                            type="button"
                            aria-label={label}
                            aria-pressed={shapeClass === key}
                            onClick={() => {
                                setShapeClass(key);
                                reshape({ shapeClass: key || undefined });
                            }}
                            style={{
                                flex: 1, padding: '4px 2px', borderRadius: 6, cursor: 'pointer',
                                fontSize: 16, textAlign: 'center',
                                border: shapeClass === key
                                    ? '2px solid #6366f1'
                                    : '1px solid #cbd5e1',
                                background: shapeClass === key
                                    ? 'rgba(99,102,241,0.15)'
                                    : '#f8fafc',
                                color: shapeClass === key ? '#4338ca' : '#475569',
                                transition: 'all 0.12s',
                            }}>
                            <div aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}><PropertyShapeIcon icon={icon} /></div>
                            <div style={{ fontSize: 10.5, marginTop: 3 }}>{label}</div>
                        </button>
                    );})}
                </div>
            </Row>

            {/* Branch line width */}
            <Row label={t('plugins.mindmap.propertyPanel.branchWidth')}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {[0, 1, 2, 4, 6].map(w => (
                        <button key={w}
                            type="button"
                            title={w === 0 ? t('plugins.mindmap.propertyPanel.defaultValue') : `${w}px`}
                            aria-label={t('plugins.mindmap.propertyPanel.branchWidthValue', { value: w === 0 ? t('plugins.mindmap.propertyPanel.defaultValue') : `${w}px` })}
                            aria-pressed={branchWidth === w}
                            onClick={() => { setBranchWidth(w); reshape({ branchWidth: w || undefined }); }}
                            style={{
                                flex: 1, height: 28, borderRadius: 5, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: branchWidth === w ? '2px solid #6366f1' : '1px solid #cbd5e1',
                                background: branchWidth === w ? 'rgba(99,102,241,0.12)' : '#f8fafc',
                                transition: 'all 0.12s',
                            }}>
                            <div style={{
                                height: w === 0 ? 1.5 : Math.min(w, 6),
                                width: '80%',
                                background: branchWidth === w ? '#4f46e5' : '#64748b',
                                borderRadius: 3,
                            }} />
                        </button>
                    ))}
                </div>
            </Row>

            <Divider style={{ margin: '10px 0' }} />

            {/* HyperLink */}
            <Row label={t('plugins.mindmap.propertyPanel.hyperlink')}>
                <Input prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
                    aria-label={t('plugins.mindmap.propertyPanel.hyperlink')}
                    placeholder="https://..." value={hyperLink} size="small"
                    onChange={e => setHyperLink(e.target.value)}
                    onBlur={saveHyperLink}
                    onPressEnter={saveHyperLink} />
            </Row>

            {/* Note */}
            <Row label={t('plugins.mindmap.propertyPanel.note')}>
                <TextArea placeholder={t('plugins.mindmap.propertyPanel.notePlaceholder')} value={note}
                    aria-label={t('plugins.mindmap.propertyPanel.note')}
                    onChange={e => setNote(e.target.value)}
                    onBlur={() => {
                        const cleanNote = cleanMindMapNote(note);
                        setNote(cleanNote ?? '');
                        reshape({ note: cleanNote });
                    }}
                    autoSize={{ minRows: 2, maxRows: 5 }} style={{ fontSize: 12 }} />
            </Row>

            <Divider style={{ margin: '10px 0' }} />

            {/* Keyboard cheatsheet */}
            <div style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.1)',
                borderRadius: 8, padding: '8px 12px', fontSize: 11.5, color: 'rgba(0,0,0,0.5)', lineHeight: 2 }}>
                {MIND_MAP_PROPERTY_SHORTCUTS.map(shortcut => (
                    <div key={shortcut.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <kbd style={{ display: 'inline-block', padding: '1px 5px', background: '#f1f5f9',
                            border: '1px solid #e2e8f0', borderBottom: '2px solid #cbd5e1',
                            borderRadius: 4, fontSize: 10.5, fontFamily: 'monospace',
                            color: '#475569', minWidth: 40, textAlign: 'center' }}>{shortcut.key}</kbd>
                        <span>{t(`plugins.mindmap.propertyPanel.shortcuts.${shortcut.translationKey}`)}</span>
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
    const [, setTick] = useState(0);
    useEffect(() => subscribeMindElixir(() => setTick(t => t + 1)), []);
    const mind = getMindElixirInstance();
    const selectedNode = useMindMapPropertySelection(mind);
    const { deleteDialog, requestDelete } = useMindMapNodeDeletion({
        mind,
        onFailure: error => logMindmapPropertyQuickActionFailure('removeNode', error),
    });

    return (
        <div style={{ height: '100%', overflowY: 'auto' }}>
            {selectedNode
                ? <NodePropertyPanel
                    key={selectedNode.id}
                    node={selectedNode}
                    onRequestDelete={requestDelete}
                />
                : <CanvasPanel activeTheme={activeTheme} onThemeChange={onThemeChange} />}
            {deleteDialog}
        </div>
    );
};

export default MindMapPropertyPanel;
