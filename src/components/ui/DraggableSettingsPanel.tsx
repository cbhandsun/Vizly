import React, { ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConfigProvider } from 'antd';
import { MdClose, MdDragIndicator } from 'react-icons/md';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';
import { ModalNestingBoundary } from '../../hooks/ModalNestingBoundary';

interface DraggableSettingsPanelProps {
    children: ReactNode;
    closeLabel: string;
    onClose: () => void;
    title: string;
}

export const SETTINGS_PANEL_Z_INDEX = 1100;
export const SETTINGS_PANEL_POPUP_Z_INDEX = 1150;
const getSettingsPanelViewportInset = (viewportWidth: number): number => (
    viewportWidth <= 360 ? 8 : 16
);

export const DraggableSettingsPanel: React.FC<DraggableSettingsPanelProps> = ({ children, closeLabel, onClose, title }) => {
    const viewportInset = useMemo(() => getSettingsPanelViewportInset(window.innerWidth), []);
    const initialPos = useMemo(() => ({
        x: Math.max(viewportInset, (window.innerWidth - Math.min(480, window.innerWidth - (viewportInset * 2))) / 2),
        y: Math.max(viewportInset, Math.min(80, window.innerHeight - 160)),
    }), [viewportInset]);
    const titleId = useId();
    const [hasActiveNestedModal, setHasActiveNestedModal] = useState(false);
    const onCloseRef = useRef(onClose);
    const handleNestedModalChange = useCallback((active: boolean) => {
        setHasActiveNestedModal(active);
    }, []);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const { panelRef, handlePointerDown } = useDraggablePanel({
        initialPosition: initialPos,
        viewportInset,
    });

    useEffect(() => {
        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const panel = panelRef.current;
        panel?.querySelector<HTMLElement>('[data-settings-close]')?.focus();
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            onCloseRef.current();
        };
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
            const capturedTarget = previouslyFocused?.isConnected && previouslyFocused !== document.body
                ? previouslyFocused
                : null;
            const primaryFallback = document.querySelector<HTMLElement>('[data-settings-focus-return="primary"]');
            const secondaryFallback = document.querySelector<HTMLElement>('[data-settings-focus-return="fallback"]');
            (capturedTarget ?? primaryFallback ?? secondaryFallback)?.focus();
        };
    }, [panelRef]);

    const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab' || !panelRef.current) return;
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        )).filter(element => !element.hasAttribute('hidden'));
        if (focusable.length === 0) {
            event.preventDefault();
            panelRef.current.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: SETTINGS_PANEL_Z_INDEX,
                background: 'rgba(15, 23, 42, 0.12)',
            }}
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
        <div
            ref={panelRef}
            role="dialog"
            aria-modal={hasActiveNestedModal ? undefined : true}
            aria-hidden={hasActiveNestedModal ? true : undefined}
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={handleDialogKeyDown}
            className="bg-[rgba(255,255,255,0.92)] dark:bg-[rgba(28,28,41,0.92)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.22)] rounded-[20px] overflow-hidden"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: `calc(100vw - ${viewportInset * 2}px)`,
                maxWidth: 480,
                maxHeight: `calc(100dvh - ${viewportInset * 2}px)`,
                display: 'flex',
                flexDirection: 'column',
                zIndex: 1,
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                onPointerDown={handlePointerDown}
                className="flex items-center justify-between px-6 py-4 bg-white/40 dark:bg-black/20 hover:bg-white/50 dark:hover:bg-black/30 backdrop-blur-md border-b border-black/5 dark:border-white/5 cursor-move select-none shrink-0 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <MdDragIndicator className="text-gray-400 dark:text-gray-500 text-[20px]" />
                    <span id={titleId} className="font-semibold text-[15px] tracking-wide text-gray-800 dark:text-gray-200">{title}</span>
                </div>
                <button
                    type="button"
                    data-settings-close
                    aria-label={closeLabel}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="flex items-center justify-center rounded-full bg-transparent hover:bg-black/5 dark:bg-transparent dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors border-none outline-none cursor-pointer"
                    style={{
                        width: 'var(--commercial-touch-target, 44px)',
                        height: 'var(--commercial-touch-target, 44px)',
                        flexShrink: 0,
                    }}
                >
                    <MdClose size={18} aria-hidden="true" />
                </button>
            </div>

            {/* 内容区域：ConfigProvider 让下拉框弹出到 body，避免被 overflow 裁剪 */}
            <ConfigProvider
                getPopupContainer={() => document.body}
                theme={{
                    token: {
                        zIndexPopupBase: SETTINGS_PANEL_POPUP_Z_INDEX
                    }
                }}
            >
                <div style={{
                    flex: 1,
                    minHeight: 0,
                    overflowY: 'auto',
                    overflowX: 'hidden'
                }}>
                    <ModalNestingBoundary onActiveChange={handleNestedModalChange}>
                        {children}
                    </ModalNestingBoundary>
                </div>
            </ConfigProvider>
        </div>
        </div>,
        document.body
    );
};
