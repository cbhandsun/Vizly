import React, { ReactNode, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ConfigProvider } from 'antd';
import { MdDragIndicator } from 'react-icons/md';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';

interface DraggableSettingsPanelProps {
    children: ReactNode;
    onClose: () => void;
    title: string;
}

export const SETTINGS_PANEL_Z_INDEX = 900;
export const SETTINGS_PANEL_POPUP_Z_INDEX = 950;

export const DraggableSettingsPanel: React.FC<DraggableSettingsPanelProps> = ({ children, onClose, title }) => {
    // 初始位置设为居中偏上，避免与右侧属性面板（DesignerRightSidebar）冲突
    const initialPos = useMemo(() => ({
        x: Math.max(20, (window.innerWidth - 440) / 2),
        y: 80
    }), []);

    const { panelRef, handlePointerDown } = useDraggablePanel({
        initialPosition: initialPos
    });

    return createPortal(
        <div
            ref={panelRef}
            className="bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(28,28,41,0.65)] backdrop-blur-[24px] backdrop-saturate-[180%] border border-[rgba(255,255,255,0.45)] dark:border-[rgba(255,255,255,0.12)] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.15)] rounded-[20px] overflow-hidden"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '480px',
                maxHeight: 'calc(100vh - 100px)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: SETTINGS_PANEL_Z_INDEX,
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                onPointerDown={handlePointerDown}
                className="flex items-center justify-between px-6 py-4 bg-white/40 dark:bg-black/20 hover:bg-white/50 dark:hover:bg-black/30 backdrop-blur-md border-b border-black/5 dark:border-white/5 cursor-move select-none shrink-0 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <MdDragIndicator className="text-gray-400 dark:text-gray-500 text-[20px]" />
                    <span className="font-semibold text-[15px] tracking-wide text-gray-800 dark:text-gray-200">{title}</span>
                </div>
                <button
                    type="button"
                    aria-label={`关闭${title}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="flex items-center justify-center w-7 h-7 rounded-full bg-transparent hover:bg-black/5 dark:bg-transparent dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors border-none outline-none cursor-pointer"
                >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
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
                    overflowY: 'auto',
                    overflowX: 'hidden'
                }}>
                    {children}
                </div>
            </ConfigProvider>
        </div>,
        document.body
    );
};
