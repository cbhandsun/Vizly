import { describe, expect, it } from 'vitest';
import {
    attachVizlyExportMetadata,
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

    it('adds escaped, restorable metadata to a safe SVG export', async () => {
        const source = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
        const result = await attachVizlyExportMetadata(source, 'svg', {
            nodes: [{ id: 'safe', label: '</metadata><script>alert(1)</script>' }],
        });
        const decoded = decodeURIComponent(result.slice(result.indexOf(',') + 1));

        expect(decoded).toContain('<metadata id="vizly-state">');
        expect(decoded).toContain('&lt;/metadata&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(decoded).not.toContain('<script>alert(1)</script>');
    });

    it('keeps empty metadata payloads without inventing user content', async () => {
        const source = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
        const result = await attachVizlyExportMetadata(source, 'svg', null);
        const decoded = decodeURIComponent(result.slice(result.indexOf(',') + 1));

        expect(decoded).toContain('"data":null');
    });

    it('leaves unsafe, oversized, and unserializable metadata inputs unchanged', async () => {
        const source = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E';
        const cyclic: { self?: unknown } = {};
        cyclic.self = cyclic;

        await expect(attachVizlyExportMetadata('javascript:alert(1)', 'svg', {}))
            .resolves.toBe('javascript:alert(1)');
        await expect(attachVizlyExportMetadata(source, 'svg', { value: 'x'.repeat(513 * 1024) }))
            .resolves.toBe(source);
        await expect(attachVizlyExportMetadata(source, 'svg', cyclic))
            .resolves.toBe(source);
    });
});
