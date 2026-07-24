import { normalizeRasterExportBounds } from './exportUtilsBoundary';
import {
  computeDiagramBBox,
  computeDomBBox,
  computeHeaderOffset,
  getTargetDiagramElement,
  temporarilyHideElements,
} from './exportUtilsDom';
import {
  exportElementToPngDataUrl,
  exportElementToSvgDataUrl,
} from './exportUtilsElement';

/**
 * 视口兜底：直接调整真实视口与容器尺寸进行整图导出（PNG）。
 * 避免离屏克隆导致样式/尺寸不同步或渲染空白的问题。
 * @param diagramId 图表实例ID
 * @param paddingPx 导出边距
 * @param pixelRatio 像素比
 */
export async function exportFullDiagramByAdjustingViewportToPngDataUrl(
  diagramId: string,
  paddingPx = 40,
  pixelRatio: number = 2
): Promise<string> {
  const root = getTargetDiagramElement(diagramId);
  if (!root) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(root);
  if (!bbox) {
    return exportElementToPngDataUrl(root, paddingPx, pixelRatio);
  }

  const headerOffset = computeHeaderOffset(root);

  const viewport = root.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewport) {
    return exportElementToPngDataUrl(root, paddingPx, pixelRatio);
  }

  const rendererSvg = root.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
  const reactFlowContainer = root.classList.contains('react-flow')
    ? root
    : root.querySelector<HTMLElement>('.react-flow');

  // Backup styles
  const backup = {
    viewportTransform: viewport.style.transform,
    rootWidth: root.style.width,
    rootHeight: root.style.height,
    rootOverflow: root.style.overflow,
    rfWidth: reactFlowContainer?.style.width,
    rfHeight: reactFlowContainer?.style.height,
    rfFlex: reactFlowContainer?.style.flex,
    svgWidth: rendererSvg?.getAttribute('width'),
    svgHeight: rendererSvg?.getAttribute('height'),
    svgOverflow: rendererSvg?.style.overflow
  };

  const bounds = normalizeRasterExportBounds(bbox.width + paddingPx * 2, bbox.height + paddingPx * 2 + headerOffset, pixelRatio);
  const exportWidth = bounds.width;
  const exportHeight = bounds.height;

  const hideSelectors = [
    '.react-flow__controls', '.react-flow__minimap', '.react-flow__background',
    'svg.react-flow__background', '.mini-map', '.react-flow__minimap-container',
    '.diagram-controls', '.single-menu-toggle-floating', '.menu-toggle-floating', '.menu-toggle-btn'
  ];

  try {
    root.style.width = `${exportWidth}px`;
    root.style.height = `${exportHeight}px`;
    root.style.overflow = 'visible';

    if (reactFlowContainer) {
      reactFlowContainer.style.width = `${exportWidth}px`;
      reactFlowContainer.style.height = `${Math.ceil(bbox.height + paddingPx * 2)}px`;
      if (headerOffset > 0) reactFlowContainer.style.flex = 'none';
    }

    if (rendererSvg) {
      rendererSvg.setAttribute('width', String(exportWidth));
      rendererSvg.setAttribute('height', String(Math.ceil(bbox.height + paddingPx * 2)));
      rendererSvg.style.overflow = 'visible';
    }

    return await temporarilyHideElements(hideSelectors, async () => {
      viewport.style.transform = `translate(${paddingPx - bbox.minX}px, ${paddingPx - bbox.minY}px) scale(1)`;
      await new Promise(resolve => setTimeout(resolve, 300));

      return (await import('html-to-image')).toPng(root, {
        backgroundColor: '#ffffff',
        quality: 1.0,
        pixelRatio: bounds.pixelRatio,
        cacheBust: true,
        width: exportWidth,
        height: exportHeight,
        style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
      });
    });
  } finally {
    if (backup.viewportTransform) viewport.style.transform = backup.viewportTransform; else viewport.style.removeProperty('transform');
    if (backup.rootWidth) root.style.width = backup.rootWidth; else root.style.removeProperty('width');
    if (backup.rootHeight) root.style.height = backup.rootHeight; else root.style.removeProperty('height');
    root.style.overflow = backup.rootOverflow;

    if (reactFlowContainer) {
      if (backup.rfWidth) reactFlowContainer.style.width = backup.rfWidth; else reactFlowContainer.style.removeProperty('width');
      if (backup.rfHeight) reactFlowContainer.style.height = backup.rfHeight; else reactFlowContainer.style.removeProperty('height');
      if (backup.rfFlex) reactFlowContainer.style.flex = backup.rfFlex; else reactFlowContainer.style.removeProperty('flex');
    }

    if (rendererSvg) {
      if (backup.svgWidth) rendererSvg.setAttribute('width', backup.svgWidth); else rendererSvg.removeAttribute('width');
      if (backup.svgHeight) rendererSvg.setAttribute('height', backup.svgHeight); else rendererSvg.removeAttribute('height');
      if (backup.svgOverflow) rendererSvg.style.overflow = backup.svgOverflow; else rendererSvg.style.removeProperty('overflow');
    }
  }
}

/**
 * 视口兜底：直接调整真实视口与容器尺寸进行整图导出（SVG）。
 * @param diagramId 图表实例ID
 * @param paddingPx 导出边距
 */
export async function exportFullDiagramByAdjustingViewportToSvgDataUrl(
  diagramId: string,
  paddingPx = 40
): Promise<string> {
  const root = getTargetDiagramElement(diagramId);
  if (!root) throw new Error('未找到架构图容器');

  const bbox = computeDiagramBBox() || computeDomBBox(root);
  if (!bbox) {
    return exportElementToSvgDataUrl(root, paddingPx);
  }

  const viewport = root.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!viewport) {
    return exportElementToSvgDataUrl(root, paddingPx);
  }

  const rendererSvg = root.querySelector('svg.react-flow__renderer') as SVGSVGElement | null;
  const prevTransformInline = viewport.style.transform;
  const prevTransformComputed = getComputedStyle(viewport).transform;
  const prevTransform = (prevTransformInline && prevTransformInline !== 'none') ? prevTransformInline : (prevTransformComputed || 'none');

  const prevRootWidth = root.style.width;
  const prevRootHeight = root.style.height;
  const prevRootOverflow = root.style.overflow;

  const prevSvgWidth = rendererSvg?.getAttribute('width') || null;
  const prevSvgHeight = rendererSvg?.getAttribute('height') || null;
  const prevSvgOverflow = rendererSvg?.style.overflow;

  const bounds = normalizeRasterExportBounds(bbox.width + paddingPx * 2, bbox.height + paddingPx * 2, 1);
  const exportWidth = bounds.width;
  const exportHeight = bounds.height;

  root.style.width = `${exportWidth}px`;
  root.style.height = `${exportHeight}px`;
  root.style.overflow = 'visible';
  if (rendererSvg) {
    rendererSvg.setAttribute('width', String(exportWidth));
    rendererSvg.setAttribute('height', String(exportHeight));
    rendererSvg.style.overflow = 'visible';
  }

  viewport.style.transform = `translate(${paddingPx - bbox.minX}px, ${paddingPx - bbox.minY}px) scale(1)`;
  viewport.style.overflow = 'visible';

  const hideSelectors = [
    '.react-flow__controls',
    '.react-flow__minimap',
    '.react-flow__background',
    '.mini-map',
    '.react-flow__minimap-container',
    '.diagram-controls',
    '.single-menu-toggle-floating',
    '.menu-toggle-floating',
    '.menu-toggle-btn'
  ];

  try {
    const dataUrl = await temporarilyHideElements(hideSelectors, async () => {
      // [FIX] 等待浏览器重排 Reflow/Repaint
      await new Promise(resolve => setTimeout(resolve, 300));

      return (await import('html-to-image')).toSvg(root, {
        backgroundColor: '#ffffff',
        quality: 1.0,
        cacheBust: true,
        width: exportWidth,
        height: exportHeight,
        // [FIX] 移除 style 中的 padding，因为 viewport 变换已经包含了 padding。
        // 保持 backgroundColor 确保背景不透明。
        style: { backgroundColor: '#ffffff', overflow: 'visible', padding: '0' }
      });
    });
    return dataUrl;
  } finally {
    viewport.style.transform = prevTransform === 'none' ? '' : prevTransform;
    root.style.width = prevRootWidth;
    root.style.height = prevRootHeight;
    root.style.overflow = prevRootOverflow;
    if (rendererSvg) {
      if (prevSvgWidth) rendererSvg.setAttribute('width', prevSvgWidth); else rendererSvg.removeAttribute('width');
      if (prevSvgHeight) rendererSvg.setAttribute('height', prevSvgHeight); else rendererSvg.removeAttribute('height');
      rendererSvg.style.overflow = prevSvgOverflow ?? '';
    }
  }
}
