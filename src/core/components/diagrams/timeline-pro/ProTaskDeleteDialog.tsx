import React from 'react';
import { Modal } from 'antd';

interface ProTaskDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  impact?: {
    childTaskNames: readonly string[];
    dependencyCount: number;
    hiddenChildTaskCount: number;
    taskCount: number;
  };
  impactLabels?: {
    affectedSubtasks: string;
    dependencyCount: string;
    heading: string;
    hiddenSubtasks: (count: number) => string;
    taskCount: string;
  };
  confirmText: string;
  cancelText: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ProTaskDeleteDialog: React.FC<ProTaskDeleteDialogProps> = ({
  open,
  title,
  description,
  impact,
  impactLabels,
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
    width={460}
    centered
    onCancel={onCancel}
    onOk={onConfirm}
  >
    <p style={{ marginTop: 0 }}>{description}</p>
    {impact && impactLabels && (
      <section
        aria-label={impactLabels.heading}
        style={{
          background: 'rgba(207, 19, 34, 0.05)',
          border: '1px solid rgba(207, 19, 34, 0.2)',
          borderRadius: 8,
          padding: '12px 14px',
        }}
      >
        <strong>{impactLabels.heading}</strong>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', margin: '10px 0 0' }}>
          <dt>{impactLabels.taskCount}</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{impact.taskCount}</dd>
          <dt>{impactLabels.dependencyCount}</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{impact.dependencyCount}</dd>
        </dl>
        {impact.childTaskNames.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div>{impactLabels.affectedSubtasks}</div>
            <ul style={{ margin: '4px 0 0', paddingInlineStart: 20 }}>
              {impact.childTaskNames.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}
            </ul>
            {impact.hiddenChildTaskCount > 0 && (
              <div style={{ marginTop: 4 }}>{impactLabels.hiddenSubtasks(impact.hiddenChildTaskCount)}</div>
            )}
          </div>
        )}
      </section>
    )}
  </Modal>
);
