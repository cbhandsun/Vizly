import type { ComponentProps } from 'react';
import { Button, Tooltip } from 'antd';

type AntButtonProps = ComponentProps<typeof Button>;

interface MindMapToolbarIconButtonProps extends Omit<AntButtonProps, 'aria-label' | 'aria-pressed' | 'size' | 'type'> {
    label: string;
    pressed?: boolean;
}

const MindMapToolbarIconButton = ({
    className,
    label,
    pressed,
    ...buttonProps
}: MindMapToolbarIconButtonProps) => (
    <Tooltip title={label}>
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
