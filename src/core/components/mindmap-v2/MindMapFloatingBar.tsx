/**
 * MindMapFloatingBar.tsx — 选中节点浮动快捷操作条
 *
 * 行业标准 UX（参考 Whimsical / MindNode inline inspector）：
 *  - 选中节点时在节点正上方弹出一排图标气泡
 *  - 覆盖 90% 高频操作：添加子/兄弟、颜色、折叠/展开、删除
 *  - 无需打开侧边属性面板或右键菜单
 */
import React, { useCallback, useEffect, useLayoutEffect, useState, useRef } from 'react';
import { Tooltip, Popover, Input } from 'antd';
import type { NodeObj, Topic } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { findNodeById } from './migrate';
import { expandNodeWithAI, getAncestorPath, summarizeNodeWithAI, processNodeWithAICustomAction } from './mindmapAIService';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { cleanMindMapData, cleanMindMapTopic, refreshMindElixirWithSanitizedData } from './mindmapTreeSanitizer';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons';
import { logMindMapFloatingActionFailure } from './mindmapFloatingLogging';
import { resolveMindMapFloatingBarLeft } from './mindMapFloatingBarLayout';
import { addEditableMindMapChild } from './mindMapNodeCreation';
import { MindMapNoteEditorPanel } from './MindMapNoteEditorPanel';
import { updateMindMapNoteAndRestoreSelection } from './mindMapNoteMutation';
import { MindMapBranchColorPicker } from './MindMapBranchColorPicker';
import { updateMindMapBranchColorAndRestoreSelection } from './mindMapBranchColorMutation';
import { MindMapNodeShapeControl } from './MindMapNodeShapeControl';
import { updateMindMapNodePatchAndRestoreSelection } from './mindMapNodeMutation';
import {
    restoreCurrentMindMapSelectionAfterMutation,
} from './mindMapFloatingSelection';
import { useMindMapFloatingSelection } from './useMindMapFloatingSelection';
import styles from './FloatingBar.module.css';

// ─── Position tracking ────────────────────────────────────────────────────────
type ExtendedMindMapNode = NodeObj & {
    shapeClass?: string;
    boundary?: { color: string; title: string };
};

const errorMessage = (error: unknown, fallback: string): string =>
    error instanceof Error && error.message ? error.message : fallback;

const MindMapFloatingBar: React.FC = () => {
    // 订阅 store，确保 mind 实例异步注册后触发重渲染
    const [mind, setMind] = useState(getMindElixirInstance);
    useEffect(() => subscribeMindElixir(() => setMind(getMindElixirInstance())), []);

    const [colorOpen, setColorOpen] = useState(false);
    const [shapeOpen, setShapeOpen] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [aiOpen, setAiOpen] = useState(false);
    const [aiExpanding, setAiExpanding] = useState(false);
    const [aiSummarizing, setAiSummarizing] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiError, setAiError] = useState('');
    const [customAiPrompt, setCustomAiPrompt] = useState('');
    const [aiCustomLoading, setAiCustomLoading] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);
    const colorTriggerRef = useRef<HTMLButtonElement>(null);
    const noteTriggerRef = useRef<HTMLButtonElement>(null);
    const [barWidth, setBarWidth] = useState(0);

    const closeSelectionOverlays = useCallback(() => {
        setColorOpen(false); setShapeOpen(false); setNoteOpen(false); setAiOpen(false);
    }, []);
    const {
        position: pos,
        refreshForNode: refreshFloatingBarForNode,
    } = useMindMapFloatingSelection(mind, closeSelectionOverlays);
    useLayoutEffect(() => {
        const bar = barRef.current;
        if (!pos || !bar) return;

        const updateWidth = () => setBarWidth(bar.getBoundingClientRect().width);
        updateWidth();
        window.addEventListener('resize', updateWidth);
        const resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(updateWidth)
            : null;
        resizeObserver?.observe(bar);

        return () => {
            window.removeEventListener('resize', updateWidth);
            resizeObserver?.disconnect();
        };
    }, [pos]);

    if (!pos || !mind) return null;

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
    const reshapeNodePatch = (tpc: Topic, baseObj: NodeObj | null | undefined, patch: Partial<NodeObj> & Record<string, unknown>) => {
        if (!baseObj) return;
        mind.reshapeNode(tpc, { ...baseObj, ...cleanMindMapNodePatch(patch) } as NodeObj);
    };

    const obj = getObj();
    if (!obj) return null;

    const closeNoteEditor = (restoreFocus = false) => {
        setNoteOpen(false);
        if (restoreFocus) {
            requestAnimationFrame(() => noteTriggerRef.current?.focus());
        }
    };

    const commitNote = async (note: string | undefined, action: 'clearNote' | 'saveNote') => {
        try {
            const tpc = getTpc();
            if (tpc) {
                const restored = await updateMindMapNoteAndRestoreSelection(mind, tpc, obj, note);
                if (restored) refreshFloatingBarForNode(obj.id);
            }
        } catch (error) {
            logMindMapFloatingActionFailure(action, error);
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

    const extendedObj = obj as ExtendedMindMapNode;

    const isRoot = pos.nodeId === mind.getData()?.nodeData?.id;
    const hasChildren = (obj.children?.length ?? 0) > 0;
    const isExpanded = obj.expanded !== false;

    const act = (fn: () => void) => { fn(); setColorOpen(false); setShapeOpen(false); setAiOpen(false); };

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
    const Btn: React.FC<{ icon: string; tip: string; danger?: boolean; onClick: () => void }> = ({ icon, tip, danger, onClick }) => (
        <Tooltip title={tip} placement="top" mouseEnterDelay={0.4}>
            <button
                type="button"
                className={`${styles.btn} ${danger ? styles.btnDanger : ''}`}
                aria-label={tip}
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

    const resolvedBarWidth = barWidth || Math.min(window.innerWidth - 16, 320);

    return (
        <div
            ref={barRef}
            className={styles.barContainer}
            role="toolbar"
            aria-label="节点快捷操作"
            style={{
                left: resolveMindMapFloatingBarLeft({
                    anchorX: pos.x,
                    measuredWidth: resolvedBarWidth,
                    viewportWidth: window.innerWidth,
                }),
                top: Math.max(pos.y - 44, 8),
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
                        setColorOpen(false); setShapeOpen(false); setNoteOpen(false);
                        if (aiSuggestions.length === 0 && !aiExpanding) {
                            handleAIExpand();
                        }
                    }
                }}
                trigger="click"
                placement="top"
                arrow={false}
                content={
                    <div className={styles.aiPopover}>
                        <div className={styles.aiHeader}>
                            <span>✨ AI 扩展建议</span>
                            {aiExpanding && <span style={{ fontSize: 10, opacity: 0.6 }}>生成中...</span>}
                        </div>
                        {aiError && <div style={{ color: '#ef4444', fontSize: 12, padding: 4 }}>{aiError}</div>}
                        {!aiExpanding && aiSuggestions.length === 0 && !aiError && (
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: 4 }}>暂无建议</div>
                        )}
                        {aiSuggestions.map(s => (
                            <button type="button" key={s} onClick={() => { handleAIApply(s); setAiOpen(false); }} className={styles.aiSuggestion}>
                                <PlusOutlined style={{ marginRight: 6, color: '#a5b4fc', fontSize: 10 }} />
                                {s}
                            </button>
                        ))}
                        {hasChildren && (
                            <div className={styles.aiSummarizeSection}>
                                <button
                                    type="button"
                                    className={styles.aiSummarizeBtn}
                                    onClick={handleAISummarize}
                                    disabled={aiSummarizing}
                                >
                                    {aiSummarizing ? <LoadingOutlined /> : '🪄'} AI 智能归纳当前节点
                                </button>
                            </div>
                        )}
                        <div style={{ marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>💬 自定义 AI 指令</div>
                            <Input.Search
                                placeholder="如: 翻译成英文、写个详细备注..."
                                value={customAiPrompt}
                                onChange={e => setCustomAiPrompt(e.target.value)}
                                onSearch={handleCustomAISubmit}
                                enterButton={aiCustomLoading ? <LoadingOutlined /> : "运行"}
                                loading={aiCustomLoading}
                                size="small"
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>
                }
            >
                <Tooltip title="AI 扩展子主题">
                    <button
                        type="button"
                        className={`${styles.btn} ${styles.btnAi}`}
                        aria-label="AI 扩展子主题"
                        title="AI 扩展子主题"
                        onClick={() => setAiOpen(v => !v)}
                    >
                        <div className={styles.btnAiInner} aria-hidden="true">✨</div>
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
                <Btn icon={isExpanded ? '🔽' : '▶️'} tip={isExpanded ? '折叠' : '展开'}
                    onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.expandNode(tpc, !isExpanded); })} />
            )}

            <Div />

            {/* Branch color quick picker */}
            <Popover
                open={colorOpen}
                onOpenChange={v => { setColorOpen(v); if (v) setShapeOpen(false); }}
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
                    }
                }}
                onSelect={commitNodeShape}
            />

            {/* Note quick edit */}
            <Popover
                open={noteOpen}
                onOpenChange={v => {
                    if (v) {
                        setColorOpen(false); setShapeOpen(false);
                    }
                    setNoteOpen(v);
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
                        initialNote={obj.note}
                        onCancel={() => closeNoteEditor(true)}
                        onClear={() => void commitNote(undefined, 'clearNote')}
                        onSave={note => void commitNote(note, 'saveNote')}
                    />
                }
            >
                <Tooltip title={obj.note ? '编辑备注' : '添加备注'}>
                    <button
                        ref={noteTriggerRef}
                        type="button"
                        className={styles.btn}
                        aria-label={obj.note ? '编辑备注' : '添加备注'}
                        title={obj.note ? '编辑备注' : '添加备注'}
                        style={{ color: obj.note ? '#f59e0b' : 'rgba(255, 255, 255, 0.7)' }}
                    >
                        <span aria-hidden="true" style={{ fontSize: 13 }}>📝</span>
                    </button>
                </Tooltip>
            </Popover>

            {/* Boundary Toggle */}
            <Btn icon="📌" tip={extendedObj.boundary ? '取消外框分组' : '添加外框分组'}
                onClick={() => act(() => { 
                    const tpc = getTpc(); 
                    if (tpc) {
                        const newBoundary = extendedObj.boundary ? undefined : { color: '#818cf8', title: '新建分组' };
                        reshapeNodePatch(tpc, obj, { boundary: newBoundary });
                    }
                })} 
            />

            {/* Delete — not for root */}
            {!isRoot && (
                <>
                    <Div />
                    <Btn icon="🗑️" tip="删除节点 (Del)" danger
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.removeNodes([tpc]); })} />
                </>
            )}
        </div>
    );
};

export default MindMapFloatingBar;
