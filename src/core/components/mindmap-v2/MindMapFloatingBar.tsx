/**
 * MindMapFloatingBar.tsx — 选中节点浮动快捷操作条
 *
 * 行业标准 UX（参考 Whimsical / MindNode inline inspector）：
 *  - 选中节点时在节点正上方弹出一排图标气泡
 *  - 覆盖 90% 高频操作：添加子/兄弟、颜色、折叠/展开、删除
 *  - 无需打开侧边属性面板或右键菜单
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Tooltip, Popover } from 'antd';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance } from './mindElixirStore';
import { findNodeById } from './migrate';

// ─── Colour palette for quick branch color ─────────────────────────────────
const QUICK_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#64748b', '#ffffff', 'transparent',
];

// ─── Position tracking ────────────────────────────────────────────────────────
interface BarPos { x: number; y: number; nodeId: string; }

const MindMapFloatingBar: React.FC = () => {
    const [pos, setPos] = useState<BarPos | null>(null);
    const [colorOpen, setColorOpen] = useState(false);
    const [shapeOpen, setShapeOpen] = useState(false);
    const barRef = useRef<HTMLDivElement>(null);

    const mind = getMindElixirInstance();

    // ── Listen to selectNode / selectNodes events ────────────────────────────
    useEffect(() => {
        if (!mind) return;

        const onSelect = (node: NodeObj | null) => {
            if (!node) { setPos(null); setColorOpen(false); return; }
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

        const onDeselect = () => { setPos(null); setColorOpen(false); };

        // mind-elixir fires 'selectNode' with the NodeObj
        mind.bus.addListener('selectNode', onSelect);
        // Clicking canvas background fires 'unselectNode'
        mind.bus.addListener('unselectNode', onDeselect);
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
            mind.bus.removeListener('selectNode', onSelect);
            mind.bus.removeListener('unselectNode', onDeselect);
        };
    }, [mind]);

    // Close when clicking outside
    useEffect(() => {
        if (!pos) return;
        const handler = (e: MouseEvent) => {
            if (barRef.current && !barRef.current.contains(e.target as Node)) {
                setColorOpen(false);
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

    const act = (fn: () => void) => { fn(); setColorOpen(false); setShapeOpen(false); };

    // ── Button style ─────────────────────────────────────────────────────────
    const btnStyle: React.CSSProperties = {
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 7,
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.1)',
        cursor: 'pointer',
        fontSize: 13,
        color: 'rgba(255,255,255,0.85)',
        transition: 'background 0.12s, transform 0.1s',
        flexShrink: 0,
    };

    const BAR_W = isRoot ? 100 : (hasChildren ? 340 : 310);

    const Btn: React.FC<{ icon: string; tip: string; danger?: boolean; onClick: () => void }> = ({ icon, tip, danger, onClick }) => (
        <Tooltip title={tip} placement="top" mouseEnterDelay={0.4}>
            <div
                style={{ ...btnStyle, color: danger ? '#f87171' : btnStyle.color }}
                onClick={onClick}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.15)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1.1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
                {icon}
            </div>
        </Tooltip>
    );

    // ── Position: offset left so bar is truly centered ────────────────────────

    return (
        <div
            ref={barRef}
            style={{
                position: 'fixed',
                left: Math.min(Math.max(pos.x - BAR_W / 2, 8), window.innerWidth - BAR_W - 8),
                top: pos.y - 38,
                zIndex: 9000,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                padding: '4px 6px',
                background: 'rgba(12,12,20,0.9)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                animation: 'floatBarIn 0.12s ease',
                pointerEvents: 'all',
            }}
            // stop clicks from deselecting the node in canvas
            onMouseDown={e => e.stopPropagation()}
        >
            <style>{`@keyframes floatBarIn { from { opacity:0; transform:translateY(4px) scale(0.96) } to { opacity:1; transform:translateY(0) scale(1) } }`}</style>

            {/* Add child */}
            <Btn icon="➕" tip="添加子节点 (Tab)"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.addChild(tpc); })} />

            {/* Add sibling — not for root */}
            {!isRoot && (
                <Btn icon="↕️" tip="添加同级节点 (Enter)"
                    onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.insertSibling('after', tpc); })} />
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 5, padding: 4 }}>
                        {QUICK_COLORS.map(c => (
                            <div
                                key={c}
                                title={c === 'transparent' ? '透明（继承）' : c}
                                onClick={() => {
                                    try {
                                        const tpc = getTpc();
                                        if (tpc) {
                                            const obj2 = getObj();
                                            mind.reshapeNode(tpc, { ...obj2!, branchColor: c === 'transparent' ? undefined : c });
                                        }
                                    } catch {}
                                    setColorOpen(false);
                                }}
                                style={{
                                    width: 22, height: 22, borderRadius: 5,
                                    background: c === 'transparent' ? 'repeating-conic-gradient(#ccc 0 90deg, #fff 0 180deg) 0 / 10px 10px' : c,
                                    border: '1.5px solid rgba(0,0,0,0.15)',
                                    cursor: 'pointer', transition: 'transform 0.1s',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                            />
                        ))}
                    </div>
                }
            >
                <Tooltip title="连线颜色">
                    <div style={{ ...btnStyle, gap: 2 }}
                        onClick={() => { setColorOpen(v => !v); setShapeOpen(false); }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                    >
                        <div style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: obj.branchColor ?? '#6366f1',
                            border: '1px solid rgba(255,255,255,0.3)',
                        }} />
                        <span style={{ fontSize: 9 }}>▾</span>
                    </div>
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
                    <div style={{ display: 'flex', gap: 5, padding: 4 }}>
                        {SHAPES.map(({ key, label, preview }) => {
                            const current = (obj as any).shapeClass ?? '';
                            return (
                                <button key={key || 'default'}
                                    title={label}
                                    onClick={() => {
                                        try {
                                            const tpc = getTpc();
                                            if (tpc) mind.reshapeNode(tpc, { ...obj, ...({ shapeClass: key || undefined } as any) });
                                        } catch {}
                                        setShapeOpen(false);
                                    }}
                                    style={{
                                        width: 32, height: 32, borderRadius: 6, cursor: 'pointer',
                                        fontSize: 14, textAlign: 'center', display: 'flex',
                                        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                        border: current === key ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.12)',
                                        background: current === key ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                                        color: current === key ? '#a5b4fc' : 'rgba(255,255,255,0.7)',
                                    }}
                                >
                                    <div style={{ fontSize: 14 }}>{preview}</div>
                                    <div style={{ fontSize: 8, opacity: 0.6 }}>{label}</div>
                                </button>
                            );
                        })}
                    </div>
                }
            >
                <Tooltip title="节点形状">
                    <div style={{ ...btnStyle }}
                        onClick={() => { setShapeOpen(v => !v); setColorOpen(false); }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                    >
                        <span style={{ fontSize: 13 }}>◇</span>
                    </div>
                </Tooltip>
            </Popover>

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
