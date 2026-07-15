import type { DiagramRenderScene } from '../rendering/types';
import { exportRenderSceneToSvg, type SvgExportOptions } from './svgExport';

const DEFAULT_PREVIEW_MAX_SIDE = 720;
const MAX_PREVIEW_MAX_SIDE = 2_000;

export interface SvgPreviewModelOptions extends SvgExportOptions {
  maxPreviewSide?: number;
}

export interface SvgPreviewModel {
  svg: string;
  dataUrl: string;
  width: number;
  height: number;
  viewBox: string;
  previewWidth: number;
  previewHeight: number;
  scale: number;
  nodeCount: number;
  edgeCount: number;
  byteLength: number;
}

const normalizePreviewMaxSide = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_PREVIEW_MAX_SIDE;
  return Math.min(MAX_PREVIEW_MAX_SIDE, Math.max(120, value));
};

const utf8ByteLength = (value: string): number => new TextEncoder().encode(value).length;

export const buildSvgPreviewModel = (
  scene: DiagramRenderScene,
  options: SvgPreviewModelOptions = {},
): SvgPreviewModel => {
  const svg = exportRenderSceneToSvg(scene, options);
  const width = Math.ceil(scene.bounds.width);
  const height = Math.ceil(scene.bounds.height);
  const maxPreviewSide = normalizePreviewMaxSide(options.maxPreviewSide);
  const scale = width > 0 && height > 0
    ? Math.min(1, maxPreviewSide / Math.max(width, height))
    : 1;
  const previewWidth = Math.max(1, Math.round(width * scale));
  const previewHeight = Math.max(1, Math.round(height * scale));

  return {
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width,
    height,
    viewBox: `${scene.bounds.minX} ${scene.bounds.minY} ${scene.bounds.width} ${scene.bounds.height}`,
    previewWidth,
    previewHeight,
    scale,
    nodeCount: scene.nodes.length,
    edgeCount: scene.edges.length,
    byteLength: utf8ByteLength(svg),
  };
};
