import React, { useMemo } from 'react';
import Modal from 'antd/es/modal';
import Typography from 'antd/es/typography';
import Table from 'antd/es/table';
import { useTranslation } from 'react-i18next';
import './ShortcutsHelpModal.css';

type ShortcutRow = {
  key: string;
  action: string;
  shortcut: string;
  note?: string;
};

export const ShortcutsHelpModal: React.FC<{
  open: boolean;
  onClose: () => void;
  getContainer?: () => HTMLElement;
}> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');

  const rows = useMemo<ShortcutRow[]>(() => {
    const mod = isMac ? '⌘' : 'Ctrl';
    return [
      { key: 'palette', action: t('designer.shortcuts.action.palette'), shortcut: `${mod}+K` },
      { key: 'menuSearch', action: t('designer.shortcuts.action.menuSearch'), shortcut: `${mod}+Shift+F` },
      { key: 'menuToggle', action: t('designer.shortcuts.action.menuToggle'), shortcut: `${mod}+Shift+B` },
      { key: 'debugToggle', action: t('designer.shortcuts.action.debugToggle'), shortcut: `${mod}+Shift+D`, note: t('designer.shortcuts.note.devOnly') },
      { key: 'settings', action: t('designer.shortcuts.action.settings'), shortcut: `${mod}+,` },
      { key: 'exitFs', action: t('designer.shortcuts.action.exitFullscreen'), shortcut: 'Esc' }
    ];
  }, [isMac, t]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={t('designer.shortcuts.title')}
      width={720}
      centered
      getContainer={() => document.body}
      rootClassName="commercial-shortcuts-modal"
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
        {t('designer.shortcuts.subtitle')}
      </Typography.Paragraph>
      <Table
        size="small"
        pagination={false}
        dataSource={rows}
        columns={[
          { title: t('designer.shortcuts.table.action'), dataIndex: 'action', key: 'action' },
          { title: t('designer.shortcuts.table.shortcut'), dataIndex: 'shortcut', key: 'shortcut', width: 160 },
          { title: t('designer.shortcuts.table.note'), dataIndex: 'note', key: 'note' }
        ]}
      />
    </Modal>
  );
};

export default ShortcutsHelpModal;
