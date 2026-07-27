import React, { useMemo } from 'react';
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

    if (!visible) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                left: 320,
                top: 60,
                width: 260,
                maxHeight: 400,
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
                        onClick={onUndo}
                        disabled={!canUndo}
                        title="撤销"
                        style={{
                            border: 'none',
                            background: canUndo ? token.colorFillTertiary : 'transparent',
                            borderRadius: token.borderRadius,
                            padding: '4px 6px',
                            cursor: canUndo ? 'pointer' : 'not-allowed',
                            color: canUndo ? token.colorText : token.colorTextDisabled,
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <FaUndoAlt size={11} />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={!canRedo}
                        title="重做"
                        style={{
                            border: 'none',
                            background: canRedo ? token.colorFillTertiary : 'transparent',
                            borderRadius: token.borderRadius,
                            padding: '4px 6px',
                            cursor: canRedo ? 'pointer' : 'not-allowed',
                            color: canRedo ? token.colorText : token.colorTextDisabled,
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <FaRedoAlt size={11} />
                    </button>
                    <button
                        onClick={onClose}
                        title="关闭"
                        style={{
                            border: 'none',
                            background: 'transparent',
                            borderRadius: token.borderRadius,
                            padding: '4px 6px',
                            cursor: 'pointer',
                            color: token.colorTextSecondary,
                            fontSize: 14,
                            lineHeight: 1,
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
                    <div
                        key={`${entry.index}-${entry.timestamp}`}
                        onClick={() => onJumpTo(entry.index)}
                        style={{
                            padding: '6px 12px',
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
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: token.colorTextQuaternary,
                            flexShrink: 0,
                        }} />

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                color: token.colorText,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {entry.label}
                            </div>
                            <div style={{
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
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>,
        document.body
    );
};
