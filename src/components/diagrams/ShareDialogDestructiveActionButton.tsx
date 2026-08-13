import React from 'react';
import { Button, Popconfirm, Tooltip } from 'antd';
import { FaTrash } from 'react-icons/fa';

interface ShareDialogDestructiveActionButtonProps {
  ariaLabel: string;
  cancelText: string;
  confirmTitle: string;
  label: string;
  onConfirm: () => Promise<void>;
  showLabel?: boolean;
}

export const ShareDialogDestructiveActionButton: React.FC<
  ShareDialogDestructiveActionButtonProps
> = ({
  ariaLabel,
  cancelText,
  confirmTitle,
  label,
  onConfirm,
  showLabel = false,
}) => (
  <Popconfirm
    title={confirmTitle}
    onConfirm={onConfirm}
    okText={label}
    cancelText={cancelText}
  >
    <Tooltip title={ariaLabel}>
      <Button
        aria-label={ariaLabel}
        type="text"
        size="small"
        danger
        icon={<FaTrash aria-hidden="true" style={showLabel ? { fontSize: 11 } : undefined} />}
      >
        {showLabel ? label : null}
      </Button>
    </Tooltip>
  </Popconfirm>
);
