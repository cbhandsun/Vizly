// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exportToPNG, appMessageMocks } = vi.hoisted(() => ({
  exportToPNG: vi.fn<() => Promise<void>>(async () => undefined),
  appMessageMocks: {
    error: vi.fn(),
    loading: vi.fn(() => vi.fn()),
    success: vi.fn(),
  },
}));

vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    getNodes: () => [{ id: 'node-1' }],
    getEdges: () => [],
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  }),
}));

vi.mock('@/core/hooks/useDiagramControls', () => ({
  useDiagramControls: () => ({
    handleFitDiagram: vi.fn(),
    handleBackToTop: vi.fn(),
    handleToggleFullscreen: vi.fn(),
    exportToPNG,
    exportToPDF: vi.fn(async () => undefined),
    exportToSVG: vi.fn(async () => undefined),
    exportToGIF: vi.fn(async () => undefined),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? ({
      'common.export': '导出',
      'export.png': 'PNG 图片',
      'export.pdf': 'PDF 文档',
      'export.svg': 'SVG 矢量图',
      'export.gif': 'GIF 动画',
      'export.markdown': 'Markdown 文档',
      'export.saveToCloud': '保存到云端',
      'storage.manager.title': '云端文件',
      'share.shareButton': '分享',
      'export.fileGroup': '文件导出',
      'export.fileGroupEmpty': '文件导出（暂无可导出节点）',
      'export.cloudGroup': '云端与分享',
    }[key] ?? key),
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/context/useSubscription', () => ({
  useSubscription: () => ({
    hasFeature: () => true,
    showUpgradeModal: vi.fn(),
  }),
}));

vi.mock('@/core/utils/flowDataBridge', () => ({
  getFlowDataBridge: () => null,
  getFlowDataBridgeNodes: () => [],
  getStandardFlowDataBridge: () => null,
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
  appMessage: appMessageMocks,
}));

import ExportTools from '../ExportTools';

describe('ExportTools keyboard menu', () => {
  beforeEach(() => {
    exportToPNG.mockClear();
    exportToPNG.mockResolvedValue(undefined);
    appMessageMocks.error.mockClear();
    appMessageMocks.success.mockClear();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
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

  it('keeps the export menu visually isolated and clear of the mobile dock', () => {
    const css = readFileSync('src/components/ExportTools.css', 'utf8');

    expect(css).toMatch(
      /\.vizly-export-actions-menu \.ant-dropdown-menu\s*\{[\s\S]*?background-color:\s*rgba\(255, 255, 255, 0\.98\) !important;/,
    );
    expect(css).toMatch(
      /\[data-theme='dark'\] \.vizly-export-actions-menu \.ant-dropdown-menu\s*\{[\s\S]*?background-color:\s*rgba\(28, 28, 41, 0\.98\) !important;/,
    );
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?--vizly-export-actions-top-clearance:\s*160px;[\s\S]*?--vizly-export-actions-dock-clearance:\s*calc\(88px \+ env\(safe-area-inset-bottom, 0px\)\);[\s\S]*?max-height:\s*min\([\s\S]*?424px,[\s\S]*?100dvh[\s\S]*?var\(--vizly-export-actions-top-clearance\)[\s\S]*?var\(--vizly-export-actions-dock-clearance\)[\s\S]*?\);/,
    );
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?scroll-padding-block:\s*8px;[\s\S]*?scrollbar-gutter:\s*stable;/,
    );
  });

  it.each(['ArrowDown', 'Enter', ' '])('opens with %s, refreshes availability, and restores focus with Escape', async key => {
    render(
      <ExportTools
        diagramId="diagram-1"
        diagramName="Diagram"
        showControls={false}
        variant="compact"
      />,
    );

    const trigger = screen.getByRole('button', { name: '导出' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.keyDown(trigger, { key });

    const firstItem = await screen.findByRole('menuitem', { name: 'PNG 图片' });
    await waitFor(() => expect(document.activeElement).toBe(firstItem));
    expect(firstItem.getAttribute('aria-disabled')).not.toBe('true');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('diagram-export-actions-menu');
    const menu = screen.getByRole('menu', { name: '导出操作' });
    expect(menu.id).toBe('diagram-export-actions-menu');

    fireEvent.keyDown(menu, { key: 'Escape' });
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('moves focus into a pointer-opened menu and closes it with Escape', async () => {
    render(
      <ExportTools
        diagramId="diagram-1"
        diagramName="Diagram"
        showControls={false}
        variant="compact"
      />,
    );

    const trigger = screen.getByRole('button', { name: '导出' });
    fireEvent.click(trigger);

    const firstItem = await screen.findByRole('menuitem', { name: 'PNG 图片' });
    await waitFor(() => expect(document.activeElement).toBe(firstItem));

    fireEvent.keyDown(firstItem, { key: 'Escape' });
    await waitFor(() => {
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('announces an active export as a polite busy status', async () => {
    render(
      <ExportTools
        diagramId="diagram-1"
        diagramName="Diagram"
        showControls={false}
        variant="compact"
      />,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent('diagramExportStart', {
        detail: { diagramId: 'diagram-1', type: 'png' },
      }));
    });

    const status = await screen.findByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('aria-atomic')).toBe('true');
    expect(status.getAttribute('aria-busy')).toBe('true');

    act(() => {
      window.dispatchEvent(new CustomEvent('diagramExportComplete', {
        detail: { diagramId: 'diagram-1', type: 'png' },
      }));
    });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('reports a dispatched export failure without also announcing success', async () => {
    exportToPNG.mockImplementation(async () => {
      window.dispatchEvent(new CustomEvent('diagramExportError', {
        detail: { diagramId: 'diagram-1', type: 'png', error: 'capture_failed' },
      }));
    });

    render(
      <ExportTools
        diagramId="diagram-1"
        diagramName="Diagram"
        showControls={false}
        variant="compact"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导出' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'PNG 图片' }));

    await waitFor(() => expect(appMessageMocks.error).toHaveBeenCalledTimes(1));
    expect(appMessageMocks.success).not.toHaveBeenCalled();
  });

  it('ignores a duplicate export trigger while the first export is still running', async () => {
    let resolveExport: (() => void) | undefined;
    exportToPNG.mockImplementation(() => new Promise<void>((resolve) => {
      resolveExport = resolve;
    }));

    render(
      <ExportTools
        diagramId="diagram-1"
        diagramName="Diagram"
        showControls={false}
        variant="compact"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '导出' }));
    const pngItem = await screen.findByRole('menuitem', { name: 'PNG 图片' });
    fireEvent.click(pngItem);
    fireEvent.click(pngItem);

    await waitFor(() => expect(exportToPNG).toHaveBeenCalledTimes(1));
    resolveExport?.();
    await waitFor(() => expect(appMessageMocks.success).toHaveBeenCalledTimes(1));
  });

  it('uses the commercial touch target inside the mobile system menu', () => {
    render(
      <ExportTools
        diagramId="diagram-1"
        diagramName="Diagram"
        showControls={false}
        variant="inline"
        commercialTouchTarget
      />,
    );

    const trigger = screen.getByRole('button', { name: '导出' });
    expect(trigger.style.height).toBe('var(--commercial-touch-target, 44px)');
    expect(trigger.style.minHeight).toBe('var(--commercial-touch-target, 44px)');
  });
});
