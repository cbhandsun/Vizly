/**
 * MindMapContextMenu.tsx — 自定义右键上下文菜单
 * 替换 mind-elixir 内置菜单，集成所有自定义操作
 *
 * v2: 修复 getObjById → findNodeById，新增形状快速选择
 */
import React, { useEffect, useRef, useState } from 'react';
import { getMindElixirInstance } from './mindElixirStore';
import { findNodeById } from './migrate';
import { toSafeExternalUrl } from '../../utils/sanitizeHtml';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { cleanMindMapChildNode } from './mindmapBridgeSecurity';
import { logMindmapContextMenuFailure } from './mindmapInteractionLogging';

interface CtxPos { visible: boolean; x: number; y: number; nodeId: string | null; }
interface Props extends CtxPos { onClose: () => void; }

const ITEM_STYLE: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 14px', cursor: 'pointer', borderRadius: 7,
    fontSize: 13, color: 'rgba(255,255,255,0.82)',
    transition: 'background 0.12s',
    userSelect: 'none', whiteSpace: 'nowrap',
};
const DIVIDER = <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 8px' }} />;

const KBD: React.FC<{ k: string }> = ({ k }) => (
    <kbd style={{
        marginLeft: 'auto', padding: '1px 5px', borderRadius: 4,
        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
        fontSize: 10, fontFamily: 'monospace', color: 'rgba(255,255,255,0.4)',
    }}>{k}</kbd>
);

// ─── Shape options ────────────────────────────────────────────────────────────
const SHAPES = [
    { key: '',          label: '默认', preview: '▭' },
    { key: 'oval',      label: '椭圆', preview: '◡' },
    { key: 'rect',      label: '矩形', preview: '□' },
    { key: 'underline', label: '下划线', preview: '▁' },
    { key: 'diamond',   label: '菱形', preview: '◇' },
];

const MindMapContextMenu: React.FC<Props> = ({ visible, x, y, nodeId, onClose }) => {
    const mind = getMindElixirInstance();
    const ref = useRef<HTMLDivElement>(null);
    const [shapeOpen, setShapeOpen] = useState(false);

    // Close on outside click or Escape
    useEffect(() => {
        if (!visible) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onClick, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('mousedown', onClick, true);
        };
    }, [visible, onClose]);

    if (!visible || !nodeId || !mind) return null;

    const getTpc = () => {
        try { return mind.findEle(nodeId); } catch (error) {
            logMindmapContextMenuFailure('findTopicElement', error);
            return null;
        }
    };
    // ✅ Using our own DFS instead of mind-elixir's getObjById (which doesn't exist in v5)
    const getObj = () => {
        try { return findNodeById(mind.getData().nodeData, nodeId); } catch (error) {
            logMindmapContextMenuFailure('findNodeObject', error);
            return null;
        }
    };
    const obj = getObj();
    const isRoot = nodeId === mind.getData()?.nodeData?.id;
    const isExpanded = obj?.expanded !== false;
    const hasChildren = (obj?.children?.length ?? 0) > 0;
    const currentShape = (obj as any)?.shapeClass ?? '';
    const safeHyperLink = obj?.hyperLink ? toSafeExternalUrl(String(obj.hyperLink)) : null;

    // Clamp to viewport
    const MENU_W = 230, MENU_H = 420;
    const cx = Math.min(x, window.innerWidth - MENU_W - 8);
    const cy = Math.min(y, window.innerHeight - MENU_H - 8);

    const act = (fn: () => void) => { fn(); onClose(); };

    const Item: React.FC<{ icon: string; label: string; kbd?: string; danger?: boolean; onClick: () => void }> =
        ({ icon, label, kbd: k, danger, onClick }) => (
            <div
                style={{ ...ITEM_STYLE, color: danger ? '#f87171' : ITEM_STYLE.color }}
                onClick={onClick}
                onMouseEnter={e => (e.currentTarget.style.background = danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                {k && <KBD k={k} />}
            </div>
        );

    return (
        <div
            ref={ref}
            style={{
                position: 'fixed', left: cx, top: cy, zIndex: 99999,
                background: 'rgba(12,12,18,0.92)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '6px 0',
                boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
                minWidth: MENU_W,
                animation: 'ctxMenuIn 0.12s ease',
            }}
        >
            <style>{`@keyframes ctxMenuIn { from { opacity:0; transform:scale(0.95) } to { opacity:1; transform:scale(1) } }`}</style>

            {/* Node info header */}
            {obj && (
                <div style={{ padding: '6px 14px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 4 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 2 }}>节点</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)',
                        maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {obj.topic}
                    </div>
                </div>
            )}

            <Item icon="✏️" label="编辑节点" kbd="F2"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.editTopic(tpc); })} />
            <Item icon="➕" label="添加子节点" kbd="Tab"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.addChild(tpc, cleanMindMapChildNode()); })} />
            {!isRoot && (
                <>
                    <Item icon="↕️" label="添加同级节点" kbd="Enter"
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.insertSibling('after', tpc, cleanMindMapChildNode()); })} />
                    <Item icon="📋" label="复制为同级" kbd="Ctrl+D"
                        onClick={() => act(() => {
                            try {
                                const tpc = getTpc();
                                if (tpc) mind.copyNode(tpc, tpc);
                            } catch (error) {
                                logMindmapContextMenuFailure('copyNode', error);
                            }
                        })} />
                </>
            )}

            {DIVIDER}

            {!isRoot && (
                <>
                    <Item icon="⬆️" label="向上移动"
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.moveUpNode(tpc); })} />
                    <Item icon="⬇️" label="向下移动"
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.moveDownNode(tpc); })} />
                    {DIVIDER}
                </>
            )}

            {hasChildren && (
                <Item icon={isExpanded ? '🔽' : '▶️'} label={isExpanded ? '折叠子节点' : '展开子节点'}
                    onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.expandNode(tpc, !isExpanded); })} />
            )}
            <Item icon="⌥" label="创建汇总括号"
                onClick={() => act(() => {
                    try {
                        mind.createSummary();
                    } catch (error) {
                        logMindmapContextMenuFailure('createSummary', error);
                    }
                })} />

            {DIVIDER}

            {/* ── Shape quick-pick ─────────────────────────────────────────── */}
            <div
                style={{ ...ITEM_STYLE, flexDirection: 'column', alignItems: 'flex-start', gap: 6, paddingBottom: 10 }}
                onClick={() => setShapeOpen(v => !v)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                    <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>🔷</span>
                    <span style={{ flex: 1 }}>节点形状</span>
                    <span style={{ fontSize: 10, opacity: 0.4 }}>{shapeOpen ? '▲' : '▼'}</span>
                </div>
                {shapeOpen && (
                    <div style={{ display: 'flex', gap: 4, width: '100%', paddingLeft: 28 }}
                        onClick={e => e.stopPropagation()}
                    >
                        {SHAPES.map(({ key, label, preview }) => (
                            <button
                                key={key || 'default'}
                                title={label}
                                onClick={() => {
                                    const tpc = getTpc();
                                    if (!tpc || !obj) { onClose(); return; }
                                    try {
                                        mind.reshapeNode(tpc, { ...obj, ...cleanMindMapNodePatch({ shapeClass: key || undefined }) });
                                    } catch (error) {
                                        logMindmapContextMenuFailure('setShapeClass', error);
                                    }
                                    onClose();
                                }}
                                style={{
                                    flex: 1, padding: '4px 2px', borderRadius: 5, cursor: 'pointer',
                                    fontSize: 15, textAlign: 'center',
                                    border: currentShape === key
                                        ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.12)',
                                    background: currentShape === key
                                        ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                                    color: currentShape === key ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
                                }}
                            >
                                <div>{preview}</div>
                                <div style={{ fontSize: 9, opacity: 0.6, marginTop: 1 }}>{label}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {safeHyperLink && (
                <>
                    {DIVIDER}
                    <Item icon="🔗" label="打开超链接"
                        onClick={() => act(() => {
                            window.open(safeHyperLink, '_blank', 'noopener,noreferrer');
                        })} />
                </>
            )}

            {!isRoot && (
                <>
                    {DIVIDER}
                    <Item icon="🗑️" label="删除节点" kbd="Del" danger
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.removeNodes([tpc]); })} />
                </>
            )}
        </div>
    );
};

export type { CtxPos };
export default MindMapContextMenu;
