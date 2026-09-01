// @vitest-environment jsdom

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRenderSceneFromReactFlow } from '../../rendering/reactFlowScene';
import {
  exportRenderSceneToPdfBlob,
  isValidVectorPdfFontBytes,
  normalizeVectorPdfPageGeometry,
  ScenePdfExportError,
} from '../../export/scenePdfExport';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeVectorPdfPageGeometry', () => {
  it('preserves ordinary scene dimensions', () => {
    expect(normalizeVectorPdfPageGeometry(2_240, 1_840)).toEqual({
      width: 2_240,
      height: 1_840,
      scale: 1,
    });
  });

  it('proportionally scales extreme scenes to the PDF page limit', () => {
    expect(normalizeVectorPdfPageGeometry(50_000, 25_000)).toEqual({
      width: 14_400,
      height: 7_200,
      scale: 0.288,
    });
  });

  it.each([
    [0, 100],
    [-1, 100],
    [100, Number.NaN],
    [Number.POSITIVE_INFINITY, 100],
    ['100', 100],
    [null, 100],
  ])('rejects invalid dimensions %#', (width, height) => {
    expect(() => normalizeVectorPdfPageGeometry(width, height)).toThrow(ScenePdfExportError);
  });
});

describe('isValidVectorPdfFontBytes', () => {
  it('accepts a bounded TrueType signature', () => {
    expect(isValidVectorPdfFontBytes(new Uint8Array([0, 1, 0, 0, 1]))).toBe(true);
  });

  it.each([
    undefined,
    new Uint8Array(),
    new Uint8Array([0, 0, 0, 0, 1]),
    new Uint8Array(6 * 1024 * 1024 + 1),
  ])('rejects empty, malformed, typed, and oversized values %#', value => {
    expect(isValidVectorPdfFontBytes(value)).toBe(false);
  });
});

describe('exportRenderSceneToPdfBlob', () => {
  it('creates an embedded-font vector PDF without raster image objects', async () => {
    const fontModule = await readFile(
      resolve(process.cwd(), 'node_modules/@reogrid/font-sc/data.js'),
      'utf8',
    );
    const fontBase64 = /^\s*(?:\/\/[^\r\n]*\r?\n)?export\s+default\s+(["'])([a-z0-9+/]+={0,2})\1\s*;?\s*$/i.exec(fontModule)?.[2];
    if (!fontBase64) throw new Error('Test PDF font fixture is invalid');
    const fontBytes = Uint8Array.from(Buffer.from(fontBase64, 'base64'));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(fontBytes, {
      headers: { 'content-length': String(fontBytes.length), 'content-type': 'font/ttf' },
      status: 200,
    })));

    const nodes: Node[] = [
      { id: 'source', position: { x: 0, y: 0 }, measured: { width: 140, height: 72 }, data: { label: '订单中心' } },
      { id: 'target', position: { x: 260, y: 0 }, measured: { width: 140, height: 72 }, data: { label: '仓储管理' } },
    ];
    const edges: Edge[] = [{
      id: 'route',
      source: 'source',
      target: 'target',
      label: '仓储指令',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb' },
    }];
    const canvasContextDescriptor = Object.getOwnPropertyDescriptor(
      HTMLCanvasElement.prototype,
      'getContext',
    );
    const svgBoundingBoxDescriptor = Object.getOwnPropertyDescriptor(
      SVGElement.prototype,
      'getBBox',
    );
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({
        font: '',
        measureText: (text: string) => ({ width: text.length * 8 }),
      }),
    });
    Object.defineProperty(SVGElement.prototype, 'getBBox', {
      configurable: true,
      value: () => ({ height: 16, width: 120, x: 0, y: 0 }),
    });
    let blob: Blob;
    try {
      blob = await exportRenderSceneToPdfBlob(
        buildRenderSceneFromReactFlow(nodes, edges, { padding: 24 }),
        { includeBackground: true, title: '矢量导出验证' },
      );
    } finally {
      if (canvasContextDescriptor) {
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', canvasContextDescriptor);
      }
      if (svgBoundingBoxDescriptor) {
        Object.defineProperty(SVGElement.prototype, 'getBBox', svgBoundingBoxDescriptor);
      } else {
        Reflect.deleteProperty(SVGElement.prototype, 'getBBox');
      }
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdfSource = Buffer.from(bytes).toString('latin1');

    expect(blob.type).toBe('application/pdf');
    expect(bytes.byteLength).toBeGreaterThan(4_096);
    expect(pdfSource.startsWith('%PDF-')).toBe(true);
    expect(pdfSource.match(/\/Type\s*\/Page\b/g)?.length).toBeGreaterThan(0);
    expect(pdfSource.match(/\/Type\s*\/Font\b/g)?.length).toBeGreaterThan(0);
    expect(pdfSource.match(/\/FontFile(?:2|3)?\b/g)?.length).toBeGreaterThan(0);
    expect(pdfSource.match(/\/Subtype\s*\/Image\b/g)).toBeNull();
  });
});
