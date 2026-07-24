import { describe, expect, it, vi } from 'vitest';
import {
  buildExportFileName,
  exportFullDiagramByAdjustingViewportToPngDataUrl,
  isSafeExportDataUrl,
  normalizeExportPixelRatio,
  normalizeGifFrameCount,
  normalizeRasterExportBounds,
  temporarilyHideElements,
  triggerDownload,
} from '../exportUtils';

const htmlToImageMock = vi.hoisted(() => ({
  toPng: vi.fn(),
  toSvg: vi.fn(),
}));

vi.mock('html-to-image', () => htmlToImageMock);

describe('exportUtils', () => {
  it('builds sanitized export filenames from diagram ids', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-13T12:34:56.789Z'));

    expect(buildExportFileName('../CON:<bad>', 'png')).toBe('_CON_bad__2026-06-13T12-34-56-789Z.png');
    expect(buildExportFileName('   ', 'svg')).toBe('diagram_2026-06-13T12-34-56-789Z.svg');
    expect(buildExportFileName('diagram', 'exe' as never)).toBe('diagram_2026-06-13T12-34-56-789Z.png');

    vi.useRealTimers();
  });

  it('normalizes raster export pixel ratios and dimensions', () => {
    expect(normalizeExportPixelRatio(Number.NaN)).toBe(1);
    expect(normalizeExportPixelRatio(10)).toBe(3);
    expect(normalizeExportPixelRatio(0.1)).toBe(0.5);
    expect(normalizeExportPixelRatio(2, Number.NaN)).toBe(2);

    expect(normalizeRasterExportBounds(1000, 500, 2)).toEqual({
      width: 1000,
      height: 500,
      pixelRatio: 2,
    });
  });

  it('reduces pixel ratio for large exports and rejects invalid dimensions', () => {
    const large = normalizeRasterExportBounds(6000, 4000, 3);
    expect(large.width).toBe(6000);
    expect(large.height).toBe(4000);
    expect(large.pixelRatio).toBeLessThan(3);

    expect(() => normalizeRasterExportBounds(12_001, 100, 1)).toThrow('Export dimensions exceed');
    expect(() => normalizeRasterExportBounds(Number.POSITIVE_INFINITY, 100, 1)).toThrow('Invalid export dimensions');
    expect(normalizeRasterExportBounds(100, 100, 2, Number.NaN).pixelRatio).toBe(2);
  });

  it('normalizes GIF frame counts', () => {
    expect(normalizeGifFrameCount(Number.NaN)).toBe(1);
    expect(normalizeGifFrameCount(0)).toBe(1);
    expect(normalizeGifFrameCount(12.8)).toBe(12);
    expect(normalizeGifFrameCount(100)).toBe(24);
  });

  it('validates export data URLs before download', () => {
    expect(isSafeExportDataUrl('data:image/png;base64,aGVsbG8=')).toBe(true);
    expect(isSafeExportDataUrl('data:image/gif;base64,R0lGODlh')).toBe(true);
    expect(isSafeExportDataUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E')).toBe(true);
    expect(isSafeExportDataUrl('data:image/svg+xml,%3Csvg%20onload%3D%22alert(1)%22%3E%3C/svg%3E')).toBe(false);
    expect(isSafeExportDataUrl('data:image/svg+xml,%3Csvg%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E%3C%2Fsvg%3E')).toBe(false);
    expect(isSafeExportDataUrl('data:image/svg+xml,%3Csvg%3E%3Cpath%20fill%3D%22url(javascript%3Aalert(1))%22%2F%3E%3C%2Fsvg%3E')).toBe(false);
    expect(isSafeExportDataUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeExportDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExportDataUrl(`data:image/png;base64,${'A'.repeat(65 * 1024 * 1024)}`)).toBe(false);
  });

  it('throws before creating a download link for unsafe data URLs', () => {
    expect(() => triggerDownload('javascript:alert(1)', 'bad.png')).toThrow('Unsafe export data URL');
    expect(document.querySelector('a')).toBeNull();
  });

  it('skips invalid hide selectors and always restores previously hidden elements', async () => {
    const toolbar = document.createElement('div');
    toolbar.className = 'export-toolbar';
    toolbar.style.display = 'flex';
    toolbar.style.visibility = 'visible';
    document.body.appendChild(toolbar);

    const result = await temporarilyHideElements(['.export-toolbar', '['], async () => {
      expect(toolbar.style.display).toBe('none');
      expect(toolbar.style.visibility).toBe('hidden');
      return 'captured';
    });

    expect(result).toBe('captured');
    expect(toolbar.style.display).toBe('flex');
    expect(toolbar.style.visibility).toBe('visible');
    toolbar.remove();
  });

  it('restores every mutated viewport style when PNG capture rejects', async () => {
    vi.useFakeTimers();
    htmlToImageMock.toPng.mockReset().mockRejectedValueOnce(new Error('capture failed'));
    document.body.innerHTML = `
      <div id="diagram-transaction">
        <div class="diagram-component-root" style="width:111px;height:222px;overflow:hidden">
          <div class="react-flow" style="width:333px;height:444px;flex:1 1 auto">
            <svg class="react-flow__renderer" width="5" height="6" style="overflow:hidden">
              <g class="react-flow__viewport" style="transform:translate(1px, 2px)"></g>
            </svg>
            <div class="react-flow__controls" style="display:block;visibility:visible"></div>
          </div>
        </div>
      </div>`;
    const runtimeWindow = window as Window & { reactFlowInstance?: unknown };
    runtimeWindow.reactFlowInstance = {
      getNodes: () => [{
        position: { x: 10, y: 20 },
        measured: { width: 100, height: 50 },
      }],
    };

    const promise = exportFullDiagramByAdjustingViewportToPngDataUrl('transaction', 40, 2);
    const rejection = expect(promise).rejects.toThrow('capture failed');
    await vi.advanceTimersByTimeAsync(300);
    await rejection;

    const root = document.querySelector<HTMLElement>('.diagram-component-root')!;
    const reactFlow = document.querySelector<HTMLElement>('.react-flow')!;
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport')!;
    const renderer = document.querySelector<SVGSVGElement>('svg.react-flow__renderer')!;
    const controls = document.querySelector<HTMLElement>('.react-flow__controls')!;
    expect(root.style.width).toBe('111px');
    expect(root.style.height).toBe('222px');
    expect(root.style.overflow).toBe('hidden');
    expect(reactFlow.style.width).toBe('333px');
    expect(reactFlow.style.height).toBe('444px');
    expect(reactFlow.style.flex).toBe('1 1 auto');
    expect(viewport.style.transform).toBe('translate(1px, 2px)');
    expect(renderer.getAttribute('width')).toBe('5');
    expect(renderer.getAttribute('height')).toBe('6');
    expect(renderer.style.overflow).toBe('hidden');
    expect(controls.style.display).toBe('block');
    expect(controls.style.visibility).toBe('visible');

    delete runtimeWindow.reactFlowInstance;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });
});
