import type { DiagramRenderScene } from '../rendering/types';
import { exportRenderSceneToSvg } from './svgExport';
import pdfFontUrl from 'virtual:vizly-pdf-font-url';

const PDF_FONT_FILE = 'VizlyNotoSansSC.ttf';
const PDF_FONT_FAMILY = 'VizlyNotoSansSC';
const MAX_PDF_PAGE_SIDE_PT = 14_400;
const MAX_PDF_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_PDF_FONT_BYTES = 6 * 1024 * 1024;
const BYTE_STRING_CHUNK = 0x8000;
const MAX_PDF_TEXT_COORDINATE = 50_000;
const MAX_PDF_BULLET_FONT_SIZE = 512;
const MAX_PDF_BULLET_TEXT_CHARS = 10_000;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export interface ScenePdfExportOptions {
  title?: string;
  includeBackground?: boolean;
}

export interface VectorPdfPageGeometry {
  height: number;
  scale: number;
  width: number;
}

export interface VectorPdfLeadingBulletDecoration {
  circleX: number;
  circleY: number;
  radius: number;
  text: string;
  textX: number;
}

export type ScenePdfExportErrorCode =
  | 'PDF_EXPORT_INVALID_DIMENSIONS'
  | 'PDF_EXPORT_FONT_LOAD'
  | 'PDF_EXPORT_INVALID_SVG'
  | 'PDF_EXPORT_OUTPUT_LIMIT';

export class ScenePdfExportError extends Error {
  readonly code: ScenePdfExportErrorCode;

  constructor(code: ScenePdfExportErrorCode, message: string) {
    super(message);
    this.name = 'ScenePdfExportError';
    this.code = code;
  }
}

export const normalizeVectorPdfPageGeometry = (
  width: unknown,
  height: unknown,
): VectorPdfPageGeometry => {
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    throw new ScenePdfExportError(
      'PDF_EXPORT_INVALID_DIMENSIONS',
      'Invalid vector PDF dimensions',
    );
  }
  const scale = Math.min(1, MAX_PDF_PAGE_SIDE_PT / Math.max(width, height));
  const roundPageUnit = (value: number): number => Math.round(value * 1_000) / 1_000;
  return {
    width: roundPageUnit(width * scale),
    height: roundPageUnit(height * scale),
    scale,
  };
};

const fontBytesToBinaryString = (bytes: Uint8Array): string => {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += BYTE_STRING_CHUNK) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + BYTE_STRING_CHUNK)));
  }
  return chunks.join('');
};

export const isValidVectorPdfFontBytes = (bytes: unknown): bytes is Uint8Array => (
  bytes instanceof Uint8Array
  && bytes.length > 4
  && bytes.length <= MAX_PDF_FONT_BYTES
  && bytes[0] === 0
  && bytes[1] === 1
  && bytes[2] === 0
  && bytes[3] === 0
);

const loadPdfFontBytes = async (): Promise<Uint8Array> => {
  const response = await fetch(pdfFontUrl, { credentials: 'same-origin' });
  const declaredLength = Number(response.headers.get('content-length'));
  if (!response.ok || (Number.isFinite(declaredLength) && declaredLength > MAX_PDF_FONT_BYTES)) {
    throw new ScenePdfExportError('PDF_EXPORT_FONT_LOAD', 'Vector PDF font asset is unavailable');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isValidVectorPdfFontBytes(bytes)) {
    throw new ScenePdfExportError('PDF_EXPORT_FONT_LOAD', 'Vector PDF font asset is invalid');
  }
  return bytes;
};

const parsePdfSvgElement = (markup: string): SVGSVGElement => {
  const documentNode = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = documentNode.documentElement;
  if (
    documentNode.querySelector('parsererror')
    || root.localName.toLowerCase() !== 'svg'
    || root.namespaceURI !== 'http://www.w3.org/2000/svg'
  ) {
    throw new ScenePdfExportError('PDF_EXPORT_INVALID_SVG', 'Invalid vector PDF SVG');
  }
  root.querySelectorAll('text').forEach(text => {
    const bullet = resolveVectorPdfLeadingBulletDecoration({
      content: text.textContent,
      fontSize: text.getAttribute('font-size'),
      textAnchor: text.getAttribute('text-anchor'),
      x: text.getAttribute('x'),
      y: text.getAttribute('y'),
    });
    const fill = text.getAttribute('fill')?.trim();
    if (bullet && fill && fill !== 'none' && fill !== 'transparent' && text.parentNode) {
      const circle = documentNode.createElementNS(SVG_NAMESPACE, 'circle');
      circle.setAttribute('cx', String(bullet.circleX));
      circle.setAttribute('cy', String(bullet.circleY));
      circle.setAttribute('r', String(bullet.radius));
      circle.setAttribute('fill', fill);
      const opacity = text.getAttribute('opacity');
      if (opacity) circle.setAttribute('opacity', opacity);
      const fillOpacity = text.getAttribute('fill-opacity');
      if (fillOpacity) circle.setAttribute('fill-opacity', fillOpacity);
      text.parentNode.insertBefore(circle, text);
      text.textContent = bullet.text;
      text.setAttribute('x', String(bullet.textX));
    }
    text.setAttribute('font-family', PDF_FONT_FAMILY);
    const syntheticStrokeWidth = resolveVectorPdfSyntheticTextStrokeWidth(
      text.getAttribute('font-weight') ?? '400',
    );
    if (syntheticStrokeWidth > 0 && fill && fill !== 'none' && fill !== 'transparent') {
      text.setAttribute('stroke', fill);
      text.setAttribute('stroke-width', String(syntheticStrokeWidth));
      text.setAttribute('stroke-linejoin', 'round');
      text.setAttribute('paint-order', 'stroke fill');
    }
  });
  return root as unknown as SVGSVGElement;
};

const parseBoundedPdfNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
): number | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

const roundPdfUnit = (value: number): number => Math.round(value * 1_000) / 1_000;

export const resolveVectorPdfLeadingBulletDecoration = ({
  content,
  fontSize,
  textAnchor,
  x,
  y,
}: {
  content: unknown;
  fontSize: unknown;
  textAnchor: unknown;
  x: unknown;
  y: unknown;
}): VectorPdfLeadingBulletDecoration | null => {
  if (
    typeof content !== 'string'
    || content.length === 0
    || content.length > MAX_PDF_BULLET_TEXT_CHARS
    || (textAnchor !== null && textAnchor !== 'start')
  ) {
    return null;
  }
  const match = /^\s*•\s+([\s\S]*\S)\s*$/u.exec(content);
  if (!match) return null;
  const parsedX = parseBoundedPdfNumber(x, -MAX_PDF_TEXT_COORDINATE, MAX_PDF_TEXT_COORDINATE);
  const parsedY = parseBoundedPdfNumber(y, -MAX_PDF_TEXT_COORDINATE, MAX_PDF_TEXT_COORDINATE);
  const parsedFontSize = parseBoundedPdfNumber(fontSize, 1, MAX_PDF_BULLET_FONT_SIZE);
  if (parsedX === null || parsedY === null || parsedFontSize === null) return null;
  return {
    circleX: roundPdfUnit(parsedX + parsedFontSize * 0.18),
    circleY: parsedY,
    radius: roundPdfUnit(Math.max(0.8, parsedFontSize * 0.105)),
    text: match[1],
    textX: roundPdfUnit(parsedX + parsedFontSize * 0.72),
  };
};

export const resolveVectorPdfSyntheticTextStrokeWidth = (fontWeight: unknown): number => {
  if (typeof fontWeight !== 'string') return 0;
  const normalized = fontWeight.trim().toLowerCase();
  const numericWeight = normalized === 'normal'
    ? 400
    : normalized === 'bold' || normalized === 'bolder'
      ? 700
      : /^\d{3}$/u.test(normalized) ? Number(normalized) : 0;
  if (numericWeight < 400 || numericWeight > 900) return 0;
  return [0.24, 0.36, 0.7, 1.15][Math.min(3, Math.floor((numericWeight - 400) / 100))];
};

export const exportRenderSceneToPdfBlob = async (
  scene: DiagramRenderScene,
  options: ScenePdfExportOptions = {},
): Promise<Blob> => {
  const svgMarkup = exportRenderSceneToSvg(scene, options);
  const svgElement = parsePdfSvgElement(svgMarkup);
  const page = normalizeVectorPdfPageGeometry(scene.bounds.width, scene.bounds.height);
  const [{ jsPDF }, { svg2pdf }, fontBytes] = await Promise.all([
    import('jspdf'),
    import('svg2pdf.js/dist/svg2pdf.es.min.js'),
    loadPdfFontBytes(),
  ]);
  const pdf = new jsPDF({
    compress: true,
    format: [page.width, page.height],
    orientation: page.width > page.height ? 'landscape' : 'portrait',
    putOnlyUsedFonts: true,
    unit: 'pt',
  });
  const fontBinary = fontBytesToBinaryString(fontBytes);
  pdf.addFileToVFS(PDF_FONT_FILE, fontBinary);
  pdf.addFont(PDF_FONT_FILE, PDF_FONT_FAMILY, 'normal', 400, 'Identity-H');
  pdf.addFont(PDF_FONT_FILE, PDF_FONT_FAMILY, 'normal', 600, 'Identity-H');
  pdf.addFont(PDF_FONT_FILE, PDF_FONT_FAMILY, 'normal', 700, 'Identity-H');
  await svg2pdf(svgElement, pdf, {
    height: page.height,
    loadExternalStyleSheets: false,
    loadImages: false,
    width: page.width,
    x: 0,
    y: 0,
  });
  const bytes = pdf.output('arraybuffer');
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength <= 0 || bytes.byteLength > MAX_PDF_OUTPUT_BYTES) {
    throw new ScenePdfExportError(
      'PDF_EXPORT_OUTPUT_LIMIT',
      'Invalid vector PDF output size',
    );
  }
  return new Blob([bytes], { type: 'application/pdf' });
};
