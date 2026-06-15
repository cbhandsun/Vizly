import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, sanitizeDownloadFileName } from '../downloadUtils';

describe('downloadUtils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('sanitizes unsafe filename characters and control characters', () => {
    expect(sanitizeDownloadFileName('../bad\\name:<x>\n.md')).toBe('_bad_name_x_.md');
  });

  it('falls back for empty names and protects reserved Windows device names', () => {
    expect(sanitizeDownloadFileName('   ', 'diagram.md')).toBe('diagram.md');
    expect(sanitizeDownloadFileName('CON')).toBe('_CON');
    expect(sanitizeDownloadFileName('lpt1.txt')).toBe('_lpt1.txt');
  });

  it('truncates long names while preserving a short extension', () => {
    const result = sanitizeDownloadFileName(`${'a'.repeat(200)}.json`, 'download.json', 40);
    expect(result).toHaveLength(40);
    expect(result.endsWith('.json')).toBe(true);
  });

  it('downloads content with a sanitized filename and delayed object URL cleanup', () => {
    vi.useFakeTimers();
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download-test');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:download-test');
      expect(this.download).toBe('_bad_name.md');
      expect(document.body.contains(this)).toBe(true);
    });

    downloadFile('hello', '../bad:name.md', 'text/markdown');

    expect(createSpy).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(revokeSpy).toHaveBeenCalledWith('blob:download-test');
    vi.useRealTimers();
  });
});
