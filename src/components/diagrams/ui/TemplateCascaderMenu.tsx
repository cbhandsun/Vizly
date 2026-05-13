// @ts-nocheck
import React, { useMemo, useEffect } from 'react';
import Cascader from 'antd/es/cascader';
import { SearchOutlined, ApartmentOutlined, CloudOutlined, DatabaseOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useDiagramStorage } from '../hooks/useDiagramStorage';

export const CUSTOM_PRESETS_STORAGE_KEY = 'diagram-custom-presets';

export interface TemplateCascaderMenuProps {
  value?: string[];
  onChange?: (value: string[], leafKey: string, rootGroup: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  allowClear?: boolean;
  templatesOnly?: boolean;
  children?: React.ReactNode;
}

// 被视为「通用」的 category 值
const GENERAL_CATEGORIES = new Set(['general', '通用', 'general_template']);

export const TemplateCascaderMenu: React.FC<TemplateCascaderMenuProps> = ({
  value,
  onChange,
  style,
  placeholder = "搜索或选择图表...",
  allowClear = true,
  templatesOnly = false,
  children
}) => {
  const { s3Diagrams, supabaseDiagrams, systemTemplates, fetchCloudList } = useDiagramStorage();

  useEffect(() => {
    fetchCloudList();
  }, [fetchCloudList]);

  const [cascaderKey, setCascaderKey] = React.useState(0);

  const cascaderOptions = useMemo(() => {
    interface CascaderOption {
      value: string;
      label: string | React.ReactNode;
      children?: CascaderOption[];
    }
    const options: CascaderOption[] = [];

    // --- 1. 行业模板库 (System Templates from Supabase，按 category 分组) ---
    if (systemTemplates && systemTemplates.length > 0) {
      // 行业模版：category 不是 general 的
      const industryTemplates = systemTemplates.filter(t => !GENERAL_CATEGORIES.has(t.category));
      // 通用模版：category 是 general 的
      const generalTemplates = systemTemplates.filter(t => GENERAL_CATEGORIES.has(t.category));

      if (industryTemplates.length > 0) {
        // 按 category 分组
        const byCategory: Record<string, any[]> = {};
        industryTemplates.forEach(t => {
          const cat = t.category || '其他行业';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(t);
        });

        const industryChildren: CascaderOption[] = Object.entries(byCategory).map(([cat, items]) => ({
          value: `industry-cat-${cat}`,
          label: cat,
          children: items.map(d => ({ value: d.id, label: d.title }))
        }));

        options.push({
          value: 'industry-templates',
          label: <span><ApartmentOutlined style={{ marginRight: 8, color: '#eb2f96' }} />行业模板库</span>,
          children: industryChildren
        });
      }

      if (generalTemplates.length > 0) {
        options.push({
          value: 'general-templates',
          label: <span><ApartmentOutlined style={{ marginRight: 8, color: '#1677ff' }} />通用模版</span>,
          children: generalTemplates.map(d => ({ value: d.id, label: d.title }))
        });
      }
    }

    // --- 2. S3 存储 ---
    if (!templatesOnly && s3Diagrams.length > 0) {
      options.push({
        value: 's3',
        label: <span><CloudOutlined style={{ marginRight: 8, color: '#fa8c16' }} />S3 存储</span>,
        children: s3Diagrams.map(d => ({ value: d.id, label: d.title || d.id }))
      });
    }

    // --- 3. 个人云端图表 ---
    if (!templatesOnly && supabaseDiagrams.length > 0) {
      options.push({
        value: 'supabase',
        label: <span><DatabaseOutlined style={{ marginRight: 8, color: '#3eaf7c' }} />个人云端图表</span>,
        children: supabaseDiagrams.map(d => ({ value: d.id, label: d.title || d.id }))
      });
    }

    // --- 4. 本地自定义 (Custom saved presets in localStorage) ---
    try {
      const raw = localStorage.getItem(CUSTOM_PRESETS_STORAGE_KEY);
      if (raw) {
        const customMap = JSON.parse(raw);
        const customKeys = Object.keys(customMap);
        if (customKeys.length > 0) {
          options.push({
            value: 'local-workspace',
            label: <span><FolderOpenOutlined style={{ marginRight: 8, color: '#8c8c8c' }} />本地工作区</span>,
            children: customKeys.map(k => ({ value: `custom:${k}`, label: k }))
          });
        }
      }
    } catch { /* ignore */ }

    return options;
  }, [s3Diagrams, supabaseDiagrams, systemTemplates, templatesOnly]);

  return (
    <Cascader
      key={cascaderKey}
      onOpenChange={(visible) => {
        if (!visible) {
          setTimeout(() => setCascaderKey(k => k + 1), 300);
        }
      }}
      options={cascaderOptions}
      value={value}
      onChange={(val) => {
        if (val && val.length > 0) {
          const rootGroup = String(val[0]);
          const key = String(val[val.length - 1]);
          if (onChange) {
            onChange(val as string[], key, rootGroup);
          }
        } else if (!val || val.length === 0) {
          if (onChange) {
            onChange([], '', '');
          }
        }
      }}
      displayRender={(labels, selectedOptions) => {
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
