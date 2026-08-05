import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Popconfirm, theme } from 'antd';
import { FaSearch, FaChevronUp, FaChevronDown, FaTimes, FaExchangeAlt } from 'react-icons/fa';
import { Node, useReactFlow } from '@xyflow/react';
import { buildPresentationNodeSelector } from '../presentation/presentationSelectorSafety';
import {
    FLOWCHART_REPLACE_TEXT_MAX_LENGTH,
    FLOWCHART_SEARCH_QUERY_MAX_LENGTH,
    planFlowchartLabelReplacement,
    type FlowchartReplaceResult,
} from './flowchartSearchReplace';

export interface CanvasSearchBarProps {
    visible: boolean;
    onClose: () => void;
    nodes: Node[];
    /** 外部控制高亮节点 */
    onHighlightNode?: (nodeId: string | null) => void;
    /** 替换功能：更新节点数据 */
    onReplaceNode?: (nodeId: string, query: string, replacement: string) => FlowchartReplaceResult;
    /** 批量替换 */
    onReplaceAll?: (matches: string[], query: string, replacement: string) => FlowchartReplaceResult;
    /** 受控替换栏状态，用于可靠响应 Ctrl+H 等外部入口 */
    replaceVisible?: boolean;
    onReplaceVisibleChange?: (visible: boolean) => void;
}

type ThemeToken = ReturnType<typeof theme.useToken>['token'];

/**
 * 画布内搜索栏 — Ctrl+F / Ctrl+H 触发
 * 支持关键词匹配节点标签/描述/ID/域名，上/下导航结果，聚焦视口 + 脉冲高亮
 * Phase 2：新增查找替换功能
 */
const ActiveCanvasSearchBar: React.FC<Omit<CanvasSearchBarProps, 'visible'>> = ({
    onClose,
    nodes,
    onHighlightNode,
    onReplaceNode,
    onReplaceAll,
    replaceVisible,
    onReplaceVisibleChange,
}) => {
    const { token } = theme.useToken();
    const reactFlow = useReactFlow();

    const [query, setQuery] = useState('');
    const [excludedMatchIds, setExcludedMatchIds] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Phase 2：替换功能
    const [replaceText, setReplaceText] = useState('');
    const [replaceStatus, setReplaceStatus] = useState('');
    const [internalReplaceVisible, setInternalReplaceVisible] = useState(false);
    const showReplace = replaceVisible ?? internalReplaceVisible;
    const setShowReplace = useCallback((visible: boolean) => {
        if (replaceVisible === undefined) setInternalReplaceVisible(visible);
        onReplaceVisibleChange?.(visible);
    }, [onReplaceVisibleChange, replaceVisible]);

    const focusNode = useCallback((nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;
        const w = node.measured?.width || node.width || 120;
        const h = node.measured?.height || node.height || 60;
        reactFlow.setCenter(
            node.position.x + w / 2,
            node.position.y + h / 2,
            { zoom: 1.2, duration: 300 }
        );
        onHighlightNode?.(nodeId);
    }, [nodes, reactFlow, onHighlightNode]);

    // 搜索结果由输入和节点直接派生，避免维护第二套易失步状态。
    const matchIds = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const excluded = new Set(excludedMatchIds);
        return nodes
            .filter(n => {
                const d = n.data as Record<string, unknown>;
                const label = String(d?.label || '').toLowerCase();
                const desc = String(d?.description || '').toLowerCase();
                const domain = String(d?.domain || '').toLowerCase();
                return !excluded.has(n.id)
                    && (label.includes(q)
                        || desc.includes(q)
                        || domain.includes(q)
                        || n.id.toLowerCase().includes(q));
            })
            .map(n => n.id);
    }, [excludedMatchIds, nodes, query]);
    const boundedCurrentIndex = matchIds.length > 0
        ? Math.min(currentIndex, matchIds.length - 1)
        : 0;
    const currentMatchId = matchIds[boundedCurrentIndex] ?? null;
    const matchIdSet = useMemo(() => new Set(matchIds), [matchIds]);
    const allReplacePlan = useMemo(() => planFlowchartLabelReplacement(
        nodes,
        matchIds,
        query,
        replaceText,
    ), [matchIds, nodes, query, replaceText]);
    const currentReplaceEligible = currentMatchId !== null
        && allReplacePlan.changedIds.includes(currentMatchId);

    useEffect(() => {
        if (currentMatchId) {
            focusNode(currentMatchId);
        } else {
            onHighlightNode?.(null);
        }
    }, [currentMatchId, focusNode, onHighlightNode]);
    useEffect(() => {
        return () => onHighlightNode?.(null);
    }, [onHighlightNode]);

    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        setExcludedMatchIds([]);
        setCurrentIndex(0);
        setReplaceStatus('');
    }, []);

    const handleReplaceTextChange = useCallback((value: string) => {
        setReplaceText(value);
        setReplaceStatus('');
    }, []);

    const formatReplaceResult = useCallback((result: FlowchartReplaceResult) => {
        const parts = [`已替换 ${result.changedIds.length} 个节点标签`];
        if (result.skippedLockedIds.length > 0) parts.push(`跳过 ${result.skippedLockedIds.length} 个锁定节点`);
        if (result.skippedBlankIds.length > 0) parts.push(`跳过 ${result.skippedBlankIds.length} 个空标签结果`);
        if (result.ignoredNonLabelMatchIds.length > 0) parts.push(`忽略 ${result.ignoredNonLabelMatchIds.length} 个非标签匹配`);
        if (result.truncatedIds.length > 0) parts.push(`${result.truncatedIds.length} 个标签已截断`);
        return parts.join('；');
    }, []);

    const goNext = useCallback(() => {
        if (matchIds.length === 0) return;
        const next = (boundedCurrentIndex + 1) % matchIds.length;
        setCurrentIndex(next);
    }, [boundedCurrentIndex, matchIds.length]);

    const goPrev = useCallback(() => {
        if (matchIds.length === 0) return;
        const prev = (boundedCurrentIndex - 1 + matchIds.length) % matchIds.length;
        setCurrentIndex(prev);
    }, [boundedCurrentIndex, matchIds.length]);

    // ── 替换当前匹配 ──
    const handleReplaceCurrent = useCallback(() => {
        if (!currentReplaceEligible || !currentMatchId || !onReplaceNode) return;
        const result = onReplaceNode(currentMatchId, query, replaceText);
        setReplaceStatus(formatReplaceResult(result));
        setExcludedMatchIds(ids => [...ids, currentMatchId]);
        const newIds = matchIds.filter(id => id !== currentMatchId);
        const nextIndex = Math.min(boundedCurrentIndex, newIds.length - 1);
        setCurrentIndex(Math.max(0, nextIndex));
    }, [boundedCurrentIndex, currentMatchId, currentReplaceEligible, formatReplaceResult, matchIds, onReplaceNode, query, replaceText]);

    // ── 全部替换 ──
    const handleReplaceAll = useCallback(() => {
        if (allReplacePlan.changedIds.length === 0 || !onReplaceAll) return;
        const result = onReplaceAll(matchIds, query, replaceText);
        setReplaceStatus(formatReplaceResult(result));
        setExcludedMatchIds(ids => Array.from(new Set([...ids, ...result.changedIds])));
        setCurrentIndex(0);
    }, [allReplacePlan.changedIds.length, formatReplaceResult, matchIds, onReplaceAll, query, replaceText]);

    const replacePreviewMessage = useMemo(() => {
        if (!showReplace || !query.trim() || replaceStatus) return replaceStatus;
        if (currentMatchId && allReplacePlan.skippedLockedIds.includes(currentMatchId)) return '当前结果已锁定，不会被替换';
        if (currentMatchId && allReplacePlan.skippedBlankIds.includes(currentMatchId)) return '替换后标签不能为空';
        if (currentMatchId && allReplacePlan.ignoredNonLabelMatchIds.includes(currentMatchId)) return '当前结果仅在描述、域名或 ID 中匹配，不会修改标签';
        if (allReplacePlan.changedIds.length > 0 && allReplacePlan.skippedLockedIds.length > 0) {
            return `可替换 ${allReplacePlan.changedIds.length} 个标签，将跳过 ${allReplacePlan.skippedLockedIds.length} 个锁定节点`;
        }
        return replaceStatus;
    }, [allReplacePlan, currentMatchId, query, replaceStatus, showReplace]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'Enter') {
            if (e.shiftKey) goPrev();
            else goNext();
        }
    }, [onClose, goNext, goPrev]);

    // --- 动态注入搜索高亮样式 ---
    const highlightStyle = useMemo(() => {
        if (!query.trim() || matchIds.length === 0) return '';

        // 当前匹配项：脉冲蓝色高亮
        const currentSelector = currentMatchId
            ? `${buildPresentationNodeSelector(currentMatchId)} {
                outline: 3px solid rgba(59, 130, 246, 0.8) !important; 
                outline-offset: 4px !important;
                border-radius: 8px;
                animation: search-pulse 1.5s ease-in-out infinite !important;
                z-index: 1000 !important;
            }`
            : '';

        // 其他匹配项：subtle 高亮
        const otherSelectors = matchIds
            .filter(id => id !== currentMatchId)
            .map(buildPresentationNodeSelector)
            .join(',\n');
        const otherStyles = otherSelectors
            ? `${otherSelectors} { 
                outline: 2px solid rgba(59, 130, 246, 0.35) !important;
                outline-offset: 3px !important;
                border-radius: 8px;
            }`
            : '';

        // 非匹配项：降低透明度
        const dimSelectors = nodes
            .filter(n => !matchIdSet.has(n.id))
            .map(n => buildPresentationNodeSelector(n.id))
            .join(',\n');
        const dimStyles = dimSelectors
            ? `${dimSelectors} { opacity: 0.35 !important; transition: opacity 0.3s ease !important; }`
            : '';

        const keyframes = `@keyframes search-pulse {
            0%, 100% { outline-color: rgba(59, 130, 246, 0.8); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
            50% { outline-color: rgba(59, 130, 246, 1); box-shadow: 0 0 16px 4px rgba(59, 130, 246, 0.25); }
        }`;

        const reducedMotionStyles = `@media (prefers-reduced-motion: reduce) {
            .react-flow__node {
                animation: none !important;
                transition: none !important;
            }
        }`;

        return `${keyframes}\n${currentSelector}\n${otherStyles}\n${dimStyles}\n${reducedMotionStyles}`;
    }, [query, matchIds, matchIdSet, currentMatchId, nodes]);

    const hasReplaceFns = !!(onReplaceNode && onReplaceAll);

    return (
        <>
            {/* 动态搜索高亮样式 */}
            {highlightStyle && <style>{highlightStyle}</style>}

            <div className="canvas-search-bar" role="search" aria-label="画布节点查找与替换" style={{
                zIndex: 1600,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                animation: 'quickMenuFadeIn 0.15s ease-out',
                overflow: 'hidden',
            }}>
                {/* ── 搜索行 ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}>
                    <FaSearch size={12} style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
                    <input
                        autoFocus
                        value={query}
                        onChange={e => handleQueryChange(e.target.value)}
                        maxLength={FLOWCHART_SEARCH_QUERY_MAX_LENGTH}
                        onKeyDown={handleKeyDown}
                        aria-label="搜索画布节点"
                        placeholder="搜索节点..."
                        style={{
                            border: 'none', outline: 'none', background: 'transparent',
                            fontSize: 13, flex: 1, minWidth: 0, color: token.colorText, fontFamily: 'inherit',
                        }}
                    />
                    {/* 结果计数 */}
                    {query && (
                        <span role="status" aria-live="polite" aria-atomic="true" style={{
                            fontSize: 11,
                            color: matchIds.length > 0 ? token.colorTextSecondary : '#ef4444',
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {matchIds.length > 0 ? `${boundedCurrentIndex + 1}/${matchIds.length}` : '无结果'}
                        </span>
                    )}
                    {/* 上下导航 */}
                    <button className="canvas-search-icon-button" aria-label="上一个搜索结果" onClick={goPrev} disabled={matchIds.length === 0} style={navBtnStyle(matchIds.length > 0, token)}>
                        <FaChevronUp size={11} />
                    </button>
                    <button className="canvas-search-icon-button" aria-label="下一个搜索结果" onClick={goNext} disabled={matchIds.length === 0} style={navBtnStyle(matchIds.length > 0, token)}>
                        <FaChevronDown size={11} />
                    </button>
                    {/* 切换替换模式 */}
                    {hasReplaceFns && (
                        <button
                            className="canvas-search-icon-button"
                            aria-label={showReplace ? '关闭替换' : '打开查找替换'}
                            onClick={() => setShowReplace(!showReplace)}
                            title="查找替换 (Ctrl+H)"
                            style={{
                                ...navBtnStyle(true, token),
                                color: showReplace ? token.colorPrimary : token.colorTextSecondary,
                            }}
                        >
                            <FaExchangeAlt size={11} />
                        </button>
                    )}
                    {/* 关闭 */}
                    <button className="canvas-search-icon-button" aria-label="关闭画布搜索" onClick={onClose} style={navBtnStyle(true, token)}>
                        <FaTimes size={11} />
                    </button>
                </div>

                {nodes.length === 0 && (
                    <div role="status" aria-live="polite" style={{
                        padding: '0 10px 8px 28px',
                        color: token.colorTextTertiary,
                        fontSize: 11,
                    }}>
                        画布暂无节点，请先添加节点
                    </div>
                )}

                {/* ── 替换行（可折叠）── */}
                {showReplace && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 10px 8px',
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}>
                        <FaExchangeAlt size={11} style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
                        <input
                            value={replaceText}
                            onChange={e => handleReplaceTextChange(e.target.value)}
                            maxLength={FLOWCHART_REPLACE_TEXT_MAX_LENGTH}
                            onKeyDown={e => { if (e.key === 'Enter') handleReplaceCurrent(); }}
                            aria-label="替换为"
                            placeholder="替换为..."
                            style={{
                                border: 'none', outline: 'none', background: 'transparent',
                                fontSize: 13, flex: 1, minWidth: 0, color: token.colorText, fontFamily: 'inherit',
                            }}
                        />
                        <button
                            className="canvas-search-action-button"
                            aria-label="替换当前匹配"
                            onClick={handleReplaceCurrent}
                            disabled={!currentReplaceEligible}
                            title="替换当前"
                            style={actionBtnStyle(currentReplaceEligible, token)}
                        >
                            替换
                        </button>
                        <Popconfirm
                            placement="bottomRight"
                            autoAdjustOverflow={false}
                            zIndex={2600}
                            getPopupContainer={() => document.body}
                            title={`替换 ${allReplacePlan.changedIds.length} 个节点标签？`}
                            description="此操作可通过撤销恢复；锁定节点不会被修改。"
                            okText="确认替换"
                            cancelText="取消"
                            onConfirm={handleReplaceAll}
                            disabled={allReplacePlan.changedIds.length === 0}
                        >
                            <button
                                className="canvas-search-action-button"
                                aria-label={`全部替换，共 ${allReplacePlan.changedIds.length} 个可修改标签`}
                                disabled={allReplacePlan.changedIds.length === 0}
                                title={`全部替换 (${allReplacePlan.changedIds.length} 个可修改标签)`}
                                style={actionBtnStyle(allReplacePlan.changedIds.length > 0, token)}
                            >
                                全部({allReplacePlan.changedIds.length})
                            </button>
                        </Popconfirm>
                    </div>
                )}
                {replacePreviewMessage && (
                    <div role="status" aria-label="替换操作状态" aria-live="polite" aria-atomic="true" style={{
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
