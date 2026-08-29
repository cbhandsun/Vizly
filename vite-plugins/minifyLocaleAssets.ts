import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Plugin } from 'vite';

const LOCALE_ASSET_PATTERN = /(?:^|\/)(?:en|zh)-[^/]+\.json$/;
const MAX_LOCALE_ASSET_BYTES = 2 * 1024 * 1024;

const toUtf8String = (source: string | Uint8Array): string => (
  typeof source === 'string' ? source : new TextDecoder().decode(source)
);

/** Minifies only the hashed locale assets emitted by the `?url` imports. */
export const minifyLocaleJsonAsset = (
  fileName: string,
  source: string | Uint8Array,
): string | Uint8Array => {
  if (!LOCALE_ASSET_PATTERN.test(fileName.replace(/\\/g, '/'))) return source;

  const raw = toUtf8String(source);
  if (new TextEncoder().encode(raw).byteLength > MAX_LOCALE_ASSET_BYTES) {
    throw new Error(`[vizly:locale-assets] Locale asset exceeds 2 MiB: ${fileName}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`[vizly:locale-assets] Invalid locale JSON: ${fileName}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[vizly:locale-assets] Locale root must be an object: ${fileName}`);
  }
  return JSON.stringify(parsed);
};

const normalizeModuleId = (id: string): string => id.replace(/\\/g, '/');

export const minifyLocaleAssetsPlugin = (projectRoot: string): Plugin => {
  const localePaths = new Set(['en.json', 'zh.json'].map(fileName => (
    normalizeModuleId(resolve(projectRoot, 'src/locales', fileName))
  )));

  return {
    name: 'vizly:minify-locale-assets',
    apply: 'build',
    enforce: 'pre',
    async load(id) {
      const [rawPath, query = ''] = normalizeModuleId(id).split('?', 2);
      if (!localePaths.has(rawPath) || !new URLSearchParams(query).has('url')) return null;
      const fileName = basename(rawPath);
      const source = await readFile(rawPath);
      const minified = minifyLocaleJsonAsset(`assets/${fileName.replace('.json', '-build.json')}`, source);
      const referenceId = this.emitFile({ type: 'asset', name: fileName, source: minified });
      return `export default import.meta.ROLLUP_FILE_URL_${referenceId};`;
    },
  };
};
