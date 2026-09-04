import React from 'react';
import { Button, Tooltip } from 'antd';

interface DropdownMenuTriggerButtonProps extends Omit<
    React.HTMLAttributes<HTMLElement>,
    'children' | 'className' | 'onKeyDown' | 'style'
> {
    ariaLabel: string;
    className: string;
    'data-flowchart-import-focus-return'?: 'true';
    'data-flowchart-search-focus-return'?: 'true';
    'data-advanced-export-focus-return'?: 'true';
    'data-cloud-save-focus-return'?: 'true';
    'data-flowchart-layout-selection'?: string;
    busy?: boolean;
    disabled?: boolean;
    icon: React.ReactNode;
    menuId?: string;
    open: boolean;
    onTriggerKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
    style?: React.CSSProperties;
}

export const DropdownMenuTriggerButton = React.forwardRef<
    HTMLButtonElement,
    DropdownMenuTriggerButtonProps
>(({ ariaLabel, busy = false, className, disabled = false, icon, menuId, open, onTriggerKeyDown, style, ...triggerProps }, ref) => (
    <Tooltip title={ariaLabel} open={open ? false : undefined} {...triggerProps}>
        <Button
            ref={ref}
            data-flowchart-import-focus-return={triggerProps['data-flowchart-import-focus-return']}
            data-flowchart-search-focus-return={triggerProps['data-flowchart-search-focus-return']}
            data-advanced-export-focus-return={triggerProps['data-advanced-export-focus-return']}
            data-cloud-save-focus-return={triggerProps['data-cloud-save-focus-return']}
            data-flowchart-layout-selection={triggerProps['data-flowchart-layout-selection']}
            type="text"
            aria-label={ariaLabel}
            aria-haspopup="menu"
            aria-busy={busy}
            disabled={disabled}
            aria-expanded={open}
            aria-controls={menuId}
            onKeyDown={onTriggerKeyDown}
            icon={icon}
            className={className}
            style={style}
        />
    </Tooltip>
));

DropdownMenuTriggerButton.displayName = 'DropdownMenuTriggerButton';
