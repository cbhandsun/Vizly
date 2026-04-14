// @ts-nocheck
import React, { useMemo, useEffect } from 'react';
import Cascader from 'antd/es/cascader';
import { SearchOutlined, ApartmentOutlined, CloudOutlined, DatabaseOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { PRESET_MAP, PRESET_OPTIONS, ALL_TAGS } from '../../../data/standardized';
import { useDiagramStorage } from '../hooks/useDiagramStorage';

export const CUSTOM_PRESETS_STORAGE_KEY = 'diagram-custom-presets';

export interface TemplateCascaderMenuProps {
  value?: string[];
  onChange?: (value: string[], leafKey: string, rootGroup: string) => void;
  style?: React.CSSProperties;
  placeholder?: string;
  allowClear?: boolean;
}

export const TemplateCascaderMenu: React.FC<TemplateCascaderMenuProps> = ({
  value,
  onChange,
  style,
  placeholder = "搜索或选择图表...",
  allowClear = true
}) => {
  const { s3Diagrams, supabaseDiagrams, fetchCloudList } = useDiagramStorage();

  useEffect(() => {
    fetchCloudList();
  }, [fetchCloudList]);

  const cascaderOptions = useMemo(() => {
    interface CascaderOption {
      value: string;
      label: string | React.ReactNode;
      children?: CascaderOption[];
    }
    const options: CascaderOption[] = [];

    // --- 1. Gallery (Example Center) ---
    const galleryChildren: CascaderOption[] = [
      {
        value: 'by-tags',
        label: '按领域分类',
        children: Array.from(ALL_TAGS).map(tag => {
          const items = PRESET_OPTIONS.filter(p => PRESET_MAP[p.value]?.metadata?.tags?.includes(tag));
          return {
            value: tag,
            label: tag,
            children: items.map(p => ({ value: p.value, label: p.label }))
          };
        }).filter(node => node.children && node.children.length > 0)
      },
      {
        value: 'all-demos',
        label: '全部演示列表',
        children: PRESET_OPTIONS.map(p => ({ value: p.value, label: p.label }))
      }
    ];

    options.push({
      value: 'gallery',
      label: <span><ApartmentOutlined style={{ marginRight: 8, color: '#1677ff' }} />示例中心</span>,
      children: galleryChildren
    });

    // --- 2. S3 Storage ---
    if (s3Diagrams.length > 0) {
      options.push({
        value: 's3',
        label: <span><CloudOutlined style={{ marginRight: 8, color: '#fa8c16' }} />S3 存储</span>,
        children: s3Diagrams.map(d => ({ value: d.id, label: d.title || d.id }))
      });
    }

    // --- 3. Supabase Cloud ---
    if (supabaseDiagrams.length > 0) {
      options.push({
        value: 'supabase',
        label: <span><DatabaseOutlined style={{ marginRight: 8, color: '#3eaf7c' }} />Supabase 云端</span>,
        children: supabaseDiagrams.map(d => ({ value: d.id, label: d.title || d.id }))
      });
    }

    // --- 4. Local Workspace (Custom Saves) ---
    const customPresets = Object.keys(PRESET_MAP).filter(k => k.startsWith('custom:'));
    if (customPresets.length > 0) {
      options.push({
        value: 'local-workspace',
        label: <span><FolderOpenOutlined style={{ marginRight: 8, color: '#8c8c8c' }} />本地工作区</span>,
        children: customPresets.map(k => ({ value: k, label: k.replace('custom:', '') }))
      });
    }

    return options;
  }, [s3Diagrams, supabaseDiagrams]);

  return (
    <Cascader
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
        
        const lastOption = selectedOptions?.[selectedOptions.length - 1];
        let lastLabel: React.ReactNode = labels[labels.length - 1];

        // Retrieve real title instead of ID if it's from PRESET_MAP
        if (lastOption && lastOption.value && PRESET_MAP[String(lastOption.value)]) {
           const data = PRESET_MAP[String(lastOption.value)];
           lastLabel = data.metadata?.title || data.name || lastLabel;
        }

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
            const text = typeof lbl === 'string' ? lbl : (option.value as string) ?? '';
            return text.toLowerCase().indexOf(input) > -1;
          });
        },

      }}
      expandTrigger="hover"
      style={{ width: 320, ...style }}
      suffixIcon={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
      getPopupContainer={() => document.body}
    />
  );
};
