/**
 * MindMapEmptyGuide.tsx — 空状态交互引导
 *
 * 当 MindMap 只有根节点（新建状态）时，
 * 在画布内显示动态提示气泡，引导用户开始使用。
 *
 * 设计参考：Notion、Whimsical 的空状态页面
 */

import React, { useEffect, useState } from 'react';
import { getMindElixirInstance, subscribeMindElixir } from './mindElixirStore';
import type { NodeObj } from 'mind-elixir';

function countNodes(node: NodeObj): number {
    return 1 + (node.children ?? []).reduce((acc, c) => acc + countNodes(c), 0);
}

const TIPS = [
    { icon: '⌨️', key: 'Tab',    tip: 'Tab — 添加子节点' },
    { icon: '↩️', key: 'Enter', tip: 'Enter — 添加同级节点' },
    { icon: '✏️', key: 'F2',    tip: 'F2 — 编辑节点文字' },
    { icon: '🔍', key: 'Ctrl+F', tip: 'Ctrl+F — 全文搜索' },
    { icon: '↩', key: 'Ctrl+Z', tip: 'Ctrl+Z — 撤销' },
];

const MindMapEmptyGuide: React.FC = () => {
    const [isEmpty, setIsEmpty] = useState(false);
    const [visible, setVisible] = useState(true);

    const mind = getMindElixirInstance();

    // Check if map is "empty" (only root node)
    const checkEmpty = () => {
        try {
            const data = mind?.getData();
            if (!data) return;
            const n = countNodes(data.nodeData);
            setIsEmpty(n <= 1);
        } catch {}
    };

    useEffect(() => {
        if (!mind) return;
        checkEmpty();
        mind.bus.addListener('operation', checkEmpty);
        return () => { mind.bus.removeListener('operation', checkEmpty); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mind]);

    // Also subscribe to mind instance changes
    useEffect(() => {
        const unsub = subscribeMindElixir(m => {
            if (m) setTimeout(checkEmpty, 500);
        });
        return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!isEmpty || !visible) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            userSelect: 'none',
        }}>
            {/* Main hint cloud */}
            <div style={{
                background: 'rgba(99,102,241,0.06)',
                border: '1.5px dashed rgba(99,102,241,0.25)',
                borderRadius: 16,
                padding: '20px 28px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                backdropFilter: 'blur(8px)',
                animation: 'emptyPulse 3s ease-in-out infinite',
            }}>
                <style>{`
                    @keyframes emptyPulse {
                        0%, 100% { opacity: 0.7; transform: scale(1);    }
                        50%       { opacity: 1;   transform: scale(1.01); }
                    }
                    @keyframes emptyFadeIn {
                        from { opacity: 0; transform: translateY(8px); }
                        to   { opacity: 1; transform: translateY(0); }
                    }
                `}</style>

                <div style={{ fontSize: 32, lineHeight: 1 }}>🧠</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'rgba(99,102,241,0.8)' }}>
                    点击根节点 · 开始思维导图
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', maxWidth: 220 }}>
                    双击根节点或按 <kbd style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace',
                    }}>Tab</kbd> 添加第一个子节点
                </div>
            </div>

            {/* Keyboard shortcuts row */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
                animation: 'emptyFadeIn 0.6s ease',
            }}>
                {TIPS.map(({ icon, key, tip }) => (
                    <div key={key} style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontSize: 11, color: 'rgba(255,255,255,0.45)',
                    }}>
                        <span>{icon}</span>
                        <kbd style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 3, padding: '0 4px',
                            fontFamily: 'monospace', fontSize: 10,
                        }}>{key}</kbd>
                        <span>{tip.split('—')[1]?.trim()}</span>
                    </div>
                ))}
            </div>

            {/* Dismiss */}
            <button
                onClick={() => setVisible(false)}
                style={{
                    pointerEvents: 'all',
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.25)',
                    fontSize: 11,
                    cursor: 'pointer',
                    padding: '2px 8px',
                    borderRadius: 4,
                    marginTop: -6,
                }}
            >
                不再显示 ×
            </button>
        </div>
    );
};

export default MindMapEmptyGuide;
