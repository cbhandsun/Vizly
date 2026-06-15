export const FLOWCHART_JSON_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const THEME_JSON_IMPORT_MAX_BYTES = 1024 * 1024;
export const FLOWCHART_TEXT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const MINDMAP_TEXT_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_DATA_URL_IMPORT_MAX_BYTES = 3 * 1024 * 1024;
export const REVERSE_IMPORT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const SAFE_IMAGE_IMPORT_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
]);
const SAFE_IMAGE_IMPORT_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif)$/i;

export const formatFileSize = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Number(kb.toFixed(kb >= 10 ? 0 : 1))} KB`;
    const mb = kb / 1024;
    return `${Number(mb.toFixed(mb >= 10 ? 0 : 1))} MB`;
};

export const getFileSizeLimitError = (
    file: Pick<File, 'name' | 'size'>,
    maxBytes: number,
    label = 'file'
): string | null => {
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
        return 'Invalid import size limit.';
    }

    if (file.size <= maxBytes) return null;

    const fileName = file.name || label;
    return `${fileName} is too large (${formatFileSize(file.size)}). The ${label} import limit is ${formatFileSize(maxBytes)}.`;
};

export const getImageFileImportError = (
    file: Pick<File, 'name' | 'size' | 'type'>,
    maxBytes: number = IMAGE_DATA_URL_IMPORT_MAX_BYTES
): string | null => {
    const sizeError = getFileSizeLimitError(file, maxBytes, 'image');
    if (sizeError) return sizeError;

    const mime = String(file.type || '').toLowerCase();
    const hasSafeMime = SAFE_IMAGE_IMPORT_MIME_TYPES.has(mime);
    const hasSafeExtension = SAFE_IMAGE_IMPORT_EXTENSIONS.test(file.name || '');
    if (!hasSafeMime || !hasSafeExtension) {
        return `${file.name || 'image'} is not a supported image type. Supported formats: PNG, JPEG, GIF, WebP, AVIF.`;
    }

    return null;
};
