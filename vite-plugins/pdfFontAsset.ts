import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const PDF_FONT_VIRTUAL_ID = 'virtual:vizly-pdf-font-url';
const RESOLVED_PDF_FONT_VIRTUAL_ID = `\0${PDF_FONT_VIRTUAL_ID}`;
const PDF_FONT_DEV_URL = '/@vizly/vizly-noto-sans-sc.ttf';
const MAX_BASE64_FONT_CHARS = 8 * 1024 * 1024;
const MAX_PDF_FONT_BYTES = 6 * 1024 * 1024;

export const createPdfFontUrlModule = (urlExpression: string): string => (
  `export default ${urlExpression};`
);

export const decodePdfFontBase64 = (rawValue: unknown): Uint8Array => {
  if (
    typeof rawValue !== 'string'
    || rawValue.length === 0
    || rawValue.length > MAX_BASE64_FONT_CHARS
    || !/^[a-z0-9+/]+={0,2}$/i.test(rawValue)
  ) {
    throw new Error('[vizly:pdf-font-asset] Invalid bounded Base64 font payload');
  }
  const bytes = Buffer.from(rawValue, 'base64');
  if (
    bytes.length <= 4
    || bytes.length > MAX_PDF_FONT_BYTES
    || bytes[0] !== 0
    || bytes[1] !== 1
    || bytes[2] !== 0
    || bytes[3] !== 0
  ) {
    throw new Error('[vizly:pdf-font-asset] Invalid bounded TrueType font payload');
  }
  return bytes;
};

const readEmbeddedFontBase64 = async (dataPath: string): Promise<string> => {
  const source = await readFile(dataPath, 'utf8');
  if (source.length > MAX_BASE64_FONT_CHARS + 1_024) {
    throw new Error('[vizly:pdf-font-asset] Font module exceeds source limit');
  }
  const match = /^\s*(?:\/\/[^\r\n]*\r?\n)?export\s+default\s+(["'])([a-z0-9+/]+={0,2})\1\s*;?\s*$/i.exec(source);
  if (!match) throw new Error('[vizly:pdf-font-asset] Font module shape changed');
  return match[2];
};

export const pdfFontAssetPlugin = (projectRoot: string): Plugin => {
  const fontDataPath = resolve(projectRoot, 'node_modules/@reogrid/font-sc/data.js');
  let buildAssetReference: string | undefined;
  let fontBytesPromise: Promise<Uint8Array> | undefined;
  const loadFontBytes = (): Promise<Uint8Array> => {
    fontBytesPromise ??= readEmbeddedFontBase64(fontDataPath).then(decodePdfFontBase64);
    return fontBytesPromise;
  };

  return {
    name: 'vizly:pdf-font-asset',
    enforce: 'pre',
    async buildStart() {
      if (this.environment.config.command !== 'build') return;
      buildAssetReference = this.emitFile({
        type: 'asset',
        name: 'vizly-noto-sans-sc.ttf',
        source: await loadFontBytes(),
      });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== PDF_FONT_DEV_URL) {
          next();
          return;
        }
        try {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'font/ttf');
          response.setHeader('Cache-Control', 'no-store');
          response.end(await loadFontBytes());
        } catch (error) {
          next(error instanceof Error ? error : new Error('Failed to prepare PDF font asset'));
        }
      });
    },
    resolveId(id) {
      return id === PDF_FONT_VIRTUAL_ID ? RESOLVED_PDF_FONT_VIRTUAL_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_PDF_FONT_VIRTUAL_ID) return null;
      if (this.environment.config.command !== 'build') {
        return createPdfFontUrlModule(JSON.stringify(PDF_FONT_DEV_URL));
      }
      if (!buildAssetReference) {
        throw new Error('[vizly:pdf-font-asset] PDF font build asset was not emitted');
      }
      return createPdfFontUrlModule(`import.meta.ROLLUP_FILE_URL_${buildAssetReference}`);
    },
  };
};
