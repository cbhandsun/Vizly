import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { theme } from 'antd';
import { FaHistory, FaUndoAlt, FaRedoAlt, FaClock } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import type { HistoryEntry } from '../../hooks/useDiagramHistory';
import {
    normalizeHistoryChangeCount,
    normalizeHistoryLabel,
    resolveHistoryTime,
} from './historyPanelPresentation';

export interface HistoryPanelProps {
    visible: boolean;
    onClose: () => void;
    pastEntries: HistoryEntry[];
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onJumpTo: (index: number) => void;
}

const HISTORY_FOCUS_RETURN_SELECTOR = '[data-history-focus-return]';

function focusAfterHistoryUpdate(preferredTarget?: HTMLButtonElement): void {
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            if (preferredTarget?.isConnected && !preferredTarget.disabled) {
                preferredTarget.focus({ preventScroll: true });
                return;
            }
            document.querySelector<HTMLDivElement>('[data-history-panel]')?.focus({ preventScroll: true });
        });
    });
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
    const { t, i18n } = useTranslation();
    const panelRef = useRef<HTMLDivElement>(null);
    const [statusMessage, setStatusMessage] = useState('');
    const [now, setNow] = useState(() => Date.now());

    const closePanel = useCallback(() => {
        setStatusMessage('');
        onClose();
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                document.querySelector<HTMLButtonElement>(HISTORY_FOCUS_RETURN_SELECTOR)?.focus({ preventScroll: true });
            });
        });
    }, [onClose]);

    const handleUndo = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        onUndo();
        setStatusMessage(t('designer.historyPanel.undoStatus'));
        focusAfterHistoryUpdate(event.currentTarget);
    }, [onUndo, t]);

    const handleRedo = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        onRedo();
        setStatusMessage(t('designer.historyPanel.redoStatus'));
        focusAfterHistoryUpdate(event.currentTarget);
    }, [onRedo, t]);

    const handleJumpTo = useCallback((event: React.MouseEvent<HTMLButtonElement>, index: number, label: string) => {
        onJumpTo(index);
        setStatusMessage(t('designer.historyPanel.restoredStatus', { label }));
        focusAfterHistoryUpdate(event.currentTarget);
    }, [onJumpTo, t]);

    const formatTime = (timestamp: number): string => {
        const presentation = resolveHistoryTime(timestamp, now);
        switch (presentation.kind) {
            case 'justNow':
                return t('designer.historyPanel.justNow');
            case 'secondsAgo':
                return t('designer.historyPanel.secondsAgo', { count: presentation.count });
            case 'minutesAgo':
                return t('designer.historyPanel.minutesAgo', { count: presentation.count });
            case 'clock':
                try {
                    return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                    }).format(new Date(presentation.timestamp));
                } catch {
                    return t('designer.historyPanel.unknownTime');
                }
            default:
                return t('designer.historyPanel.unknownTime');
        }
    };

    // 反转显示（最新在上）
    const reversedEntries = useMemo(
        () => pastEntries.map((entry, index) => ({
            ...entry,
            index,
            label: normalizeHistoryLabel(entry.label, t('designer.historyPanel.unknownOperation')),
            changeCount: normalizeHistoryChangeCount(entry.changeCount, entry.patch?.length),
        })).reverse(),
        [pastEntries, t]
    );

    useEffect(() => {
        if (!visible) return;

        panelRef.current?.focus({ preventScroll: true });
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            closePanel();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [closePanel, visible]);

    if (!visible) return null;

    return createPortal(
        <div
            ref={panelRef}
            data-history-panel
            role="dialog"
            aria-modal="false"
            aria-labelledby="history-panel-title"
            tabIndex={-1}
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
                    <FaHistory size={13} aria-hidden="true" />
                    <span id="history-panel-title">{t('designer.historyPanel.title')}</span>
                    <span style={{ fontSize: 11, color: token.colorTextTertiary, fontWeight: 400 }}>
                        ({pastEntries.length})
                    </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        type="button"
                        onClick={handleUndo}
                        disabled={!canUndo}
                        title={t('designer.historyPanel.undo')}
                        aria-label={t('designer.historyPanel.undo')}
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
                        <FaUndoAlt size={11} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={handleRedo}
                        disabled={!canRedo}
                        title={t('designer.historyPanel.redo')}
                        aria-label={t('designer.historyPanel.redo')}
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
                        <FaRedoAlt size={11} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={closePanel}
                        title={t('designer.historyPanel.close')}
                        aria-label={t('designer.historyPanel.close')}
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

            {statusMessage && (
                <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    style={{
                        margin: '8px 12px 4px',
                        padding: '8px 10px',
                        border: `1px solid ${token.colorSuccessBorder}`,
                        borderRadius: token.borderRadius,
                        background: token.colorSuccessBg,
                        color: token.colorText,
                        fontSize: 12,
                    }}
                >
                    {statusMessage}
                </div>
            )}

            {/* Timeline */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {reversedEntries.length === 0 && (
                    <div style={{
                        padding: '24px 16px',
                        textAlign: 'center',
                        color: token.colorTextTertiary,
                        fontSize: 12,
                    }}>
                        {t('designer.historyPanel.empty')}
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
                    <span style={{ fontWeight: 600, color: token.colorText }}>{t('designer.historyPanel.current')}</span>
                </div>

                {reversedEntries.map((entry) => (
                    <button
                        type="button"
                        key={`${entry.index}-${entry.timestamp}`}
                        onClick={(event) => handleJumpTo(event, entry.index, entry.label)}
                        aria-label={t('designer.historyPanel.restoreEntry', {
                            label: entry.label,
                            time: formatTime(entry.timestamp),
                        })}
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
                                <FaClock size={8} aria-hidden="true" />
                                {formatTime(entry.timestamp)}
                                <span style={{ marginLeft: 4 }}>
                                    {t('designer.historyPanel.changeCount', { count: entry.changeCount })}
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
