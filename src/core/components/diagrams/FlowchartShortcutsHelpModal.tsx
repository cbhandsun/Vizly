import React, { useMemo } from 'react';
import Modal from 'antd/es/modal';
import Typography from 'antd/es/typography';
import Table from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import '../ui/ShortcutsHelpModal.css';

type ShortcutRow = {
  key: string;
  action: string;
  shortcut: string;
  note?: string;
};

export const FlowchartShortcutsHelpModal: React.FC<{
  open: boolean;
  onClose: () => void;
  getContainer?: () => HTMLElement;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  const mod = isMac ? '⌘' : 'Ctrl';

  const rows = useMemo<ShortcutRow[]>(() => {
    return [
      { key: 'palette', action: t('designer.flowchartShortcuts.action.palette'), shortcut: `${mod}+K / /` },
      { key: 'undo', action: t('designer.flowchartShortcuts.action.undo'), shortcut: `${mod}+Z` },
      { key: 'redo', action: t('designer.flowchartShortcuts.action.redo'), shortcut: isMac ? `${mod}+Shift+Z` : `${mod}+Y` },
      { key: 'copy', action: t('designer.flowchartShortcuts.action.copy'), shortcut: `${mod}+C` },
      { key: 'paste', action: t('designer.flowchartShortcuts.action.paste'), shortcut: `${mod}+V` },
      { key: 'cut', action: t('designer.flowchartShortcuts.action.cut'), shortcut: `${mod}+X` },
      { key: 'duplicate', action: t('designer.flowchartShortcuts.action.duplicate'), shortcut: `${mod}+D` },
      { key: 'selectAll', action: t('designer.flowchartShortcuts.action.selectAll'), shortcut: `${mod}+A` },
      { key: 'group', action: t('designer.flowchartShortcuts.action.group'), shortcut: `${mod}+G` },
      { key: 'ungroup', action: t('designer.flowchartShortcuts.action.ungroup'), shortcut: `${mod}+Shift+G` },
      { key: 'delete', action: t('designer.flowchartShortcuts.action.delete'), shortcut: t('designer.flowchartShortcuts.shortcut.delete') },
      { key: 'nudge', action: t('designer.flowchartShortcuts.action.nudge'), shortcut: t('designer.flowchartShortcuts.shortcut.nudge') },
      { key: 'nudgeFast', action: t('designer.flowchartShortcuts.action.nudgeFast'), shortcut: t('designer.flowchartShortcuts.shortcut.nudgeFast') },
      { key: 'duplicateDrag', action: t('designer.flowchartShortcuts.action.duplicateDrag'), shortcut: t('designer.flowchartShortcuts.shortcut.duplicateDrag') },
      { key: 'pan', action: t('designer.flowchartShortcuts.action.pan'), shortcut: t('designer.flowchartShortcuts.shortcut.pan') }
    ];
  }, [isMac, mod, t]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={t('designer.flowchartShortcuts.title')}
      width={760}
      centered
      getContainer={() => document.body}
      rootClassName="commercial-shortcuts-modal"
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t('designer.flowchartShortcuts.subtitle', { mod })}
      </Typography.Paragraph>
      <Table
        size="small"
        pagination={false}
        dataSource={rows}
        rowKey="key"
        columns={[
          { title: t('designer.flowchartShortcuts.table.action'), dataIndex: 'action', key: 'action' },
          { title: t('designer.flowchartShortcuts.table.shortcut'), dataIndex: 'shortcut', key: 'shortcut', width: 200 },
          { title: t('designer.flowchartShortcuts.table.note'), dataIndex: 'note', key: 'note' }
        ]}
      />
    </Modal>
  );
};

export default FlowchartShortcutsHelpModal;
