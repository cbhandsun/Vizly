import React, { ReactNode, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ConfigProvider, Button } from 'antd';
import { MdDragIndicator } from 'react-icons/md';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';

interface DraggableSettingsPanelProps {
    children: ReactNode;
    onClose: () => void;
    title: string;
}

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
            className="bg-white/70 dark:bg-[#1C1C1E]/80 backdrop-blur-xl backdrop-saturate-150 border border-white/20 dark:border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.12)] rounded-xl"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '440px',
                maxHeight: 'calc(100vh - 80px)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 2000,
            }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            <div
                onPointerDown={handlePointerDown}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(128,128,128,0.1)',
                    cursor: 'move',
                    userSelect: 'none',
                    flexShrink: 0
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MdDragIndicator style={{ color: 'var(--color-text-tertiary, #999)' }} />
                    <span style={{ fontWeight: 600, fontSize: '15px' }}>{title}</span>
                </div>
                <Button
                    type="text"
                    size="small"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    style={{ fontSize: '18px', lineHeight: 1 }}
                >
                    ×
                </Button>
            </div>

            {/* 内容区域：ConfigProvider 让下拉框弹出到 body，避免被 overflow 裁剪 */}
            <ConfigProvider
                getPopupContainer={() => document.body}
                theme={{
                    token: {
                        zIndexPopupBase: 3000 // 确保下拉框高于面板(2000)
                    }
                }}
            >
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: '16px'
                }}>
                    {children}
                </div>
            </ConfigProvider>
        </div>,
        document.body
    );
};
