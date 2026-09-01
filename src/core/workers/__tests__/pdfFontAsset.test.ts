import { describe, expect, it } from 'vitest';
import {
  createPdfFontUrlModule,
  decodePdfFontBase64,
} from '../../../../vite-plugins/pdfFontAsset';

describe('pdfFontAssetPlugin boundaries', () => {
  it('creates deterministic build and development URL modules', () => {
    expect(createPdfFontUrlModule('import.meta.ROLLUP_FILE_URL_font')).toBe(
      'export default import.meta.ROLLUP_FILE_URL_font;',
    );
    expect(createPdfFontUrlModule(JSON.stringify('/font.ttf'))).toBe(
      'export default "/font.ttf";',
    );
  });

  it('accepts a bounded TrueType payload', () => {
    const bytes = decodePdfFontBase64(Buffer.from([0, 1, 0, 0, 1]).toString('base64'));
    expect([...bytes]).toEqual([0, 1, 0, 0, 1]);
  });

  it.each([
    '',
    'not base64',
    Buffer.from([0, 0, 0, 0, 1]).toString('base64'),
  ])('rejects malformed or non-TrueType payloads', value => {
    expect(() => decodePdfFontBase64(value)).toThrow(/font payload/);
  });
});
