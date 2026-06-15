import { describe, expect, it } from 'vitest';
import {
    imageExportDataUrlToBlob,
    isSafeImageExportDataUrl,
} from '../imageExporter';

describe('imageExporter guards', () => {
    it('accepts bounded PNG/JPEG/SVG export data URLs only', () => {
        expect(isSafeImageExportDataUrl('data:image/png;base64,AAAA')).toBe(true);
        expect(isSafeImageExportDataUrl('data:image/jpeg;base64,AAAA')).toBe(true);
        expect(isSafeImageExportDataUrl('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E')).toBe(true);

        expect(isSafeImageExportDataUrl('data:text/html;base64,PHNjcmlwdA==')).toBe(false);
        expect(isSafeImageExportDataUrl('javascript:alert(1)')).toBe(false);
        expect(isSafeImageExportDataUrl(`data:image/png;base64,${'A'.repeat(33 * 1024 * 1024)}`)).toBe(false);
    });

    it('converts safe base64 image data URLs to blobs without network fetch', async () => {
        const blob = imageExportDataUrlToBlob('data:image/png;base64,SGVsbG8=');

        expect(blob.type).toBe('image/png');
        expect(await blob.text()).toBe('Hello');
    });

    it('rejects unsafe or non-binary image data URLs for blob conversion', () => {
        expect(() => imageExportDataUrlToBlob('data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'))
            .toThrow('Only base64 PNG/JPEG data URLs can be converted to Blob');
        expect(() => imageExportDataUrlToBlob('data:text/html;base64,SGVsbG8='))
            .toThrow('Unsafe image export data URL');
    });
});
