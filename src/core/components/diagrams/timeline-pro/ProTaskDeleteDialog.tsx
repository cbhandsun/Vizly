import React from 'react';
import { Modal } from 'antd';

interface ProTaskDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ProTaskDeleteDialog: React.FC<ProTaskDeleteDialogProps> = ({
  open,
  title,
  description,
  confirmText,
  cancelText,
  onCancel,
  onConfirm,
}) => (
  <Modal
    open={open}
    title={title}
    okText={confirmText}
    cancelText={cancelText}
    okButtonProps={{ danger: true, type: 'primary' }}
    cancelButtonProps={{ autoFocus: true }}
    width={420}
    centered
    onCancel={onCancel}
    onOk={onConfirm}
  >
    <p>{description}</p>
  </Modal>
);
