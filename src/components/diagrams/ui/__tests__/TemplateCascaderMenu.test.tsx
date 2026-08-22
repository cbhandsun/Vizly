// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const localWorkspaceState = vi.hoisted(() => ({
  presets: {} as Record<string, { id: string }>,
  revision: 0,
  openManager: vi.fn(),
}));

vi.mock('antd/es/cascader', () => ({
  default: (props: {
    'aria-label'?: string;
    placeholder?: string;
    options?: Array<{
      value?: string;
      label?: React.ReactNode;
      disabled?: boolean;
      children?: Array<{
        value?: string;
        label?: React.ReactNode;
        disabled?: boolean;
        children?: Array<{
          value?: string;
          label?: React.ReactNode;
          disabled?: boolean;
        }>;
      }>;
    }>;
    showSearch?: {
      searchValue?: string;
      onSearch?: (value: string) => void;
    };
    notFoundContent?: React.ReactNode;
    popupClassName?: string;
    onChange?: (value: string[]) => void;
  }) => {
    const renderOptions = (
      options: typeof props.options,
    ): React.ReactNode => options?.map(option => (
      <div
        key={option.value}
        data-testid={`option-${option.value}`}
        data-disabled={String(Boolean(option.disabled))}
      >
        {option.label}
        {option.children ? renderOptions(option.children) : null}
      </div>
    ));

    return (
      <div data-testid="cascader" data-popup-class={props.popupClassName}>
        <input
          role="combobox"
          aria-label={props['aria-label']}
          placeholder={props.placeholder}
          value={props.showSearch?.searchValue ?? ''}
          onChange={(event) => props.showSearch?.onSearch?.(event.target.value)}
        />
        {renderOptions(props.options)}
        {props.notFoundContent}
        <button
          type="button"
          onClick={() => props.onChange?.([
            'built-in',
            'category:logistics',
            'logistics-planning-v1',
          ])}
        >
          choose built-in
        </button>
        <button
          type="button"
          onClick={() => props.onChange?.(['local-workspace', 'manage:local-workspace'])}
        >
          choose local manager
        </button>
      </div>
    );
  },
}));

vi.mock('@ant-design/icons', () => ({
  AppstoreOutlined: () => <span />,
  SearchOutlined: () => <span />,
  ApartmentOutlined: () => <span />,
  CloudOutlined: () => <span />,
  DatabaseOutlined: () => <span />,
  FolderOpenOutlined: () => <span />,
  SettingOutlined: () => <span />,
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
  readCustomPresetMap: () => localWorkspaceState.presets,
  getCustomPresetRevision: () => localWorkspaceState.revision,
  subscribeToCustomPresetChanges: () => () => undefined,
}));

vi.mock('../openLocalWorkspaceManager', () => ({
  openLocalWorkspaceManager: localWorkspaceState.openManager,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

import { TemplateCascaderMenu } from '../TemplateCascaderMenu';
import { getTemplateCascaderPopupContainer } from '../templateCascaderPopupContainer';

describe('TemplateCascaderMenu accessibility', () => {
  beforeEach(() => {
    localWorkspaceState.presets = {};
    localWorkspaceState.openManager.mockReset();
  });
  it('provides a stable accessible name for the diagram combobox', () => {
    render(<TemplateCascaderMenu ariaLabel="切换图表" />);

    expect(screen.getByRole('combobox', { name: '切换图表' })).toBeTruthy();
  });

  it('shows built-in diagrams offline and identifies the current diagram', () => {
    render(<TemplateCascaderMenu currentDiagramId="logistics-architecture-v1" />);

    expect(screen.getByRole('combobox', { name: 'Open diagrams and templates' })).toHaveAttribute(
      'placeholder',
      'Search diagrams or templates...',
    );
    expect(screen.getByText('Built-in templates')).toBeInTheDocument();
    expect(screen.getByText('Logistics Architecture')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByTestId('option-logistics-architecture-v1')).toHaveAttribute(
      'data-disabled',
      'true',
    );
  });

  it('bounds and sanitizes search input and exposes a clear-search recovery action', () => {
    render(<TemplateCascaderMenu />);
    const input = screen.getByRole('combobox', { name: 'Open diagrams and templates' });

    fireEvent.change(input, { target: { value: `<${'x'.repeat(160)}>\u0000` } });
    expect(input).toHaveValue('x'.repeat(120));

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
  });

  it('routes built-in selections through the standard-preset loader group', () => {
    const onChange = vi.fn();
    render(<TemplateCascaderMenu onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'choose built-in' }));

    expect(onChange).toHaveBeenCalledWith(
      ['built-in', 'category:logistics', 'logistics-planning-v1'],
      'logistics-planning-v1',
      'built-in',
    );
  });

  it('exposes local capacity and routes the management action without opening a diagram', () => {
    localWorkspaceState.presets = {
      Alpha: { id: 'alpha' },
      Beta: { id: 'beta' },
    };
    const onChange = vi.fn();
    render(<TemplateCascaderMenu onChange={onChange} />);

    expect(screen.getByText(/Local workspace \(2\)/)).toBeInTheDocument();
    expect(screen.getByText('Manage local templates')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'choose local manager' }));

    expect(localWorkspaceState.openManager).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps all three menu levels reachable and touch-safe on narrow screens', () => {
    render(<TemplateCascaderMenu />);

    expect(screen.getByTestId('cascader')).toHaveAttribute(
      'data-popup-class',
      'diagram-template-cascader-popup',
    );

    const css = readFileSync('src/index.css', 'utf8');
    expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.diagram-template-cascader-popup\.ant-cascader-dropdown[\s\S]*?max-width: calc\(100vw - 16px\)/);
    expect(css).toMatch(/\.diagram-template-cascader-popup \.ant-cascader-menu \{[\s\S]*?width: calc\(\(100vw - 16px\) \/ 3\)[\s\S]*?min-width: 0/);
    expect(css).toMatch(/\.diagram-template-cascader-popup \.ant-cascader-menu-item \{[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
  });

  it('keeps the cascader portal inside the switcher lifecycle surface', () => {
    const surface = document.createElement('div');
    surface.dataset.diagramSwitcherSurface = 'true';
    const trigger = document.createElement('input');
    surface.appendChild(trigger);
    document.body.appendChild(surface);

    expect(getTemplateCascaderPopupContainer(trigger)).toBe(surface);

    trigger.remove();
    surface.remove();
    expect(getTemplateCascaderPopupContainer(trigger)).toBe(document.body);
  });
});
