import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Popconfirm, theme } from 'antd';
import { FaSearch, FaChevronUp, FaChevronDown, FaTimes, FaTimesCircle, FaExchangeAlt } from 'react-icons/fa';
import { useReactFlow, type Edge, type Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import {
    buildPresentationEdgeIdSelector,
    buildPresentationNodeSelector,
} from '../presentation/presentationSelectorSafety';
import {
    FLOWCHART_REPLACE_TEXT_MAX_LENGTH,
    FLOWCHART_SEARCH_QUERY_MAX_LENGTH,
    buildFlowchartCanvasSearchMatchKey,
    buildFlowchartCanvasSearchResults,
    buildFlowchartCanvasSearchSignature,
    flowchartCanvasMatchMatchesSearch,
    planFlowchartCanvasTextReplacement,
    type FlowchartCanvasReplaceResult,
    type FlowchartCanvasSearchMatch,
} from './flowchartSearchReplace';
import { getCanvasSearchMatchAnnouncementLabel } from './canvasSearchAccessibility';
import { CanvasSearchConfirmationDescription } from './CanvasSearchConfirmationDescription';
import { useTransientStatusMessage } from './useTransientStatusMessage';

export interface CanvasSearchBarProps {
    visible: boolean;
    onClose: () => void;
    nodes: Node[];
    edges?: Edge[];
    /** 当前页面名称；用于明确搜索范围，避免把当前页无结果误解为全图无结果。 */
    pageName?: string;
    /** 外部控制高亮节点 */
    onHighlightNode?: (nodeId: string | null) => void;
    /** 替换功能：更新当前节点文本或连线标签 */
    onReplaceMatch?: (match: FlowchartCanvasSearchMatch, query: string, replacement: string) => FlowchartCanvasReplaceResult;
    /** 批量替换 */
    onReplaceAll?: (matches: FlowchartCanvasSearchMatch[], query: string, replacement: string) => FlowchartCanvasReplaceResult;
    /** 受控替换栏状态，用于可靠响应 Ctrl+H 等外部入口 */
    replaceVisible?: boolean;
    onReplaceVisibleChange?: (visible: boolean) => void;
}

type ThemeToken = ReturnType<typeof theme.useToken>['token'];
const CANVAS_SEARCH_FOCUS_RETURN_SELECTOR = '[data-flowchart-search-focus-return="true"]';

interface ExcludedCanvasSearchMatch {
    key: string;
    signature: string;
}

interface ReplaceStatusTracking {
    expectedSignatures: Map<string, string>;
    observedAppliedState: boolean;
}

/**
 * 画布内搜索栏 — Ctrl+F / Ctrl+H 触发
 * 支持关键词匹配节点文本、连线标签及 ID，上/下导航结果，聚焦视口 + 脉冲高亮
 * Phase 2：新增查找替换功能
 */
const ActiveCanvasSearchBar: React.FC<Omit<CanvasSearchBarProps, 'visible'>> = ({
    onClose,
    nodes,
    edges = [],
    pageName,
    onHighlightNode,
    onReplaceMatch,
    onReplaceAll,
    replaceVisible,
    onReplaceVisibleChange,
}) => {
    const { token } = theme.useToken();
    const { t } = useTranslation();
    const reactFlow = useReactFlow();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const previousShowReplaceRef = useRef(false);
    const replaceStatusTrackingRef = useRef<ReplaceStatusTracking | null>(null);

    const [query, setQuery] = useState('');
    const [excludedMatches, setExcludedMatches] = useState<ExcludedCanvasSearchMatch[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Phase 2：替换功能
    const [replaceText, setReplaceText] = useState('');
    const {
        statusMessage: replaceStatus,
        statusMessageVersion: replaceStatusVersion,
        setStatusMessage: setReplaceStatus,
    } = useTransientStatusMessage();
    const [internalReplaceVisible, setInternalReplaceVisible] = useState(false);
    const showReplace = replaceVisible ?? internalReplaceVisible;
    const setShowReplace = useCallback((visible: boolean) => {
        if (replaceVisible === undefined) setInternalReplaceVisible(visible);
        onReplaceVisibleChange?.(visible);
    }, [onReplaceVisibleChange, replaceVisible]);

    const getNodeCenter = useCallback((node: Node) => {
        const internalNode = reactFlow.getInternalNode?.(node.id);
        const absolutePosition = internalNode?.internals.positionAbsolute ?? node.position;
        const width = internalNode?.measured.width || node.measured?.width || node.width || 120;
        const height = internalNode?.measured.height || node.measured?.height || node.height || 60;
        return {
            x: absolutePosition.x + width / 2,
            y: absolutePosition.y + height / 2,
        };
    }, [reactFlow]);

    const focusMatch = useCallback((match: FlowchartCanvasSearchMatch) => {
        if (match.kind === 'edge') {
            const edge = edges.find(candidate => candidate.id === match.id);
            const sourceNode = edge && nodes.find(node => node.id === edge.source);
            const targetNode = edge && nodes.find(node => node.id === edge.target);
            onHighlightNode?.(null);
            if (!sourceNode || !targetNode) return;
            const sourceCenter = getNodeCenter(sourceNode);
            const targetCenter = getNodeCenter(targetNode);
            reactFlow.setCenter(
                (sourceCenter.x + targetCenter.x) / 2,
                (sourceCenter.y + targetCenter.y) / 2,
                { zoom: 1.2, duration: 300 },
            );
            return;
        }
        const node = nodes.find(candidate => candidate.id === match.id);
        if (!node) return;
        const center = getNodeCenter(node);
        reactFlow.setCenter(
            center.x,
            center.y,
            { zoom: 1.2, duration: 300 }
        );
        onHighlightNode?.(match.id);
    }, [edges, getNodeCenter, nodes, onHighlightNode, reactFlow]);

    // 搜索结果由输入和画布内容直接派生，避免维护第二套易失步状态。
    const matches = useMemo(() => {
        if (!query.trim()) return [];
        const excluded = new Set(excludedMatches
            .filter((entry) => {
                const candidate = buildFlowchartCanvasSearchResults(nodes, edges, query)
                    .find(match => buildFlowchartCanvasSearchMatchKey(match) === entry.key);
                return candidate
                    && buildFlowchartCanvasSearchSignature(candidate, nodes, edges) === entry.signature;
            })
            .map(entry => entry.key));
        return buildFlowchartCanvasSearchResults(nodes, edges, query)
            .filter(match => !excluded.has(buildFlowchartCanvasSearchMatchKey(match)));
    }, [edges, excludedMatches, nodes, query]);
    const boundedCurrentIndex = matches.length > 0
        ? Math.min(currentIndex, matches.length - 1)
        : 0;
    const currentMatch = matches[boundedCurrentIndex] ?? null;
    const currentMatchKey = currentMatch ? buildFlowchartCanvasSearchMatchKey(currentMatch) : null;
    const currentMatchLabel = currentMatch
        ? getCanvasSearchMatchAnnouncementLabel(currentMatch, nodes, edges)
        : '';
    const normalizedPageName = pageName?.trim() || '';
    const searchScopeLabel = normalizedPageName
        ? t('designer.canvasSearch.scopeLabel', { page: normalizedPageName })
        : '';
    const resultAnnouncement = currentMatch
        ? t(normalizedPageName
            ? 'designer.canvasSearch.currentResultAnnouncementWithScope'
            : 'designer.canvasSearch.currentResultAnnouncement', {
              current: boundedCurrentIndex + 1,
              total: matches.length,
              type: t(`designer.canvasSearch.resultTypes.${currentMatch.kind}`),
              label: currentMatchLabel,
              page: normalizedPageName,
          })
        : t(normalizedPageName
            ? 'designer.canvasSearch.noResultsAnnouncementWithScope'
            : 'designer.canvasSearch.noResultsAnnouncement', {
              page: normalizedPageName,
          });
    const nodeMatchIds = useMemo(() => new Set(
        matches.filter(match => match.kind === 'node').map(match => match.id),
    ), [matches]);
    const edgeMatchIds = useMemo(() => new Set(
        matches.filter(match => match.kind === 'edge').map(match => match.id),
    ), [matches]);
    const allReplacePlan = useMemo(() => planFlowchartCanvasTextReplacement(
        nodes,
        edges,
        matches,
        query,
        replaceText,
    ), [edges, matches, nodes, query, replaceText]);
    const changedMatchKeys = useMemo(() => new Set(
        allReplacePlan.changedMatches.map(buildFlowchartCanvasSearchMatchKey),
    ), [allReplacePlan.changedMatches]);
    const currentReplaceEligible = currentMatchKey !== null && changedMatchKeys.has(currentMatchKey);

    useEffect(() => {
        if (currentMatch) {
            focusMatch(currentMatch);
        } else {
            onHighlightNode?.(null);
        }
    }, [currentMatch, focusMatch, onHighlightNode]);
    useEffect(() => {
        return () => onHighlightNode?.(null);
    }, [onHighlightNode]);

    useEffect(() => {
        const tracking = replaceStatusTrackingRef.current;
        if (!tracking) return;
        const allExpectedValuesPresent = Array.from(tracking.expectedSignatures.entries())
            .every(([key, signature]) => {
                const match = buildFlowchartCanvasSearchResults(nodes, edges, query)
                    .find(candidate => buildFlowchartCanvasSearchMatchKey(candidate) === key)
                    ?? (() => {
                        const separatorIndex = key.indexOf(':');
                        const kind = key.slice(0, separatorIndex);
                        const id = key.slice(separatorIndex + 1);
                        return kind === 'node' || kind === 'edge'
                            ? { kind, id } as FlowchartCanvasSearchMatch
                            : null;
                    })();
                return match
                    && buildFlowchartCanvasSearchSignature(match, nodes, edges) === signature;
            });
        if (allExpectedValuesPresent) {
            tracking.observedAppliedState = true;
        } else if (tracking.observedAppliedState) {
            replaceStatusTrackingRef.current = null;
            const animationFrame = window.requestAnimationFrame(() => {
                setReplaceStatus('');
                replaceInputRef.current?.focus({ preventScroll: true });
            });
            return () => window.cancelAnimationFrame(animationFrame);
        }
    }, [edges, nodes, query, setReplaceStatus]);

    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        setExcludedMatches([]);
        setCurrentIndex(0);
        setReplaceStatus('');
        replaceStatusTrackingRef.current = null;
    }, [setReplaceStatus]);

    const handleClearQuery = useCallback(() => {
        handleQueryChange('');
        window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    }, [handleQueryChange]);

    const closeSearch = useCallback(() => {
        onClose();
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                document.querySelector<HTMLButtonElement>(CANVAS_SEARCH_FOCUS_RETURN_SELECTOR)
                    ?.focus({ preventScroll: true });
            });
        });
    }, [onClose]);

    const handleReplaceTextChange = useCallback((value: string) => {
        setReplaceText(value);
        setReplaceStatus('');
        replaceStatusTrackingRef.current = null;
    }, [setReplaceStatus]);

    const focusReplacementInput = useCallback(() => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                replaceInputRef.current?.focus({ preventScroll: true });
            });
        });
    }, []);

    const handleReplaceConfirmationOpenChange = useCallback((open: boolean) => {
        if (!open) focusReplacementInput();
    }, [focusReplacementInput]);

    const handleReplaceVisibilityChange = useCallback(() => {
        const nextVisible = !showReplace;
        setShowReplace(nextVisible);
        window.requestAnimationFrame(() => {
            if (nextVisible && query.trim()) {
                replaceInputRef.current?.focus({ preventScroll: true });
            } else if (!nextVisible) {
                searchInputRef.current?.focus({ preventScroll: true });
            }
        });
    }, [query, setShowReplace, showReplace]);

    useEffect(() => {
        const opened = showReplace && !previousShowReplaceRef.current;
        previousShowReplaceRef.current = showReplace;
        if (opened && query.trim()) focusReplacementInput();
    }, [focusReplacementInput, query, showReplace]);

    const formatMatchCounts = useCallback((items: readonly FlowchartCanvasSearchMatch[]) => {
        const nodeCount = items.filter(item => item.kind === 'node').length;
        const edgeCount = items.length - nodeCount;
        return [
            nodeCount > 0 ? t('designer.canvasSearch.counts.nodes', { count: nodeCount }) : '',
            edgeCount > 0 ? t('designer.canvasSearch.counts.edges', { count: edgeCount }) : '',
        ].filter(Boolean).join(t('designer.canvasSearch.counts.separator'))
            || t('designer.canvasSearch.counts.none');
    }, [t]);

    const formatReplaceResult = useCallback((result: FlowchartCanvasReplaceResult) => {
        const parts = [t('designer.canvasSearch.result.changed', {
            matches: formatMatchCounts(result.changedMatches),
        })];
        if (result.skippedLockedMatches.length > 0) {
            parts.push(t('designer.canvasSearch.result.skippedLocked', {
                matches: formatMatchCounts(result.skippedLockedMatches),
            }));
        }
        if (result.skippedBlankMatches.length > 0) {
            parts.push(t('designer.canvasSearch.result.skippedBlank', {
                count: result.skippedBlankMatches.length,
            }));
        }
        if (result.ignoredMetadataMatches.length > 0) {
            parts.push(t('designer.canvasSearch.result.ignoredMetadata', {
                count: result.ignoredMetadataMatches.length,
            }));
        }
        if (result.truncatedMatches.length > 0) {
            parts.push(t('designer.canvasSearch.result.truncated', {
                count: result.truncatedMatches.length,
            }));
        }
        return parts.join(t('designer.canvasSearch.result.separator'));
    }, [formatMatchCounts, t]);

    const goNext = useCallback(() => {
        if (matches.length === 0) return;
        const next = (boundedCurrentIndex + 1) % matches.length;
        setCurrentIndex(next);
    }, [boundedCurrentIndex, matches.length]);

    const recordReplacementResult = useCallback((result: FlowchartCanvasReplaceResult) => {
        replaceStatusTrackingRef.current = {
            expectedSignatures: new Map(result.changedMatches.flatMap(match => {
                const signature = buildFlowchartCanvasSearchSignature(match, result.nodes, result.edges);
                return signature ? [[buildFlowchartCanvasSearchMatchKey(match), signature]] : [];
            })),
            observedAppliedState: false,
        };
        const stillMatching = result.changedMatches.flatMap(match => {
            if (!flowchartCanvasMatchMatchesSearch(match, result.nodes, result.edges, query)) return [];
            const signature = buildFlowchartCanvasSearchSignature(match, result.nodes, result.edges);
            return signature ? [{ key: buildFlowchartCanvasSearchMatchKey(match), signature }] : [];
        });
        if (stillMatching.length > 0) {
            setExcludedMatches(current => {
                const nextByKey = new Map(current.map(entry => [entry.key, entry]));
                stillMatching.forEach(entry => nextByKey.set(entry.key, entry));
                return Array.from(nextByKey.values());
            });
        }
    }, [query]);

    const goPrev = useCallback(() => {
        if (matches.length === 0) return;
        const prev = (boundedCurrentIndex - 1 + matches.length) % matches.length;
        setCurrentIndex(prev);
    }, [boundedCurrentIndex, matches.length]);

    // ── 替换当前匹配 ──
    const handleReplaceCurrent = useCallback(() => {
        if (!currentReplaceEligible || !currentMatch || !onReplaceMatch) return;
        const result = onReplaceMatch(currentMatch, query, replaceText);
        setReplaceStatus(formatReplaceResult(result));
        recordReplacementResult(result);
        const remainingMatches = matches.filter(match => (
            buildFlowchartCanvasSearchMatchKey(match) !== buildFlowchartCanvasSearchMatchKey(currentMatch)
        ));
        const nextIndex = Math.min(boundedCurrentIndex, remainingMatches.length - 1);
        setCurrentIndex(Math.max(0, nextIndex));
        focusReplacementInput();
    }, [boundedCurrentIndex, currentMatch, currentReplaceEligible, focusReplacementInput, formatReplaceResult, matches, onReplaceMatch, query, recordReplacementResult, replaceText, setReplaceStatus]);

    // ── 全部替换 ──
    const handleReplaceAll = useCallback(() => {
        if (allReplacePlan.changedMatches.length === 0 || !onReplaceAll) return;
        const result = onReplaceAll(matches, query, replaceText);
        setReplaceStatus(formatReplaceResult(result));
        recordReplacementResult(result);
        setCurrentIndex(0);
        focusReplacementInput();
    }, [allReplacePlan.changedMatches.length, focusReplacementInput, formatReplaceResult, matches, onReplaceAll, query, recordReplacementResult, replaceText, setReplaceStatus]);

    const replacePreviewMessage = useMemo(() => {
        if (!showReplace || !query.trim() || replaceStatus) return replaceStatus;
        const currentKey = currentMatch ? buildFlowchartCanvasSearchMatchKey(currentMatch) : null;
        const includesCurrent = (items: readonly FlowchartCanvasSearchMatch[]) => currentKey !== null
            && items.some(item => buildFlowchartCanvasSearchMatchKey(item) === currentKey);
        if (includesCurrent(allReplacePlan.skippedLockedMatches)) {
            return t('designer.canvasSearch.preview.currentLocked');
        }
        if (includesCurrent(allReplacePlan.skippedBlankMatches)) {
            return t('designer.canvasSearch.preview.blankResult');
        }
        if (includesCurrent(allReplacePlan.ignoredMetadataMatches)) {
            return t('designer.canvasSearch.preview.metadataOnly');
        }
        if (allReplacePlan.changedMatches.length > 0 && allReplacePlan.skippedLockedMatches.length > 0) {
            return t('designer.canvasSearch.preview.partialEligible', {
                eligible: formatMatchCounts(allReplacePlan.changedMatches),
                locked: formatMatchCounts(allReplacePlan.skippedLockedMatches),
            });
        }
        return replaceStatus;
    }, [allReplacePlan, currentMatch, formatMatchCounts, query, replaceStatus, showReplace, t]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            closeSearch();
        } else if (e.key === 'Enter') {
            if (e.shiftKey) goPrev();
            else goNext();
        }
    }, [closeSearch, goNext, goPrev]);

    // --- 动态注入搜索高亮样式 ---
    const highlightStyle = useMemo(() => {
        if (!query.trim() || matches.length === 0) return '';

        const currentNodeStyles = currentMatch?.kind === 'node'
            ? `${buildPresentationNodeSelector(currentMatch.id)} {
                outline: 3px solid rgba(59, 130, 246, 0.8) !important; 
                outline-offset: 4px !important;
                border-radius: 8px;
                animation: search-pulse 1.5s ease-in-out infinite !important;
                z-index: 1000 !important;
            }`
            : '';
        const currentEdgeStyles = currentMatch?.kind === 'edge'
            ? `${buildPresentationEdgeIdSelector(currentMatch.id)} .react-flow__edge-path {
                stroke: rgba(37, 99, 235, 1) !important;
                stroke-width: 4px !important;
                filter: drop-shadow(0 0 5px rgba(59, 130, 246, 0.65));
                animation: search-edge-pulse 1.5s ease-in-out infinite !important;
            }`
            : '';

        const otherNodeSelectors = matches
            .filter(match => match.kind === 'node' && buildFlowchartCanvasSearchMatchKey(match) !== currentMatchKey)
            .map(match => buildPresentationNodeSelector(match.id))
            .join(',\n');
        const otherNodeStyles = otherNodeSelectors
            ? `${otherNodeSelectors} {
                outline: 2px solid rgba(59, 130, 246, 0.35) !important;
                outline-offset: 3px !important;
                border-radius: 8px;
            }`
            : '';
        const otherEdgeSelectors = matches
            .filter(match => match.kind === 'edge' && buildFlowchartCanvasSearchMatchKey(match) !== currentMatchKey)
            .map(match => `${buildPresentationEdgeIdSelector(match.id)} .react-flow__edge-path`)
            .join(',\n');
        const otherEdgeStyles = otherEdgeSelectors
            ? `${otherEdgeSelectors} {
                stroke: rgba(59, 130, 246, 0.72) !important;
                stroke-width: 3px !important;
            }`
            : '';

        const dimNodeSelectors = nodeMatchIds.size > 0 ? nodes
            .filter(node => !nodeMatchIds.has(node.id))
            .map(node => buildPresentationNodeSelector(node.id))
            .join(',\n') : '';
        const dimNodeStyles = dimNodeSelectors
            ? `${dimNodeSelectors} { opacity: 0.35 !important; transition: opacity 0.3s ease !important; }`
            : '';
        const dimEdgeSelectors = edgeMatchIds.size > 0 ? edges
            .filter(edge => !edgeMatchIds.has(edge.id))
            .map(edge => buildPresentationEdgeIdSelector(edge.id))
            .join(',\n') : '';
        const dimEdgeStyles = dimEdgeSelectors
            ? `${dimEdgeSelectors} { opacity: 0.22 !important; transition: opacity 0.3s ease !important; }`
            : '';

        const keyframes = `@keyframes search-pulse {
            0%, 100% { outline-color: rgba(59, 130, 246, 0.8); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
            50% { outline-color: rgba(59, 130, 246, 1); box-shadow: 0 0 16px 4px rgba(59, 130, 246, 0.25); }
        }
        @keyframes search-edge-pulse {
            0%, 100% { filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.45)); }
            50% { filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.9)); }
        }`;

        const reducedMotionStyles = `@media (prefers-reduced-motion: reduce) {
            .react-flow__node,
            .react-flow__edge-path {
                animation: none !important;
                transition: none !important;
            }
        }`;

        return [
            keyframes,
            currentNodeStyles,
            currentEdgeStyles,
            otherNodeStyles,
            otherEdgeStyles,
            dimNodeStyles,
            dimEdgeStyles,
            reducedMotionStyles,
        ].filter(Boolean).join('\n');
    }, [currentMatch, currentMatchKey, edgeMatchIds, edges, matches, nodeMatchIds, nodes, query]);

    const hasReplaceFns = !!(onReplaceMatch && onReplaceAll);

    return (
        <>
            {/* 动态搜索高亮样式 */}
            {highlightStyle && <style>{highlightStyle}</style>}

            <div className="canvas-search-bar" role="search" aria-label={normalizedPageName
                ? t('designer.canvasSearch.regionLabelWithScope', { page: normalizedPageName })
                : t('designer.canvasSearch.regionLabel')} style={{
                zIndex: 1600,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                animation: 'quickMenuFadeIn 0.15s ease-out',
                overflow: 'hidden',
            }}>
                {/* ── 搜索行 ── */}
                <div className="canvas-search-primary-row" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}>
                    <FaSearch size={12} style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
                    <input
                        ref={searchInputRef}
                        autoFocus
                        value={query}
                        onChange={e => handleQueryChange(e.target.value)}
                        maxLength={FLOWCHART_SEARCH_QUERY_MAX_LENGTH}
                        onKeyDown={handleKeyDown}
                        aria-label={t('designer.canvasSearch.searchInputLabel')}
                        placeholder={t('designer.canvasSearch.searchPlaceholder')}
                        style={{
                            border: 'none', outline: 'none', background: 'transparent',
                            fontSize: 13, flex: 1, minWidth: 0, color: token.colorText, fontFamily: 'inherit',
                        }}
                    />
                    {/* 结果计数 */}
                    {query && (
                            <span role="status" aria-label={resultAnnouncement} aria-live="polite" aria-atomic="true" style={{
                            fontSize: 11,
                            color: matches.length > 0 ? token.colorTextSecondary : '#ef4444',
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {matches.length > 0
                                ? `${boundedCurrentIndex + 1}/${matches.length}`
                                : t(normalizedPageName
                                    ? 'designer.canvasSearch.noResultsCurrentPage'
                                    : 'designer.canvasSearch.noResults')}
                        </span>
                    )}
                    <div className="canvas-search-controls">
                        {query && (
                            <button
                                className="canvas-search-icon-button"
                                aria-label={t('designer.canvasSearch.clearSearch')}
                                onClick={handleClearQuery}
                                style={navBtnStyle(true, token)}
                            >
                                <FaTimesCircle size={11} />
                            </button>
                        )}
                        {/* 上下导航 */}
                        <button className="canvas-search-icon-button" aria-label={t('designer.canvasSearch.previousResult')} onClick={goPrev} disabled={matches.length === 0} style={navBtnStyle(matches.length > 0, token)}>
                            <FaChevronUp size={11} />
                        </button>
                        <button className="canvas-search-icon-button" aria-label={t('designer.canvasSearch.nextResult')} onClick={goNext} disabled={matches.length === 0} style={navBtnStyle(matches.length > 0, token)}>
                            <FaChevronDown size={11} />
                        </button>
                        {/* 切换替换模式 */}
                        {hasReplaceFns && (
                            <button
                                className="canvas-search-icon-button"
                                aria-label={showReplace
                                    ? t('designer.canvasSearch.closeReplace')
                                    : t('designer.canvasSearch.openReplace')}
                                onClick={handleReplaceVisibilityChange}
                                title={t('designer.canvasSearch.replaceTitle')}
                                style={{
                                    ...navBtnStyle(true, token),
                                    color: showReplace ? token.colorPrimary : token.colorTextSecondary,
                                }}
                            >
                                <FaExchangeAlt size={11} />
                            </button>
                        )}
                        {/* 关闭 */}
                        <button className="canvas-search-icon-button" aria-label={t('designer.canvasSearch.closeSearch')} onClick={closeSearch} style={navBtnStyle(true, token)}>
                            <FaTimes size={11} />
                        </button>
                    </div>
                </div>

                {searchScopeLabel && (
                    <div
                        className="canvas-search-scope-row"
                        title={searchScopeLabel}
                        style={{
                            padding: '0 10px 7px 28px',
                            color: token.colorTextTertiary,
                            fontSize: 11,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {searchScopeLabel}
                    </div>
                )}

                {nodes.length === 0 && edges.length === 0 && (
                    <div role="status" aria-live="polite" style={{
                        padding: '0 10px 8px 28px',
                        color: token.colorTextTertiary,
                        fontSize: 11,
                    }}>
                        {t('designer.canvasSearch.emptyCanvas')}
                    </div>
                )}

                {/* ── 替换行（可折叠）── */}
                {showReplace && (
                    <div className="canvas-search-replace-row" style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px 8px',
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}>
                        <FaExchangeAlt size={11} style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
                        <input
                            ref={replaceInputRef}
                            value={replaceText}
                            onChange={e => handleReplaceTextChange(e.target.value)}
                            maxLength={FLOWCHART_REPLACE_TEXT_MAX_LENGTH}
                            onKeyDown={e => {
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    closeSearch();
                                    return;
                                }
                                if (e.key === 'Enter') handleReplaceCurrent();
                            }}
                            aria-label={t('designer.canvasSearch.replaceInputLabel')}
                            placeholder={t('designer.canvasSearch.replacePlaceholder')}
                            style={{
                                border: 'none', outline: 'none', background: 'transparent',
                                fontSize: 13, flex: 1, minWidth: 0, color: token.colorText, fontFamily: 'inherit',
                            }}
                        />
                        <div className="canvas-search-replace-actions">
                            <button
                                className="canvas-search-action-button"
                                aria-label={t('designer.canvasSearch.replaceCurrent')}
                                onClick={handleReplaceCurrent}
                                disabled={!currentReplaceEligible}
                                title={t('designer.canvasSearch.replaceCurrent')}
                                style={actionBtnStyle(currentReplaceEligible, token)}
                            >
                                {t('designer.canvasSearch.replaceAction')}
                            </button>
                            <Popconfirm
                                placement="bottomRight"
                                autoAdjustOverflow={false}
                                zIndex={2600}
                                getPopupContainer={() => document.body}
                                title={t('designer.canvasSearch.replaceConfirmTitle', {
                                    matches: formatMatchCounts(allReplacePlan.changedMatches),
                                })}
                                description={<CanvasSearchConfirmationDescription
                                    description={t('designer.canvasSearch.replaceConfirmDescription')}
                                    mapping={t('designer.canvasSearch.replaceConfirmMapping', {
                                        query,
                                        replacement: replaceText || t('designer.canvasSearch.emptyReplacement'),
                                    })}
                                />}
                                okText={t('designer.canvasSearch.replaceConfirm')}
                                cancelText={t('common.cancel')}
                                onConfirm={handleReplaceAll}
                                onOpenChange={handleReplaceConfirmationOpenChange}
                                disabled={allReplacePlan.changedMatches.length === 0}
                            >
                                <button
                                    className="canvas-search-action-button"
                                    aria-label={t('designer.canvasSearch.replaceAllLabel', {
                                        matches: formatMatchCounts(allReplacePlan.changedMatches),
                                    })}
                                    disabled={allReplacePlan.changedMatches.length === 0}
                                    title={t('designer.canvasSearch.replaceAllTitle', {
                                        matches: formatMatchCounts(allReplacePlan.changedMatches),
                                    })}
                                    style={actionBtnStyle(allReplacePlan.changedMatches.length > 0, token)}
                                >
                                    {t('designer.canvasSearch.replaceAllAction', {
                                        count: allReplacePlan.changedMatches.length,
                                    })}
                                </button>
                            </Popconfirm>
                        </div>
                    </div>
                )}
                {replacePreviewMessage && (
                    <div key={replaceStatus ? `operation-${replaceStatusVersion}` : `preview-${replacePreviewMessage}`} role="status" aria-label={t('designer.canvasSearch.replaceStatus')} aria-live="polite" aria-atomic="true" style={{
                        padding: '0 10px 8px 28px',
                        color: token.colorTextSecondary,
                        fontSize: 11,
                    }}>
                        {replacePreviewMessage}
                    </div>
                )}
            </div>
        </>
    );
};

export const CanvasSearchBar: React.FC<CanvasSearchBarProps> = ({ visible, ...props }) => (
    visible ? <ActiveCanvasSearchBar {...props} /> : null
);

// ── 样式辅助 ──
const navBtnStyle = (active: boolean, token: ThemeToken): React.CSSProperties => ({
    border: 'none', background: 'transparent',
    cursor: active ? 'pointer' : 'default',
    color: active ? token.colorText : token.colorTextDisabled,
    padding: 2, minWidth: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 3,
    transition: 'background 0.15s',
});

const actionBtnStyle = (active: boolean, token: ThemeToken): React.CSSProperties => ({
    border: `1px solid ${active ? token.colorPrimaryBorder : token.colorBorder}`,
    background: active ? token.colorPrimaryBg : token.colorBgContainerDisabled,
    color: active ? token.colorPrimary : token.colorTextDisabled,
    cursor: active ? 'pointer' : 'default',
    borderRadius: 4,
    fontSize: 11,
    padding: '1px 8px',
    minWidth: 44,
    minHeight: 32,
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
});
