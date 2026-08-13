/**
 * MindMapFloatingBar.tsx — 选中节点浮动快捷操作条
 *
 * 行业标准 UX（参考 Whimsical / MindNode inline inspector）：
 *  - 选中节点时在节点正上方弹出一排图标气泡
 *  - 覆盖 90% 高频操作：添加子/兄弟、颜色、折叠/展开、删除
 *  - 无需打开侧边属性面板或右键菜单
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useState, useRef } from 'react';
import { Tooltip, Popover } from 'antd';
import { useTranslation } from 'react-i18next';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { findNodeById } from './migrate';
import { expandNodeWithAI, getAncestorPath, summarizeNodeWithAI, processNodeWithAICustomAction } from './mindmapAIService';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import {
    cleanMindMapData,
    cleanMindMapNote,
    cleanMindMapTopic,
    refreshMindElixirWithSanitizedData,
} from './mindmapTreeSanitizer';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import { RobotOutlined } from '@ant-design/icons';
import { logMindMapFloatingActionFailure } from './mindmapFloatingLogging';
import {
    resolveMindMapFloatingBarFallbackWidth,
    resolveMindMapFloatingBarLeft,
    resolveMindMapFloatingBarVisibleRight,
} from './mindMapFloatingBarLayout';
import { addEditableMindMapChild } from './mindMapNodeCreation';
import { MindMapNoteEditorPanel } from './MindMapNoteEditorPanel';
import { updateMindMapNoteAndRestoreSelection } from './mindMapNoteMutation';
import { MindMapBranchColorPicker } from './MindMapBranchColorPicker';
import { updateMindMapBranchColorAndRestoreSelection } from './mindMapBranchColorMutation';
import { MindMapNodeShapeControl } from './MindMapNodeShapeControl';
import { updateMindMapNodePatchAndRestoreSelection } from './mindMapNodeMutation';
import { MindMapAIQuickPanel } from './MindMapAIQuickPanel';
import { requestMindMapAIConfig } from './mindMapAIConfigEvent';
import { MindMapBoundaryControl } from './MindMapBoundaryControl';
import type { MindMapBoundaryValue } from './MindMapBoundaryEditor';
import {
    restoreCurrentMindMapSelectionAfterMutation,
} from './mindMapFloatingSelection';
import { useMindMapFloatingSelection } from './useMindMapFloatingSelection';
import { useMindMapNodeDeletion } from './useMindMapNodeDeletion';
import type { MindMapFloatingBarNode } from './mindMapFloatingBarTypes';
import styles from './FloatingBar.module.css';

const errorMessage = (error: unknown, fallback: string): string =>
    error instanceof Error && error.message ? error.message : fallback;

const MindMapFloatingBar: React.FC = () => {
    const { t } = useTranslation();
    // 订阅 store，确保 mind 实例异步注册后触发重渲染
    const [mind, setMind] = useState(getMindElixirInstance);
    useEffect(() => subscribeMindElixir(() => setMind(getMindElixirInstance())), []);

    const [colorOpen, setColorOpen] = useState(false);
    const [shapeOpen, setShapeOpen] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteDirty, setNoteDirty] = useState(false);
    const [noteSession, setNoteSession] = useState<{
        nodeId: string;
        initialNote?: string;
    } | null>(null);
    const [aiOpen, setAiOpen] = useState(false);
    const [boundaryOpen, setBoundaryOpen] = useState(false);
    const [aiExpanding, setAiExpanding] = useState(false);
    const [aiSummarizing, setAiSummarizing] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiError, setAiError] = useState('');
    const [customAiPrompt, setCustomAiPrompt] = useState('');
    const [aiCustomLoading, setAiCustomLoading] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);
    const colorTriggerRef = useRef<HTMLButtonElement>(null);
    const noteTriggerRef = useRef<HTMLButtonElement>(null);
    const noteDialogId = useId();
    const [barWidth, setBarWidth] = useState(0);
    const [visibleRight, setVisibleRight] = useState(() => window.innerWidth);

    const closeSelectionOverlays = useCallback(() => {
        setColorOpen(false); setShapeOpen(false); setNoteOpen(false); setNoteDirty(false);
        setNoteSession(null); setAiOpen(false); setBoundaryOpen(false);
    }, []);
    const {
        position: pos,
        refreshForNode: refreshFloatingBarForNode,
    } = useMindMapFloatingSelection(mind, closeSelectionOverlays);
    const {
        deleteDialog,
        requestDelete,
    } = useMindMapNodeDeletion({
        mind,
        onDeleted: closeSelectionOverlays,
        onFailure: error => logMindMapFloatingActionFailure('removeNode', error),
    });
    useLayoutEffect(() => {
        const bar = barRef.current;
        if (!pos || !bar) return;

        const sidebar = document.querySelector<HTMLElement>('.designer-right-sidebar');
        const updateLayout = () => {
            const sidebarRect = sidebar?.getBoundingClientRect();
            setBarWidth(bar.getBoundingClientRect().width);
            setVisibleRight(resolveMindMapFloatingBarVisibleRight({
                viewportWidth: window.innerWidth,
                sidebarLeft: sidebarRect?.left,
                sidebarWidth: sidebarRect?.width,
                sidebarHeight: sidebarRect?.height,
                sidebarVisible: Boolean(
                    sidebar
                    && sidebarRect
                    && getComputedStyle(sidebar).visibility !== 'hidden'
                ),
            }));
        };
        updateLayout();
        window.addEventListener('resize', updateLayout);
        const resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(updateLayout)
            : null;
        resizeObserver?.observe(bar);
        if (sidebar) resizeObserver?.observe(sidebar);

        return () => {
            window.removeEventListener('resize', updateLayout);
            resizeObserver?.disconnect();
        };
    }, [pos]);

    if (!pos || !mind) return deleteDialog;

    const getTpc = () => {
        try { return mind.findEle(pos.nodeId); } catch (error) {
            logMindMapFloatingActionFailure('findSelectedTopic', error);
            return null;
        }
    };
    const getObj = (): NodeObj | null => {
        try { return findNodeById(mind.getData().nodeData, pos.nodeId); } catch (error) {
            logMindMapFloatingActionFailure('findSelectedNode', error);
            return null;
        }
    };
    const obj = getObj();
    if (!obj) return deleteDialog;

    const closeNoteEditor = (restoreFocus = false) => {
        setNoteOpen(false);
        setNoteDirty(false);
        setNoteSession(null);
        if (restoreFocus) {
            requestAnimationFrame(() => noteTriggerRef.current?.focus());
        }
    };

    const commitNote = async (note: string | undefined, action: 'clearNote' | 'saveNote') => {
        try {
            const targetNodeId = noteSession?.nodeId ?? obj.id;
            const targetNode = findNodeById(mind.getData().nodeData, targetNodeId);
            const targetTopic = mind.findEle(targetNodeId);
            if (!targetNode || !targetTopic) throw new Error('Note target is unavailable');
            const restored = await updateMindMapNoteAndRestoreSelection(
                mind,
                targetTopic,
                targetNode,
                note,
            );
            if (restored) refreshFloatingBarForNode(targetNode.id);
        } catch (error) {
            logMindMapFloatingActionFailure(action, error);
            throw error;
        }
        closeNoteEditor(true);
    };

    const closeBranchColorPicker = (restoreFocus = false) => {
        setColorOpen(false);
        if (restoreFocus) {
            requestAnimationFrame(() => colorTriggerRef.current?.focus());
        }
    };

    const commitBranchColor = async (color: string | undefined) => {
        try {
            const tpc = getTpc();
            if (tpc) {
                const restored = await updateMindMapBranchColorAndRestoreSelection(mind, tpc, obj, color);
                if (restored) refreshFloatingBarForNode(obj.id);
            }
        } catch (error) {
            logMindMapFloatingActionFailure('setBranchColor', error);
        }
        closeBranchColorPicker(true);
    };

    const commitNodeShape = async (shapeClass: string | undefined) => {
        try {
            const tpc = getTpc();
            if (tpc) {
                const result = await updateMindMapNodePatchAndRestoreSelection(
                    mind,
                    tpc,
                    obj,
                    { shapeClass },
                );
                if (result.restored) refreshFloatingBarForNode(obj.id);
            }
        } catch (error) {
            logMindMapFloatingActionFailure('setShapeClass', error);
        }
    };

    const commitBoundary = async (boundary: MindMapBoundaryValue | undefined) => {
        try {
            const tpc = getTpc();
            if (tpc) {
                const result = await updateMindMapNodePatchAndRestoreSelection(
                    mind,
                    tpc,
                    obj,
                    { boundary },
                );
                if (result.restored) refreshFloatingBarForNode(obj.id);
            }
        } catch (error) {
            logMindMapFloatingActionFailure(boundary ? 'saveBoundary' : 'removeBoundary', error);
        }
    };

    const extendedObj = obj as MindMapFloatingBarNode;

    const isRoot = pos.nodeId === mind.getData()?.nodeData?.id;
    const hasChildren = (obj.children?.length ?? 0) > 0;
    const isExpanded = obj.expanded !== false;

    const act = (fn: () => void) => {
        fn(); setColorOpen(false); setShapeOpen(false); setAiOpen(false); setBoundaryOpen(false);
    };

    // ── AI logic ─────────────────────────────────────────────────────────────
    const handleAIExpand = async () => {
        if (!mind || aiExpanding) return;
        setAiExpanding(true);
        setAiSuggestions([]);
        setAiError('');
        try {
            const data = mind.getData();
            const ancestorPath = getAncestorPath(data.nodeData, pos.nodeId);
            const mapTitle = data.nodeData.topic;
            const result = await expandNodeWithAI({ node: obj, ancestorPath, count: 4, mapTitle });
            if (result.error) { setAiError(result.error); }
            else { setAiSuggestions(result.topics); }
        } catch (e: unknown) {
            setAiError(errorMessage(e, '未知错误'));
        } finally {
            setAiExpanding(false);
        }
    };

    const handleAIApply = async (topic: string) => {
        if (!mind) return;
        try {
            const tpcEl = getTpc();
            if (!tpcEl) return;
            mind.selectNode(tpcEl);
            await mind.addChild(
                tpcEl,
                cleanMindMapChildNode({ label: topic }, mind.generateNewObj?.().id),
            );
        } catch (error) {
            logMindMapFloatingActionFailure('applySuggestion', error);
        }
    };

    const handleAISummarize = async () => {
        if (!mind || aiSummarizing || !obj.children?.length) return;
        setAiSummarizing(true);
        setAiError('');
        try {
            const childrenTopics = obj.children.map(child => child.topic || '');
            const result = await summarizeNodeWithAI(obj.topic, childrenTopics);
            if ('error' in result) {
                setAiError(result.error);
            } else if (result.topic && result.topic !== obj.topic) {
                const tpcEl = getTpc();
                if (tpcEl) {
                    mind.setNodeTopic(tpcEl, cleanMindMapTopic(result.topic));
                }
                setAiOpen(false);
            }
        } catch (e: unknown) {
            setAiError(errorMessage(e, '归纳失败'));
        } finally {
            setAiSummarizing(false);
        }
    };

    const handleCustomAISubmit = async () => {
        const prompt = customAiPrompt.trim();
        if (!prompt || !mind || aiCustomLoading) return;
        setAiCustomLoading(true);
        setAiError('');
        try {
            const data = mind.getData();
            const ancestorPath = getAncestorPath(data.nodeData, pos.nodeId);
            const mapTitle = data.nodeData.topic;

            const result = await processNodeWithAICustomAction({
                node: obj,
                customPrompt: prompt,
                ancestorPath,
                mapTitle,
            });

            if (result.error) {
                setAiError(result.error);
            } else {
                const tpcEl = getTpc();
                if (tpcEl) {
                    if (result.topic) {
                        mind.setNodeTopic(tpcEl, cleanMindMapTopic(result.topic));
                    }

                    const nodeInTree = findNodeById(data.nodeData, pos.nodeId);
                    if (nodeInTree) {
                        const cleanPatch = cleanMindMapNodePatch({
                            note: result.note,
                            tags: result.tags,
                            icons: result.icons,
                        });
                        if (result.note !== undefined) {
                            nodeInTree.note = cleanPatch.note;
                        }
                        if (result.tags !== undefined) {
                            nodeInTree.tags = cleanPatch.tags;
                        }
                        if (result.icons !== undefined) {
                            nodeInTree.icons = cleanPatch.icons;
                        }
                        if (result.newChildren && result.newChildren.length > 0) {
                            if (!nodeInTree.children) nodeInTree.children = [];
                            nodeInTree.children.push(...result.newChildren);
                            nodeInTree.expanded = true;
                        }

                        const cleanData = cleanMindMapData(data);
                        refreshMindElixirWithSanitizedData(mind, cleanData);
                        mind.bus.fire('operation', {
                            name: 'reshapeNode',
                            obj: findNodeById(cleanData.nodeData, pos.nodeId) ?? cleanData.nodeData,
                            origin: findNodeById(cleanData.nodeData, pos.nodeId) ?? cleanData.nodeData,
                        });
                    }

                    setCustomAiPrompt('');
                    setAiOpen(false);
                }
            }
        } catch (e: unknown) {
            setAiError(errorMessage(e, '运行失败'));
        } finally {
            setAiCustomLoading(false);
        }
    };

    // ── Button style ─────────────────────────────────────────────────────────
    const Btn: React.FC<{
        ariaExpanded?: boolean;
        danger?: boolean;
        icon: string;
        onClick: () => void;
        tip: string;
    }> = ({ ariaExpanded, icon, tip, danger, onClick }) => (
        <Tooltip title={tip} placement="top" mouseEnterDelay={0.4}>
            <button
                type="button"
                className={`${styles.btn} ${danger ? styles.btnDanger : ''}`}
                aria-label={tip}
                aria-expanded={ariaExpanded}
                title={tip}
                onClick={onClick}
            >
                <span aria-hidden="true">{icon}</span>
            </button>
        </Tooltip>
    );

    // Divider
    const Div = () => <div className={styles.divider} />;

    const handleAddChild = () => {
        const tpc = getTpc();
        if (!tpc) return;
        setColorOpen(false);
        setShapeOpen(false);
        setAiOpen(false);
        void addEditableMindMapChild(mind, tpc).catch(error => {
            logMindMapFloatingActionFailure('addChild', error);
        });
    };

    const handleDuplicate = () => {
        const tpc = getTpc();
        if (!tpc) return;
        setColorOpen(false);
        setShapeOpen(false);
        setAiOpen(false);
        void (async () => {
            try {
                await mind.copyNode(tpc, tpc);
                const restoredNode = await restoreCurrentMindMapSelectionAfterMutation(mind);
                if (restoredNode) refreshFloatingBarForNode(restoredNode.id);
            } catch (error) {
                logMindMapFloatingActionFailure('duplicateNode', error);
            }
        })();
    };

    const safeVisibleRight = Math.min(window.innerWidth, visibleRight);
    const resolvedBarWidth =
        barWidth || resolveMindMapFloatingBarFallbackWidth({ visibleRight: safeVisibleRight });

    return (
        <>
        <div
            ref={barRef}
            className={styles.barContainer}
            role="toolbar"
            aria-label="节点快捷操作"
            style={{
                left: resolveMindMapFloatingBarLeft({
                anchorX: pos.x,
                measuredWidth: resolvedBarWidth,
                viewportWidth: safeVisibleRight,
            }),
                top: Math.max(pos.y - 44, 8),
                maxWidth: Math.max(0, safeVisibleRight - 16),
            }}
            // stop clicks from deselecting the node in canvas
            onMouseDown={e => e.stopPropagation()}
        >

            {/* AI Expand */}
            <Popover
                open={aiOpen}
                onOpenChange={v => {
                    setAiOpen(v);
                    if (v) {
                        setColorOpen(false); setShapeOpen(false); setNoteOpen(false); setBoundaryOpen(false);
                        if (aiSuggestions.length === 0 && !aiExpanding) {
                            handleAIExpand();
                        }
                    }
                }}
                trigger="click"
                placement="top"
                arrow={false}
                destroyOnHidden
                getPopupContainer={() => document.body}
                styles={{
                    content: { padding: 0, background: 'transparent', boxShadow: 'none' },
                }}
                content={
                    <MindMapAIQuickPanel
                        error={aiError}
                        expanding={aiExpanding}
                        suggestions={aiSuggestions}
                        hasChildren={hasChildren}
                        summarizing={aiSummarizing}
                        customPrompt={customAiPrompt}
                        customLoading={aiCustomLoading}
                        onApplySuggestion={suggestion => {
                            void handleAIApply(suggestion);
                            setAiOpen(false);
                        }}
                        onSummarize={() => void handleAISummarize()}
                        onCustomPromptChange={setCustomAiPrompt}
                        onCustomSubmit={() => void handleCustomAISubmit()}
                        onOpenConfig={() => {
                            setAiOpen(false);
                            requestMindMapAIConfig();
                        }}
                    />
                }
            >
                <Tooltip title="AI 节点助手">
                    <button
                        type="button"
                        className={`${styles.btn} ${styles.btnAi}`}
                        aria-label="AI 节点助手"
                        title="AI 节点助手"
                        aria-expanded={aiOpen}
                        onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            setAiOpen(value => !value);
                        }}
                    >
                        <div className={styles.btnAiInner} aria-hidden="true"><RobotOutlined /></div>
                    </button>
                </Tooltip>
            </Popover>

            <Div />

            {/* Add child */}
            <Btn icon="➕" tip="添加子节点 (Tab)"
                onClick={handleAddChild} />

            {/* Add sibling — not for root */}
            {!isRoot && (
                <Btn icon="↕️" tip="添加同级节点 (Enter)"
                    onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.insertSibling('after', tpc, cleanMindMapChildNode()); })} />
            )}

            {/* Duplicate — not for root */}
            {!isRoot && (
                <Btn icon="📋" tip="复制为同级 (Ctrl+D)"
                    onClick={handleDuplicate} />
            )}

            <Div />

            {/* Edit */}
            <Btn icon="✏️" tip="编辑文字 (F2)"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.editTopic(tpc); })} />

            {/* Expand/Collapse — only if has children */}
            {hasChildren && (
                <Btn
                    icon={isExpanded ? '🔽' : '▶️'}
                    tip={t(isExpanded
                        ? 'plugins.mindmap.actions.collapse'
                        : 'plugins.mindmap.actions.expand')}
                    ariaExpanded={isExpanded}
                    onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.expandNode(tpc, !isExpanded); })} />
            )}

            <Div />

            {/* Branch color quick picker */}
            <Popover
                open={colorOpen}
                onOpenChange={v => {
                    setColorOpen(v);
                    if (v) { setShapeOpen(false); setBoundaryOpen(false); }
                }}
                trigger="click"
                placement="top"
                arrow={false}
                destroyOnHidden
                getPopupContainer={() => document.body}
                styles={{
                    content: { padding: 0, background: 'transparent', boxShadow: 'none' },
                }}
                content={
                    <MindMapBranchColorPicker
                        currentColor={obj.branchColor}
                        onCancel={() => closeBranchColorPicker(true)}
                        onSelect={commitBranchColor}
                    />
                }
            >
                <Tooltip title="连线颜色">
                    <button
                        ref={colorTriggerRef}
                        type="button"
                        className={styles.btn}
                        aria-label="连线颜色"
                        title="连线颜色"
                        style={{ gap: 2 }}
                        onKeyDown={event => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            setColorOpen(value => !value);
                            setShapeOpen(false);
                        }}
                    >
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: obj.branchColor ?? '#6366f1',
                            border: '1px solid rgba(255,255,255,0.3)',
                        }} />
                        <span aria-hidden="true" style={{ fontSize: 9 }}>▾</span>
                    </button>
                </Tooltip>
            </Popover>

            {/* Shape quick picker */}
            <MindMapNodeShapeControl
                open={shapeOpen}
                currentShape={extendedObj.shapeClass}
                onOpenChange={v => {
                    setShapeOpen(v);
                    if (v) {
                        setColorOpen(false);
                        setNoteOpen(false);
                        setAiOpen(false);
                        setBoundaryOpen(false);
                    }
                }}
                onSelect={commitNodeShape}
            />

            {/* Note quick edit */}
            <Popover
                open={noteOpen}
                onOpenChange={v => {
                    if (!v && noteDirty) return;
                    if (v) {
                        setColorOpen(false); setShapeOpen(false);
                        setBoundaryOpen(false);
                        setNoteDirty(false);
                        setNoteSession({
                            nodeId: obj.id,
                            initialNote: cleanMindMapNote(obj.note),
                        });
                    }
                    setNoteOpen(v);
                    if (!v) {
                        setNoteDirty(false);
                        setNoteSession(null);
                    }
                }}
                trigger="click"
                placement="top"
                arrow={false}
                destroyOnHidden
                getPopupContainer={() => document.body}
                styles={{
                    content: { padding: 0, background: 'transparent', boxShadow: 'none' },
                }}
                content={
                    <MindMapNoteEditorPanel
                        key={noteSession?.nodeId ?? obj.id}
                        dialogId={noteDialogId}
                        initialNote={noteSession?.initialNote}
                        onCancel={() => closeNoteEditor(true)}
                        onClear={() => commitNote(undefined, 'clearNote')}
                        onDirtyChange={setNoteDirty}
                        onSave={note => commitNote(note, 'saveNote')}
                    />
                }
            >
                <Tooltip title={t(obj.note
                    ? 'plugins.mindmap.noteEditor.editNote'
                    : 'plugins.mindmap.noteEditor.addNote')}>
                    <button
                        ref={noteTriggerRef}
                        type="button"
                        className={styles.btn}
                        aria-label={t(obj.note
                            ? 'plugins.mindmap.noteEditor.editNote'
                            : 'plugins.mindmap.noteEditor.addNote')}
                        aria-haspopup="dialog"
                        aria-expanded={noteOpen}
                        aria-controls={noteDialogId}
                        title={t(obj.note
                            ? 'plugins.mindmap.noteEditor.editNote'
                            : 'plugins.mindmap.noteEditor.addNote')}
                        style={{ color: obj.note ? '#f59e0b' : 'rgba(255, 255, 255, 0.7)' }}
                    >
                        <span aria-hidden="true" style={{ fontSize: 13 }}>📝</span>
                    </button>
                </Tooltip>
            </Popover>

            <MindMapBoundaryControl
                boundary={extendedObj.boundary}
                open={boundaryOpen}
                onOpenChange={v => {
                    setBoundaryOpen(v);
                    if (v) {
                        setColorOpen(false); setShapeOpen(false); setNoteOpen(false); setAiOpen(false);
                    }
                }}
                onRemove={() => commitBoundary(undefined)}
                onSave={commitBoundary}
            />

            {/* Delete — not for root */}
            {!isRoot && (
                <>
                    <Div />
                    <Btn icon="🗑️" tip={t('plugins.mindmap.actions.deleteNode')} danger
                        onClick={() => requestDelete(obj)} />
                </>
            )}
        </div>
        {deleteDialog}
        </>
    );
};

export default MindMapFloatingBar;
