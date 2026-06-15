/**
 * MindMapBatchBar.tsx — 多节点批量操作浮动条
 *
 * 当用户通过 Ctrl+Click 选中多个节点时，底部弹出批量操作条：
 *  - 显示已选节点数量
 *  - 批量设置颜色（连线色）
 *  - 批量折叠 / 展开
 *  - 批量删除（带确认）
 *
 * 设计参考：Whimsical / Figma 多选操作栏
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Popover, Tooltip, Popconfirm } from 'antd';
import { getMindElixirInstance } from './mindElixirStore';
import type { NodeObj, Topic } from 'mind-elixir';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';

// ─── Quick palette for batch colour ──────────────────────────────────────────
const BATCH_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#22c55e', '#06b6d4',
    '#3b82f6', '#64748b',
];

interface BatchState {
    count: number;
    nodeEls: Topic[];
    nodeObjs: NodeObj[];
}

const EMPTY: BatchState = { count: 0, nodeEls: [], nodeObjs: [] };

const MindMapBatchBar: React.FC = () => {
    const [batch, setBatch] = useState<BatchState>(EMPTY);
    const [colorOpen, setColorOpen] = useState(false);

    const mind = getMindElixirInstance();

    useEffect(() => {
        if (!mind) return;

        const onSelectNodes = (objs: NodeObj[], els: Topic[]) => {
            if (!objs || objs.length < 2) {
                setBatch(EMPTY);
                return;
            }
            setBatch({ count: objs.length, nodeEls: els, nodeObjs: objs });
        };

        const onUnselect = () => { setBatch(EMPTY); setColorOpen(false); };

        mind.bus.addListener('selectNodes', onSelectNodes as any);
        mind.bus.addListener('unselectNodes', onUnselect);
        mind.bus.addListener('unselectNode', onUnselect);

        return () => {
            mind.bus.removeListener('selectNodes', onSelectNodes as any);
            mind.bus.removeListener('unselectNodes', onUnselect);
            mind.bus.removeListener('unselectNode', onUnselect);
        };
    }, [mind]);

    const handleBatchColor = useCallback((color: string) => {
        if (!mind) return;
        batch.nodeEls.forEach(el => {
            const obj = batch.nodeObjs.find(o => o.id === (el as HTMLElement).dataset?.nodeid);
            if (obj) {
                try { mind.reshapeNode(el, { ...obj, ...cleanMindMapNodePatch({ branchColor: color }) }); } catch {}
            }
        });
        setColorOpen(false);
    }, [mind, batch]);

    const handleBatchExpand = useCallback((expand: boolean) => {
        if (!mind) return;
        batch.nodeEls.forEach(el => {
            try { mind.expandNode(el, expand); } catch {}
        });
    }, [mind, batch]);

    const handleBatchDelete = useCallback(() => {
        if (!mind) return;
        try { mind.removeNodes(batch.nodeEls); } catch {}
        setBatch(EMPTY);
    }, [mind, batch]);

    if (batch.count < 2) return null;

    // ── Styles ────────────────────────────────────────────────────────────────
    const barStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9100,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        background: 'rgba(12,12,20,0.92)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1)',
        animation: 'batchBarIn 0.18s ease',
        whiteSpace: 'nowrap',
    };

    const btnBase: React.CSSProperties = {
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 10px', borderRadius: 7, cursor: 'pointer',
        fontSize: 12, fontWeight: 500,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.85)',
        transition: 'background 0.12s',
    };

    const DivV = () => <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)', margin: '0 2px' }} />;

    return (
        <div style={barStyle}>
            <style>{`
                @keyframes batchBarIn {
                    from { opacity:0; transform:translateX(-50%) translateY(12px) scale(0.95); }
                    to   { opacity:1; transform:translateX(-50%) translateY(0)    scale(1); }
                }
            `}</style>

            {/* Count badge */}
            <div style={{
                background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)',
                borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                color: '#a5b4fc',
            }}>
                {batch.count} 个节点已选
            </div>

            <DivV />

            {/* Batch color */}
            <Popover
                open={colorOpen}
                onOpenChange={setColorOpen}
                trigger="click"
                placement="top"
                arrow={false}
                content={
                    <div style={{ display: 'flex', gap: 6, padding: '4px 2px' }}>
                        {BATCH_COLORS.map(c => (
                            <div
                                key={c}
                                onClick={() => handleBatchColor(c)}
                                style={{
                                    width: 20, height: 20, borderRadius: 4, background: c,
                                    cursor: 'pointer', border: '2px solid rgba(255,255,255,0.15)',
                                    transition: 'transform 0.1s',
                                }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.2)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                            />
                        ))}
                    </div>
                }
            >
                <Tooltip title="批量设置连线颜色">
                    <div style={btnBase} onClick={() => setColorOpen(v => !v)}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                    >
                        🎨 颜色
                    </div>
                </Tooltip>
            </Popover>

            {/* Expand */}
            <Tooltip title="批量展开">
                <div style={btnBase} onClick={() => handleBatchExpand(true)}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                >
                    ▶ 展开
                </div>
            </Tooltip>

            {/* Collapse */}
            <Tooltip title="批量折叠">
                <div style={btnBase} onClick={() => handleBatchExpand(false)}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                >
                    ▼ 折叠
                </div>
            </Tooltip>

            <DivV />

            {/* Delete */}
            <Popconfirm
                title={`确认删除这 ${batch.count} 个节点吗？`}
                description="此操作不可撤销（除非手动 Ctrl+Z）"
                onConfirm={handleBatchDelete}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                placement="top"
            >
                <Tooltip title="批量删除选中节点">
                    <div style={{ ...btnBase, color: '#f87171', borderColor: 'rgba(239,68,68,0.2)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.15)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                    >
                        🗑️ 删除
                    </div>
                </Tooltip>
            </Popconfirm>
        </div>
    );
};

export default MindMapBatchBar;
