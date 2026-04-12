import { toPng, toSvg } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { getNodesBounds, Node } from '@xyflow/react';

export const downloadImage = (
    nodes: Node[],
    format: 'png' | 'svg' | 'pdf' = 'png'
) => {
    // 1. Calculate Bounding Box
    // We want to export the VALID nodes only (not hidden ones if any)
    const bounds = getNodesBounds(nodes);

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
        backgroundColor: '#fff',
        width: bounds.width + 50,
        height: bounds.height + 50,
        style: {
            // We shift the content so that top-left (bounds.x, bounds.y) moves to (25, 25)
            width: `${bounds.width + 50}px`,
            height: `${bounds.height + 50}px`,
            transform: `translate(${-bounds.x + 25}px, ${-bounds.y + 25}px) scale(1)`,
        },
    };

    const download = (dataUrl: string, filename: string) => {
        const a = document.createElement('a');
        a.setAttribute('download', filename);
        a.setAttribute('href', dataUrl);
        a.click();
    };

    switch (format) {
        case 'png':
            toPng(viewportElem, exportOptions).then((dataUrl: string) => {
                download(dataUrl, 'diagram.png');
            });
            break;
        case 'svg':
            toSvg(viewportElem, exportOptions).then((dataUrl: string) => {
                download(dataUrl, 'diagram.svg');
            });
            break;
        case 'pdf':
            toPng(viewportElem, exportOptions).then((dataUrl: string) => {
                const pdf = new jsPDF({
                    orientation: bounds.width > bounds.height ? 'l' : 'p',
                    unit: 'px',
                    format: [bounds.width + 50, bounds.height + 50]
                });
                pdf.addImage(dataUrl, 'PNG', 0, 0, bounds.width + 50, bounds.height + 50);
                pdf.save('diagram.pdf');
            });
            break;
    }
};
