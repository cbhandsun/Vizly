import React, { useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import Button from 'antd/es/button';
import Input from 'antd/es/input';
import type { InputRef } from 'antd/es/input';

import {
  CUSTOM_PRESETS_LIMIT,
  deleteCustomPreset,
  readCustomPresetMap,
  type CustomPresetDeleteError,
} from '@/core/utils/customPresetStorage';
import { appMessage, appModal } from '@/core/utils/antdStaticBridge';
import { normalizeTemplateSearchInput } from './templateCascaderOptions';

interface LocalWorkspaceManagerContentProps {
  t: TFunction;
}

const resolveDeleteErrorMessage = (t: TFunction, error: CustomPresetDeleteError): string => {
  if (error === 'readFailed') return t('diagramViewer.switcher.localManager.readError');
  if (error === 'writeFailed') return t('diagramViewer.switcher.localManager.writeError');
  if (error === 'notFound') return t('diagramViewer.switcher.localManager.notFoundError');
  return t('diagramViewer.switcher.localManager.invalidError');
};

export const LocalWorkspaceManagerContent: React.FC<LocalWorkspaceManagerContentProps> = ({ t }) => {
  const searchInputRef = useRef<InputRef>(null);
  const [presets, setPresets] = useState(() => readCustomPresetMap());
  const [searchValue, setSearchValue] = useState('');
  const presetNames = useMemo(() => Object.keys(presets).sort((left, right) => left.localeCompare(right)), [presets]);
  const normalizedSearch = searchValue.trim().toLocaleLowerCase();
  const visiblePresetNames = useMemo(() => (
    normalizedSearch
      ? presetNames.filter(name => name.toLocaleLowerCase().includes(normalizedSearch))
      : presetNames
  ), [normalizedSearch, presetNames]);

  const requestDelete = (name: string, trigger: HTMLElement) => {
    appModal.confirm({
      title: t('diagramViewer.switcher.localManager.deleteConfirmTitle'),
      content: t('diagramViewer.switcher.localManager.deleteConfirmDescription', { name }),
      okText: t('diagramViewer.switcher.localManager.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      focusable: {
        autoFocusButton: 'cancel',
        focusTriggerAfterClose: false,
      },
      afterClose: () => {
        if (document.contains(trigger)) trigger.focus();
        else searchInputRef.current?.focus();
      },
      onOk: async () => {
        const result = deleteCustomPreset(name);
        if (!result.ok) {
          appMessage.error(resolveDeleteErrorMessage(t, result.error));
          throw new Error(`Local template deletion failed: ${result.error}`);
        }

        setPresets(readCustomPresetMap());
        appMessage.success(t('diagramViewer.switcher.localManager.deleted', { name }));
      },
    });
  };

  return (
    <div className="pt-2">
      <p className="mb-3 text-sm text-text-secondary" role="status" aria-live="polite">
        {t('diagramViewer.switcher.localManager.usage', {
          count: presetNames.length,
          max: CUSTOM_PRESETS_LIMIT,
        })}
      </p>
      <Input
        ref={searchInputRef}
        aria-label={t('diagramViewer.switcher.localManager.search')}
        placeholder={t('diagramViewer.switcher.localManager.search')}
        prefix={<SearchOutlined />}
        value={searchValue}
        allowClear
        onChange={event => setSearchValue(normalizeTemplateSearchInput(event.target.value))}
      />
      {visiblePresetNames.length > 0 ? (
        <ul
          className="mt-3 max-h-[420px] overflow-y-auto rounded-lg border border-border bg-surface"
          aria-label={t('diagramViewer.switcher.localManager.listLabel')}
        >
          {visiblePresetNames.map(name => (
            <li
              key={name}
              className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0"
            >
              <span className="min-w-0 truncate" title={name}>{name}</span>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={t('diagramViewer.switcher.localManager.deleteNamed', { name })}
                onClick={event => requestDelete(name, event.currentTarget)}
              >
                {t('diagramViewer.switcher.localManager.delete')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-8 text-center text-text-secondary">
          {normalizedSearch
            ? t('diagramViewer.switcher.localManager.noResults')
            : t('diagramViewer.switcher.localManager.empty')}
        </div>
      )}
    </div>
  );
};
