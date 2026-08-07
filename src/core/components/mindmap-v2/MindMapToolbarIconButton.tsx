import type { ComponentProps } from 'react';
import { Button, Tooltip } from 'antd';

type AntButtonProps = ComponentProps<typeof Button>;

interface MindMapToolbarIconButtonProps extends Omit<AntButtonProps, 'aria-label' | 'aria-pressed' | 'size' | 'type'> {
    label: string;
    pressed?: boolean;
    suppressTooltip?: boolean;
}

const MindMapToolbarIconButton = ({
    className,
    label,
    pressed,
    suppressTooltip = false,
    ...buttonProps
}: MindMapToolbarIconButtonProps) => (
    <Tooltip open={suppressTooltip ? false : undefined} title={label}>
        <Button
            {...buttonProps}
            aria-label={label}
            aria-pressed={pressed}
            className={['mind-elixir-toolbar-button', className].filter(Boolean).join(' ')}
            size="small"
            type="text"
        />
    </Tooltip>
);

export default MindMapToolbarIconButton;
