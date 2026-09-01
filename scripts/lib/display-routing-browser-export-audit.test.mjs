import { describe, expect, it } from 'vitest';

import {
  assertDisplayRoutingExportAvailability,
  assertDisplayRoutingExportCapture,
  formatDisplayRoutingExportMatrix,
} from './display-routing-browser-export-audit.mjs';

const svgCapture = {
  format: 'svg',
  mimeType: 'image/svg+xml',
  byteLength: 8_000,
  headerHex: 'svg',
  svg: {
    logicalEdgeCount: 14,
    edgeGroupCount: 19,
    semanticPathCount: 19,
    pathDataTotalChars: 1_024,
    pathFingerprint: '12abcdef',
    nonFinitePathCount: 0,
    markerDefinitionCount: 2,
    duplicateMarkerDefinitionCount: 0,
    markerReferenceCount: 14,
    unresolvedMarkerReferenceCount: 0,
    duplicateMarkerRoleCount: 0,
    markerCarrierCount: 3,
    markerCarrierWithVisibleStrokeCount: 0,
    interactionPathCount: 0,
    nodeGroupCount: 12,
    unsafeElementCount: 0,
    inlineEventCount: 0,
    externalHrefCount: 0,
  },
};

const pdfCapture = {
  format: 'pdf',
  mimeType: 'application/pdf',
  byteLength: 4_096,
  headerHex: '255044462d312e3700000000',
  pdf: {
    pageObjectCount: 1,
    fontObjectCount: 4,
    embeddedFontFileCount: 1,
    imageObjectCount: 0,
  },
};

describe('display routing browser export audit', () => {
  it.each([
    ['png', { format: 'png', mimeType: 'image/png', byteLength: 4_096, headerHex: '89504e470d0a1a0a00000000' }],
    ['pdf', pdfCapture],
    ['svg', svgCapture],
  ])('accepts a bounded and structurally valid %s export', (format, capture) => {
    expect(assertDisplayRoutingExportCapture({
      format,
      capture,
      expectedLogicalEdgeCount: 14,
    })).toBe(capture);
  });

  it.each([
    ['unsafe SVG element', { svg: { ...svgCapture.svg, unsafeElementCount: 1 } }],
    ['duplicate marker role', { svg: { ...svgCapture.svg, duplicateMarkerRoleCount: 1 } }],
    ['interaction path leaked', { svg: { ...svgCapture.svg, interactionPathCount: 1 } }],
    ['wrong logical edge count', { svg: { ...svgCapture.svg, logicalEdgeCount: 13 } }],
    ['non-finite path', { svg: { ...svgCapture.svg, nonFinitePathCount: 1 } }],
  ])('fails closed for %s', (_name, override) => {
    expect(() => assertDisplayRoutingExportCapture({
      format: 'svg',
      capture: { ...svgCapture, ...override },
      expectedLogicalEdgeCount: 14,
    })).toThrow(/export audit failed/);
  });

  it.each([
    ['raster image object', { imageObjectCount: 1 }],
    ['missing PDF page', { pageObjectCount: 0 }],
    ['missing font object', { fontObjectCount: 0 }],
    ['font without embedded bytes', { embeddedFontFileCount: 0 }],
  ])('rejects PDF output with %s', (_name, pdfOverride) => {
    expect(() => assertDisplayRoutingExportCapture({
      format: 'pdf',
      capture: { ...pdfCapture, pdf: { ...pdfCapture.pdf, ...pdfOverride } },
      expectedLogicalEdgeCount: 14,
    })).toThrow(/export audit failed/);
  });

  it('rejects malformed, empty and oversized binary captures', () => {
    for (const capture of [
      null,
      { format: 'png', mimeType: 'image/png', byteLength: 0, headerHex: '' },
      { format: 'png', mimeType: 'image/png', byteLength: 70 * 1024 * 1024, headerHex: '89504e470d0a1a0a' },
      { format: 'pdf', mimeType: 'application/pdf', byteLength: 2_048, headerHex: '00000000' },
    ]) {
      expect(() => assertDisplayRoutingExportCapture({
        format: capture?.format ?? 'png',
        capture,
        expectedLogicalEdgeCount: 14,
      })).toThrow(/export audit failed/);
    }
  });

  it('keeps licensed export verification strict without failing the anonymous gate', () => {
    expect(assertDisplayRoutingExportAvailability({
      format: 'svg',
      status: 'preview-entitlement-gated',
      requireLicensedExports: false,
    })).toBe('preview-entitlement-gated');
    expect(() => assertDisplayRoutingExportAvailability({
      format: 'pdf',
      status: 'entitlement-gated',
      requireLicensedExports: true,
    })).toThrow(/licensed browser verification profile/);
    expect(assertDisplayRoutingExportAvailability({
      format: 'pdf',
      status: 'downloaded',
      requireLicensedExports: true,
    })).toBe('downloaded');
  });

  it('formats only bounded aggregate export evidence', () => {
    expect(formatDisplayRoutingExportMatrix([])).toBe('');
    expect(formatDisplayRoutingExportMatrix([
      { format: 'png', status: 'downloaded', byteLength: 2_048 },
      { format: 'pdf', status: 'entitlement-gated', byteLength: null },
    ])).toBe('exports: png/downloaded/2KiB, pdf/entitlement-gated.');
  });
});
