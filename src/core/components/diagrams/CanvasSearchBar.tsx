import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { theme } from 'antd';
import { FaSearch, FaChevronUp, FaChevronDown, FaTimes } from 'react-icons/fa';
import { Node, useReactFlow } from '@xyflow/react';

interface CanvasSearchBarProps {
    visible: boolean;
    onClose: () => void;
    nodes: Node[];
    /** 外部控制高亮节点 */
    onHighlightNode?: (nodeId: string | null) => void;
}

/**
 * 画布内搜索栏 — Ctrl+F / Ctrl+K 触发
 * 支持关键词匹配节点标签/描述/ID/域名，上/下导航结果，聚焦视口 + 脉冲高亮
 */
export const CanvasSearchBar: React.FC<CanvasSearchBarProps> = ({
    visible,
    onClose,
    nodes,
    onHighlightNode,
}) => {
    const { token } = theme.useToken();
    const reactFlow = useReactFlow();
    const inputRef = useRef<HTMLInputElement>(null);

    const [query, setQuery] = useState('');
    const [matchIds, setMatchIds] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

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
            setMatchIds([]);
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

    return (
        <>
            {/* 动态搜索高亮样式 */}
            {highlightStyle && <style>{highlightStyle}</style>}

            <div style={{
                position: 'absolute',
                top: 56,
                right: 12,
                zIndex: 1600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG,
                padding: '4px 8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                animation: 'quickMenuFadeIn 0.15s ease-out',
            }}>
                <FaSearch size={12} style={{ color: token.colorTextTertiary, flexShrink: 0 }} />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="搜索节点..."
                    style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: 13,
                        width: 160,
                        color: token.colorText,
                        fontFamily: 'inherit',
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
                        {matchIds.length > 0
                            ? `${currentIndex + 1}/${matchIds.length}`
                            : '无结果'}
                    </span>
                )}
                {/* 上下导航 */}
                <button
                    onClick={goPrev}
                    disabled={matchIds.length === 0}
                    style={{
                        border: 'none', background: 'transparent', cursor: matchIds.length ? 'pointer' : 'default',
                        color: matchIds.length ? token.colorText : token.colorTextDisabled,
                        padding: 2, display: 'flex', alignItems: 'center',
                    }}
                >
                    <FaChevronUp size={11} />
                </button>
                <button
                    onClick={goNext}
                    disabled={matchIds.length === 0}
                    style={{
                        border: 'none', background: 'transparent', cursor: matchIds.length ? 'pointer' : 'default',
                        color: matchIds.length ? token.colorText : token.colorTextDisabled,
                        padding: 2, display: 'flex', alignItems: 'center',
                    }}
                >
                    <FaChevronDown size={11} />
                </button>
                {/* 关闭 */}
                <button
                    onClick={onClose}
                    style={{
                        border: 'none', background: 'transparent', cursor: 'pointer',
                        color: token.colorTextSecondary,
                        padding: 2, display: 'flex', alignItems: 'center',
                    }}
                >
                    <FaTimes size={11} />
                </button>
            </div>
        </>
    );
};
