import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { TextDecoder } from 'node:util';
import type { Plugin } from 'vite';
import { STANDARD_PRESET_KEYS } from '../src/data/standardized/presetMetadata';

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_VALUES = 100_000;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Preserve every parsed document field; only insignificant JSON whitespace changes. */
export function minifyBoundedJsonAsset(source: unknown): string {
  if (typeof source !== 'string') throw new Error('JSON asset must be UTF-8 text');
  if (Buffer.byteLength(source, 'utf8') > MAX_ASSET_BYTES) throw new Error('JSON asset exceeds 2 MiB');
  let value: unknown;
  try { value = JSON.parse(source); } catch { throw new Error('Invalid JSON asset'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON asset root must be an object');
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop();
    if (!current) break;
    if (++count > MAX_VALUES) throw new Error('JSON asset contains too many values');
    if (current.depth > MAX_DEPTH) throw new Error('JSON asset is too deeply nested');
    if (!current.value || typeof current.value !== 'object') {
      if (typeof current.value === 'number' && !Number.isFinite(current.value)) throw new Error('JSON asset contains a non-finite number');
      continue;
    }
    for (const [key, child] of Object.entries(current.value)) {
      if (UNSAFE_KEYS.has(key)) throw new Error('JSON asset contains an unsafe key');
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return JSON.stringify(value);
}

export function boundedJsonAssetsPlugin(): Plugin {
  let allowedPaths = new Set<string>();
  return {
    name: 'vizly:bounded-json-assets',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) {
      allowedPaths = new Set([
        ...['en', 'zh'].map(locale => resolve(config.root, `src/locales/${locale}.json`)),
        ...STANDARD_PRESET_KEYS.map(preset => resolve(config.root, `src/data/standardized/${preset}.json`)),
      ]);
    },
    async load(id) {
      const queryIndex = id.indexOf('?');
      if (queryIndex === -1) return null;
      const filePath = resolve(id.slice(0, queryIndex));
      const query = new URLSearchParams(id.slice(queryIndex + 1));
      if (!query.has('url') || [...query.keys()].some(key => key !== 'url' && key !== 'no-inline')
        || !allowedPaths.has(filePath)) return null;
      if (await realpath(filePath) !== filePath) throw new Error('JSON asset symlinks are not supported');
      if ((await stat(filePath)).size > MAX_ASSET_BYTES) throw new Error('JSON asset exceeds 2 MiB');
      const bytes = await readFile(filePath);
      let text: string;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch { throw new Error('JSON asset is not valid UTF-8'); }
      const source = minifyBoundedJsonAsset(text);
      this.addWatchFile(filePath);
      const reference = this.emitFile({ type: 'asset', name: basename(filePath), originalFileName: filePath, source });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
  };
}
