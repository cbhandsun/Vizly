import React from 'react';
import { Button, Tooltip } from 'antd';

interface DropdownMenuTriggerButtonProps extends Omit<
    React.HTMLAttributes<HTMLElement>,
    'children' | 'className' | 'onKeyDown' | 'style'
> {
    ariaLabel: string;
    className: string;
    icon: React.ReactNode;
    open: boolean;
    onTriggerKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
    style?: React.CSSProperties;
}

export const DropdownMenuTriggerButton = React.forwardRef<
    HTMLButtonElement,
    DropdownMenuTriggerButtonProps
>(({ ariaLabel, className, icon, open, onTriggerKeyDown, style, ...triggerProps }, ref) => (
    <Tooltip title={ariaLabel} {...triggerProps}>
        <Button
            ref={ref}
            type="text"
            aria-label={ariaLabel}
            aria-haspopup="menu"
            aria-expanded={open}
            onKeyDown={onTriggerKeyDown}
            icon={icon}
            className={className}
            style={style}
        />
    </Tooltip>
));

DropdownMenuTriggerButton.displayName = 'DropdownMenuTriggerButton';
