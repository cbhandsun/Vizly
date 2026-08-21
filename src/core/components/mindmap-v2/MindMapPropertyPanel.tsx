/**
 * MindMapPropertyPanel.tsx — 节点属性面板 v3
 * 新增：Icons/Markers、Tags 彩色标签、BranchColor 连线颜色
 */
import React, { useCallback, useEffect, useId, useState } from 'react';
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
    type MindMapTaskMeta,
} from './mindmapTaskModel';
import { toSafeImageUrl } from '../../utils/sanitizeHtml';
import {
    cleanMindMapColor,
    cleanMindMapTagObjects,
} from './mindmapNodePatchSecurity';
import {
    cleanMindMapIcons,
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
    coerceMindMapPropertyBranchWidth,
    coerceMindMapPropertyShape,
    createMindMapPropertyPanelOptions,
    MIND_MAP_PROPERTY_BRANCH_WIDTHS,
    MIND_MAP_PROPERTY_SHAPES,
    MIND_MAP_PROPERTY_SHORTCUTS,
} from './mindMapPropertyPanelOptions';
import { updateMindMapNodePatchAndRestoreSelection } from './mindMapNodeMutation';
import { useMindMapPropertySelection } from './useMindMapPropertySelection';
import { MindMapPropertyAISection } from './MindMapPropertyAISection';
import { MindMapPropertyMediaControls } from './MindMapPropertyMediaControls';
import { MindMapPropertyLinkField } from './MindMapPropertyLinkField';
import { MindMapPropertyNoteField } from './MindMapPropertyNoteField';
import { useMindMapNodeDeletion } from './useMindMapNodeDeletion';
import { useMindMapPropertyAI } from './useMindMapPropertyAI';
import { useRecoverableMindMapPropertyChoice } from './useRecoverableMindMapPropertyChoice';
import { useRecoverableMindMapPropertyTaskTransaction } from './useRecoverableMindMapPropertyTaskTransaction';
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
    const [imageUrl, setImageUrl] = useState(node.image?.url ?? '');
    const [icons, setIcons] = useState<string[]>(cleanMindMapIcons(node.icons) ?? []);
    const [tagInput, setTagInput] = useState('');

    const [syncedNodeId, setSyncedNodeId] = useState(node.id);
    if (syncedNodeId !== node.id) {
        setSyncedNodeId(node.id);
        setTopic(cleanMindMapTopic(node.topic, ''));
        setFontSize(parseFontSize(node));
        setImageUrl(node.image?.url ?? '');
        setIcons(cleanMindMapIcons(node.icons) ?? []);
    }

    const reshapeWithResult = useCallback(async (patch: MindMapNodePatch): Promise<boolean> => {
        if (!mind) return false;
        try {
            const tpcEl = mind.findEle(node.id);
            if (!tpcEl) return false;
            await updateMindMapNodePatchAndRestoreSelection(
                mind,
                tpcEl,
                node,
                patch as Partial<NodeObj> & Record<string, unknown>,
            );
            return true;
        } catch (e) {
            logMindmapPropertyReshapeFailure(e);
            return false;
        }
    }, [mind, node]);

    const reshape = useCallback((patch: MindMapNodePatch) => {
        void reshapeWithResult(patch);
    }, [reshapeWithResult]);

    const shapeChoice = useRecoverableMindMapPropertyChoice({
        failureMessage: t(propertyKey('shapeSaveFailed')),
        initialValue: coerceMindMapPropertyShape(extendedNode.shapeClass),
        onCommit: shapeClass => reshapeWithResult({ shapeClass: shapeClass || undefined }),
        sourceKey: node.id,
    });
    const branchWidthChoice = useRecoverableMindMapPropertyChoice({
        failureMessage: t(propertyKey('branchWidthSaveFailed')),
        initialValue: coerceMindMapPropertyBranchWidth(extendedNode.branchWidth),
        onCommit: branchWidth => reshapeWithResult({ branchWidth: branchWidth || undefined }),
        sourceKey: node.id,
    });
    const textColorChoice = useRecoverableMindMapPropertyChoice({
        failureMessage: t(propertyKey('textColorSaveFailed')),
        initialValue: cleanMindMapColor(node.style?.color) ?? '',
        onCommit: color => reshapeWithResult({ style: { color: color || undefined } }),
        sourceKey: node.id,
    });
    const backgroundColorChoice = useRecoverableMindMapPropertyChoice({
        failureMessage: t(propertyKey('backgroundColorSaveFailed')),
        initialValue: cleanMindMapColor(node.style?.background) ?? '',
        onCommit: background => reshapeWithResult({ style: { background: background || undefined } }),
        sourceKey: node.id,
    });
    const branchColorChoice = useRecoverableMindMapPropertyChoice({
        failureMessage: t(propertyKey('branchColorSaveFailed')),
        initialValue: cleanMindMapColor(node.branchColor) ?? '',
        onCommit: branchColor => reshapeWithResult({ branchColor: branchColor || undefined }),
        sourceKey: node.id,
    });
    const taskTransaction = useRecoverableMindMapPropertyTaskTransaction({
        failureMessage: t(propertyKey('taskSaveFailed')),
        node,
        onCommit: mutation => reshapeWithResult(mutation),
    });
    const tags = taskTransaction.tags;
    const taskMeta = taskTransaction.meta;
    const updateTags = taskTransaction.updateTags;
    const updateTask = taskTransaction.updateTask;
    const currentTaskAssignee = taskMeta.assignee ?? '';
    const [taskAssigneeEdit, setTaskAssigneeEdit] = useState(() => ({
        sourceValue: currentTaskAssignee,
        value: currentTaskAssignee,
    }));
    const taskAssignee = taskAssigneeEdit.sourceValue === currentTaskAssignee
        ? taskAssigneeEdit.value
        : currentTaskAssignee;
    const visibleTagInput = tags.some(tag => tag.text === tagInput.trim()) ? '' : tagInput;
    const shapeErrorId = useId();
    const branchWidthErrorId = useId();
    const textColorErrorId = useId();
    const backgroundColorErrorId = useId();
    const branchColorErrorId = useId();
    const taskStatusId = useId();
    const taskErrorId = useId();

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
        updateTags(next);
    }, [tags, updateTags]);

    const handleTagRemove = useCallback((text: string) => {
        const next = cleanMindMapTagObjects(tags.filter(t => t.text !== text)) ?? [];
        updateTags(next);
    }, [tags, updateTags]);

    const handleTagInputConfirm = () => {
        const t = tagInput.trim();
        if (!t) return;
        handleTagAdd({ text: t, style: { background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' } });
    };

    const commitTaskAssignee = () => {
        const nextAssignee = taskAssignee.trim();
        setTaskAssigneeEdit({ sourceValue: nextAssignee, value: nextAssignee });
        updateTask({ assignee: nextAssignee });
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

            <div
                aria-busy={taskTransaction.pending}
                aria-describedby={taskTransaction.error
                    ? taskErrorId
                    : taskTransaction.pending ? taskStatusId : undefined}
                aria-label={t(propertyKey('taskProperties'))}
                role="group"
            >
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
                    value={visibleTagInput} onChange={e => setTagInput(e.target.value)}
                    onPressEnter={handleTagInputConfirm}
                    onBlur={handleTagInputConfirm} />
            </Row>

            <Divider className={styles.divider} />

            <Row label={t(propertyKey('taskStatus'))}>
                <Select
                    aria-label={t(propertyKey('taskStatus'))}
                    size="small"
                    value={taskMeta.status}
                    options={panelOptions.taskStatuses}
                    onChange={value => updateTask({ status: value })}
                    className={styles.fullWidth}
                />
            </Row>

            <Row label={t(propertyKey('taskPriority'))}>
                <Select
                    aria-label={t(propertyKey('taskPriority'))}
                    size="small"
                    value={taskMeta.priority}
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
                    onChange={e => setTaskAssigneeEdit({
                        sourceValue: currentTaskAssignee,
                        value: e.target.value,
                    })}
                    onBlur={commitTaskAssignee}
                    onPressEnter={commitTaskAssignee}
                />
            </Row>

            <Row label={t(propertyKey('dueDate'))}>
                <Input
                    aria-label={t(propertyKey('dueDate'))}
                    size="small"
                    type="date"
                    value={taskMeta.dueDate ?? ''}
                    onChange={e => updateTask({ dueDate: e.target.value })}
                />
            </Row>

            <Row label={t(propertyKey('taskProgress'))}>
                <InputNumber
                    aria-label={t(propertyKey('taskProgress'))}
                    min={0}
                    max={100}
                    value={taskMeta.progress ?? 0}
                    suffix="%"
                    className={styles.fullWidth}
                    onChange={value => updateTask({ progress: value ?? 0 })}
                />
            </Row>

            <div className={styles.transactionFeedback}>
                {taskTransaction.pending
                    ? <div id={taskStatusId} className={styles.transactionStatus} role="status" aria-live="polite">{t(propertyKey('taskSaving'))}</div>
                    : null}
                {taskTransaction.error
                    ? <div id={taskErrorId} className={styles.choiceError} role="alert">{taskTransaction.error}</div>
                    : null}
            </div>
            </div>

            <Divider className={styles.divider} />

            {/* Font size */}
            <Row label={t(propertyKey('fontSize'))}>
                <InputNumber min={10} max={48} value={fontSize}
                    aria-label={t(propertyKey('fontSize'))}
                    onChange={v => { if (!v) return; setFontSize(v); reshape({ style: { fontSize: `${v}px` } }); }}
                    suffix="px" className={styles.fullWidth} prefix={<FontSizeOutlined />} />
            </Row>

            {/* Text color */}
            <Row label={t(propertyKey('textColor'))}>
                <ColorSwatch
                    ariaLabel={t(propertyKey('textColor'))}
                    busy={textColorChoice.pending}
                    describedBy={textColorChoice.error ? textColorErrorId : undefined}
                    disabled={textColorChoice.pending}
                    value={textColorChoice.value}
                    onChange={textColorChoice.select}
                    withTransparent
                />
                {textColorChoice.error && <div id={textColorErrorId} className={styles.choiceError} role="alert">{textColorChoice.error}</div>}
            </Row>

            {/* Background color */}
            <Row label={t(propertyKey('backgroundColor'))}>
                <ColorSwatch
                    ariaLabel={t(propertyKey('backgroundColor'))}
                    busy={backgroundColorChoice.pending}
                    describedBy={backgroundColorChoice.error ? backgroundColorErrorId : undefined}
                    disabled={backgroundColorChoice.pending}
                    value={backgroundColorChoice.value}
                    onChange={backgroundColorChoice.select}
                    withTransparent
                />
                {backgroundColorChoice.error && <div id={backgroundColorErrorId} className={styles.choiceError} role="alert">{backgroundColorChoice.error}</div>}
            </Row>

            {/* Branch color */}
            <Row label={t(propertyKey('branchColor'))}>
                <ColorSwatch
                    ariaLabel={t(propertyKey('branchColor'))}
                    busy={branchColorChoice.pending}
                    describedBy={branchColorChoice.error ? branchColorErrorId : undefined}
                    disabled={branchColorChoice.pending}
                    value={branchColorChoice.value}
                    onChange={branchColorChoice.select}
                    withTransparent
                />
                {branchColorChoice.error && <div id={branchColorErrorId} className={styles.choiceError} role="alert">{branchColorChoice.error}</div>}
            </Row>

            {/* Node shape */}
            <Row label={t(propertyKey('nodeShape'))}>
                <div
                    aria-busy={shapeChoice.pending}
                    aria-describedby={shapeChoice.error ? shapeErrorId : undefined}
                    aria-label={t(propertyKey('nodeShape'))}
                    className={styles.shapeList}
                    role="group"
                >
                    {MIND_MAP_PROPERTY_SHAPES.map(({ key, translationKey, icon }) => {
                        const label = t(propertyKey(`shapes.${translationKey}`));
                        return (
                        <button key={key || 'default'}
                            title={label}
                            type="button"
                            aria-label={label}
                            aria-pressed={shapeChoice.value === key}
                            disabled={shapeChoice.pending}
                            onClick={() => shapeChoice.select(key)}
                            className={styles.shapeButton}>
                            <div aria-hidden="true" className={styles.shapeIcon}><PropertyShapeIcon icon={icon} /></div>
                            <div className={styles.shapeLabel}>{label}</div>
                        </button>
                    );})}
                </div>
                {shapeChoice.error && <div id={shapeErrorId} className={styles.choiceError} role="alert">{shapeChoice.error}</div>}
            </Row>

            {/* Branch line width */}
            <Row label={t(propertyKey('branchWidth'))}>
                <div
                    aria-busy={branchWidthChoice.pending}
                    aria-describedby={branchWidthChoice.error ? branchWidthErrorId : undefined}
                    aria-label={t(propertyKey('branchWidth'))}
                    className={styles.branchList}
                    role="group"
                >
                    {MIND_MAP_PROPERTY_BRANCH_WIDTHS.map(w => (
                        <button key={w}
                            type="button"
                            title={w === 0 ? t(propertyKey('defaultValue')) : `${w}px`}
                            aria-label={t(propertyKey('branchWidthValue'), { value: w === 0 ? t(propertyKey('defaultValue')) : `${w}px` })}
                            aria-pressed={branchWidthChoice.value === w}
                            disabled={branchWidthChoice.pending}
                            onClick={() => branchWidthChoice.select(w)}
                            className={styles.branchButton}>
                            <div style={{
                                height: w === 0 ? 1.5 : Math.min(w, 6),
                            }} className={styles.branchLine} />
                        </button>
                    ))}
                </div>
                {branchWidthChoice.error && <div id={branchWidthErrorId} className={styles.choiceError} role="alert">{branchWidthChoice.error}</div>}
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
                <MindMapPropertyNoteField
                    initialValue={node.note}
                    failureMessage={t(propertyKey('noteSaveFailed'))}
                    label={t(propertyKey('note'))}
                    placeholder={t(propertyKey('notePlaceholder'))}
                    sourceKey={node.id}
                    onCommit={note => reshapeWithResult({ note })}
                />
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
