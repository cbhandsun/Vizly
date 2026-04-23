/**
 * MindMapOutlinePanel.tsx — 大纲视图侧面板
 * XMind / Notion 风格：所有节点按树形缩进列出，点击定位，内置搜索过滤
 */
import React, { useEffect, useState, useCallback } from 'react';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import { subscribeOutline } from './mindmapOutlineStore';

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

// ─── Component ────────────────────────────────────────────────────────────────
const MindMapOutlinePanel: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [nodes, setNodes] = useState<FlatNode[]>([]);
    const [query, setQuery] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [mind, setMind] = useState(getMindElixirInstance());

    useEffect(() => subscribeMindElixir(m => setMind(m)), []);
    useEffect(() => subscribeOutline(v => setOpen(v)), []);

    const refresh = useCallback(() => {
        try {
            const data = mind?.getData();
            if (!data) return;
            setNodes(flattenTree(data.nodeData));
        } catch {}
    }, [mind]);

    useEffect(() => {
        if (!mind || !open) return;
        refresh();
        const onOp = () => { setTimeout(refresh, 80); };
        const onSelect = (nodeObj: NodeObj | null) => setActiveId((nodeObj as any)?.id ?? null);
        const onDeselect = () => setActiveId(null);
        mind.bus.addListener('operation', onOp);
        mind.bus.addListener('selectNode', onSelect as any);
        mind.bus.addListener('unselectNode', onDeselect);
        return () => {
            mind.bus.removeListener('operation', onOp);
            mind.bus.removeListener('selectNode', onSelect as any);
            mind.bus.removeListener('unselectNode', onDeselect);
        };
    }, [mind, open, refresh]);

    const handleClick = useCallback((id: string) => {
        if (!mind) return;
        try {
            const tpc = mind.findEle(id);
            if (tpc) { mind.selectNode(tpc); mind.toCenter(); }
        } catch {}
        setActiveId(id);
    }, [mind]);

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
                        onClick={() => handleClick(n.id)}
                        title={n.topic}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: `3px 8px 3px ${8 + n.depth * INDENT}px`,
                            borderRadius: 5, cursor: 'pointer', marginBottom: 1,
                            background: activeId === n.id ? 'rgba(99,102,241,0.14)' : 'transparent',
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
                        <span style={{
                            flex: 1, fontSize: 11,
                            color: activeId === n.id ? '#c7d2fe' : depthColor(n.depth),
                            fontWeight: n.depth <= 1 ? 600 : 400,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                            {n.topic}
                        </span>
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
