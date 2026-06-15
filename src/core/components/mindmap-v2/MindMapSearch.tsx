/**
 * MindMapSearch.tsx — 节点全文搜索 + 批量替换
 *
 * v2 新增：
 *  - 展开/折叠 Replace 输入行
 *  - Replace One (当前匹配项替换)
 *  - Replace All (全部替换，记录历史)
 *  - 替换后自动导航到下一匹配
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined, CloseOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance } from './mindElixirStore';
import { findNodeById } from './migrate';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function collectAllNodes(root: NodeObj): NodeObj[] {
    const result: NodeObj[] = [];
    function dfs(n: NodeObj) { result.push(n); for (const c of n.children ?? []) dfs(c); }
    dfs(root);
    return result;
}

// ─── CSS injection ────────────────────────────────────────────────────────────
const SEARCH_STYLE_ID = 'me-search-highlight-style';
function injectSearchCSS() {
    if (document.getElementById(SEARCH_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SEARCH_STYLE_ID;
    style.textContent = `
        me-tpc.search-match {
            outline: 2px solid #f59e0b !important;
            outline-offset: 2px !important;
        }
        me-tpc.search-match-active {
            outline: 2.5px solid #6366f1 !important;
            outline-offset: 2px !important;
            background: rgba(99,102,241,0.12) !important;
        }
    `;
    document.head.appendChild(style);
}

function clearSearchHighlights() {
    document.querySelectorAll('me-tpc.search-match, me-tpc.search-match-active').forEach(el => {
        el.classList.remove('search-match', 'search-match-active');
    });
}

// ─── Component ────────────────────────────────────────────────────────────────
interface MindMapSearchProps { open: boolean; onClose: () => void; }

const MindMapSearch: React.FC<MindMapSearchProps> = ({ open, onClose }) => {
    const mind = getMindElixirInstance();
    const inputRef = useRef<any>(null);

    const [query, setQuery] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [matchIdx, setMatchIdx] = useState(0);
    const [replaceCount, setReplaceCount] = useState<number | null>(null);

    const matchIds = useMemo<string[]>(() => {
        if (!mind || !query.trim()) return [];
        try {
            const all = collectAllNodes(mind.getData().nodeData);
            return all.filter(n => n.topic.toLowerCase().includes(query.toLowerCase())).map(n => n.id);
        } catch { return []; }
    }, [mind, query]);

    // Sync highlights
    useEffect(() => {
        injectSearchCSS();
        clearSearchHighlights();
        if (!mind || matchIds.length === 0) return;
        matchIds.forEach(id => {
            try { const el = mind.findEle(id); if (el) el.classList.add('search-match'); } catch {}
        });
        const currentId = matchIds[Math.min(matchIdx, matchIds.length - 1)];
        if (currentId) {
            try {
                const el = mind.findEle(currentId);
                if (el) {
                    el.classList.remove('search-match');
                    el.classList.add('search-match-active');
                    mind.scrollIntoView(el);
                    mind.selectNode(el);
                }
            } catch {}
        }
    }, [mind, matchIds, matchIdx]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setMatchIdx(0);
            setReplaceCount(null);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [matchIds.length, query]);

    useEffect(() => {
        let timer: number | undefined;
        if (open) {
            timer = window.setTimeout(() => inputRef.current?.focus(), 80);
        } else {
            clearSearchHighlights();
            timer = window.setTimeout(() => {
                setQuery('');
                setReplaceText('');
                setShowReplace(false);
                setReplaceCount(null);
            }, 0);
        }
        return () => {
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [open]);

    // Escape key
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        };
        document.addEventListener('keydown', handler, true);
        return () => document.removeEventListener('keydown', handler, true);
    }, [open, onClose]);

    const goNext = useCallback(() => {
        if (matchIds.length === 0) return;
        setMatchIdx(i => (i + 1) % matchIds.length);
    }, [matchIds.length]);

    const goPrev = useCallback(() => {
        if (matchIds.length === 0) return;
        setMatchIdx(i => (i - 1 + matchIds.length) % matchIds.length);
    }, [matchIds.length]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) goPrev(); else goNext(); }
    }, [goNext, goPrev]);

    // ── Replace helpers ──────────────────────────────────────────────────────
    const doReplaceOne = useCallback(() => {
        if (!mind || matchIds.length === 0 || !query.trim()) return;
        const id = matchIds[Math.min(matchIdx, matchIds.length - 1)];
        try {
            const obj = findNodeById(mind.getData().nodeData, id);
            if (!obj) return;
            const tpc = mind.findEle(id);
            if (!tpc) return;
            const newTopic = obj.topic.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceText);
            mind.reshapeNode(tpc as any, { ...obj, ...cleanMindMapNodePatch({ topic: newTopic }) });
            setReplaceCount(1);
            // Move to next after replacing
            setTimeout(() => goNext(), 60);
        } catch {}
    }, [mind, matchIds, matchIdx, query, replaceText, goNext]);

    const doReplaceAll = useCallback(() => {
        if (!mind || matchIds.length === 0 || !query.trim()) return;
        let count = 0;
        const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        for (const id of matchIds) {
            try {
                const obj = findNodeById(mind.getData().nodeData, id);
                if (!obj) continue;
                const tpc = mind.findEle(id);
                if (!tpc) continue;
                const newTopic = obj.topic.replace(regex, replaceText);
                if (newTopic !== obj.topic) {
                    mind.reshapeNode(tpc as any, { ...obj, ...cleanMindMapNodePatch({ topic: newTopic }) });
                    count++;
                }
            } catch {}
        }
        setReplaceCount(count);
        setMatchIdx(0);
    }, [mind, matchIds, query, replaceText]);

    if (!open) return null;

    const total = matchIds.length;
    const current = total > 0 ? Math.min(matchIdx, total - 1) + 1 : 0;

    // ── Shared button style ───────────────────────────────────────────────────
    const iconBtn = (disabled: boolean): React.CSSProperties => ({
        background: 'transparent', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)',
        padding: '2px 4px', borderRadius: 4, lineHeight: 1, transition: 'color 0.15s',
    });

    const replaceBtn = (primary = false): React.CSSProperties => ({
        padding: '2px 8px', borderRadius: 5, cursor: total === 0 ? 'not-allowed' : 'pointer',
        fontSize: 11, fontWeight: 600, border: 'none', transition: 'background 0.12s',
        background: total === 0 ? 'rgba(255,255,255,0.06)' : primary ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)',
        color: total === 0 ? 'rgba(255,255,255,0.25)' : primary ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
    });

    return (
        <div id="me-search-panel" style={{
            position: 'absolute',
            top: 12, right: 16, zIndex: 999,
            display: 'flex', flexDirection: 'column', gap: 0,
            background: 'rgba(12,12,20,0.92)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            minWidth: 300,
            overflow: 'hidden',
        }}>
            {/* ── Search row ─────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}>
                <SearchOutlined style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, flexShrink: 0 }} />
                <Input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="搜索节点..."
                    variant="borderless"
                    style={{ flex: 1, color: '#fff', background: 'transparent', fontSize: 13, padding: '0 4px' }}
                    styles={{ input: { color: '#fff' } }}
                />
                {query.trim() && (
                    <span style={{
                        fontSize: 11, whiteSpace: 'nowrap', minWidth: 40, textAlign: 'center',
                        color: total > 0 ? 'rgba(255,255,255,0.6)' : '#ef4444',
                    }}>
                        {total > 0 ? `${current}/${total}` : '无匹配'}
                    </span>
                )}
                <button onClick={goPrev} style={iconBtn(total === 0)} title="上一个 (Shift+Enter)">
                    <UpOutlined style={{ fontSize: 11 }} />
                </button>
                <button onClick={goNext} style={iconBtn(total === 0)} title="下一个 (Enter)">
                    <DownOutlined style={{ fontSize: 11 }} />
                </button>
                {/* Toggle replace row */}
                <button
                    onClick={() => setShowReplace(v => !v)}
                    title={showReplace ? '关闭替换' : '展开替换 (Ctrl+H)'}
                    style={{
                        ...iconBtn(false),
                        fontSize: 12, fontWeight: 700,
                        color: showReplace ? '#6366f1' : 'rgba(255,255,255,0.4)',
                    }}
                >
                    ⇌
                </button>
                <button onClick={onClose} title="关闭 (Esc)" style={iconBtn(false)}>
                    <CloseOutlined style={{ fontSize: 11 }} />
                </button>
            </div>

            {/* ── Replace row ────────────────────────────────────────────── */}
            {showReplace && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px 8px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    <span style={{ fontSize: 12, width: 14, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>⇌</span>
                    <Input
                        value={replaceText}
                        onChange={e => { setReplaceText(e.target.value); setReplaceCount(null); }}
                        placeholder="替换为..."
                        variant="borderless"
                        style={{ flex: 1, color: '#fff', background: 'transparent', fontSize: 13, padding: '0 4px' }}
                        styles={{ input: { color: '#fff' } }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); doReplaceOne(); } }}
                    />
                    <button onClick={doReplaceOne} disabled={total === 0} style={replaceBtn(false)} title="替换当前 (Enter)">
                        替换
                    </button>
                    <button onClick={doReplaceAll} disabled={total === 0} style={replaceBtn(true)} title="全部替换">
                        全替
                    </button>
                    {replaceCount !== null && (
                        <span style={{ fontSize: 10, color: '#6ee7b7', whiteSpace: 'nowrap' }}>
                            ✓ {replaceCount} 处
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default MindMapSearch;
