import { describe, expect, it } from 'vitest';
import {
    formatFileSize,
    getFileSizeLimitError,
    getImageFileImportError,
    getReverseImportImageFileError,
    REVERSE_IMPORT_IMAGE_MAX_BYTES,
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

    it('defines a bounded reverse-image import limit', () => {
        expect(REVERSE_IMPORT_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
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
