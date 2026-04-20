import { getNodesBounds } from '@xyflow/react';

export interface ExportOptions {
    format: 'png' | 'svg' | 'pdf' | 'jpg' | 'json';
    pixelRatio?: number;
    includeBackground?: boolean;
    selectionOnly?: boolean;
    embedMetadata?: boolean;
}

export const downloadImage = async (
    nodes: { id: string; position?: { x: number; y: number }; measured?: { width: number; height: number }; [key: string]: unknown }[],
    options: ExportOptions = { format: 'png' }
) => {
    const { format = 'png', pixelRatio = 1, includeBackground = true, embedMetadata = true } = options;
    // 1. Calculate Bounding Box
    // We want to export the VALID nodes only (not hidden ones if any)
    const bounds = getNodesBounds(nodes as any);

    // 2. Viewport Transform
    // We want to shift the viewport so the nodes are centered/visible with padding.
    // However, html-to-image captures the DOM. 
    // We simply translate the content to be at (padding, padding).

    // We need to target the viewport element.
    const viewportElem = document.querySelector('.react-flow__viewport') as HTMLElement;

    if (!viewportElem) {
        console.error('React Flow Viewport not found');
        return;
    }

    const exportOptions = {
        backgroundColor: includeBackground ? '#fff' : 'transparent',
        width: bounds.width + 100,
        height: bounds.height + 100,
        pixelRatio,
        style: {
            width: `${bounds.width + 100}px`,
            height: `${bounds.height + 100}px`,
            transform: `translate(${-bounds.x + 50}px, ${-bounds.y + 50}px) scale(1)`,
        },
    };

    const download = (dataUrl: string, filename: string) => {
        const a = document.createElement('a');
        a.setAttribute('download', filename);
        a.setAttribute('href', dataUrl);
        a.click();
    };

    const filename = `vizly-diagram-${new Date().getTime()}`;

    // 辅助函数：注入元数据 (PNG/SVG)
    const injectMetadata = async (dataUrl: string, rawData: any) => {
        if (!embedMetadata) return dataUrl;
        
        const stateJson = JSON.stringify({
            vizly: true,
            version: '1.0',
            data: rawData,
            exportedAt: new Date().toISOString()
        });

        if (format === 'svg') {
            // SVG: 插入 metadata 标签
            const decoded = decodeURIComponent(dataUrl.replace('data:image/svg+xml;charset=utf-8,', ''));
            const metadataTag = `<metadata id="vizly-state">${stateJson}</metadata>`;
            const updatedSvg = decoded.replace('</svg>', `${metadataTag}</svg>`);
            return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(updatedSvg)}`;
        }

        if (format === 'png' || format === 'jpg') {
            // PNG/JPG: 在末尾追加数据
            try {
                const response = await fetch(dataUrl);
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();
                
                const metaMarkerStart = '\nVIZLY_META_START\n';
                const metaMarkerEnd = '\nVIZLY_META_END\n';
                const encoder = new TextEncoder();
                const markerStartBytes = encoder.encode(metaMarkerStart);
                const markerEndBytes = encoder.encode(metaMarkerEnd);
                const dataBytes = encoder.encode(stateJson);

                const finalBuffer = new Uint8Array(buffer.byteLength + markerStartBytes.byteLength + dataBytes.byteLength + markerEndBytes.byteLength);
                finalBuffer.set(new Uint8Array(buffer), 0);
                finalBuffer.set(markerStartBytes, buffer.byteLength);
                finalBuffer.set(dataBytes, buffer.byteLength + markerStartBytes.byteLength);
                finalBuffer.set(markerEndBytes, buffer.byteLength + markerStartBytes.byteLength + dataBytes.byteLength);

                const finalBlob = new Blob([finalBuffer], { type: blob.type });
                return URL.createObjectURL(finalBlob);
            } catch (err) {
                console.warn('Metadata injection failed:', err);
                return dataUrl;
            }
        }

        return dataUrl;
    };

    switch (format) {
        case 'png': {
            const { toPng } = await import('html-to-image');
            toPng(viewportElem, exportOptions).then(async (dataUrl: string) => {
                const finalUrl = await injectMetadata(dataUrl, { nodes });
                download(finalUrl, `${filename}.png`);
            });
            break;
        }
        case 'jpg': {
            const { toJpeg } = await import('html-to-image');
            toJpeg(viewportElem, exportOptions).then(async (dataUrl: string) => {
                const finalUrl = await injectMetadata(dataUrl, { nodes });
                download(finalUrl, `${filename}.jpg`);
            });
            break;
        }
        case 'svg': {
            const { toSvg } = await import('html-to-image');
            toSvg(viewportElem, exportOptions).then(async (dataUrl: string) => {
                const finalUrl = await injectMetadata(dataUrl, { nodes });
                download(finalUrl, `${filename}.svg`);
            });
            break;
        }
        case 'pdf': {
            const { toPng } = await import('html-to-image');
            const { jsPDF } = await import('jspdf');
            toPng(viewportElem, exportOptions).then((dataUrl: string) => {
                const pdf = new jsPDF({
                    orientation: bounds.width > bounds.height ? 'l' : 'p',
                    unit: 'px',
                    format: [bounds.width + 100, bounds.height + 100]
                });
                pdf.addImage(dataUrl, 'PNG', 0, 0, bounds.width + 100, bounds.height + 100);
                pdf.save(`${filename}.pdf`);
            });
            break;
        }
        case 'json': {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ nodes, timestamp: new Date() }));
            download(dataStr, `${filename}.json`);
            break;
        }
    }
};

/**
 * 拷贝图表到剪贴板 (Phase 10)
 */
export const copyImageToClipboard = async (nodes: any[]) => {
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
        console.error('Failed to copy image:', err);
    }
    return false;
};
