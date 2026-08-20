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
    MinusOutlined, RadiusSettingOutlined, SelectOutlined, TagsOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { NodeObj, TagObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import {
    applyTaskMeta,
    getTaskMeta,
    type MindMapTaskMeta,
    type TaskPriority,
    type TaskStatus,
} from './mindmapTaskModel';
import { toSafeImageUrl } from '../../utils/sanitizeHtml';
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
import { MindMapPropertyMediaControls } from './MindMapPropertyMediaControls';
import { MindMapPropertyLinkField } from './MindMapPropertyLinkField';
import { useMindMapNodeDeletion } from './useMindMapNodeDeletion';
import { useMindMapPropertyAI } from './useMindMapPropertyAI';
import styles from './MindMapPropertyPanel.module.css';

const { Text } = Typography;
const { TextArea } = Input;
type ExtendedMindMapNode = NodeObj & {
    shapeClass?: string;
    branchWidth?: number;
    task?: MindMapTaskMeta;
};
type MindMapNodePatch = Partial<NodeObj> & Partial<Pick<ExtendedMindMapNode, 'shapeClass' | 'branchWidth' | 'task'>>;

const propertyKey = (suffix: string): string => `plugins.mindmap.propertyPanel.${suffix}`;

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

    const ai = useMindMapPropertyAI({
        mind,
        node,
        translate: (key, values) => t(key, values),
    });

    return (
        <div className={styles.panel}>
            {/* Header */}
            <div className={styles.header}>

                <Text strong className={styles.title}>
                    {isRoot ? <ApartmentOutlined aria-hidden="true" /> : <FileTextOutlined aria-hidden="true" />}
                    {' '}{t(propertyKey(isRoot ? 'rootNode' : 'nodeProperties'))}
                </Text>
                <Space size={2}>
                    <Tooltip title={t(propertyKey('addChild'))}>
                        <Button size="small" type="text" icon={<PlusOutlined />}
                            aria-label={t(propertyKey('addChild'))}
                            onClick={() => {
                                try {
                                    const el = mind?.findEle(node.id);
                                    if (el) { mind!.selectNode(el); mind!.addChild(el, cleanMindMapChildNode()); }
                                } catch (error) {
                                    logMindmapPropertyQuickActionFailure('addChild', error);
                                }
                            }} />
                    </Tooltip>
                    {!isRoot && <Tooltip title={t(propertyKey('addSibling'))}>
                        <Button size="small" type="text" icon={<PlusOutlined rotate={90} />}
                            aria-label={t(propertyKey('addSibling'))}
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
                aria-label={t(propertyKey('editOnCanvas'))}
                onClick={() => {
                    try {
                        const el = mind?.findEle(node.id);
                        if (el) mind?.beginEdit(el);
                    } catch (error) {
                        logMindmapPropertyQuickActionFailure('beginEdit', error);
                    }
                }}
                className={styles.editAction}>
                {t(propertyKey('editOnCanvas'))}
            </Button>

            <MindMapPropertyAISection
                applyingTopic={ai.applyingTopic}
                error={ai.error}
                expanding={ai.expanding}
                hasChildren={Boolean(node.children?.length)}
                needsConfiguration={ai.needsConfiguration}
                status={ai.status}
                suggestions={ai.suggestions}
                summarizing={ai.summarizing}
                onApplySuggestion={topic => { void ai.applySuggestion(topic); }}
                onDismiss={ai.dismiss}
                onExpand={() => { void ai.expand(); }}
                onSummarize={() => { void ai.summarize(); }}
            />

            {/* Topic */}
            <Row label={t(propertyKey('nodeText'))}>
                <TextArea value={topic} onChange={e => setTopic(e.target.value)}
                    aria-label={t(propertyKey('nodeTextInput'))}
                    onBlur={handleTopicBlur}
                    onPressEnter={e => { e.preventDefault(); handleTopicBlur(); }}
                    autoSize={{ minRows: 1, maxRows: 4 }} className={styles.topicInput} />
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
            <Row label={t(propertyKey('tags'))}>
                <div className={styles.tagList}>
                    {tags.map(t => (
                        <Tag key={t.text} closable onClose={() => handleTagRemove(t.text)}
                            className={styles.tag} style={t.style as React.CSSProperties ?? {}}>
                            {t.text}
                        </Tag>
                    ))}
                </div>
                <div className={styles.tagList}>
                    {panelOptions.presetTags.map(pt => (
                        <button key={pt.text} onClick={() => handleTagAdd(pt)}
                            type="button"
                            aria-label={t(propertyKey('addPresetTag'), { tag: pt.text })}
                            disabled={tags.some(tag => tag.text === pt.text)}
                            className={styles.presetTagButton}
                            style={{ ...(pt.style as React.CSSProperties ?? {}),
                                border: `1px solid ${tagBorderColor(pt)}`,
                                opacity: tags.some(t => t.text === pt.text) ? 0.4 : 1 }}>
                            {pt.text}
                        </button>
                    ))}
                </div>
                <Input size="small" placeholder={t(propertyKey('customTagPlaceholder'))}
                    aria-label={t(propertyKey('customTagInput'))}
                    prefix={<TagsOutlined className={styles.mutedIcon} />}
                    value={tagInput} onChange={e => setTagInput(e.target.value)}
                    onPressEnter={handleTagInputConfirm}
                    onBlur={handleTagInputConfirm} />
            </Row>

            <Divider className={styles.divider} />

            <Row label={t(propertyKey('taskStatus'))}>
                <Select
                    aria-label={t(propertyKey('taskStatus'))}
                    size="small"
                    value={taskStatus}
                    options={panelOptions.taskStatuses}
                    onChange={value => updateTask({ status: value })}
                    className={styles.fullWidth}
                />
            </Row>

            <Row label={t(propertyKey('taskPriority'))}>
                <Select
                    aria-label={t(propertyKey('taskPriority'))}
                    size="small"
                    value={taskPriority}
                    options={panelOptions.taskPriorities}
                    onChange={value => updateTask({ priority: value })}
                    className={styles.fullWidth}
                />
            </Row>

            <Row label={t(propertyKey('taskAssignee'))}>
                <Input
                    aria-label={t(propertyKey('taskAssignee'))}
                    size="small"
                    value={taskAssignee}
                    placeholder={t(propertyKey('taskAssigneePlaceholder'))}
                    onChange={e => setTaskAssignee(e.target.value)}
                    onBlur={() => updateTask({ assignee: taskAssignee.trim() })}
                    onPressEnter={() => updateTask({ assignee: taskAssignee.trim() })}
                />
            </Row>

            <Row label={t(propertyKey('dueDate'))}>
                <Input
                    aria-label={t(propertyKey('dueDate'))}
                    size="small"
                    type="date"
                    value={taskDueDate}
                    onChange={e => {
                        setTaskDueDate(e.target.value);
                        updateTask({ dueDate: e.target.value });
                    }}
                />
            </Row>

            <Row label={t(propertyKey('taskProgress'))}>
                <InputNumber
                    aria-label={t(propertyKey('taskProgress'))}
                    min={0}
                    max={100}
                    value={taskProgress}
                    suffix="%"
                    className={styles.fullWidth}
                    onChange={value => updateTask({ progress: value ?? 0 })}
                />
            </Row>

            <Divider className={styles.divider} />

            {/* Font size */}
            <Row label={t(propertyKey('fontSize'))}>
                <InputNumber min={10} max={48} value={fontSize}
                    aria-label={t(propertyKey('fontSize'))}
                    onChange={v => { if (!v) return; setFontSize(v); reshape({ style: { ...node.style, fontSize: `${v}px` } }); }}
                    suffix="px" className={styles.fullWidth} prefix={<FontSizeOutlined />} />
            </Row>

            {/* Text color */}
            <Row label={t(propertyKey('textColor'))}>
                <ColorSwatch value={textColor} onChange={c => { setTextColor(c); reshape({ style: { ...node.style, color: c || undefined } }); }} withTransparent />
            </Row>

            {/* Background color */}
            <Row label={t(propertyKey('backgroundColor'))}>
                <ColorSwatch value={bgColor} onChange={c => { setBgColor(c); reshape({ style: { ...node.style, background: c || undefined } }); }} withTransparent />
            </Row>

            {/* Branch color */}
            <Row label={t(propertyKey('branchColor'))}>
                <ColorSwatch value={branchColor} onChange={c => { setBranchColor(c); reshape({ branchColor: c || undefined }); }} withTransparent />
            </Row>

            {/* Node shape */}
            <Row label={t(propertyKey('nodeShape'))}>
                <div className={styles.shapeList}>
                    {MIND_MAP_PROPERTY_SHAPES.map(({ key, translationKey, icon }) => {
                        const label = t(propertyKey(`shapes.${translationKey}`));
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
                            className={styles.shapeButton}>
                            <div aria-hidden="true" className={styles.shapeIcon}><PropertyShapeIcon icon={icon} /></div>
                            <div className={styles.shapeLabel}>{label}</div>
                        </button>
                    );})}
                </div>
            </Row>

            {/* Branch line width */}
            <Row label={t(propertyKey('branchWidth'))}>
                <div className={styles.branchList}>
                    {[0, 1, 2, 4, 6].map(w => (
                        <button key={w}
                            type="button"
                            title={w === 0 ? t(propertyKey('defaultValue')) : `${w}px`}
                            aria-label={t(propertyKey('branchWidthValue'), { value: w === 0 ? t(propertyKey('defaultValue')) : `${w}px` })}
                            aria-pressed={branchWidth === w}
                            onClick={() => { setBranchWidth(w); reshape({ branchWidth: w || undefined }); }}
                            className={styles.branchButton}>
                            <div style={{
                                height: w === 0 ? 1.5 : Math.min(w, 6),
                            }} className={styles.branchLine} />
                        </button>
                    ))}
                </div>
            </Row>

            <Divider className={styles.divider} />

            {/* HyperLink */}
            <Row label={t(propertyKey('hyperlink'))}>
                <MindMapPropertyLinkField
                    initialValue={node.hyperLink ?? ''}
                    invalidMessage={t(propertyKey('invalidHyperlink'))}
                    label={t(propertyKey('hyperlink'))}
                    onCommit={hyperLink => reshape({ hyperLink })}
                />
            </Row>

            {/* Note */}
            <Row label={t(propertyKey('note'))}>
                <TextArea placeholder={t(propertyKey('notePlaceholder'))} value={note}
                    aria-label={t(propertyKey('note'))}
                    onChange={e => setNote(e.target.value)}
                    onBlur={() => {
                        const cleanNote = cleanMindMapNote(note);
                        setNote(cleanNote ?? '');
                        reshape({ note: cleanNote });
                    }}
                    autoSize={{ minRows: 2, maxRows: 5 }} className={styles.noteInput} />
            </Row>

            <Divider className={styles.divider} />

            {/* Keyboard cheatsheet */}
            <div className={styles.shortcuts}>
                {MIND_MAP_PROPERTY_SHORTCUTS.map(shortcut => (
                    <div key={shortcut.key} className={styles.shortcut}>
                        <kbd className={styles.shortcutKey}>{shortcut.key}</kbd>
                        <span>{t(propertyKey(`shortcuts.${shortcut.translationKey}`))}</span>
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
        <div className={styles.scrollContainer}>
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
