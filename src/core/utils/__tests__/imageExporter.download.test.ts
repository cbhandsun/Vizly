// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const exportMocks = vi.hoisted(() => ({
  getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 200, height: 100 })),
  toJpeg: vi.fn(),
  toPng: vi.fn(),
  toSvg: vi.fn(),
  pdfAddImage: vi.fn(),
  pdfSave: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  getNodesBounds: exportMocks.getNodesBounds,
}));

vi.mock('html-to-image', () => ({
  toJpeg: exportMocks.toJpeg,
  toPng: exportMocks.toPng,
  toSvg: exportMocks.toSvg,
}));

vi.mock('jspdf', () => ({
  jsPDF: class MockPdf {
    addImage = exportMocks.pdfAddImage;
    save = exportMocks.pdfSave;
  },
}));

import { downloadImage } from '../imageExporter';

const JPEG_DATA_URL = 'data:image/jpeg;base64,SGVsbG8=';
const PNG_DATA_URL = 'data:image/png;base64,SGVsbG8=';

describe('downloadImage completion contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div class="react-flow__viewport"></div>';
    exportMocks.toJpeg.mockResolvedValue(JPEG_DATA_URL);
    exportMocks.toPng.mockResolvedValue(PNG_DATA_URL);
    exportMocks.toSvg.mockResolvedValue('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E');
    exportMocks.pdfSave.mockReturnValue(undefined);
  });

  it('rejects when the React Flow viewport is missing', async () => {
    document.body.innerHTML = '';

    await expect(downloadImage([], { format: 'jpg' })).rejects.toThrow('viewport not found');

    expect(exportMocks.toJpeg).not.toHaveBeenCalled();
  });

  it('waits for and propagates image conversion failures', async () => {
    const failure = new Error('image conversion failed');
    exportMocks.toJpeg.mockRejectedValue(failure);

    await expect(downloadImage([], { format: 'jpg', embedMetadata: false })).rejects.toBe(failure);
  });

  it('uses the sanitized visible title for a completed legacy download', async () => {
    let downloadedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function captureDownload(this: HTMLAnchorElement) {
      downloadedName = this.download;
    });

    await downloadImage([], {
      format: 'jpg',
      embedMetadata: false,
      fileNameBase: '  客户/入驻:流程  ',
    });

    expect(downloadedName).toBe('客户_入驻_流程.jpg');
  });

  it('propagates PDF save failures instead of resolving early', async () => {
    const failure = new Error('pdf save failed');
    exportMocks.pdfSave.mockImplementation(() => { throw failure; });

    await expect(downloadImage([], {
      format: 'pdf',
      embedMetadata: false,
      fileNameBase: '客户流程',
    })).rejects.toBe(failure);

    expect(exportMocks.pdfAddImage).toHaveBeenCalled();
  });
});
