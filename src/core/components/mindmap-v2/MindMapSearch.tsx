/**
 * MindMapSearch.tsx — 节点全文搜索组件
 *
 * 用法：
 *   <MindMapSearch open={open} onClose={() => setOpen(false)} />
 *
 * 功能：
 *  - DFS 遍历所有节点，匹配 topic（大小写不敏感）
 *  - 高亮匹配的关键词（CSS class）
 *  - 上下键 / Enter 逐条导航（selectNode + scrollIntoView）
 *  - 显示 X/N 匹配数
 *  - Escape 关闭
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from 'antd';
import { SearchOutlined, CloseOutlined, UpOutlined, DownOutlined } from '@ant-design/icons';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance } from './mindElixirStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Collect all nodes in DFS order */
function collectAllNodes(root: NodeObj): NodeObj[] {
    const result: NodeObj[] = [];
    function dfs(n: NodeObj) {
        result.push(n);
        for (const c of n.children ?? []) dfs(c);
    }
    dfs(root);
    return result;
}

/** Case-insensitive substring match */
function matches(node: NodeObj, query: string): boolean {
    return node.topic.toLowerCase().includes(query.toLowerCase());
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

interface MindMapSearchProps {
    open: boolean;
    onClose: () => void;
}

const MindMapSearch: React.FC<MindMapSearchProps> = ({ open, onClose }) => {
    const mind = getMindElixirInstance();
    const inputRef = useRef<any>(null);

    const [query, setQuery] = useState('');
    const [matchIdx, setMatchIdx] = useState(0);

    // Compute matches whenever query changes
    const matchIds = useMemo<string[]>(() => {
        if (!mind || !query.trim()) return [];
        try {
            const all = collectAllNodes(mind.getData().nodeData);
            return all.filter(n => matches(n, query)).map(n => n.id);
        } catch {
            return [];
        }
    }, [mind, query]);

    // Sync highlights on match list change
    useEffect(() => {
        injectSearchCSS();
        clearSearchHighlights();
        if (!mind || matchIds.length === 0) return;

        // Highlight all matches
        matchIds.forEach(id => {
            try {
                const el = mind.findEle(id);
                if (el) el.classList.add('search-match');
            } catch {}
        });

        // Scroll to and mark active
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

    // Reset matchIdx when matches change
    useEffect(() => {
        setMatchIdx(0);
    }, [matchIds.length, query]);

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 80);
        } else {
            // Clean up highlights when closed
            clearSearchHighlights();
            setQuery('');
        }
    }, [open]);

    // Escape key handler
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
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
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) goPrev(); else goNext();
        }
    }, [goNext, goPrev]);

    if (!open) return null;

    const total = matchIds.length;
    const current = total > 0 ? Math.min(matchIdx, total - 1) + 1 : 0;

    return (
        <div
            id="me-search-panel"
            style={{
                position: 'absolute',
                top: 12,
                right: 16,
                zIndex: 999,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                background: 'rgba(15,15,20,0.88)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                minWidth: 260,
            }}
        >
            <SearchOutlined style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, flexShrink: 0 }} />

            <Input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="搜索节点..."
                variant="borderless"
                style={{
                    flex: 1,
                    color: '#fff',
                    background: 'transparent',
                    fontSize: 13,
                    padding: '0 4px',
                }}
                styles={{ input: { color: '#fff', '::placeholder': { color: 'rgba(255,255,255,0.35)' } } }}
            />

            {/* Match count */}
            {query.trim() && (
                <span style={{
                    fontSize: 11,
                    color: total > 0 ? 'rgba(255,255,255,0.7)' : '#ef4444',
                    whiteSpace: 'nowrap',
                    minWidth: 40,
                    textAlign: 'center',
                }}>
                    {total > 0 ? `${current}/${total}` : '无匹配'}
                </span>
            )}

            {/* Navigation */}
            <button onClick={goPrev} disabled={total === 0}
                title="上一个 (Shift+Enter)"
                style={{
                    background: 'transparent', border: 'none', cursor: total > 0 ? 'pointer' : 'not-allowed',
                    color: total > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                    padding: '2px 4px', borderRadius: 4, lineHeight: 1,
                    transition: 'color 0.15s',
                }}>
                <UpOutlined style={{ fontSize: 11 }} />
            </button>
            <button onClick={goNext} disabled={total === 0}
                title="下一个 (Enter)"
                style={{
                    background: 'transparent', border: 'none', cursor: total > 0 ? 'pointer' : 'not-allowed',
                    color: total > 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                    padding: '2px 4px', borderRadius: 4, lineHeight: 1,
                    transition: 'color 0.15s',
                }}>
                <DownOutlined style={{ fontSize: 11 }} />
            </button>

            {/* Close */}
            <button onClick={onClose}
                title="关闭搜索 (Esc)"
                style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.5)', padding: '2px 4px',
                    borderRadius: 4, lineHeight: 1, transition: 'color 0.15s',
                }}>
                <CloseOutlined style={{ fontSize: 11 }} />
            </button>
        </div>
    );
};

export default MindMapSearch;
