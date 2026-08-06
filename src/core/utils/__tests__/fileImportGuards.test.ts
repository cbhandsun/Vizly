import { describe, expect, it } from 'vitest';
import {
    formatFileSize,
    getFileSizeLimitError,
    getImageFileImportError,
    getReverseImportImageFileError,
    isImageLikeImportFile,
    REVERSE_IMPORT_IMAGE_MAX_BYTES,
    sanitizeFileNameForDisplay,
} from '../fileImportGuards';

describe('fileImportGuards', () => {
    it('formats byte, kilobyte, and megabyte sizes', () => {
        expect(formatFileSize(512)).toBe('512 B');
        expect(formatFileSize(1536)).toBe('1.5 KB');
        expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('allows files at the configured limit', () => {
        expect(getFileSizeLimitError({ name: 'diagram.json', size: 1024 }, 1024, 'JSON')).toBeNull();
    });

    it('returns an actionable error when the file exceeds the limit', () => {
        expect(getFileSizeLimitError({ name: 'huge.json', size: 6 * 1024 * 1024 }, 5 * 1024 * 1024, 'JSON'))
            .toBe('huge.json is too large (6 MB). The JSON import limit is 5 MB.');
    });

    it('normalizes filenames before displaying them in import feedback', () => {
        expect(sanitizeFileNameForDisplay('  report\n\u202Egnp.json  ')).toBe('report gnp.json');
        expect(sanitizeFileNameForDisplay('', 'diagram.json')).toBe('diagram.json');
        expect(sanitizeFileNameForDisplay(null, 'diagram.json')).toBe('diagram.json');
        expect(sanitizeFileNameForDisplay('x'.repeat(200))).toHaveLength(120);
    });

    it('defines a bounded reverse-image import limit', () => {
        expect(REVERSE_IMPORT_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    });

    it('recognizes image-like drops from either MIME type or file extension', () => {
        expect(isImageLikeImportFile({ name: 'diagram', type: 'image/png' })).toBe(true);
        expect(isImageLikeImportFile({ name: 'diagram.webp', type: '' })).toBe(true);
        expect(isImageLikeImportFile({ name: 'diagram.svg', type: 'application/octet-stream' })).toBe(true);
        expect(isImageLikeImportFile({ name: 'diagram.mmd', type: 'text/plain' })).toBe(false);
    });

    it('rejects unsupported image uploads before reading file data', () => {
        expect(getImageFileImportError({ name: 'safe.png', size: 1024, type: 'image/png' })).toBeNull();
        expect(getImageFileImportError({ name: 'vector.svg', size: 1024, type: 'image/svg+xml' }))
            .toContain('not a supported image type');
        expect(getImageFileImportError({ name: 'fake.png', size: 1024, type: 'text/html' }))
            .toContain('not a supported image type');
        expect(getImageFileImportError({ name: 'missing-extension', size: 1024, type: 'image/png' }))
            .toContain('not a supported image type');
    });

    it('applies the same image type guard to reverse image imports', () => {
        expect(getReverseImportImageFileError({ name: 'diagram.png', size: REVERSE_IMPORT_IMAGE_MAX_BYTES, type: 'image/png' }))
            .toBeNull();
        expect(getReverseImportImageFileError({ name: 'diagram.svg', size: 1024, type: 'image/svg+xml' }))
            .toContain('not a supported image type');
        expect(getReverseImportImageFileError({ name: 'diagram.png', size: 1024, type: 'text/html' }))
            .toContain('not a supported image type');
        expect(getReverseImportImageFileError({ name: 'huge.png', size: REVERSE_IMPORT_IMAGE_MAX_BYTES + 1, type: 'image/png' }))
            .toContain('too large');
    });
});
