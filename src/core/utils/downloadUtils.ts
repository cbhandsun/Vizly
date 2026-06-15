/**
 * Browser-side download utility
 */
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export function sanitizeDownloadFileName(filename: unknown, fallback: string = 'download', maxLength: number = 120): string {
  const fallbackName = String(fallback || 'download');
  const raw = typeof filename === 'string' ? filename : '';
  let cleaned = raw
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .split('')
    .map(char => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127 ? '_' : char;
    })
    .join('')
    .replace(/_+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');

  if (!cleaned) cleaned = fallbackName;
  if (WINDOWS_RESERVED_NAMES.test(cleaned)) cleaned = `_${cleaned}`;
  if (cleaned.length > maxLength) {
    const extMatch = cleaned.match(/(\.[A-Za-z0-9]{1,12})$/);
    const ext = extMatch?.[1] ?? '';
    const baseMax = Math.max(1, maxLength - ext.length);
    cleaned = `${cleaned.slice(0, baseMax).replace(/[.\s]+$/g, '')}${ext}`;
  }
  return cleaned || fallbackName;
}

export function downloadFile(content: string, filename: string, mimeType: string = 'text/markdown') {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

export function downloadBlob(blob: Blob, filename: string, fallback = 'download') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = sanitizeDownloadFileName(filename, fallback);
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
