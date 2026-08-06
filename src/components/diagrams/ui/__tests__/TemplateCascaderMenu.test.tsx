// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('antd/es/cascader', () => ({
  default: ({
    'aria-label': ariaLabel,
    placeholder,
  }: {
    'aria-label'?: string;
    placeholder?: string;
  }) => (
    <input role="combobox" aria-label={ariaLabel} placeholder={placeholder} />
  ),
}));

vi.mock('@ant-design/icons', () => ({
  SearchOutlined: () => <span />,
  ApartmentOutlined: () => <span />,
  CloudOutlined: () => <span />,
  DatabaseOutlined: () => <span />,
  FolderOpenOutlined: () => <span />,
}));

vi.mock('../../hooks/useDiagramStorage', () => ({
  useDiagramStorage: () => ({
    s3Diagrams: [],
    supabaseDiagrams: [],
    systemTemplates: [],
    fetchCloudList: vi.fn(async () => undefined),
  }),
}));

vi.mock('@/core/utils/customPresetStorage', () => ({
  readCustomPresetMap: () => ({}),
}));

import { TemplateCascaderMenu } from '../TemplateCascaderMenu';

describe('TemplateCascaderMenu accessibility', () => {
  it('provides a stable accessible name for the diagram combobox', () => {
    render(<TemplateCascaderMenu ariaLabel="切换图表" />);

    expect(screen.getByRole('combobox', { name: '切换图表' })).toBeTruthy();
  });
});
