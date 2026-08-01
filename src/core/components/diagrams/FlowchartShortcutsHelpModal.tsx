import React, { useMemo, useState } from 'react';
import Modal from 'antd/es/modal';
import Typography from 'antd/es/typography';
import Table from 'antd/es/table';
import Input from 'antd/es/input';
import { SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { AccessibleInputClearIcon } from './AccessibleInputClearIcon';
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
  const [searchText, setSearchText] = useState('');
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');
  const mod = isMac ? '⌘' : 'Ctrl';

  const rows = useMemo<ShortcutRow[]>(() => {
    return [
      { key: 'palette', action: t('designer.flowchartShortcuts.action.palette'), shortcut: `${mod}+K / /` },
      { key: 'canvasSearch', action: t('designer.flowchartShortcuts.action.canvasSearch'), shortcut: `${mod}+F` },
      { key: 'findReplace', action: t('designer.flowchartShortcuts.action.findReplace'), shortcut: `${mod}+H` },
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

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase();
    if (!normalizedSearch) return rows;
    return rows.filter((row) => (
      row.action.toLocaleLowerCase().includes(normalizedSearch)
      || row.shortcut.toLocaleLowerCase().includes(normalizedSearch)
      || row.note?.toLocaleLowerCase().includes(normalizedSearch)
    ));
  }, [rows, searchText]);

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
      <Input
        aria-label={t('designer.flowchartShortcuts.searchPlaceholder')}
        placeholder={t('designer.flowchartShortcuts.searchPlaceholder')}
        prefix={<SearchOutlined aria-hidden="true" />}
        allowClear={{
          clearIcon: (
            <AccessibleInputClearIcon
              label={t('designer.flowchartShortcuts.clearSearch')}
            />
          ),
        }}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        style={{ marginBottom: 12 }}
      />
      <Table
        size="small"
        pagination={false}
        dataSource={filteredRows}
        rowKey="key"
        locale={{ emptyText: t('designer.flowchartShortcuts.noResults') }}
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
