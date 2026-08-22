import React, { useMemo, useSyncExternalStore } from 'react';
import Cascader from 'antd/es/cascader';
import type { DefaultOptionType } from 'antd/es/cascader';
import { AppstoreOutlined, SearchOutlined, ApartmentOutlined, CloudOutlined, DatabaseOutlined, FolderOpenOutlined, SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDiagramStorage } from '../hooks/useDiagramStorage';
import {
  getCustomPresetRevision,
  readCustomPresetMap,
  subscribeToCustomPresetChanges,
} from '@/core/utils/customPresetStorage';
import {
  STANDARD_PRESET_CATALOG,
  resolvePresetKey,
  type StandardPresetCategory,
} from '@/data/standardized/presetMetadata';
import {
  buildCustomTemplateMenuLeafOptions,
  buildTemplateMenuLeafOptions,
  GENERAL_CATEGORIES,
  coerceCascaderPath,
  getRootGroupFromPath,
  normalizeTemplateItem,
  normalizeTemplateSearchInput,
} from './templateCascaderOptions';
import { getTemplateCascaderPopupContainer } from './templateCascaderPopupContainer';
import { openLocalWorkspaceManager } from './openLocalWorkspaceManager';

export const LOCAL_WORKSPACE_MANAGER_KEY = 'manage:local-workspace';

export interface TemplateCascaderMenuProps {
  value?: string[];
  onChange?: (value: string[], leafKey: string, rootGroup: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  allowClear?: boolean;
  open?: boolean;
  templatesOnly?: boolean;
  children?: React.ReactElement;
  ariaLabel?: string;
  currentDiagramId?: string;
}

interface CascaderOption extends DefaultOptionType {
  value: string;
  label: React.ReactNode;
  searchText?: string;
  children?: CascaderOption[];
}

const BUILT_IN_CATEGORY_ORDER: readonly StandardPresetCategory[] = [
  'general',
  'architecture',
  'logistics',
  'warehouse',
];

const BUILT_IN_CATEGORY_LABELS: Record<StandardPresetCategory, string> = {
  general: 'diagramViewer.switcher.categories.general',
  architecture: 'diagramViewer.switcher.categories.architecture',
  logistics: 'diagramViewer.switcher.categories.logistics',
  warehouse: 'diagramViewer.switcher.categories.warehouse',
};

export const TemplateCascaderMenu: React.FC<TemplateCascaderMenuProps> = ({
  value,
  onChange,
  style,
  placeholder,
  allowClear = true,
  open,
  templatesOnly = false,
  children,
  ariaLabel,
  currentDiagramId,
}) => {
  const { t } = useTranslation();
  const { s3Diagrams, supabaseDiagrams, systemTemplates, fetchCloudList } = useDiagramStorage();
  const hasFetchedCloudListRef = React.useRef(false);
  const [searchValue, setSearchValue] = React.useState('');
  const customPresetRevision = useSyncExternalStore(
    subscribeToCustomPresetChanges,
    getCustomPresetRevision,
    getCustomPresetRevision,
  );
  const currentPresetKey = resolvePresetKey(currentDiagramId);
  const effectivePlaceholder = placeholder ?? t('diagramViewer.switcher.placeholder', 'Search diagrams or templates...');
  const effectiveAriaLabel = ariaLabel ?? t('diagramViewer.switcher.open', 'Open diagrams and templates');

  const cascaderOptions = useMemo(() => {
    const options: CascaderOption[] = [];

    const builtInChildren = BUILT_IN_CATEGORY_ORDER.flatMap((category) => {
      const categoryItems = STANDARD_PRESET_CATALOG.filter(item => item.category === category);
      if (categoryItems.length === 0) return [];

      const categoryLabel = t(BUILT_IN_CATEGORY_LABELS[category], category);
      return [{
        value: `category:${category}`,
        label: categoryLabel,
        searchText: categoryLabel,
        children: categoryItems.map((item) => {
          const title = t(item.titleKey, item.fallbackTitle);
          const isCurrent = currentPresetKey === item.key;
          return {
            value: item.id,
            label: (
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className="truncate">{title}</span>
                {isCurrent ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {t('diagramViewer.switcher.current', 'Current')}
                  </span>
                ) : null}
              </span>
            ),
            searchText: `${title} ${item.id}`,
            disabled: isCurrent,
          };
        }),
      }];
    });

    options.push({
      value: 'built-in',
      label: <span><AppstoreOutlined style={{ marginRight: 8, color: '#1677ff' }} />{t('diagramViewer.switcher.builtIn', 'Built-in templates')}</span>,
      searchText: t('diagramViewer.switcher.builtIn', 'Built-in templates'),
      children: builtInChildren,
    });

    // --- 2. 行业模板库 (System Templates from Supabase，按 category 分组) ---
    if (systemTemplates && systemTemplates.length > 0) {
      const normalizedTemplates = systemTemplates
        .map(normalizeTemplateItem)
        .filter((item): item is { id: string; title: string; category: string } => !!item);
      // 行业模版：category 不是 general 的
      const industryTemplates = normalizedTemplates.filter(t => !GENERAL_CATEGORIES.has(t.category));
      // 通用模版：category 是 general 的
      const generalTemplates = normalizedTemplates.filter(t => GENERAL_CATEGORIES.has(t.category));

      const systemChildren: CascaderOption[] = [];
      const byCategory: Record<string, Array<{ id: string; title: string; category: string }>> = {};
      industryTemplates.forEach(t => {
        const cat = t.category;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(t);
      });

      systemChildren.push(...Object.entries(byCategory).map(([cat, items]) => ({
        value: `category:${cat}`,
        label: cat,
        children: items.map(d => ({ value: d.id, label: d.title }))
      })));

      if (generalTemplates.length > 0) {
        systemChildren.push({
          value: 'category:general',
          label: t('diagramViewer.switcher.generalTemplates', 'General templates'),
          searchText: t('diagramViewer.switcher.generalTemplates', 'General templates'),
          children: generalTemplates.map(d => ({ value: d.id, label: d.title }))
        });
      }

      if (systemChildren.length > 0) {
        options.push({
          value: 'system-templates',
          label: <span><ApartmentOutlined style={{ marginRight: 8, color: '#eb2f96' }} />{t('diagramViewer.switcher.templateLibrary', 'Template library')}</span>,
          searchText: t('diagramViewer.switcher.templateLibrary', 'Template library'),
          children: systemChildren
        });
      }
    }

    // --- 3. S3 存储 ---
    if (!templatesOnly && s3Diagrams.length > 0) {
      options.push({
        value: 's3',
        label: <span><CloudOutlined style={{ marginRight: 8, color: '#fa8c16' }} />{t('diagramViewer.switcher.s3Storage', 'S3 storage')}</span>,
        searchText: t('diagramViewer.switcher.s3Storage', 'S3 storage'),
        children: buildTemplateMenuLeafOptions(s3Diagrams),
      });
    }

    // --- 4. 个人云端图表 ---
    if (!templatesOnly && supabaseDiagrams.length > 0) {
      options.push({
        value: 'supabase',
        label: <span><DatabaseOutlined style={{ marginRight: 8, color: '#3eaf7c' }} />{t('diagramViewer.switcher.cloudDiagrams', 'Cloud diagrams')}</span>,
        searchText: t('diagramViewer.switcher.cloudDiagrams', 'Cloud diagrams'),
        children: buildTemplateMenuLeafOptions(supabaseDiagrams),
      });
    }

    // --- 5. 本地自定义 (Custom saved presets in localStorage) ---
    void customPresetRevision;
    let customKeys: string[] = [];
    try {
      customKeys = Object.keys(readCustomPresetMap());
    } catch { /* ignore */ }
    const customOptions = buildCustomTemplateMenuLeafOptions(customKeys);
    if (customOptions.length > 0) {
      options.push({
        value: 'local-workspace',
        label: <span><FolderOpenOutlined style={{ marginRight: 8, color: '#8c8c8c' }} />{t('diagramViewer.switcher.localWorkspace', 'Local workspace')} ({customKeys.length})</span>,
        searchText: t('diagramViewer.switcher.localWorkspace', 'Local workspace'),
        children: [
          {
            value: LOCAL_WORKSPACE_MANAGER_KEY,
            label: <span><SettingOutlined style={{ marginRight: 8 }} />{t('diagramViewer.switcher.localManager.manage', 'Manage local templates')}</span>,
            searchText: t('diagramViewer.switcher.localManager.manage', 'Manage local templates'),
          },
          ...customOptions,
        ],
      });
    }

    return options;
  }, [currentPresetKey, customPresetRevision, s3Diagrams, supabaseDiagrams, systemTemplates, t, templatesOnly]);

  return (
    <Cascader
      aria-label={effectiveAriaLabel}
      open={open}
      onOpenChange={(visible) => {
        if (visible && !hasFetchedCloudListRef.current) {
          hasFetchedCloudListRef.current = true;
          void fetchCloudList();
        }
        if (!visible) {
          setSearchValue('');
        }
      }}
      options={cascaderOptions}
      value={value}
      onChange={(val) => {
        const path = coerceCascaderPath(val);
        const rootGroup = getRootGroupFromPath(path);
        const leafKey = path[path.length - 1] || '';
        if (leafKey === LOCAL_WORKSPACE_MANAGER_KEY) {
          openLocalWorkspaceManager(t);
          return;
        }
        if (path.length > 0 && rootGroup) {
          onChange?.(path, leafKey, rootGroup);
        } else {
          onChange?.([], '', '');
        }
      }}
      displayRender={(labels) => {
        if (!labels || labels.length === 0) return '';
        const lastLabel = labels[labels.length - 1];
        if (labels.length === 1) return lastLabel;
        return (
          <span>
            {labels.slice(0, -1).map((label, idx) => (
              <React.Fragment key={idx}>
                {label}
                <span style={{ margin: '0 4px', color: 'rgba(0,0,0,0.25)' }}>/</span>
              </React.Fragment>
            ))}
            {lastLabel}
          </span>
        );
      }}
      placeholder={effectivePlaceholder}
      allowClear={allowClear}
      showSearch={{
        searchValue,
        onSearch: (nextValue) => setSearchValue(normalizeTemplateSearchInput(nextValue)),
        filter: (inputValue, path) => {
          const input = normalizeTemplateSearchInput(inputValue).trim().toLocaleLowerCase();
          return path.some(option => {
            const lbl = option.label;
            const text = option.searchText ?? (typeof lbl === 'string' ? lbl : '');
            const val = String(option.value || '');
            return text.toLocaleLowerCase().includes(input) || val.toLocaleLowerCase().includes(input);
          });
        },
      }}
      notFoundContent={(
        <div role="status" aria-live="polite" className="flex min-w-[280px] flex-col items-center px-5 py-6 text-center">
          <div className="font-semibold text-text-primary">
            {t('diagramViewer.switcher.noResults', 'No matching diagrams or templates')}
          </div>
          <div className="mt-1 text-sm text-text-secondary">
            {t('diagramViewer.switcher.noResultsHint', 'Try another keyword or clear the search.')}
          </div>
          {searchValue ? (
            <button
              type="button"
              className="mt-4 min-h-11 rounded-lg border border-border bg-surface px-4 py-2 font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              style={{ minHeight: 'calc(var(--commercial-touch-target, 44px) + 1px)' }}
              aria-label={t('diagramViewer.switcher.clearSearch', 'Clear search')}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                setSearchValue('');
              }}
            >
              {t('diagramViewer.switcher.clearSearch', 'Clear search')}
            </button>
          ) : null}
        </div>
      )}
      popupClassName="diagram-template-cascader-popup"
      expandTrigger="hover"
      style={{
        width: 320,
        minHeight: 'var(--commercial-touch-target, 44px)',
        ...style,
      }}
      suffixIcon={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
      getPopupContainer={getTemplateCascaderPopupContainer}
    >
      {children}
    </Cascader>
  );
};
