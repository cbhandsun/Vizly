/**
 * MindMapOutlinePanel.tsx — 大纲视图侧面板
 * XMind / Notion 风格：所有节点按树形缩进列出，点击定位，内置搜索过滤
 */
import React, { useEffect, useState, useCallback } from 'react';
import type { MindElixirData, NodeObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { subscribeOutline } from './mindmapOutlineStore';
import { nodeObjToMarkdown, downloadText, findNodeById } from './migrate';
import { cleanMindMapData, cleanMindMapTopic } from './mindmapTreeSanitizer';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import { emitVizlyMindMapOperation, refreshVizlyMindMapData } from './mindmapOperationBridge';
import {
    logMindmapOutlineAddFailure,
    logMindmapOutlineDeleteFailure,
    logMindmapOutlineEditFailure,
    logMindmapOutlineExportFailure,
    logMindmapOutlineInvalidDrop,
    logMindmapOutlineRefreshFailure,
    logMindmapOutlineSelectFailure,
    logMindmapOutlineUpdateFailure,
} from './mindmapPanelLogging';

// ─── Flatten tree → array ─────────────────────────────────────────────────────
interface FlatNode {
    id: string; topic: string; depth: number;
    hasNote: boolean; hasLink: boolean;
    icons: string[];
}

function flattenTree(node: NodeObj, depth = 0, result: FlatNode[] = []): FlatNode[] {
    result.push({
        id: node.id,
        topic: node.topic || '(无标题)',
        depth,
        hasNote: !!node.note,
        hasLink: !!node.hyperLink,
        icons: ((node.icons as string[]) ?? []).slice(0, 2),
    });
    (node.children ?? []).forEach(c => flattenTree(c, depth + 1, result));
    return result;
}

function findNodeAndParent(
    root: NodeObj,
    targetId: string,
    parent: NodeObj | null = null
): { node: NodeObj; parent: NodeObj | null; index: number } | null {
    if (root.id === targetId) {
        return { node: root, parent, index: -1 };
    }
    if (root.children) {
        for (let i = 0; i < root.children.length; i++) {
            const child = root.children[i];
            if (child.id === targetId) {
                return { node: child, parent: root, index: i };
            }
            const result = findNodeAndParent(child, targetId, root);
            if (result) return result;
        }
    }
    return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
const MindMapOutlinePanel: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [nodes, setNodes] = useState<FlatNode[]>([]);
    const [query, setQuery] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [mind, setMind] = useState(getMindElixirInstance());

    // Inline edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTopicValue, setEditTopicValue] = useState('');

    // Drag-and-drop states
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'inside' | null>(null);

    useEffect(() => subscribeMindElixir(m => setMind(m)), []);
    useEffect(() => subscribeOutline(v => setOpen(v)), []);

    const refresh = useCallback(() => {
        try {
            const data = mind?.getData();
            if (!data) return;
            setNodes(flattenTree(data.nodeData));
        } catch (error) {
            logMindmapOutlineRefreshFailure(error);
        }
    }, [mind]);

    useEffect(() => {
        if (!mind || !open) return;
        const initialRefreshTimer = window.setTimeout(refresh, 0);
        const onOp = () => { setTimeout(refresh, 80); };
        const onSelectNodes = (selectedNodes: NodeObj[]) => setActiveId(selectedNodes[0]?.id ?? null);
        const onSelectNewNode = (nodeObj: NodeObj) => setActiveId(nodeObj.id);
        const onDeselect = (_selectedNodes: NodeObj[]) => setActiveId(null);
        mind.bus.addListener('operation', onOp);
        mind.bus.addListener('selectNodes', onSelectNodes);
        mind.bus.addListener('selectNewNode', onSelectNewNode);
        mind.bus.addListener('unselectNodes', onDeselect);
        return () => {
            window.clearTimeout(initialRefreshTimer);
            mind.bus.removeListener('operation', onOp);
            mind.bus.removeListener('selectNodes', onSelectNodes);
            mind.bus.removeListener('selectNewNode', onSelectNewNode);
            mind.bus.removeListener('unselectNodes', onDeselect);
        };
    }, [mind, open, refresh]);

    const updateTreeAndSave = useCallback((updater: (data: MindElixirData) => boolean) => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const success = updater(data);
            if (success) {
                const cleanData = cleanMindMapData(data);
                refreshVizlyMindMapData(mind, cleanData);
                emitVizlyMindMapOperation(mind, {
                    name: 'outline_structure_change',
                    obj: cleanData.nodeData,
                });
                setTimeout(refresh, 80);
            }
        } catch (e) {
            logMindmapOutlineUpdateFailure(e);
        }
    }, [mind, refresh]);

    const handleClick = useCallback((id: string) => {
        if (!mind) return;
        try {
            const tpc = mind.findEle(id);
            if (tpc) { mind.selectNode(tpc); mind.toCenter(); }
        } catch (error) {
            logMindmapOutlineSelectFailure(error);
        }
        setActiveId(id);
    }, [mind]);

    const handleCreateSibling = useCallback((id: string) => {
        updateTreeAndSave(data => {
            const result = findNodeAndParent(data.nodeData, id);
            if (!result || !result.parent) return false; // Root node cannot have sibling
            
            const newId = `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const newNode = cleanMindMapChildNode({}, newId);
            result.parent.children?.splice(result.index + 1, 0, newNode);
            
            setTimeout(() => {
                setEditingId(newId);
                setEditTopicValue('');
                handleClick(newId);
            }, 120);
            return true;
        });
    }, [handleClick, updateTreeAndSave]);

    const handleIndent = useCallback((id: string) => {
        const currentText = cleanMindMapTopic(editTopicValue, '');
        updateTreeAndSave(data => {
            const result = findNodeAndParent(data.nodeData, id);
            if (!result || !result.parent || result.index <= 0) return false;
            
            const prevSibling = result.parent.children?.[result.index - 1];
            if (!prevSibling) return false;
            
            result.node.topic = currentText;
            result.parent.children?.splice(result.index, 1);
            
            if (!prevSibling.children) prevSibling.children = [];
            prevSibling.children.push(result.node);
            prevSibling.expanded = true;
            
            setTimeout(() => {
                setEditingId(id);
                setEditTopicValue(currentText);
                handleClick(id);
            }, 120);
            
            return true;
        });
    }, [editTopicValue, handleClick, updateTreeAndSave]);

    const handleOutdent = useCallback((id: string) => {
        const currentText = cleanMindMapTopic(editTopicValue, '');
        updateTreeAndSave(data => {
            const result = findNodeAndParent(data.nodeData, id);
            if (!result || !result.parent || result.parent.id === 'root') return false;
            
            const gpResult = findNodeAndParent(data.nodeData, result.parent.id);
            if (!gpResult) return false;
            
            result.node.topic = currentText;
            result.parent.children?.splice(result.index, 1);
            
            const parentIndex = gpResult.node.children?.findIndex(c => c.id === result.parent!.id) ?? -1;
            if (parentIndex !== -1) {
                gpResult.node.children?.splice(parentIndex + 1, 0, result.node);
            } else {
                if (!gpResult.node.children) gpResult.node.children = [];
                gpResult.node.children.push(result.node);
            }
            
            setTimeout(() => {
                setEditingId(id);
                setEditTopicValue(currentText);
                handleClick(id);
            }, 120);
            
            return true;
        });
    }, [editTopicValue, handleClick, updateTreeAndSave]);

    const handleArrowMove = useCallback((id: string, dir: 'up' | 'down') => {
        const val = cleanMindMapTopic(editTopicValue, '').trim();
        if (val && mind) {
            const tpc = mind.findEle(id);
            if (tpc) {
                mind.setNodeTopic(tpc, val);
            }
        }
        
        const filteredList = query.trim()
            ? nodes.filter(n => n.topic.toLowerCase().includes(query.toLowerCase()))
            : nodes;
            
        const idx = filteredList.findIndex(n => n.id === id);
        if (idx === -1) return;
        
        let targetNode;
        if (dir === 'up' && idx > 0) {
            targetNode = filteredList[idx - 1];
        } else if (dir === 'down' && idx < filteredList.length - 1) {
            targetNode = filteredList[idx + 1];
        }
        
        if (targetNode) {
            setEditingId(targetNode.id);
            setEditTopicValue(targetNode.topic);
            handleClick(targetNode.id);
        }
    }, [editTopicValue, handleClick, mind, nodes, query]);

    const handleExportMarkdown = useCallback(() => {
        if (!mind) return;
        try {
            const data = mind.getData();
            const mdText = nodeObjToMarkdown(data.nodeData);
            const filename = `${data.nodeData.topic || 'mindmap'}_outline.md`;
            downloadText(filename, mdText, 'text/markdown;charset=utf-8');
        } catch (e) {
            logMindmapOutlineExportFailure(e);
        }
    }, [mind]);

    // ── Drag & Drop Handlers ──────────────────────────────────────────────────
    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('text/plain', id);
        setDraggingId(id);
    };

    const handleDragOver = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggingId || draggingId === targetId) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const height = rect.height;

        let pos: 'before' | 'after' | 'inside' = 'inside';
        if (relativeY < height * 0.3) {
            pos = 'before';
        } else if (relativeY > height * 0.7) {
            pos = 'after';
        }

        setDragOverId(targetId);
        setDropPosition(pos);
    };

    const handleDragLeave = () => {
        setDragOverId(null);
        setDropPosition(null);
    };

    const handleDragEnd = () => {
        setDraggingId(null);
        setDragOverId(null);
        setDropPosition(null);
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        const dragId = draggingId || e.dataTransfer.getData('text/plain');
        handleDragEnd();

        if (!dragId || dragId === targetId) return;

        updateTreeAndSave(data => {
            const dragNode = findNodeById(data.nodeData, dragId);
            if (!dragNode) return false;

            // Target cannot be a descendant of dragNode (no cycles)
            const targetIsDescendant = findNodeById(dragNode, targetId);
            if (targetIsDescendant) {
                logMindmapOutlineInvalidDrop();
                return false;
            }

            const dragResult = findNodeAndParent(data.nodeData, dragId);
            if (!dragResult || !dragResult.parent) return false; // Root cannot be dragged

            const targetResult = findNodeAndParent(data.nodeData, targetId);
            if (!targetResult) return false;

            // Remove dragNode from original parent
            const parentChildren = dragResult.parent.children ?? [];
            const dragIdx = parentChildren.findIndex(c => c.id === dragId);
            if (dragIdx !== -1) {
                parentChildren.splice(dragIdx, 1);
            }

            // Insert based on drop position
            if (dropPosition === 'inside') {
                if (!targetResult.node.children) targetResult.node.children = [];
                targetResult.node.children.push(dragNode);
                targetResult.node.expanded = true;
            } else {
                const targetParent = targetResult.parent;
                if (!targetParent) {
                    // Fallback to inserting as child of root
                    if (!targetResult.node.children) targetResult.node.children = [];
                    targetResult.node.children.push(dragNode);
                } else {
                    const tChildren = targetParent.children ?? [];
                    const tIdx = tChildren.findIndex(c => c.id === targetId);
                    if (tIdx !== -1) {
                        const insertIdx = dropPosition === 'before' ? tIdx : tIdx + 1;
                        tChildren.splice(insertIdx, 0, dragNode);
                    } else {
                        tChildren.push(dragNode);
                    }
                }
            }
            return true;
        });
    };

    const startEdit = useCallback((id: string, currentTopic: string) => {
        setEditingId(id);
        setEditTopicValue(currentTopic);
    }, []);

    const finishEdit = useCallback((id: string) => {
        setEditingId(null);
        const val = cleanMindMapTopic(editTopicValue, '').trim();
        if (!val || !mind) return;
        try {
            const tpc = mind.findEle(id);
            if (tpc) {
                mind.setNodeTopic(tpc, val);
                refresh();
            }
        } catch (e) {
            logMindmapOutlineEditFailure(e);
        }
    }, [editTopicValue, mind, refresh]);

    const handleAddChild = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!mind) return;
        try {
            const tpc = mind.findEle(id);
            if (tpc) {
                mind.addChild(tpc, cleanMindMapChildNode());
                setTimeout(refresh, 100);
            }
        } catch (e) {
            logMindmapOutlineAddFailure(e);
        }
    }, [mind, refresh]);

    const handleDeleteNode = useCallback((e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!mind) return;
        const isRoot = id === mind.getData()?.nodeData?.id;
        if (isRoot) return;
        try {
            const tpc = mind.findEle(id);
            if (tpc) {
                mind.removeNodes([tpc]);
                setTimeout(refresh, 100);
            }
        } catch (e) {
            logMindmapOutlineDeleteFailure(e);
        }
    }, [mind, refresh]);

    if (!open) return null;

    const filtered = query.trim()
        ? nodes.filter(n => n.topic.toLowerCase().includes(query.toLowerCase()))
        : nodes;

    const INDENT = 12;
    const depthColor = (d: number) =>
        d === 0 ? '#a5b4fc' : d === 1 ? '#c4b5fd' : d === 2 ? '#d8b4fe' : 'rgba(255,255,255,0.5)';

    return (
        <div style={{
            position: 'absolute',
            right: 0, top: 0, bottom: 0, width: 262,
            background: 'rgba(9,9,15,0.93)',
            backdropFilter: 'blur(24px)',
            borderLeft: '1px solid rgba(255,255,255,0.07)',
            zIndex: 800,
            display: 'flex', flexDirection: 'column',
            animation: 'outlineIn 0.16s ease',
        }}>
            <style>{`
                @keyframes outlineIn {
                    from { opacity:0; transform:translateX(16px); }
                    to   { opacity:1; transform:translateX(0); }
                }
                .outline-item:hover { background: rgba(255,255,255,0.04) !important; }
                .outline-item .actions { opacity: 0; transition: opacity 0.12s ease; display: flex; gap: 6px; margin: 0 4px; }
                .outline-item:hover .actions { opacity: 1; }
                .outline-scroll::-webkit-scrollbar { width: 3px; }
                .outline-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }
            `}</style>

            {/* Header */}
            <div style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <span style={{ fontSize: 13 }}>📋</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', flex: 1 }}>大纲视图</span>
                <button onClick={handleExportMarkdown} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.4)', fontSize: 11, marginRight: 6,
                    transition: 'color 0.12s', display: 'flex', alignItems: 'center', gap: 2,
                }}
                title="导出 Markdown 大纲"
                onMouseEnter={e => (e.currentTarget.style.color = '#6366f1')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                >
                    📥 导出
                </button>
                <button onClick={() => setOpen(false)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.3)', fontSize: 16, lineHeight: 1,
                }} title="关闭 (Alt+O)">×</button>
            </div>

            {/* Search */}
            <div style={{ padding: '7px 10px 4px' }}>
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="🔍 搜索节点..."
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '4px 9px', borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.09)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'rgba(255,255,255,0.75)',
                        fontSize: 11, outline: 'none',
                    }}
                />
            </div>

            {/* Node list */}
            <div className="outline-scroll" style={{ flex: 1, overflowY: 'auto', padding: '2px 5px 8px' }}>
                {filtered.map(n => (
                    <div
                        key={n.id}
                        className="outline-item"
                        draggable={n.id !== 'root' && editingId !== n.id}
                        onDragStart={(e) => handleDragStart(e, n.id)}
                        onDragOver={(e) => handleDragOver(e, n.id)}
                        onDragLeave={handleDragLeave}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDrop(e, n.id)}
                        onClick={() => handleClick(n.id)}
                        onDoubleClick={() => startEdit(n.id, n.topic)}
                        title={editingId === n.id ? undefined : "双击编辑，单击定位 (拖拽排序)"}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: `4px 8px 4px ${8 + n.depth * INDENT}px`,
                            borderRadius: 5, cursor: 'pointer', marginBottom: 1,
                            borderTop: dragOverId === n.id && dropPosition === 'before' ? '2px solid #6366f1' : undefined,
                            borderBottom: dragOverId === n.id && dropPosition === 'after' ? '2px solid #6366f1' : undefined,
                            background: dragOverId === n.id && dropPosition === 'inside'
                                ? 'rgba(99, 102, 241, 0.24) !important'
                                : (activeId === n.id ? 'rgba(99,102,241,0.14)' : 'transparent'),
                            borderLeft: `2px solid ${activeId === n.id ? '#6366f1' : 'transparent'}`,
                            transition: 'background 0.1s',
                        }}
                    >
                        {n.depth > 0 && (
                            <div style={{
                                width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
                                background: depthColor(n.depth), opacity: 0.7,
                            }} />
                        )}
                        {n.depth === 0 && <span style={{ fontSize: 11, flexShrink: 0 }}>🧠</span>}
                        
                        {editingId === n.id ? (
                            <input
                                value={editTopicValue}
                                onChange={e => setEditTopicValue(e.target.value)}
                                onBlur={() => finishEdit(n.id)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const val = cleanMindMapTopic(editTopicValue, '').trim();
                                        if (val && mind) {
                                            const tpc = mind.findEle(n.id);
                                            if (tpc) mind.setNodeTopic(tpc, val);
                                        }
                                        setEditingId(null);
                                        handleCreateSibling(n.id);
                                    }
                                    else if (e.key === 'Tab') {
                                        e.preventDefault();
                                        if (e.shiftKey) {
                                            handleOutdent(n.id);
                                        } else {
                                            handleIndent(n.id);
                                        }
                                    }
                                    else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        handleArrowMove(n.id, 'up');
                                    }
                                    else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        handleArrowMove(n.id, 'down');
                                    }
                                    else if (e.key === 'Escape') {
                                        setEditingId(null);
                                    }
                                }}
                                autoFocus
                                style={{
                                    flex: 1,
                                    fontSize: 11,
                                    background: 'rgba(255,255,255,0.08)',
                                    border: '1px solid #6366f1',
                                    borderRadius: 4,
                                    color: '#fff',
                                    padding: '1px 4px',
                                    outline: 'none',
                                }}
                                onClick={e => e.stopPropagation()}
                            />
                        ) : (
                            <span style={{
                                flex: 1, fontSize: 11,
                                color: activeId === n.id ? '#c7d2fe' : depthColor(n.depth),
                                fontWeight: n.depth <= 1 ? 600 : 400,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {n.topic}
                            </span>
                        )}

                        <div className="actions" onClick={e => e.stopPropagation()}>
                            <button
                                title="添加子节点"
                                onClick={(e) => handleAddChild(e, n.id)}
                                style={{
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: 'rgba(255,255,255,0.4)', fontSize: 11, padding: '0 2px',
                                    transition: 'color 0.12s', display: 'flex', alignItems: 'center'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.color = '#6366f1')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                            >
                                ➕
                            </button>
                            {n.depth > 0 && (
                                <button
                                    title="删除节点"
                                    onClick={(e) => handleDeleteNode(e, n.id)}
                                    style={{
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: 'rgba(255,255,255,0.4)', fontSize: 11, padding: '0 2px',
                                        transition: 'color 0.12s', display: 'flex', alignItems: 'center'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
                                >
                                    🗑️
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            {n.icons.map(ic => <span key={ic} style={{ fontSize: 9 }}>{ic}</span>)}
                            {n.hasNote && <span title="有备注" style={{ fontSize: 9, opacity: 0.45 }}>📝</span>}
                            {n.hasLink && <span title="有超链接" style={{ fontSize: 9, opacity: 0.45 }}>🔗</span>}
                        </div>
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>
                        {query ? '无匹配节点' : '暂无节点'}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: '5px 14px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                fontSize: 10, color: 'rgba(255,255,255,0.25)',
                display: 'flex', justifyContent: 'space-between',
            }}>
                <span>共 {nodes.length} 个节点</span>
                <span>Alt+O 切换</span>
            </div>
        </div>
    );
};

export default MindMapOutlinePanel;
