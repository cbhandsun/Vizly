import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { theme } from 'antd';
import { FaHistory, FaUndoAlt, FaRedoAlt, FaClock } from 'react-icons/fa';
import type { HistoryEntry } from '../../hooks/useDiagramHistory';

interface HistoryPanelProps {
    visible: boolean;
    onClose: () => void;
    pastEntries: HistoryEntry[];
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onJumpTo: (index: number) => void;
}

/** 格式化时间戳为用户友好的相对时间 */
function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    if (diff < 5000) return '刚才';
    if (diff < 60000) return `${Math.floor(diff / 1000)}秒前`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
    visible,
    onClose,
    pastEntries,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onJumpTo,
}) => {
    const { token } = theme.useToken();

    // 反转显示（最新在上）
    const reversedEntries = useMemo(
        () => pastEntries.map((e, i) => ({ ...e, index: i })).reverse(),
        [pastEntries]
    );

    useEffect(() => {
        if (!visible) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose, visible]);

    if (!visible) return null;

    return createPortal(
        <div
            role="region"
            aria-label="历史记录"
            style={{
                position: 'fixed',
                right: 16,
                top: 60,
                width: 'calc(100vw - 32px)',
                maxWidth: 320,
                maxHeight: 'calc(100dvh - 76px)',
                zIndex: 3000,
                background: token.colorBgContainer,
                border: `1px solid ${token.colorBorderSecondary}`,
                borderRadius: token.borderRadiusLG + 2,
                boxShadow: `0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)`,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'quickMenuFadeIn 0.15s ease-out',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px 8px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: token.colorText }}>
                    <FaHistory size={13} />
                    <span>历史记录</span>
                    <span style={{ fontSize: 11, color: token.colorTextTertiary, fontWeight: 400 }}>
                        ({pastEntries.length})
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="撤销"
                        aria-label="撤销"
                        style={{
                            border: 'none',
                            background: canUndo ? token.colorFillTertiary : 'transparent',
                            borderRadius: token.borderRadius,
                            width: 'var(--commercial-touch-target, 44px)',
                            height: 'var(--commercial-touch-target, 44px)',
                            padding: 0,
                            cursor: canUndo ? 'pointer' : 'not-allowed',
                            color: canUndo ? token.colorText : token.colorTextDisabled,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <FaUndoAlt size={11} />
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="重做"
                        aria-label="重做"
                        style={{
                            border: 'none',
                            background: canRedo ? token.colorFillTertiary : 'transparent',
                            borderRadius: token.borderRadius,
                            width: 'var(--commercial-touch-target, 44px)',
                            height: 'var(--commercial-touch-target, 44px)',
                            padding: 0,
                            cursor: canRedo ? 'pointer' : 'not-allowed',
                            color: canRedo ? token.colorText : token.colorTextDisabled,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <FaRedoAlt size={11} />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        title="关闭"
                        aria-label="关闭历史记录"
                        style={{
                            border: 'none',
                            background: 'transparent',
                            borderRadius: token.borderRadius,
                            width: 'var(--commercial-touch-target, 44px)',
                            height: 'var(--commercial-touch-target, 44px)',
                            padding: 0,
                            cursor: 'pointer',
                            color: token.colorTextSecondary,
                            fontSize: 14,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            {/* Timeline */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {reversedEntries.length === 0 && (
                    <div style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        color: token.colorTextTertiary,
                        fontSize: 12,
                    }}>
                        暂无历史记录
                    </div>
                )}

                {/* 当前状态标记 */}
                <div style={{
                    padding: '6px 12px',
                    minHeight: 'var(--commercial-touch-target, 44px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                }}>
                    <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 0 3px rgba(16,185,129,0.2)',
                        flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 600, color: token.colorText }}>当前状态</span>
                </div>

                {reversedEntries.map((entry) => (
                    <button
                        type="button"
                        key={`${entry.index}-${entry.timestamp}`}
                        onClick={() => onJumpTo(entry.index)}
                        aria-label={`恢复到 ${entry.label}，${formatTime(entry.timestamp)}`}
                        style={{
                            padding: '6px 12px',
                            minHeight: 'var(--commercial-touch-target, 44px)',
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            textAlign: 'left',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            cursor: 'pointer',
                            fontSize: 12,
                            transition: 'background 0.1s',
                            borderRadius: 0,
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = token.colorFillTertiary}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        {/* Timeline dot */}
                        <span style={{
                            display: 'block',
                            width: 6, height: 6, borderRadius: '50%',
                            background: token.colorTextQuaternary,
                            flexShrink: 0,
                        }} />

                        {/* Content */}
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{
                                display: 'block',
                                color: token.colorText,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {entry.label}
                            </span>
                            <span style={{
                                color: token.colorTextTertiary,
                                fontSize: 10,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                            }}>
                                <FaClock size={8} />
                                {formatTime(entry.timestamp)}
                                <span style={{ marginLeft: 4 }}>
                                    {entry.changeCount ?? entry.patch.length} 变动
                                </span>
                            </span>
                        </span>
                    </button>
                ))}
            </div>
        </div>,
        document.body
    );
};
