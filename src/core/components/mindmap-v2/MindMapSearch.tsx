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
import { Input, type InputRef } from 'antd';
import {
    CheckOutlined,
    CloseOutlined,
    DownOutlined,
    SearchOutlined,
    SwapOutlined,
    UpOutlined,
} from '@ant-design/icons';
import type { NodeObj } from 'mind-elixir';
import { getMindElixirInstance } from './mindElixirStore';
import { findNodeById } from './migrate';
import { cleanMindMapNodePatch } from './mindmapNodePatchSecurity';
import { logMindmapSearchFailure } from './mindmapInteractionLogging';
import { MINDMAP_MAX_TOPIC_LENGTH } from './mindmapTreeSanitizer';
import { appModal } from '../../utils/antdStaticBridge';
import { getViewportOverlayContainer } from '../ui/viewportOverlayPortal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function collectAllNodes(root: NodeObj): NodeObj[] {
    const result: NodeObj[] = [];
    function dfs(n: NodeObj) { result.push(n); for (const c of n.children ?? []) dfs(c); }
    dfs(root);
    return result;
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
    replaceRequested?: boolean;
}
type MindElixirInstance = NonNullable<ReturnType<typeof getMindElixirInstance>>;
type ReshapeNodeTarget = Parameters<MindElixirInstance['reshapeNode']>[0];

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MindMapSearch: React.FC<MindMapSearchProps> = ({ open, onClose, replaceRequested = false }) => {
    const mind = getMindElixirInstance();
    const inputRef = useRef<InputRef>(null);
    const replaceInputRef = useRef<InputRef>(null);
    const replaceAllConfirmOpenRef = useRef(false);
    const returnFocusRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(open);

    const [query, setQuery] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [showReplace, setShowReplace] = useState(false);
    const [matchIdx, setMatchIdx] = useState(0);
    const [replaceCount, setReplaceCount] = useState<number | null>(null);
    const [replaceStatus, setReplaceStatus] = useState('');

    const matchIds = useMemo<string[]>(() => {
        if (!mind || !query.trim()) return [];
        try {
            const all = collectAllNodes(mind.getData().nodeData);
            return all.filter(n => n.topic.toLowerCase().includes(query.toLowerCase())).map(n => n.id);
        } catch (error) {
            logMindmapSearchFailure('collectMatches', error);
            return [];
        }
    }, [mind, query]);

    // Sync highlights
    useEffect(() => {
        clearSearchHighlights();
        if (!mind || matchIds.length === 0) return;
        matchIds.forEach(id => {
            try {
                const el = mind.findEle(id);
                if (el) el.classList.add('search-match');
            } catch (error) {
                logMindmapSearchFailure('highlightMatch', error);
            }
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
            } catch (error) {
                logMindmapSearchFailure('activateMatch', error);
            }
        }
    }, [mind, matchIds, matchIdx]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setMatchIdx(0);
            setReplaceCount(null);
            setReplaceStatus('');
        }, 0);
        return () => window.clearTimeout(timer);
    }, [matchIds.length, query]);

    useEffect(() => {
        let timer: number | undefined;
        if (open) {
            if (!wasOpenRef.current) {
                const activeElement = document.activeElement;
                returnFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body
                    ? activeElement
                    : null;
            }
            timer = window.setTimeout(() => {
                if (replaceRequested) {
                    setShowReplace(true);
                } else {
                    inputRef.current?.focus();
                }
            }, 80);
        } else {
            clearSearchHighlights();
            timer = window.setTimeout(() => {
                setQuery('');
                setReplaceText('');
                setShowReplace(false);
                setReplaceCount(null);
                setReplaceStatus('');
                const returnTarget = returnFocusRef.current;
                returnFocusRef.current = null;
                if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true });
            }, 0);
        }
        wasOpenRef.current = open;
        return () => {
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, [open, replaceRequested]);

    useEffect(() => {
        if (!open || !showReplace || !replaceRequested) return;
        const timer = window.setTimeout(() => replaceInputRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [open, replaceRequested, showReplace]);

    const focusReplacement = useCallback(() => {
        window.setTimeout(() => replaceInputRef.current?.focus(), 0);
    }, []);

    // Escape and find/replace shortcuts remain inside the active surface.
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.isComposing || e.keyCode === 229) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
                e.preventDefault();
                e.stopPropagation();
                setShowReplace(true);
                focusReplacement();
                return;
            }
            if (e.key === 'Escape') {
                if (replaceAllConfirmOpenRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        };
        document.addEventListener('keydown', handler, true);
        return () => document.removeEventListener('keydown', handler, true);
    }, [focusReplacement, onClose, open]);

    const goNext = useCallback(() => {
        if (matchIds.length === 0) return;
        setMatchIdx(i => (i + 1) % matchIds.length);
    }, [matchIds.length]);

    const goPrev = useCallback(() => {
        if (matchIds.length === 0) return;
        setMatchIdx(i => (i - 1 + matchIds.length) % matchIds.length);
    }, [matchIds.length]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
            const newTopic = obj.topic.replace(new RegExp(escapeRegExp(query), 'gi'), replaceText);
            mind.reshapeNode(tpc as ReshapeNodeTarget, { ...obj, ...cleanMindMapNodePatch({ topic: newTopic }) });
            setReplaceCount(1);
            setReplaceStatus('已替换当前匹配项');
            // Move to next after replacing
            setTimeout(() => goNext(), 60);
        } catch (error) {
            logMindmapSearchFailure('replaceOne', error);
            setReplaceCount(null);
            setReplaceStatus('替换失败，请重试');
        }
    }, [mind, matchIds, matchIdx, query, replaceText, goNext]);

    const doReplaceAll = useCallback(() => {
        if (!mind || matchIds.length === 0 || !query.trim()) return;
        let count = 0;
        let failureCount = 0;
        const regex = new RegExp(escapeRegExp(query), 'gi');
        for (const id of matchIds) {
            try {
                const obj = findNodeById(mind.getData().nodeData, id);
                if (!obj) { failureCount++; continue; }
                const tpc = mind.findEle(id);
                if (!tpc) { failureCount++; continue; }
                const newTopic = obj.topic.replace(regex, replaceText);
                if (newTopic !== obj.topic) {
                    mind.reshapeNode(tpc as ReshapeNodeTarget, { ...obj, ...cleanMindMapNodePatch({ topic: newTopic }) });
                    count++;
                }
            } catch (error) {
                logMindmapSearchFailure('replaceAll', error);
                failureCount++;
            }
        }
        setReplaceCount(count);
        setReplaceStatus(failureCount > 0
            ? `批量替换完成：成功 ${count} 处，失败 ${failureCount} 处`
            : `批量替换完成：成功 ${count} 处`);
        setMatchIdx(0);
        focusReplacement();
    }, [focusReplacement, mind, matchIds, query, replaceText]);

    if (!open) return null;

    const total = matchIds.length;
    const current = total > 0 ? Math.min(matchIdx, total - 1) + 1 : 0;
    const resultStatus = !query.trim()
        ? '输入关键词开始搜索'
        : total > 0
            ? `第 ${current} 项，共 ${total} 项`
            : '未找到匹配节点';

    const toggleReplace = () => {
        const next = !showReplace;
        setShowReplace(next);
        if (next) focusReplacement();
    };

    const requestReplaceAll = () => {
        replaceAllConfirmOpenRef.current = true;
        appModal.confirm({
            title: `替换 ${total} 个匹配节点？`,
            content: `查找“${query}” → 替换为“${replaceText || '空文本'}”`,
            okText: '确认替换',
            cancelText: '取消',
            centered: true,
            keyboard: true,
            maskClosable: false,
            getContainer: getViewportOverlayContainer,
            onOk: doReplaceAll,
            afterClose: () => {
                replaceAllConfirmOpenRef.current = false;
                focusReplacement();
            },
        });
    };

    return (
        <div
            aria-label="搜索并替换思维导图节点"
            className="mind-map-search-panel"
            id="me-search-panel"
            role="search"
        >
            <span className="mind-map-search-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
                {replaceStatus || resultStatus}
            </span>
            {/* ── Search row ─────────────────────────────────────────────── */}
            <div className="mind-map-search-row">
                <SearchOutlined className="mind-map-search-leading-icon" />
                <Input
                    ref={inputRef}
                    aria-label="搜索节点"
                    maxLength={MINDMAP_MAX_TOPIC_LENGTH}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="搜索节点..."
                    variant="borderless"
                    className="mind-map-search-input"
                />
                {query.trim() && (
                    <span className={`mind-map-search-result-count${total === 0 ? ' is-empty' : ''}`} aria-hidden="true">
                        {total > 0 ? `${current}/${total}` : '无匹配'}
                    </span>
                )}
                <button aria-label="上一个搜索结果" className="mind-map-search-icon-button" disabled={total === 0} onClick={goPrev} title="上一个 (Shift+Enter)" type="button">
                    <UpOutlined />
                </button>
                <button aria-label="下一个搜索结果" className="mind-map-search-icon-button" disabled={total === 0} onClick={goNext} title="下一个 (Enter)" type="button">
                    <DownOutlined />
                </button>
                {/* Toggle replace row */}
                <button
                    aria-controls="me-search-replace-row"
                    aria-expanded={showReplace}
                    aria-label={showReplace ? '收起替换控件' : '展开替换控件'}
                    className={`mind-map-search-icon-button mind-map-search-replace-toggle${showReplace ? ' is-active' : ''}`}
                    onClick={toggleReplace}
                    title={showReplace ? '关闭替换' : '展开替换 (Ctrl+H)'}
                    type="button"
                >
                    <SwapOutlined />
                </button>
                <button aria-label="关闭搜索" className="mind-map-search-icon-button" onClick={onClose} title="关闭 (Esc)" type="button">
                    <CloseOutlined />
                </button>
            </div>

            {/* ── Replace row ────────────────────────────────────────────── */}
            {showReplace && (
                <div id="me-search-replace-row" className="mind-map-search-replace-row">
                    <SwapOutlined aria-hidden="true" className="mind-map-search-replace-icon" />
                    <Input
                        ref={replaceInputRef}
                        aria-label="替换文本"
                        maxLength={MINDMAP_MAX_TOPIC_LENGTH}
                        value={replaceText}
                        onChange={e => {
                            setReplaceText(e.target.value);
                            setReplaceCount(null);
                            setReplaceStatus('');
                        }}
                        placeholder="替换为..."
                        variant="borderless"
                        className="mind-map-search-input mind-map-search-replace-input"
                        onKeyDown={e => {
                            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                            if (e.key === 'Enter') { e.preventDefault(); doReplaceOne(); }
                        }}
                    />
                    <button aria-label="替换当前匹配项" className="mind-map-search-replace-button" onClick={doReplaceOne} disabled={total === 0} title="替换当前 (Enter)" type="button">
                        替换
                    </button>
                    <button
                        aria-haspopup="dialog"
                        aria-label={`替换所有匹配项，共 ${total} 个节点`}
                        className="mind-map-search-replace-button is-primary"
                        disabled={total === 0}
                        onClick={requestReplaceAll}
                        title="全部替换"
                        type="button"
                    >
                        全替
                    </button>
                    {replaceCount !== null && (
                        <span className="mind-map-search-replace-count" aria-hidden="true">
                            <CheckOutlined aria-hidden="true" /> {replaceCount} 处
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default MindMapSearch;
