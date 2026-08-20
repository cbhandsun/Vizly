// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registryState = vi.hoisted(() => ({
  active: true,
  setPluginActive: vi.fn<(id: string, active: boolean) => boolean>(),
}));

const messageState = vi.hoisted(() => ({
  error: vi.fn(),
}));

const translationState = vi.hoisted(() => ({
  language: 'zh' as 'zh' | 'en',
}));

vi.mock('../../../services/PluginRegistry', () => ({
  PluginRegistry: {
    getInstance: () => ({
      getAllPlugins: () => [{
        id: 'flowchart',
        name: '通用画布',
        version: '1.0.0',
        category: 'Core',
        description: '核心画布插件',
        author: 'Vizly Core',
        tags: ['General'],
      }],
      isPluginActive: () => registryState.active,
      setPluginActive: registryState.setPluginActive,
    }),
  },
}));

vi.mock('../../../utils/antdStaticBridge', () => ({
  appMessage: {
    error: messageState.error,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number; name?: string; defaultValue?: string }) => ({
      'common.cancel': '取消',
      'common.close': '关闭',
      'pluginMarketplace.clearSearch': '清除插件搜索',
      'pluginMarketplace.confirmDisableAction': '确认停用',
      'pluginMarketplace.confirmDisableDescription': '使用该插件的图表将无法继续查看或编辑。',
      'pluginMarketplace.confirmDisableTitle': `停用插件：${params?.name ?? ''}？`,
      'pluginMarketplace.defaultDesc': '默认描述',
      'pluginMarketplace.deliveryDesc': '交付说明',
      'pluginMarketplace.deliveryTitle': '远程交付',
      'pluginMarketplace.disablePlugin': `停用插件：${params?.name ?? ''}`,
      'pluginMarketplace.discoverMore': '发现更多',
      'pluginMarketplace.emptyCategory': '暂无插件',
      'pluginMarketplace.emptySearch': '未找到插件',
      'pluginMarketplace.enablePlugin': `启用插件：${params?.name ?? ''}`,
      'pluginMarketplace.loading': '正在加载插件...',
      'pluginMarketplace.resultsCount': translationState.language === 'en'
        ? `Showing ${params?.count ?? 0} ${(params?.count ?? 0) === 1 ? 'plugin' : 'plugins'}`
        : `显示 ${params?.count ?? 0} 个插件`,
      'pluginMarketplace.searchPlaceholder': '搜索名称、ID 或标签...',
      'pluginMarketplace.statusActive': '已激活',
      'pluginMarketplace.statusChangeFailed': '插件状态未能保存',
      'pluginMarketplace.statusInactive': '未启用',
      'pluginMarketplace.tabAll': '全部插件',
      'pluginMarketplace.tabCore': '官方推荐',
      'pluginMarketplace.tabInstalled': '已启用',
      'pluginMarketplace.tabProductivity': '效率工具',
      'pluginMarketplace.title': 'Vizly 插件市场',
      'pluginMarketplace.builtinPlugins.flowchart.name': translationState.language === 'en'
        ? 'General Canvas'
        : '通用画布',
      'pluginMarketplace.builtinPlugins.flowchart.description': translationState.language === 'en'
        ? 'Vizly core canvas for general diagramming.'
        : '核心画布插件',
    }[key] ?? params?.defaultValue ?? key),
  }),
}));

import { PluginManagerModal } from '../ui/PluginManagerModal';

const renderLoadedModal = async (onClose = vi.fn(), expectedName = '通用画布') => {
  render(<PluginManagerModal visible onClose={onClose} />);
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  expect(screen.getByText(expectedName)).toBeTruthy();
};

describe('PluginManagerModal commercial recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    translationState.language = 'zh';
    registryState.active = true;
    registryState.setPluginActive.mockImplementation((_id, active) => {
      registryState.active = active;
      return true;
    });
    messageState.error.mockReset();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('announces result changes and names the search clear action', async () => {
    await renderLoadedModal();

    expect(screen.getByRole('status').textContent).toContain('显示 1 个插件');
    fireEvent.change(screen.getByRole('textbox', { name: '搜索名称、ID 或标签...' }), {
      target: { value: '不存在' },
    });

    expect(screen.getByRole('status').textContent).toContain('显示 0 个插件');
    expect(screen.getByRole('button', { name: '清除插件搜索' })).toBeTruthy();
  });

  it('localizes built-in metadata and searches the localized copy', async () => {
    translationState.language = 'en';
    await renderLoadedModal(vi.fn(), 'General Canvas');

    expect(screen.getByText('General Canvas')).toBeTruthy();
    expect(screen.getByText('Vizly core canvas for general diagramming.')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Showing 1 plugin');

    fireEvent.change(screen.getByRole('textbox', { name: '搜索名称、ID 或标签...' }), {
      target: { value: 'canvas' },
    });
    expect(screen.getByRole('status').textContent).toContain('Showing 1 plugin');
  });

  it('requires confirmation before disabling and keeps the plugin recoverable afterward', async () => {
    await renderLoadedModal();
    fireEvent.click(screen.getByRole('tab', { name: '已启用' }));
    fireEvent.click(screen.getByRole('switch', { name: '停用插件：通用画布' }));

    expect(registryState.setPluginActive).not.toHaveBeenCalled();
    expect(screen.getByText('停用插件：通用画布？')).toBeTruthy();
    expect(screen.getByText('使用该插件的图表将无法继续查看或编辑。')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '确认停用' }));

    expect(registryState.setPluginActive).toHaveBeenCalledWith('flowchart', false);
    expect(screen.getByRole('tab', { name: '全部插件' }).getAttribute('aria-selected')).toBe('true');
    const restoredSwitch = screen.getByRole('switch', { name: '启用插件：通用画布' });
    expect(restoredSwitch.getAttribute('aria-checked')).toBe('false');
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(document.activeElement).toBe(restoredSwitch);
  });

  it('cancels a disable request without changing persisted state', async () => {
    await renderLoadedModal();
    fireEvent.click(screen.getByRole('switch', { name: '停用插件：通用画布' }));
    const cancelButton = screen.getByRole('button', { name: '取消' });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(document.activeElement).toBe(cancelButton);
    fireEvent.click(cancelButton);

    expect(registryState.setPluginActive).not.toHaveBeenCalled();
    expect(screen.queryByText('停用插件：通用画布？')).toBeNull();
    const restoredSwitch = screen.getByRole('switch', { name: '停用插件：通用画布' });
    expect(restoredSwitch.getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(document.activeElement).toBe(restoredSwitch);
  });

  it('lets the disable warning own Escape and restores the affected switch', async () => {
    const onClose = vi.fn();
    await renderLoadedModal(onClose);
    const pluginSwitch = screen.getByRole('switch', { name: '停用插件：通用画布' });
    fireEvent.click(pluginSwitch);
    const cancelButton = screen.getByRole('button', { name: '取消' });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    fireEvent.keyDown(cancelButton, { key: 'Escape' });
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText('停用插件：通用画布？')).toBeNull();
    expect(document.activeElement).toBe(pluginSwitch);
  });

  it('keeps the confirmation visible when status persistence fails', async () => {
    registryState.setPluginActive.mockReturnValue(false);
    await renderLoadedModal();
    fireEvent.click(screen.getByRole('switch', { name: '停用插件：通用画布' }));
    fireEvent.click(screen.getByRole('button', { name: '确认停用' }));

    expect(messageState.error).toHaveBeenCalledWith('插件状态未能保存');
    expect(screen.getByText('停用插件：通用画布？')).toBeTruthy();
    expect(screen.getByRole('switch', { name: '停用插件：通用画布' }).getAttribute('aria-checked')).toBe('true');
  });
});
