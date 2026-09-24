import React, { useId, useRef, useState } from 'react';
import { Button, Input, Popover, Tooltip, Typography } from 'antd';
import type { InputRef } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface DiagramTitleEditorProps {
  title: string;
  onRename: (title: string) => Promise<void>;
  commercialTouchTarget?: boolean;
}

export const DiagramTitleEditor: React.FC<DiagramTitleEditorProps> = ({
  title,
  onRename,
  commercialTouchTarget = false,
}) => {
  const { t } = useTranslation();
  const inputId = useId();
  const labelId = useId();
  const dialogId = useId();
  const errorId = useId();
  const inputRef = useRef<InputRef>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [errorKind, setErrorKind] = useState<'required' | 'failed' | null>(null);

  const restoreTriggerFocus = () => {
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  };

  const closeEditor = () => {
    if (saving) return;
    setErrorKind(null);
    setOpen(false);
    restoreTriggerFocus();
  };

  const submitRename = async () => {
    const candidate = draft.trim();
    if (saving) return;
    if (!candidate) {
      setErrorKind('required');
      return;
    }

    setSaving(true);
    setErrorKind(null);
    try {
      await onRename(candidate);
      setOpen(false);
      restoreTriggerFocus();
    } catch {
      setErrorKind('failed');
    } finally {
      setSaving(false);
    }
  };

  const errorMessage = errorKind === 'required'
    ? t('diagramViewer.saveAs.nameRequired')
    : errorKind === 'failed'
      ? t('diagramViewer.rename.failed')
      : null;
  const touchTargetStyle = commercialTouchTarget ? {
    minWidth: 'var(--commercial-touch-target, 44px)',
    minHeight: 'var(--commercial-touch-target, 44px)',
    height: 'var(--commercial-touch-target, 44px)',
  } : undefined;

  const content = (
    <div
      id={dialogId}
      role="dialog"
      aria-labelledby={labelId}
      aria-busy={saving}
      className="w-[300px] max-w-[calc(100vw-32px)] p-1"
    >
      <label
        id={labelId}
        htmlFor={inputId}
        className="block mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
      >
        {t('diagramViewer.rename.label')}
      </label>
      <Input
        ref={inputRef}
        id={inputId}
        aria-label={t('diagramViewer.rename.inputLabel')}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={errorMessage ? errorId : undefined}
        value={draft}
        maxLength={240}
        size={commercialTouchTarget ? 'large' : 'middle'}
        status={errorMessage ? 'error' : undefined}
        style={commercialTouchTarget ? {
          minHeight: 'var(--commercial-touch-target, 44px)',
          height: 'var(--commercial-touch-target, 44px)',
        } : undefined}
        autoFocus
        onChange={(event) => {
          setDraft(event.target.value);
          setErrorKind(null);
        }}
        onPressEnter={() => void submitRename()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') closeEditor();
        }}
      />
      {errorMessage && (
        <Typography.Text
          id={errorId}
          type="danger"
          role="alert"
          className="block mt-2 text-xs"
        >
          {errorMessage}
        </Typography.Text>
      )}
      <div className="flex justify-end gap-2 mt-3">
        <Button
          size={commercialTouchTarget ? 'middle' : 'small'}
          style={touchTargetStyle}
          onClick={closeEditor}
          disabled={saving}
        >
          {t('common.cancel')}
        </Button>
        <Button
          size={commercialTouchTarget ? 'middle' : 'small'}
          type="primary"
          style={touchTargetStyle}
          loading={saving}
          disabled={saving}
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
        setErrorKind(null);
        if (nextOpen) setDraft(title);
        setOpen(nextOpen);
      }}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) return;
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
      }}
    >
      <Tooltip
        title={t('diagramViewer.rename.action')}
        open={open ? false : undefined}
      >
        <Button
          ref={triggerRef}
          type="text"
          size="small"
          aria-label={t('diagramViewer.rename.action')}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? dialogId : undefined}
          icon={<EditOutlined />}
          style={commercialTouchTarget ? {
            width: 'var(--commercial-touch-target, 44px)',
            minWidth: 'var(--commercial-touch-target, 44px)',
            height: 'var(--commercial-touch-target, 44px)',
            minHeight: 'var(--commercial-touch-target, 44px)',
          } : undefined}
          className={`${commercialTouchTarget ? 'w-[44px] min-w-[44px] h-[44px] min-h-[44px]' : 'w-8 h-8'} p-0 flex items-center justify-center rounded-[6px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200`}
        />
      </Tooltip>
    </Popover>
  );
};
