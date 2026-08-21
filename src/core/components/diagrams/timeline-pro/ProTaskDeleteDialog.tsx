import React from 'react';
import { Modal } from 'antd';

interface ProTaskDeleteDialogProps {
  open: boolean;
  taskName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ProTaskDeleteDialog: React.FC<ProTaskDeleteDialogProps> = ({
  open,
  taskName,
  onCancel,
  onConfirm,
}) => (
  <Modal
    open={open}
    title={taskName ? `删除“${taskName}”？` : '删除任务？'}
    okText="删除"
    cancelText="取消"
    okButtonProps={{ danger: true, type: 'primary' }}
    cancelButtonProps={{ autoFocus: true }}
    width={420}
    centered
    onCancel={onCancel}
    onOk={onConfirm}
  >
    <p>将同时删除其所有子任务和相关依赖关系；删除后可使用撤销恢复。</p>
  </Modal>
);
