/**
 * MindMapContextMenu.tsx — 自定义右键上下文菜单
 * 替换 mind-elixir 内置菜单，集成所有自定义操作
 */
import React, { useEffect, useRef } from 'react';
import { getMindElixirInstance } from './mindElixirStore';

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

const MindMapContextMenu: React.FC<Props> = ({ visible, x, y, nodeId, onClose }) => {
    const mind = getMindElixirInstance();
    const ref = useRef<HTMLDivElement>(null);

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

    const getTpc = () => { try { return mind.findEle(nodeId); } catch { return null; } };
    const getObj = () => { try { return mind.getObjById(nodeId, mind.getData().nodeData); } catch { return null; } };
    const obj = getObj();
    const isRoot = nodeId === mind.getData()?.nodeData?.id;
    const isExpanded = obj?.expanded !== false;
    const hasChildren = (obj?.children?.length ?? 0) > 0;

    // Clamp to viewport
    const MENU_W = 220, MENU_H = 360;
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
                        maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {obj.topic}
                    </div>
                </div>
            )}

            <Item icon="✏️" label="编辑节点" kbd="F2"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.editTopic(tpc); })} />
            <Item icon="➕" label="添加子节点" kbd="Tab"
                onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.addChild(tpc); })} />
            {!isRoot && (
                <>
                    <Item icon="↕️" label="添加同级节点" kbd="Enter"
                        onClick={() => act(() => { const tpc = getTpc(); if (tpc) mind.insertSibling('after', tpc); })} />
                    <Item icon="📋" label="复制为同级" kbd="Ctrl+D"
                        onClick={() => act(() => {
                            try { const tpc = getTpc(); if (tpc) mind.copyNode(tpc, tpc); } catch {}
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
                onClick={() => act(() => { try { mind.createSummary(); } catch {} })} />

            {obj?.hyperLink && (
                <>
                    {DIVIDER}
                    <Item icon="🔗" label="打开超链接"
                        onClick={() => act(() => {
                            const url = obj.hyperLink!;
                            window.open(url.startsWith('http') ? url : `https://${url}`, '_blank', 'noopener,noreferrer');
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
