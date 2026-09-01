import { getNodesBounds, type Node } from '@xyflow/react';
import { sanitizeDownloadFileName } from './downloadUtils';
import { safeLog } from './consoleCleanup';
import { redactSensitiveLogValue } from './logSecurity';

export interface ExportNode {
    id: string;
    position?: { x?: number; y?: number };
    measured?: { width?: number; height?: number };
}

export interface ExportOptions {
    format: 'png' | 'svg' | 'pdf' | 'jpg' | 'json';
    pixelRatio?: number;
    includeBackground?: boolean;
    selectionOnly?: boolean;
    embedMetadata?: boolean;
    fileNameBase?: string;
}

const MAX_EXPORT_DIMENSION = 12_000;
const MAX_EXPORT_AREA = 80_000_000;
const MAX_EXPORT_PIXEL_RATIO = 4;
const MAX_METADATA_BYTES = 512 * 1024;
const MAX_IMAGE_DATA_URL_CHARS = 32 * 1024 * 1024;
const PDF_JPEG_QUALITY = 0.92;

const EXPORT_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg);base64,([a-z0-9+/=\s]+)$/i;
const EXPORT_SVG_DATA_URL_PATTERN = /^data:image\/svg\+xml(?:;charset=[\w-]+)?,/i;

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(min, Math.min(max, value))
        : fallback;
};

const escapeXmlText = (value: string): string => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const isSafeImageExportDataUrl = (dataUrl: unknown): boolean => {
    if (typeof dataUrl !== 'string' || dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) return false;
    return EXPORT_IMAGE_DATA_URL_PATTERN.test(dataUrl) || EXPORT_SVG_DATA_URL_PATTERN.test(dataUrl);
};

export const imageExportDataUrlToBlob = (dataUrl: string): Blob => {
    if (!isSafeImageExportDataUrl(dataUrl)) {
        throw new Error('Unsafe image export data URL');
    }

    const match = dataUrl.match(EXPORT_IMAGE_DATA_URL_PATTERN);
    if (!match) {
        throw new Error('Only base64 PNG/JPEG data URLs can be converted to Blob');
    }

    const mime = match[1].toLowerCase() === 'jpg' ? 'image/jpeg' : `image/${match[1].toLowerCase()}`;
    const base64 = match[2].replace(/\s+/g, '');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mime });
};

type MetadataCapableExportFormat = Extract<ExportOptions['format'], 'png' | 'jpg' | 'svg'>;

export const attachVizlyExportMetadata = async (
    dataUrl: string,
    format: MetadataCapableExportFormat,
    rawData: unknown,
): Promise<string> => {
    try {
        const stateJson = JSON.stringify({
            vizly: true,
            version: '1.0',
            data: rawData,
            exportedAt: new Date().toISOString(),
        });

        if (new TextEncoder().encode(stateJson).byteLength > MAX_METADATA_BYTES) {
            return dataUrl;
        }

        if (format === 'svg') {
            if (!isSafeImageExportDataUrl(dataUrl)) return dataUrl;
            const separatorIndex = dataUrl.indexOf(',');
            if (separatorIndex < 0) return dataUrl;
            const decoded = decodeURIComponent(dataUrl.slice(separatorIndex + 1));
            if (!decoded.includes('</svg>')) return dataUrl;
            const metadataTag = `<metadata id="vizly-state">${escapeXmlText(stateJson)}</metadata>`;
            const updatedSvg = decoded.replace('</svg>', `${metadataTag}</svg>`);
            return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(updatedSvg)}`;
        }

        const blob = imageExportDataUrlToBlob(dataUrl);
        const buffer = await blob.arrayBuffer();
        const metaMarkerStart = '\nVIZLY_META_START\n';
        const metaMarkerEnd = '\nVIZLY_META_END\n';
        const encoder = new TextEncoder();
        const markerStartBytes = encoder.encode(metaMarkerStart);
        const markerEndBytes = encoder.encode(metaMarkerEnd);
        const dataBytes = encoder.encode(stateJson);
        const finalBuffer = new Uint8Array(
            buffer.byteLength + markerStartBytes.byteLength + dataBytes.byteLength + markerEndBytes.byteLength,
        );
        finalBuffer.set(new Uint8Array(buffer), 0);
        finalBuffer.set(markerStartBytes, buffer.byteLength);
        finalBuffer.set(dataBytes, buffer.byteLength + markerStartBytes.byteLength);
        finalBuffer.set(
            markerEndBytes,
            buffer.byteLength + markerStartBytes.byteLength + dataBytes.byteLength,
        );

        const finalBlob = new Blob([finalBuffer], { type: blob.type });
        return URL.createObjectURL(finalBlob);
    } catch (error) {
        safeLog.warn('Metadata injection failed:', redactSensitiveLogValue(error));
        return dataUrl;
    }
};

const assertExportBounds = (width: number, height: number, pixelRatio: number): void => {
    if (
        width <= 0 ||
        height <= 0 ||
        width > MAX_EXPORT_DIMENSION ||
        height > MAX_EXPORT_DIMENSION ||
        width * height * pixelRatio * pixelRatio > MAX_EXPORT_AREA
    ) {
        throw new Error('Export image dimensions are too large');
    }
};

const downloadHref = (href: string, filename: string): void => {
    if (!isSafeImageExportDataUrl(href) && !href.startsWith('blob:') && !href.startsWith('data:text/json;charset=utf-8,')) {
        throw new Error('Unsafe export download URL');
    }

    const link = document.createElement('a');
    try {
        link.href = href;
        link.download = sanitizeDownloadFileName(filename, 'vizly-diagram');
        link.rel = 'noopener noreferrer';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
    } finally {
        link.remove();
        if (href.startsWith('blob:')) {
            window.setTimeout(() => URL.revokeObjectURL(href), 0);
        }
    }
};

export const downloadImage = async (
    nodes: ExportNode[],
    options: ExportOptions = { format: 'png' }
) => {
    const { format = 'png', includeBackground = true, embedMetadata = true } = options;
    const pixelRatio = clampNumber(options.pixelRatio, 0.5, MAX_EXPORT_PIXEL_RATIO, 1);
    // 1. Calculate Bounding Box
    // We want to export only valid nodes (excluding hidden nodes when present).
    const bounds = getNodesBounds(nodes as Node[]);

    // 2. Viewport Transform
    // We want to shift the viewport so the nodes are centered/visible with padding.
    // However, html-to-image captures the DOM. 
    // We simply translate the content to be at (padding, padding).

    // We need to target the viewport element.
    const viewportElem = document.querySelector('.react-flow__viewport') as HTMLElement;

    if (!viewportElem) throw new Error('React Flow viewport not found');

    const exportWidth = bounds.width + 100;
    const exportHeight = bounds.height + 100;
    assertExportBounds(exportWidth, exportHeight, pixelRatio);

    const exportOptions = {
        backgroundColor: includeBackground ? '#fff' : 'transparent',
        width: exportWidth,
        height: exportHeight,
        pixelRatio,
        style: {
            width: `${exportWidth}px`,
            height: `${exportHeight}px`,
            transform: `translate(${-bounds.x + 50}px, ${-bounds.y + 50}px) scale(1)`,
        },
    };

    const filename = sanitizeDownloadFileName(
        options.fileNameBase?.trim() || `vizly-diagram-${new Date().getTime()}`,
        'vizly-diagram',
    );

    switch (format) {
        case 'png': {
            const { toPng } = await import('html-to-image');
            const dataUrl = await toPng(viewportElem, exportOptions);
            const finalUrl = embedMetadata
                ? await attachVizlyExportMetadata(dataUrl, 'png', { nodes })
                : dataUrl;
            downloadHref(finalUrl, `${filename}.png`);
            break;
        }
        case 'jpg': {
            const { toJpeg } = await import('html-to-image');
            const dataUrl = await toJpeg(viewportElem, exportOptions);
            const finalUrl = embedMetadata
                ? await attachVizlyExportMetadata(dataUrl, 'jpg', { nodes })
                : dataUrl;
            downloadHref(finalUrl, `${filename}.jpg`);
            break;
        }
        case 'svg': {
            const { toSvg } = await import('html-to-image');
            const dataUrl = await toSvg(viewportElem, exportOptions);
            const finalUrl = embedMetadata
                ? await attachVizlyExportMetadata(dataUrl, 'svg', { nodes })
                : dataUrl;
            downloadHref(finalUrl, `${filename}.svg`);
            break;
        }
        case 'pdf': {
            const { toJpeg } = await import('html-to-image');
            const { jsPDF } = await import('jspdf');
            // PDF pages are raster-backed. Embedding the lossless PNG produced files
            // tens of megabytes large for ordinary diagrams, while a high-quality
            // JPEG keeps text legible at the requested pixel ratio and is already
            // compressed before jsPDF embeds it.
            const dataUrl = await toJpeg(viewportElem, {
                ...exportOptions,
                backgroundColor: '#fff',
                quality: PDF_JPEG_QUALITY,
            });
            const pdf = new jsPDF({
                orientation: bounds.width > bounds.height ? 'l' : 'p',
                unit: 'px',
                format: [bounds.width + 100, bounds.height + 100]
            });
            pdf.addImage(dataUrl, 'JPEG', 0, 0, bounds.width + 100, bounds.height + 100);
            pdf.save(`${filename}.pdf`);
            break;
        }
        case 'json': {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ nodes, timestamp: new Date() }));
            downloadHref(dataStr, `${filename}.json`);
            break;
        }
    }
};

/**
 * 拷贝图表到剪贴板 (Phase 10)
 */
export const copyImageToClipboard = async (_nodes: readonly ExportNode[]) => {
    const viewportElem = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!viewportElem) return;

    try {
        const { toBlob } = await import('html-to-image');
        const blob = await toBlob(viewportElem, { pixelRatio: 2 });
        if (blob) {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            return true;
        }
    } catch (err) {
        safeLog.error('Failed to copy image:', redactSensitiveLogValue(err));
    }
    return false;
};
