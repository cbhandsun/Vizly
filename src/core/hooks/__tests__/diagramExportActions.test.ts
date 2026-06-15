import { describe, expect, it } from 'vitest';
import { isSafeExportDataUrl, serializeExportError } from '../diagramExportActions';

describe('diagram export action guards', () => {
  it('allows only supported image data URLs for downloads', () => {
    expect(isSafeExportDataUrl('data:image/png;base64,aGVsbG8=')).toBe(true);
    expect(isSafeExportDataUrl('data:image/gif;base64,R0lGODlh')).toBe(true);
    expect(isSafeExportDataUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E')).toBe(true);
    expect(isSafeExportDataUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExportDataUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeExportDataUrl('https://example.com/file.png')).toBe(false);
  });

  it('serializes unknown export errors into event-safe strings', () => {
    expect(serializeExportError(new Error('failed'))).toBe('failed');
    expect(serializeExportError('plain')).toBe('plain');
    expect(serializeExportError({ code: 'bad' })).toBe('{"code":"bad"}');
  });
});
