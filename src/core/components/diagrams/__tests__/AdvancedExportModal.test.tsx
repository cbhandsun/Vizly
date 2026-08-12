// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdvancedExportModal,
  AdvancedExportModeNotice,
  SvgExportPreview,
} from '../ui/AdvancedExportModal';
import {
  getAdvancedExportCapabilities,
  isSceneBasedAdvancedExportFormat,
} from '../advancedExportMode';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => {
      const translations: Record<string, string> = {
        'advancedExport.title': '高级图表导出',
        'advancedExport.closeDialog': '关闭高级图表导出',
        'advancedExport.formatLabel': '选择导出格式',
        'advancedExport.dpiLabel': '图片清晰度 (DPI)',
        'advancedExport.dpi1x': '1x - 标准清晰度',
        'advancedExport.dpi2x': '2x - 高清（推荐）',
        'advancedExport.dpi4x': '4x - 印刷级超清',
        'advancedExport.includeBackground': '包含底色背景',
        'advancedExport.embedMetadata': '注入元数据',
        'advancedExport.copyClipboard': '复制 PNG 到剪贴板',
        'advancedExport.clipboardRecoveryTitle': '无法写入图片剪贴板',
        'advancedExport.clipboardRecoveryDescription': '当前浏览器可能未开放图片剪贴板权限，可改用 PNG 下载保存。',
        'advancedExport.downloadPngFallback': '下载 PNG',
        'advancedExport.exportRecoveryTitle': '导出未完成',
        'advancedExport.exportRecoveryDescription': '请检查画布内容，或降低图片清晰度后重试。',
        'advancedExport.previewCounts': '{{nodes}} 个节点 / {{edges}} 条连线',
        'advancedExport.cancel': '取消',
        'advancedExport.confirm': '确认导出',
        'advancedExport.confirmFormat': '导出 {{format}}',
        'common.close': '关闭',
      };
      const template = translations[key] ?? (typeof fallback === 'string' ? fallback : key);
      if (!fallback || typeof fallback === 'string') return template;
      return Object.entries(fallback).reduce(
        (result, [name, value]) => result.replaceAll(`{{${name}}}`, String(value)),
        template,
      );
    },
  }),
}));

vi.mock('../../../utils/imageExporter', () => ({
  downloadImage: vi.fn(),
  copyImageToClipboard: vi.fn(),
}));

vi.mock('../../../store/useDiagramStore', () => ({
  useDiagramStore: {
    getState: () => ({ nodes: [] }),
  },
}));

vi.mock('@/core/utils/antdStaticBridge', () => ({
  appMessage: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../advancedExportActions', () => ({
  runAdvancedExport: vi.fn(),
}));

import { runAdvancedExport } from '../advancedExportActions';
import { copyImageToClipboard } from '../../../utils/imageExporter';

const installReactFlowInstance = () => {
  (window as any).reactFlowInstance = {
    getNodes: () => [
      {
        id: 'a',
        position: { x: 0, y: 0 },
        measured: { width: 120, height: 60 },
        data: { label: '<script>x</script>Alpha' },
      },
      {
        id: 'b',
        position: { x: 220, y: 0 },
        measured: { width: 120, height: 60 },
        data: { label: 'Beta' },
      },
    ],
    getEdges: () => [
      { id: 'a-b', source: 'a', target: 'b', label: '<img onerror=x>safe edge' },
    ],
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  };
};

afterEach(() => {
  delete (window as any).reactFlowInstance;
  vi.clearAllMocks();
});

describe('AdvancedExportModal SVG preview', () => {
  it('prefers explicit React Flow snapshots over the global fallback', async () => {
    (window as any).reactFlowInstance = {
      getNodes: () => {
        throw new Error('global fallback should not be used');
      },
      getEdges: () => [],
    };
    const getReactFlowSnapshot = vi.fn(() => ({
      nodes: [
        {
          id: 'snapshot-node',
          position: { x: 0, y: 0 },
          measured: { width: 120, height: 60 },
          data: { label: 'Snapshot Node' },
        },
      ],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }));

    render(<SvgExportPreview visible getReactFlowSnapshot={getReactFlowSnapshot} />);

    const preview = await screen.findByTestId('svg-export-preview');
    const image = preview.querySelector('img');
    expect(getReactFlowSnapshot).toHaveBeenCalledTimes(1);
    const decodedSvg = decodeURIComponent(image?.getAttribute('src') ?? '');
    expect(decodedSvg).toContain('Snapshot');
    expect(decodedSvg).toContain('Node');
  });

  it('renders a safe SVG preview when SVG format is selected', async () => {
    installReactFlowInstance();
    render(<SvgExportPreview visible />);

    const preview = await screen.findByTestId('svg-export-preview');
    const image = preview.querySelector('img');

    expect(image?.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(decodeURIComponent(image?.getAttribute('src') ?? '')).toContain('Alpha');
    expect(decodeURIComponent(image?.getAttribute('src') ?? '')).toContain('safe edge');
    expect(decodeURIComponent(image?.getAttribute('src') ?? '')).not.toContain('<script>');
    expect(decodeURIComponent(image?.getAttribute('src') ?? '')).not.toContain('onerror');
    expect(preview.textContent).toContain('2 个节点 / 1 条连线');
  });

  it('shows a safe empty state when preview generation fails', async () => {
    (window as any).reactFlowInstance = {
      getNodes: () => {
        throw new Error('Authorization: Bearer svg-preview-secret');
      },
      getEdges: () => [],
    };

    render(<SvgExportPreview visible />);

    await waitFor(() => {
      expect(screen.getByTestId('svg-export-preview-error')).toBeTruthy();
    });
    expect(document.body.textContent).not.toContain('svg-preview-secret');
  });
});

describe('AdvancedExportModeNotice', () => {
  it('maps every format to only the controls that affect its output', () => {
    expect(getAdvancedExportCapabilities('png')).toEqual({
      pixelRatio: true,
      background: true,
      metadata: true,
      clipboard: true,
    });
    expect(getAdvancedExportCapabilities('jpg')).toEqual({
      pixelRatio: true,
      background: false,
      metadata: true,
      clipboard: false,
    });
    expect(getAdvancedExportCapabilities('svg')).toEqual({
      pixelRatio: false,
      background: true,
      metadata: true,
      clipboard: false,
    });
    expect(getAdvancedExportCapabilities('pdf')).toEqual({
      pixelRatio: true,
      background: false,
      metadata: false,
      clipboard: false,
    });
    expect(getAdvancedExportCapabilities('json')).toEqual({
      pixelRatio: false,
      background: false,
      metadata: false,
      clipboard: false,
    });
  });

  it('classifies PNG and SVG as scene-based advanced export formats', () => {
    expect(isSceneBasedAdvancedExportFormat('png')).toBe(true);
    expect(isSceneBasedAdvancedExportFormat('svg')).toBe(true);
    expect(isSceneBasedAdvancedExportFormat('jpg')).toBe(false);
    expect(isSceneBasedAdvancedExportFormat('pdf')).toBe(false);
    expect(isSceneBasedAdvancedExportFormat('json')).toBe(false);
  });

  it('explains reliable canvas rendering for PNG and SVG when snapshots are available', () => {
    render(<AdvancedExportModeNotice format="svg" hasSnapshotProvider />);

    expect(screen.getByTestId('advanced-export-mode-notice').textContent).toContain(
      'rendered from the current canvas data',
    );
  });

  it('explains fallback behavior when the selected format is not scene based', () => {
    render(<AdvancedExportModeNotice format="pdf" hasSnapshotProvider />);

    expect(screen.getByTestId('advanced-export-mode-notice').textContent).toContain(
      'standard export engine',
    );
  });

  it('explains fallback behavior when scene snapshots are unavailable', () => {
    render(<AdvancedExportModeNotice format="png" hasSnapshotProvider={false} />);

    expect(screen.getByTestId('advanced-export-mode-notice').textContent).toContain(
      'standard export engine',
    );
  });
});

describe('AdvancedExportModal commercial controls', () => {
  it('renders above the persistent mobile shell in the viewport-level modal layer', () => {
    render(
      <AdvancedExportModal
        visible
        onClose={vi.fn()}
        diagramId="diagram-1"
        diagramTitle="Audit diagram"
      />,
    );

    const modalRoot = document.querySelector('.commercial-viewport-modal.advanced-export-modal');
    const modalWrap = modalRoot?.querySelector<HTMLElement>('.ant-modal-wrap');

    expect(modalRoot).toBeTruthy();
    expect(modalWrap?.style.zIndex).toBe('2200');
  });

  it('names the format, resolution, options, close, and PNG clipboard actions', () => {
    render(
      <AdvancedExportModal
        visible
        onClose={vi.fn()}
        diagramId="diagram-1"
        diagramTitle="Audit diagram"
      />,
    );

    expect(screen.getByRole('radiogroup', { name: '选择导出格式' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '图片清晰度 (DPI)' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '包含底色背景' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '注入元数据' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '复制 PNG 到剪贴板' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '关闭高级图表导出' })).toBeTruthy();
  });

  it('removes image-only controls when JSON is selected', () => {
    render(
      <AdvancedExportModal
        visible
        onClose={vi.fn()}
        diagramId="diagram-1"
        diagramTitle="Audit diagram"
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'JSON' }));

    expect(screen.queryByRole('combobox', { name: '图片清晰度 (DPI)' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '包含底色背景' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '注入元数据' })).toBeNull();
    expect(screen.queryByRole('button', { name: '复制 PNG 到剪贴板' })).toBeNull();
    expect(screen.getByRole('button', { name: 'download 导出 JSON' })).toBeTruthy();
  });

  it('keeps only the applicable controls for SVG and PDF', () => {
    render(<AdvancedExportModal visible onClose={vi.fn()} diagramId="diagram-1" />);

    fireEvent.click(screen.getByRole('radio', { name: 'SVG' }));
    expect(screen.queryByRole('combobox', { name: '图片清晰度 (DPI)' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: '包含底色背景' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: '注入元数据' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '复制 PNG 到剪贴板' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'PDF' }));
    expect(screen.getByRole('combobox', { name: '图片清晰度 (DPI)' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '包含底色背景' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '注入元数据' })).toBeNull();
  });

  it('blocks gated PDF exports before the advanced export action runs', async () => {
    const onClose = vi.fn();
    const onExportPermissionCheck = vi.fn(() => false);

    render(
      <AdvancedExportModal
        visible
        onClose={onClose}
        diagramId="diagram-1"
        diagramTitle="Audit diagram"
        onExportPermissionCheck={onExportPermissionCheck}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'download 导出 PDF' }));

    await waitFor(() => {
      expect(onExportPermissionCheck).toHaveBeenCalledWith('pdf');
    });
    expect(runAdvancedExport).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate clipboard operations and locks competing actions while copying', async () => {
    let resolveCopy: ((value: boolean) => void) | undefined;
    vi.mocked(copyImageToClipboard).mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveCopy = resolve;
    }));
    const onClose = vi.fn();

    render(<AdvancedExportModal visible onClose={onClose} diagramId="diagram-1" />);

    const copyButton = screen.getByRole('button', { name: '复制 PNG 到剪贴板' });
    fireEvent.click(copyButton);
    fireEvent.click(copyButton);

    expect(copyImageToClipboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'download 导出 PNG' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: '取 消' }).hasAttribute('disabled')).toBe(true);

    resolveCopy?.(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('offers a PNG download fallback after clipboard access fails', async () => {
    vi.mocked(copyImageToClipboard).mockResolvedValue(false);
    vi.mocked(runAdvancedExport).mockResolvedValue('fallback');
    const onClose = vi.fn();

    render(<AdvancedExportModal visible onClose={onClose} diagramId="diagram-1" />);

    fireEvent.click(screen.getByRole('button', { name: '复制 PNG 到剪贴板' }));

    const recovery = await screen.findByTestId('advanced-export-recovery');
    expect(recovery.textContent).toContain('无法写入图片剪贴板');
    expect(recovery.textContent).toContain('PNG 下载');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '下载 PNG' }));
    await waitFor(() => {
      expect(runAdvancedExport).toHaveBeenCalledWith(expect.objectContaining({ format: 'png' }));
    });
  });

  it('keeps a safe, actionable message visible when export fails', async () => {
    vi.mocked(runAdvancedExport).mockRejectedValue(new Error('Authorization: Bearer export-secret'));
    const onClose = vi.fn();

    render(<AdvancedExportModal visible onClose={onClose} diagramId="diagram-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'download 导出 PNG' }));

    const recovery = await screen.findByTestId('advanced-export-recovery');
    expect(recovery.textContent).toContain('导出未完成');
    expect(recovery.textContent).toContain('降低图片清晰度');
    expect(document.body.textContent).not.toContain('export-secret');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears stale recovery feedback when the dialog is closed and reopened', async () => {
    vi.mocked(runAdvancedExport).mockRejectedValue(new Error('export failed'));

    const ControlledModal = () => {
      const [visible, setVisible] = React.useState(true);
      return (
        <>
          <button type="button" onClick={() => setVisible(true)}>Reopen export</button>
          <AdvancedExportModal
            visible={visible}
            onClose={() => setVisible(false)}
            diagramId="diagram-1"
          />
        </>
      );
    };

    render(<ControlledModal />);
    fireEvent.click(screen.getByRole('button', { name: 'download 导出 PNG' }));
    expect(await screen.findByTestId('advanced-export-recovery')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '取 消' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen export' }));

    expect(screen.queryByTestId('advanced-export-recovery')).toBeNull();
  });
});
