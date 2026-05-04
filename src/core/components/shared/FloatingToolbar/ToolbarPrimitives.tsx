/**
 * ToolbarPrimitives.tsx — Vizly Floating Toolbar Primitives V4
 * 
 * 设计对标: Figma / Miro / Whimsical context toolbar
 * 关键约束:
 *   - 按钮 32×32, 图标 15px, 圆角 7px
 *   - 所有图标使用 .floating-toolbar-btn__icon 包裹以确保 font-size 统一
 *   - 不使用 antd Button，用 <button> 维持 CSS-only 控制
 */
import React, { useState, useCallback } from 'react';
import { Tooltip, Popover } from 'antd';
import { MoreOutlined } from '@ant-design/icons';
import './FloatingToolbar.css';

// ─── ToolbarContainer ─────────────────────────────────────────────────────────
export interface ToolbarContainerProps {
    children: React.ReactNode;
    className?: string;
    positioning?: 'positioned' | 'fixed' | 'static';
    square?: boolean;
    style?: React.CSSProperties;
    stopPropagation?: boolean;
}

export const ToolbarContainer: React.FC<ToolbarContainerProps> = ({
    children,
    className = '',
    positioning = 'static',
    square = false,
    style,
    stopPropagation = true,
}) => {
    const cls = [
        'floating-toolbar-container',
        positioning === 'positioned' && 'floating-toolbar-container--positioned',
        positioning === 'fixed' && 'floating-toolbar-container--fixed',
        square && 'floating-toolbar-container--square',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cls}
            style={style}
            onPointerDownCapture={stopPropagation ? e => e.stopPropagation() : undefined}
            onPointerMoveCapture={stopPropagation ? e => e.stopPropagation() : undefined}
            onWheelCapture={stopPropagation ? e => e.stopPropagation() : undefined}
        >
            {children}
        </div>
    );
};

// ─── ToolbarButton ────────────────────────────────────────────────────────────
export interface ToolbarButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    active?: boolean;
    disabled?: boolean;
    danger?: boolean;
    color?: string;
    badge?: string;
    placement?: 'top' | 'bottom';
    className?: string;
    style?: React.CSSProperties;
}

export const ToolbarButton: React.FC<ToolbarButtonProps> = ({
    icon, label, onClick,
    active = false, disabled = false, danger = false,
    color, badge, placement = 'top',
    className = '', style,
}) => {
    const cls = [
        'floating-toolbar-btn',
        active && 'floating-toolbar-btn--active',
        danger && 'floating-toolbar-btn--danger',
        disabled && 'floating-toolbar-btn--disabled',
        className,
    ].filter(Boolean).join(' ');

    return (
        <Tooltip title={label} placement={placement} mouseEnterDelay={0.5}>
            <button
                className={cls}
                onClick={disabled ? undefined : onClick}
                style={{ ...style, ...(color ? { color } : {}) }}
                tabIndex={disabled ? -1 : 0}
                aria-label={label}
                aria-disabled={disabled}
            >
                <span className="floating-toolbar-btn__icon">{icon}</span>
                {badge && <span className="floating-toolbar-btn__badge" style={{ backgroundColor: badge }} />}
            </button>
        </Tooltip>
    );
};

// ─── ToolbarColorSwatch ───────────────────────────────────────────────────────
export interface ToolbarColorSwatchProps {
    color: string;
    label: string;
    onClick?: () => void;
    placement?: 'top' | 'bottom';
}

export const ToolbarColorSwatch: React.FC<ToolbarColorSwatchProps> = ({
    color, label, onClick, placement = 'top',
}) => (
    <Tooltip title={label} placement={placement} mouseEnterDelay={0.5}>
        <button className="floating-toolbar-btn" onClick={onClick} aria-label={label}>
            <div className="floating-toolbar-color-swatch">
                <div className="floating-toolbar-color-swatch__dot" style={{ backgroundColor: color }} />
            </div>
        </button>
    </Tooltip>
);

// ─── ToolbarDivider ───────────────────────────────────────────────────────────
export const ToolbarDivider: React.FC = () => <div className="floating-toolbar-divider" />;

// ─── ToolbarGroup ─────────────────────────────────────────────────────────────
export const ToolbarGroup: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>{children}</div>
);

// ─── ToolbarPopover ───────────────────────────────────────────────────────────
export interface ToolbarPopoverProps {
    icon: React.ReactNode;
    label: string;
    content: React.ReactNode;
    active?: boolean;
    disabled?: boolean;
    placement?: 'top' | 'bottom';
    badge?: string;
}

export const ToolbarPopover: React.FC<ToolbarPopoverProps> = ({
    icon, label, content,
    active = false, disabled = false,
    placement = 'bottom', badge,
}) => (
    <Popover content={content} trigger="click" placement={placement}>
        <span>
            <ToolbarButton icon={icon} label={label} active={active} disabled={disabled} badge={badge} />
        </span>
    </Popover>
);

// ─── ToolbarOverflow ──────────────────────────────────────────────────────────
export interface OverflowItem {
    key: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
}

export interface ToolbarOverflowProps {
    items: OverflowItem[];
    label?: string;
}

export const ToolbarOverflow: React.FC<ToolbarOverflowProps> = ({
    items, label = '更多操作',
}) => {
    const [open, setOpen] = useState(false);

    const handleItemClick = useCallback((item: OverflowItem) => {
        if (item.disabled) return;
        item.onClick();
        setOpen(false);
    }, []);

    if (items.length === 0) return null;

    const content = (
        <div className="floating-toolbar-overflow-panel">
            {items.map(item => (
                <button
                    key={item.key}
                    className={`floating-toolbar-overflow-item ${item.danger ? 'floating-toolbar-overflow-item--danger' : ''}`}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                    style={{ opacity: item.disabled ? 0.35 : 1 }}
                >
                    <span className="floating-toolbar-overflow-item-icon">{item.icon}</span>
                    <span>{item.label}</span>
                </button>
            ))}
        </div>
    );

    return (
        <Popover content={content} trigger="click" placement="bottom" open={open} onOpenChange={setOpen}>
            <span>
                <ToolbarButton icon={<MoreOutlined />} label={label} />
            </span>
        </Popover>
    );
};
