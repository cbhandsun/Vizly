/**
 * MindMapFloatingBar.tsx — 选中节点浮动快捷操作条
 *
 * 行业标准 UX（参考 Whimsical / MindNode inline inspector）：
 *  - 选中节点时在节点正上方弹出一排图标气泡
 *  - 覆盖 90% 高频操作：添加子/兄弟、颜色、折叠/展开、删除
 *  - 无需打开侧边属性面板或右键菜单
 */
import React, { useEffect, useState, useRef } from 'react';
import { Tooltip, Popover, Input } from 'antd';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { findNodeById } from './migrate';
import { expandNodeWithAI, getAncestorPath, summarizeNodeWithAI, processNodeWithAICustomAction } from './mindmapAIService';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { cleanMindMapData, cleanMindMapTopic } from './mindmapTreeSanitizer';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import { PlusOutlined, LoadingOutlined } from '@ant-design/icons';
import styles from './FloatingBar.module.css';

// ─── Colour palette for quick branch color ─────────────────────────────────
const QUICK_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#64748b', '#ffffff', 'transparent',
];

// ─── Position tracking ────────────────────────────────────────────────────────
interface BarPos { x: number; y: number; nodeId: string; }

const MindMapFloatingBar: React.FC = () => {
    // 订阅 store，确保 mind 实例异步注册后触发重渲染
    const [mind, setMind] = useState(getMindElixirInstance);
    useEffect(() => subscribeMindElixir(() => setMind(getMindElixirInstance())), []);

    const [pos, setPos] = useState<BarPos | null>(null);
    const [colorOpen, setColorOpen] = useState(false);
    const [shapeOpen, setShapeOpen] = useState(false);
    const [noteOpen, setNoteOpen] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [aiOpen, setAiOpen] = useState(false);
    const [aiExpanding, setAiExpanding] = useState(false);
    const [aiSummarizing, setAiSummarizing] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
    const [aiError, setAiError] = useState('');
    const [customAiPrompt, setCustomAiPrompt] = useState('');
    const [aiCustomLoading, setAiCustomLoading] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);


    // ── Listen to selectNode / selectNodes events ────────────────────────────
    useEffect(() => {
        if (!mind) return;

        const onSelect = (nodes: NodeObj[] | null) => {
            const node = nodes?.[0] ?? null;
            if (!node) { setPos(null); setColorOpen(false); setShapeOpen(false); setNoteOpen(false); setAiOpen(false); return; }
            // Find the DOM element for the selected node to get its bounding rect
            try {
                const tpcEl = mind.findEle(node.id);
                if (!tpcEl) { setPos(null); return; }
                const rect = (tpcEl as HTMLElement).getBoundingClientRect();
                setPos({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 8,        // 8px above the node
                    nodeId: node.id,
                });
            } catch { setPos(null); }
        };

        const onDeselect = () => {
            setPos(null); setColorOpen(false); setShapeOpen(false); setNoteOpen(false); setAiOpen(false);
        };

        // mind-elixir v5: fires 'selectNodes' (array) and 'selectNewNode'
        mind.bus.addListener('selectNodes', onSelect as any);
        mind.bus.addListener('selectNewNode', (node: NodeObj) => onSelect([node] as any));
        // Clicking canvas background fires 'unselectNodes'
        mind.bus.addListener('unselectNodes', onDeselect);
        mind.bus.addListener('unselectNode' as any, onDeselect);  // legacy fallback
        // When map refreshes, deselect
        mind.bus.addListener('operation', () => {
            // Delay to let DOM update, then refresh position
            setTimeout(() => {
                const currentNode = (mind as any).currentNode as HTMLElement | null;
                if (!currentNode) { setPos(null); return; }
                const nodeId = currentNode.dataset?.nodeid ?? '';
                if (!nodeId) { setPos(null); return; }
                const rect = currentNode.getBoundingClientRect();
                setPos({ x: rect.left + rect.width / 2, y: rect.top - 8, nodeId });
            }, 50);
        });

        return () => {
            mind.bus.removeListener('selectNodes', onSelect as any);
            mind.bus.removeListener('selectNewNode', onSelect as any);
            mind.bus.removeListener('unselectNodes', onDeselect);
            mind.bus.removeListener('unselectNode' as any, onDeselect);
        };
    }, [mind]);

    // Close when clicking outside
    useEffect(() => {
        if (!pos) return;
        const handler = (e: MouseEvent) => {
            if (barRef.current && !barRef.current.contains(e.target as Node)) {
                setColorOpen(false);
                // Also close other popovers if we want to mimic clicking outside
            }
        };
        document.addEventListener('mousedown', handler, true);
        return () => document.removeEventListener('mousedown', handler, true);
    }, [pos]);

    if (!pos || !mind) return null;

    const getTpc = () => { try { return mind.findEle(pos.nodeId); } catch { return null; } };
    const getObj = (): NodeObj | null => {
        try { return findNodeById(mind.getData().nodeData, pos.nodeId); } catch { return null; }
    };
    const reshapeNodePatch = (tpc: unknown, baseObj: NodeObj | null | undefined, patch: Partial<NodeObj> & Record<string, unknown>) => {
        if (!baseObj) return;
        mind.reshapeNode(tpc as any, { ...baseObj, ...cleanMindMapNodePatch(patch) } as NodeObj);
    };

    const obj = getObj();
    if (!obj) return null;

    const isRoot = pos.nodeId === mind.getData()?.nodeData?.id;
    const hasChildren = (obj.children?.length ?? 0) > 0;
    const isExpanded = obj.expanded !== false;

    const SHAPES = [
        { key: '',          label: '默认', preview: '▭' },
        { key: 'oval',      label: '椭圆', preview: '◡' },
        { key: 'rect',      label: '矩形', preview: '□' },
        { key: 'underline', label: '下划线', preview: '□̲' },
        { key: 'diamond',   label: '菱形', preview: '◇' },
    ];

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
        } catch (e: any) {
            setAiError(e?.message ?? '未知错误');
        } finally {
            setAiExpanding(false);
        }
    };

    const handleAIApply = async (topic: string) => {
        if (!mind) return;
        try {
            const tpcEl = getTpc();
            if (!tpcEl) return;
            mind.selectNode(tpcEl as any);
            await mind.addChild(tpcEl as any, cleanMindMapChildNode({ label: topic }, mind.generateNewObj?.().id ?? `n_${Date.now()}`));
        } catch {}
    };

    const handleAISummarize = async () => {
        if (!mind || aiSummarizing || !obj.children?.length) return;
        setAiSummarizing(true);
        setAiError('');
        try {
            const childrenTopics = obj.children.map((c: any) => c.topic || '');
            const result = await summarizeNodeWithAI(obj.topic, childrenTopics);
            if ('error' in result) {
                setAiError(result.error);
            } else if (result.topic && result.topic !== obj.topic) {
                const tpcEl = getTpc();
                if (tpcEl) {
                    mind.setNodeTopic(tpcEl as any, cleanMindMapTopic(result.topic));
                }
                setAiOpen(false);
            }
        } catch (e: any) {
            setAiError(e?.message ?? '归纳失败');
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
                        mind.setNodeTopic(tpcEl as any, cleanMindMapTopic(result.topic));
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
                        mind.refresh(cleanData);
                        mind.bus.fire('operation', {
                            name: 'ai_custom',
                            obj: findNodeById(cleanData.nodeData, pos.nodeId) ?? cleanData.nodeData,
                        });
                    }

                    setCustomAiPrompt('');
                    setAiOpen(false);
                }
            }
        } catch (e: any) {
            setAiError(e?.message ?? '运行失败');
        } finally {
            setAiCustomLoading(false);
        }
    };

    // ── Button style ─────────────────────────────────────────────────────────
    const Btn: React.FC<{ icon: string; tip: string; danger?: boolean; onClick: () => void }> = ({ icon, tip, danger, onClick }) => (
        <Tooltip title={tip} placement="top" mouseEnterDelay={0.4}>
            <button
                className={`${styles.btn} ${danger ? styles.btnDanger : ''}`}
                onClick={onClick}
            >
                {icon}
            </button>
        </Tooltip>
    );

    // Divider
    const Div = () => <div className={styles.divider} />;

    // ── Position: offset left so bar is truly centered ────────────────────────
    const BAR_W = isRoot ? 140 : (hasChildren ? 410 : 380); // Adjusted for new AI button

    return (
        <div
            ref={barRef}
            className={styles.barContainer}
            style={{
                left: Math.min(Math.max(pos.x - BAR_W / 2, 8), window.innerWidth - BAR_W - 8),
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
                            <div key={s} onClick={() => { handleAIApply(s); setAiOpen(false); }} className={styles.aiSuggestion}>
                                <PlusOutlined style={{ marginRight: 6, color: '#a5b4fc', fontSize: 10 }} />
                                {s}
                            </div>
                        ))}
                        {hasChildren && (
                            <div className={styles.aiSummarizeSection}>
                                <button
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
                        className={`${styles.btn} ${styles.btnAi}`}
                        onClick={() => setAiOpen(v => !v)}
                    >
                        <div className={styles.btnAiInner}>✨</div>
                    </button>
                </Tooltip>
            </Popover>

            <Div />

            {/* Add child */}
            <Btn icon="➕" tip="添加子节点 (Tab)"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.addChild(tpc, cleanMindMapChildNode()); })} />

            {/* Add sibling — not for root */}
            {!isRoot && (
                <Btn icon="↕️" tip="添加同级节点 (Enter)"
                    onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.insertSibling('after', tpc, cleanMindMapChildNode()); })} />
            )}

            {/* Duplicate — not for root */}
            {!isRoot && (
                <Btn icon="📋" tip="复制为同级 (Ctrl+D)"
                    onClick={() => act(() => { try { const tpc = getTpc(); if (tpc) mind.copyNode(tpc, tpc); } catch {} })} />
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
                content={
                    <div className={styles.colorGrid}>
                        {QUICK_COLORS.map(c => (
                            <div
                                key={c}
                                className={styles.colorItem}
                                title={c === 'transparent' ? '透明（继承）' : c}
                                onClick={() => {
                                    try {
                                        const tpc = getTpc();
                                        if (tpc) {
                                            const obj2 = getObj();
                                            reshapeNodePatch(tpc, obj2, { branchColor: c === 'transparent' ? undefined : c });
                                        }
                                    } catch {}
                                    setColorOpen(false);
                                }}
                                style={{
                                    background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 90deg, #fff 0 180deg) 0 / 10px 10px' : c,
                                }}
                            />
                        ))}
                    </div>
                }
            >
                <Tooltip title="连线颜色">
                    <button className={styles.btn} style={{ gap: 2 }} onClick={() => { setColorOpen(v => !v); setShapeOpen(false); }}>
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: obj.branchColor ?? '#6366f1',
                            border: '1px solid rgba(255,255,255,0.3)',
                        }} />
                        <span style={{ fontSize: 9 }}>▾</span>
                    </button>
                </Tooltip>
            </Popover>

            {/* Shape quick picker */}
            <Popover
                open={shapeOpen}
                onOpenChange={v => { setShapeOpen(v); if (v) setColorOpen(false); }}
                trigger="click"
                placement="top"
                arrow={false}
                content={
                    <div className={styles.shapeGrid}>
                        {SHAPES.map(({ key, label, preview }) => {
                            const current = (obj as any).shapeClass ?? '';
                            return (
                                <button key={key || 'default'}
                                    title={label}
                                    className={`${styles.shapeBtn} ${current === key ? styles.shapeBtnActive : ''}`}
                                    onClick={() => {
                                        try {
                                            const tpc = getTpc();
                                            if (tpc) reshapeNodePatch(tpc, obj, { shapeClass: key || undefined });
                                        } catch {}
                                        setShapeOpen(false);
                                    }}
                                >
                                    <div className={styles.shapePreview}>{preview}</div>
                                    <div className={styles.shapeLabel}>{label}</div>
                                </button>
                            );
                        })}
                    </div>
                }
            >
                <Tooltip title="节点形状">
                    <button className={styles.btn} onClick={() => { setShapeOpen(v => !v); setColorOpen(false); }}>
                        <span style={{ fontSize: 13 }}>◇</span>
                    </button>
                </Tooltip>
            </Popover>

            {/* Note quick edit */}
            <Popover
                open={noteOpen}
                onOpenChange={v => {
                    if (v) {
                        setNoteText(obj.note ?? '');
                        setColorOpen(false); setShapeOpen(false);
                    }
                    setNoteOpen(v);
                }}
                trigger="click"
                placement="top"
                arrow={false}
                content={
                    <div className={styles.notePopover}>
                        <textarea
                            className={styles.noteTextarea}
                            value={noteText}
                            onChange={e => setNoteText(e.target.value)}
                            placeholder="输入备注（支持 Markdown）..."
                            rows={4}
                        />
                        <div className={styles.noteActions}>
                            <button
                                className={styles.noteBtnClear}
                                onClick={() => {
                                    try { const tpc = getTpc(); if (tpc) reshapeNodePatch(tpc, obj, { note: undefined }); }
                                    catch {} setNoteOpen(false);
                                }}
                            >清除</button>
                            <button
                                className={styles.noteBtnSave}
                                onClick={() => {
                                    try { const tpc = getTpc(); if (tpc) reshapeNodePatch(tpc, obj, { note: noteText || undefined }); }
                                    catch {} setNoteOpen(false);
                                }}
                            >保存</button>
                        </div>
                    </div>
                }
            >
                <Tooltip title={obj.note ? '编辑备注' : '添加备注'}>
                    <button
                        className={styles.btn}
                        style={{ color: obj.note ? '#f59e0b' : 'rgba(255, 255, 255, 0.7)' }}
                        onClick={() => setNoteOpen(v => !v)}
                    >
                        <span style={{ fontSize: 13 }}>📝</span>
                    </button>
                </Tooltip>
            </Popover>

            {/* Boundary Toggle */}
            <Btn icon="📌" tip={(obj as any).boundary ? '取消外框分组' : '添加外框分组'}
                onClick={() => act(() => { 
                    const tpc = getTpc(); 
                    if (tpc) {
                        const newBoundary = (obj as any).boundary ? undefined : { color: '#818cf8', title: '新建分组' };
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
