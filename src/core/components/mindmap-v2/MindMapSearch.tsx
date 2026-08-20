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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
            setReplaceStatus(t('plugins.mindmap.searchPanel.replaceOneSuccess'));
            // Move to next after replacing
            setTimeout(() => goNext(), 60);
        } catch (error) {
            logMindmapSearchFailure('replaceOne', error);
            setReplaceCount(null);
            setReplaceStatus(t('plugins.mindmap.searchPanel.replaceFailure'));
        }
    }, [mind, matchIds, matchIdx, query, replaceText, goNext, t]);

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
            ? t('plugins.mindmap.searchPanel.replaceAllPartial', { success: count, failure: failureCount })
            : t('plugins.mindmap.searchPanel.replaceAllSuccess', { count }));
        setMatchIdx(0);
        focusReplacement();
    }, [focusReplacement, mind, matchIds, query, replaceText, t]);

    if (!open) return null;

    const total = matchIds.length;
    const current = total > 0 ? Math.min(matchIdx, total - 1) + 1 : 0;
    const resultStatus = !query.trim()
        ? t('plugins.mindmap.searchPanel.statusPrompt')
        : total > 0
            ? t('plugins.mindmap.searchPanel.statusPosition', { current, total })
            : t('plugins.mindmap.searchPanel.statusEmpty');

    const toggleReplace = () => {
        const next = !showReplace;
        setShowReplace(next);
        if (next) focusReplacement();
    };

    const requestReplaceAll = () => {
        replaceAllConfirmOpenRef.current = true;
        appModal.confirm({
            title: t('plugins.mindmap.searchPanel.confirmTitle', { count: total }),
            content: t('plugins.mindmap.searchPanel.confirmContent', {
                query,
                replacement: replaceText || t('plugins.mindmap.searchPanel.emptyText'),
            }),
            okText: t('plugins.mindmap.searchPanel.confirm'),
            cancelText: t('plugins.mindmap.searchPanel.cancel'),
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
            aria-label={t('plugins.mindmap.searchPanel.regionLabel')}
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
                    aria-label={t('plugins.mindmap.searchPanel.searchInputLabel')}
                    maxLength={MINDMAP_MAX_TOPIC_LENGTH}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('plugins.mindmap.searchPanel.searchPlaceholder')}
                    variant="borderless"
                    className="mind-map-search-input"
                />
                {query.trim() && (
                    <span className={`mind-map-search-result-count${total === 0 ? ' is-empty' : ''}`} aria-hidden="true">
                        {total > 0
                            ? t('plugins.mindmap.searchPanel.resultCount', { current, total })
                            : t('plugins.mindmap.searchPanel.noMatchesShort')}
                    </span>
                )}
                <button aria-label={t('plugins.mindmap.searchPanel.previousLabel')} className="mind-map-search-icon-button" disabled={total === 0} onClick={goPrev} title={t('plugins.mindmap.searchPanel.previousTitle')} type="button">
                    <UpOutlined />
                </button>
                <button aria-label={t('plugins.mindmap.searchPanel.nextLabel')} className="mind-map-search-icon-button" disabled={total === 0} onClick={goNext} title={t('plugins.mindmap.searchPanel.nextTitle')} type="button">
                    <DownOutlined />
                </button>
                {/* Toggle replace row */}
                <button
                    aria-controls="me-search-replace-row"
                    aria-expanded={showReplace}
                    aria-label={t(showReplace
                        ? 'plugins.mindmap.searchPanel.collapseReplaceLabel'
                        : 'plugins.mindmap.searchPanel.expandReplaceLabel')}
                    className={`mind-map-search-icon-button mind-map-search-replace-toggle${showReplace ? ' is-active' : ''}`}
                    onClick={toggleReplace}
                    title={t(showReplace
                        ? 'plugins.mindmap.searchPanel.collapseReplaceTitle'
                        : 'plugins.mindmap.searchPanel.expandReplaceTitle')}
                    type="button"
                >
                    <SwapOutlined />
                </button>
                <button aria-label={t('plugins.mindmap.searchPanel.closeLabel')} className="mind-map-search-icon-button" onClick={onClose} title={t('plugins.mindmap.searchPanel.closeTitle')} type="button">
                    <CloseOutlined />
                </button>
            </div>

            {/* ── Replace row ────────────────────────────────────────────── */}
            {showReplace && (
                <div id="me-search-replace-row" className="mind-map-search-replace-row">
                    <SwapOutlined aria-hidden="true" className="mind-map-search-replace-icon" />
                    <Input
                        ref={replaceInputRef}
                        aria-label={t('plugins.mindmap.searchPanel.replaceInputLabel')}
                        maxLength={MINDMAP_MAX_TOPIC_LENGTH}
                        value={replaceText}
                        onChange={e => {
                            setReplaceText(e.target.value);
                            setReplaceCount(null);
                            setReplaceStatus('');
                        }}
                        placeholder={t('plugins.mindmap.searchPanel.replacePlaceholder')}
                        variant="borderless"
                        className="mind-map-search-input mind-map-search-replace-input"
                        onKeyDown={e => {
                            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                            if (e.key === 'Enter') { e.preventDefault(); doReplaceOne(); }
                        }}
                    />
                    <button aria-label={t('plugins.mindmap.searchPanel.replaceCurrentLabel')} className="mind-map-search-replace-button" onClick={doReplaceOne} disabled={total === 0} title={t('plugins.mindmap.searchPanel.replaceCurrentTitle')} type="button">
                        {t('plugins.mindmap.searchPanel.replaceCurrentButton')}
                    </button>
                    <button
                        aria-haspopup="dialog"
                        aria-label={t('plugins.mindmap.searchPanel.replaceAllLabel', { count: total })}
                        className="mind-map-search-replace-button is-primary"
                        disabled={total === 0}
                        onClick={requestReplaceAll}
                        title={t('plugins.mindmap.searchPanel.replaceAllTitle')}
                        type="button"
                    >
                        {t('plugins.mindmap.searchPanel.replaceAllButton')}
                    </button>
                    {replaceCount !== null && (
                        <span className="mind-map-search-replace-count" aria-hidden="true">
                            <CheckOutlined aria-hidden="true" /> {t('plugins.mindmap.searchPanel.replacementCount', { count: replaceCount })}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default MindMapSearch;
