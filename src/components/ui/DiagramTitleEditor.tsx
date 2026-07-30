import React, { useId, useState } from 'react';
import { Button, Input, Popover, Tooltip, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface DiagramTitleEditorProps {
  title: string;
  onRename: (title: string) => Promise<void>;
}

export const DiagramTitleEditor: React.FC<DiagramTitleEditorProps> = ({
  title,
  onRename,
}) => {
  const { t } = useTranslation();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const closeEditor = () => {
    if (saving) return;
    setFailed(false);
    setOpen(false);
  };

  const submitRename = async () => {
    const candidate = draft.trim();
    if (!candidate || saving) return;

    setSaving(true);
    setFailed(false);
    try {
      await onRename(candidate);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="w-[300px] max-w-[calc(100vw-32px)] p-1">
      <label
        htmlFor={inputId}
        className="block mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
      >
        {t('diagramViewer.rename.label')}
      </label>
      <Input
        id={inputId}
        aria-label={t('diagramViewer.rename.inputLabel')}
        value={draft}
        maxLength={240}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onPressEnter={() => void submitRename()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeEditor();
        }}
      />
      {failed && (
        <Typography.Text
          type="danger"
          role="alert"
          className="block mt-2 text-xs"
        >
          {t('diagramViewer.rename.failed')}
        </Typography.Text>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <Button size="small" onClick={closeEditor} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          size="small"
          type="primary"
          loading={saving}
          disabled={!draft.trim()}
          onClick={() => void submitRename()}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomLeft"
      open={open}
      onOpenChange={(nextOpen) => {
        if (saving) return;
        setFailed(false);
        if (nextOpen) setDraft(title);
        setOpen(nextOpen);
      }}
    >
      <Tooltip title={t('diagramViewer.rename.action')}>
        <Button
          type="text"
          size="small"
          aria-label={t('diagramViewer.rename.action')}
          icon={<EditOutlined />}
          className="w-8 h-8 p-0 flex items-center justify-center rounded-[6px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        />
      </Tooltip>
    </Popover>
  );
};
