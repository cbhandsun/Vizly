import React, { useMemo } from 'react';
import Cascader from 'antd/es/cascader';
import type { DefaultOptionType } from 'antd/es/cascader';
import { SearchOutlined, ApartmentOutlined, CloudOutlined, DatabaseOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useDiagramStorage } from '../hooks/useDiagramStorage';
import { readCustomPresetMap } from '@/core/utils/customPresetStorage';
import {
  buildCustomTemplateMenuLeafOptions,
  buildTemplateMenuLeafOptions,
  GENERAL_CATEGORIES,
  coerceCascaderPath,
  getRootGroupFromPath,
  normalizeTemplateItem,
} from './templateCascaderOptions';

export interface TemplateCascaderMenuProps {
  value?: string[];
  onChange?: (value: string[], leafKey: string, rootGroup: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  allowClear?: boolean;
  templatesOnly?: boolean;
  children?: React.ReactElement;
  ariaLabel?: string;
}

interface CascaderOption extends DefaultOptionType {
  value: string;
  label: React.ReactNode;
  children?: CascaderOption[];
}

export const TemplateCascaderMenu: React.FC<TemplateCascaderMenuProps> = ({
  value,
  onChange,
  style,
  placeholder = "搜索或选择图表...",
  allowClear = true,
  templatesOnly = false,
  children,
  ariaLabel = '搜索或选择图表',
}) => {
  const { s3Diagrams, supabaseDiagrams, systemTemplates, fetchCloudList } = useDiagramStorage();
  const hasFetchedCloudListRef = React.useRef(false);

  const [cascaderKey, setCascaderKey] = React.useState(0);

  const cascaderOptions = useMemo(() => {
    const options: CascaderOption[] = [];

    // --- 1. 行业模板库 (System Templates from Supabase，按 category 分组) ---
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
          label: '通用模版',
          children: generalTemplates.map(d => ({ value: d.id, label: d.title }))
        });
      }

      if (systemChildren.length > 0) {
        options.push({
          value: 'system-templates',
          label: <span><ApartmentOutlined style={{ marginRight: 8, color: '#eb2f96' }} />模板库</span>,
          children: systemChildren
        });
      }
    }

    // --- 2. S3 存储 ---
    if (!templatesOnly && s3Diagrams.length > 0) {
      options.push({
        value: 's3',
        label: <span><CloudOutlined style={{ marginRight: 8, color: '#fa8c16' }} />S3 存储</span>,
        children: buildTemplateMenuLeafOptions(s3Diagrams),
      });
    }

    // --- 3. 个人云端图表 ---
    if (!templatesOnly && supabaseDiagrams.length > 0) {
      options.push({
        value: 'supabase',
        label: <span><DatabaseOutlined style={{ marginRight: 8, color: '#3eaf7c' }} />个人云端图表</span>,
        children: buildTemplateMenuLeafOptions(supabaseDiagrams),
      });
    }

    // --- 4. 本地自定义 (Custom saved presets in localStorage) ---
    let customKeys: string[] = [];
    try {
      customKeys = Object.keys(readCustomPresetMap());
    } catch { /* ignore */ }
    const customOptions = buildCustomTemplateMenuLeafOptions(customKeys);
    if (customOptions.length > 0) {
      options.push({
        value: 'local-workspace',
        label: <span><FolderOpenOutlined style={{ marginRight: 8, color: '#8c8c8c' }} />本地工作区</span>,
        children: customOptions
      });
    }

    return options;
  }, [s3Diagrams, supabaseDiagrams, systemTemplates, templatesOnly]);

  return (
    <Cascader
      aria-label={ariaLabel}
      key={cascaderKey}
      onOpenChange={(visible) => {
        if (visible && !hasFetchedCloudListRef.current) {
          hasFetchedCloudListRef.current = true;
          void fetchCloudList();
        }
        if (!visible) {
          setTimeout(() => setCascaderKey(k => k + 1), 300);
        }
      }}
      options={cascaderOptions}
      value={value}
      onChange={(val) => {
        const path = coerceCascaderPath(val);
        const rootGroup = getRootGroupFromPath(path);
        const leafKey = path[path.length - 1] || '';
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
      placeholder={placeholder}
      allowClear={allowClear}
      showSearch={{
        filter: (inputValue, path) => {
          const input = inputValue.toLowerCase();
          return path.some(option => {
            const lbl = option.label;
            const text = typeof lbl === 'string' ? lbl : '';
            const val = String(option.value || '');
            return text.toLowerCase().indexOf(input) > -1 || val.toLowerCase().indexOf(input) > -1;
          });
        },
      }}
      expandTrigger="hover"
      style={{ width: 320, ...style }}
      suffixIcon={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
      getPopupContainer={() => document.body}
    >
      {children}
    </Cascader>
  );
};
