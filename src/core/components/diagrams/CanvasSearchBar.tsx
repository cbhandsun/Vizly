import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { theme } from 'antd';
import { FaSearch, FaChevronUp, FaChevronDown, FaTimes, FaExchangeAlt } from 'react-icons/fa';
import { Node, useReactFlow } from '@xyflow/react';

interface CanvasSearchBarProps {
    visible: boolean;
    onClose: () => void;
    nodes: Node[];
    /** 外部控制高亮节点 */
    onHighlightNode?: (nodeId: string | null) => void;
    /** 替换功能：更新节点数据 */
    onReplaceNode?: (nodeId: string, newLabel: string) => void;
    /** 批量替换 */
    onReplaceAll?: (matches: string[], newLabel: string) => void;
    /** 替换前记录快照 */
    onBeforeReplace?: () => void;
}

type ThemeToken = ReturnType<typeof theme.useToken>['token'];

/**
 * 画布内搜索栏 — Ctrl+F / Ctrl+K 触发
 * 支持关键词匹配节点标签/描述/ID/域名，上/下导航结果，聚焦视口 + 脉冲高亮
 * Phase 2：新增查找替换功能
 */
export const CanvasSearchBar: React.FC<CanvasSearchBarProps> = ({
    visible,
    onClose,
    nodes,
    onHighlightNode,
    onReplaceNode,
    onReplaceAll,
    onBeforeReplace,
}) => {
    const { token } = theme.useToken();
    const reactFlow = useReactFlow();
    const inputRef = useRef<HTMLInputElement>(null);

    const [query, setQuery] = useState('');
    const [matchIds, setMatchIds] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Phase 2：替换功能
    const [replaceText, setReplaceText] = useState('');
    const [showReplace, setShowReplace] = useState(false);

    // 搜索逻辑 — 搜索 label / description / id / domain
    useEffect(() => {
        if (!query.trim()) {
            setMatchIds([]);
            setCurrentIndex(0);
            onHighlightNode?.(null);
            return;
        }
        const q = query.toLowerCase();
        const ids = nodes
            .filter(n => {
                const d = n.data as Record<string, unknown>;
                const label = String(d?.label || '').toLowerCase();
                const desc = String(d?.description || '').toLowerCase();
                const domain = String(d?.domain || '').toLowerCase();
                return label.includes(q) || desc.includes(q) || domain.includes(q) || n.id.toLowerCase().includes(q);
            })
            .map(n => n.id);
        setMatchIds(ids);
        setCurrentIndex(0);
        if (ids.length > 0) {
            onHighlightNode?.(ids[0]);
            focusNode(ids[0]);
        } else {
            onHighlightNode?.(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, nodes]);

    // 自动聚焦输入框
    useEffect(() => {
        if (visible) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setQuery('');
            setReplaceText('');
            setMatchIds([]);
            setShowReplace(false);
            onHighlightNode?.(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

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

    const goNext = useCallback(() => {
        if (matchIds.length === 0) return;
        const next = (currentIndex + 1) % matchIds.length;
        setCurrentIndex(next);
        focusNode(matchIds[next]);
    }, [matchIds, currentIndex, focusNode]);

    const goPrev = useCallback(() => {
        if (matchIds.length === 0) return;
        const prev = (currentIndex - 1 + matchIds.length) % matchIds.length;
        setCurrentIndex(prev);
        focusNode(matchIds[prev]);
    }, [matchIds, currentIndex, focusNode]);

    // ── 替换当前匹配 ──
    const handleReplaceCurrent = useCallback(() => {
        if (matchIds.length === 0 || !onReplaceNode) return;
        const targetId = matchIds[currentIndex];
        onBeforeReplace?.();
        onReplaceNode(targetId, replaceText);
        // 替换后从列表移除
        const newIds = matchIds.filter(id => id !== targetId);
        setMatchIds(newIds);
        const nextIndex = Math.min(currentIndex, newIds.length - 1);
        setCurrentIndex(Math.max(0, nextIndex));
        if (newIds.length > 0) {
            onHighlightNode?.(newIds[Math.max(0, nextIndex)]);
            focusNode(newIds[Math.max(0, nextIndex)]);
        } else {
            onHighlightNode?.(null);
        }
    }, [matchIds, currentIndex, replaceText, onReplaceNode, onBeforeReplace, onHighlightNode, focusNode]);

    // ── 全部替换 ──
    const handleReplaceAll = useCallback(() => {
        if (matchIds.length === 0 || !onReplaceAll) return;
        onBeforeReplace?.();
        onReplaceAll(matchIds, replaceText);
        setMatchIds([]);
        setCurrentIndex(0);
        onHighlightNode?.(null);
    }, [matchIds, replaceText, onReplaceAll, onBeforeReplace, onHighlightNode]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        } else if (e.key === 'Enter') {
            if (e.shiftKey) goPrev();
            else goNext();
        }
    }, [onClose, goNext, goPrev]);

    // --- 动态注入搜索高亮样式 ---
    const currentMatchId = matchIds.length > 0 ? matchIds[currentIndex] : null;

    const highlightStyle = useMemo(() => {
        if (!visible || !query.trim() || matchIds.length === 0) return '';

        // 当前匹配项：脉冲蓝色高亮
        const currentSelector = currentMatchId
            ? `.react-flow__node[data-id="${currentMatchId}"] { 
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
            .map(id => `.react-flow__node[data-id="${id}"]`)
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
            .filter(n => !matchIds.includes(n.id))
            .map(n => `.react-flow__node[data-id="${n.id}"]`)
            .join(',\n');
        const dimStyles = dimSelectors
            ? `${dimSelectors} { opacity: 0.35 !important; transition: opacity 0.3s ease !important; }`
            : '';

        const keyframes = `@keyframes search-pulse {
            0%, 100% { outline-color: rgba(59, 130, 246, 0.8); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
            50% { outline-color: rgba(59, 130, 246, 1); box-shadow: 0 0 16px 4px rgba(59, 130, 246, 0.25); }
        }`;

        return `${keyframes}\n${currentSelector}\n${otherStyles}\n${dimStyles}`;
    }, [visible, query, matchIds, currentMatchId, nodes]);

    if (!visible) return null;

    const hasReplaceFns = !!(onReplaceNode && onReplaceAll);

    return (
        <>
            {/* 动态搜索高亮样式 */}
            {highlightStyle && <style>{highlightStyle}</style>}

            <div style={{
                position: 'absolute',
                top: 56,
                right: 12,
                zIndex: 1600,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                animation: 'quickMenuFadeIn 0.15s ease-out',
                overflow: 'hidden',
                minWidth: 280,
            }}>
                {/* ── 搜索行 ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}>
                    <FaSearch size={12} style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="搜索节点..."
                        style={{
                            border: 'none', outline: 'none', background: 'transparent',
                            fontSize: 13, flex: 1, color: token.colorText, fontFamily: 'inherit',
                        }}
                    />
                    {/* 结果计数 */}
                    {query && (
                        <span style={{
                            fontSize: 11,
                            color: matchIds.length > 0 ? token.colorTextSecondary : '#ef4444',
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {matchIds.length > 0 ? `${currentIndex + 1}/${matchIds.length}` : '无结果'}
                        </span>
                    )}
                    {/* 上下导航 */}
                    <button onClick={goPrev} disabled={matchIds.length === 0} style={navBtnStyle(matchIds.length > 0, token)}>
                        <FaChevronUp size={11} />
                    </button>
                    <button onClick={goNext} disabled={matchIds.length === 0} style={navBtnStyle(matchIds.length > 0, token)}>
                        <FaChevronDown size={11} />
                    </button>
                    {/* 切换替换模式 */}
                    {hasReplaceFns && (
                        <button
                            onClick={() => setShowReplace(v => !v)}
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
                    <button onClick={onClose} style={navBtnStyle(true, token)}>
                        <FaTimes size={11} />
                    </button>
                </div>

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
                            onChange={e => setReplaceText(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleReplaceCurrent(); }}
                            placeholder="替换为..."
                            style={{
                                border: 'none', outline: 'none', background: 'transparent',
                                fontSize: 13, flex: 1, color: token.colorText, fontFamily: 'inherit',
                            }}
                        />
                        <button
                            onClick={handleReplaceCurrent}
                            disabled={matchIds.length === 0}
                            title="替换当前"
                            style={actionBtnStyle(matchIds.length > 0, token)}
                        >
                            替换
                        </button>
                        <button
                            onClick={handleReplaceAll}
                            disabled={matchIds.length === 0}
                            title={`全部替换 (${matchIds.length} 处)`}
                            style={actionBtnStyle(matchIds.length > 0, token)}
                        >
                            全部({matchIds.length})
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

// ── 样式辅助 ──
const navBtnStyle = (active: boolean, token: ThemeToken): React.CSSProperties => ({
    border: 'none', background: 'transparent',
    cursor: active ? 'pointer' : 'default',
    color: active ? token.colorText : token.colorTextDisabled,
    padding: 2, display: 'flex', alignItems: 'center',
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
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
});
