import type { DiagramRenderScene } from '../rendering/types';
import { exportRenderSceneToSvg } from './svgExport';
import pdfFontUrl from 'virtual:vizly-pdf-font-url';

const PDF_FONT_FILE = 'VizlyNotoSansSC.ttf';
const PDF_FONT_FAMILY = 'VizlyNotoSansSC';
const MAX_PDF_PAGE_SIDE_PT = 14_400;
const MAX_PDF_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_PDF_FONT_BYTES = 6 * 1024 * 1024;
const BYTE_STRING_CHUNK = 0x8000;

export interface ScenePdfExportOptions {
  title?: string;
  includeBackground?: boolean;
}

export interface VectorPdfPageGeometry {
  height: number;
  scale: number;
  width: number;
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
      'Vector PDF dimensions must be finite and positive',
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
    throw new ScenePdfExportError('PDF_EXPORT_INVALID_SVG', 'Vector PDF source SVG is invalid');
  }
  root.querySelectorAll('text').forEach(text => {
    text.setAttribute('font-family', PDF_FONT_FAMILY);
    const syntheticStrokeWidth = resolveVectorPdfSyntheticTextStrokeWidth(
      text.getAttribute('font-weight'),
    );
    const fill = text.getAttribute('fill')?.trim();
    if (syntheticStrokeWidth > 0 && fill && fill !== 'none' && fill !== 'transparent') {
      text.setAttribute('stroke', fill);
      text.setAttribute('stroke-width', String(syntheticStrokeWidth));
      text.setAttribute('stroke-linejoin', 'round');
      text.setAttribute('paint-order', 'stroke fill');
    }
  });
  return root as unknown as SVGSVGElement;
};

export const resolveVectorPdfSyntheticTextStrokeWidth = (fontWeight: unknown): number => {
  if (typeof fontWeight !== 'string') return 0;
  const normalized = fontWeight.trim().toLowerCase();
  if (normalized === 'bold' || normalized === 'bolder') return 0.45;
  if (!/^\d{3}$/u.test(normalized)) return 0;
  const numericWeight = Number(normalized);
  if (numericWeight > 900) return 0;
  if (numericWeight >= 700) return 0.45;
  if (numericWeight >= 600) return 0.28;
  return 0;
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
      'Vector PDF output is empty or exceeds the size limit',
    );
  }
  return new Blob([bytes], { type: 'application/pdf' });
};
