import { posix } from 'node:path';

const MAX_MANIFEST_SOURCE_LENGTH = 4 * 1024 * 1024;
const MAX_STATIC_ASSET_COUNT = 10_000;
const SAFE_ASSET_PATH = /^[A-Za-z0-9._/-]+\.js$/;

const normalizeAssetPath = value => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) {
    throw new Error('Invalid bundle asset path');
  }
  const withoutQuery = value.split(/[?#]/, 1)[0].replace(/^\/+/, '');
  const normalized = posix.normalize(withoutQuery);
  if (!SAFE_ASSET_PATH.test(normalized)
    || normalized === '..'
    || normalized.startsWith('../')
    || !normalized.startsWith('assets/')) {
    throw new Error(`Unsafe bundle asset path: ${value}`);
  }
  return normalized;
};

export const parseViteModuleEntry = html => {
  if (typeof html !== 'string' || html.length === 0 || html.length > MAX_MANIFEST_SOURCE_LENGTH) {
    throw new Error('Invalid Vite entry HTML');
  }
  const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
  for (const script of scripts) {
    if (!/\btype\s*=\s*["']module["']/i.test(script)) continue;
    const source = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(script)?.[1];
    if (source) return normalizeAssetPath(source);
  }
  throw new Error('Vite module entry was not found');
};

export const readStaticJsImports = source => {
  if (typeof source !== 'string' || source.length > MAX_MANIFEST_SOURCE_LENGTH) {
    throw new Error('Invalid JavaScript asset source');
  }
  const imports = [];
  const pattern = /(?:^|[;\n])\s*import\s*(?!\()(?:[^"'();]*?from\s*)?["']([^"']+\.js(?:[?#][^"']*)?)["']/g;
  for (const match of source.matchAll(pattern)) imports.push(match[1]);
  return imports;
};

const resolveStaticAssetPath = (importer, specifier) => {
  if (typeof specifier !== 'string' || !specifier.startsWith('.')) {
    throw new Error(`Unsupported static bundle import: ${String(specifier).slice(0, 80)}`);
  }
  return normalizeAssetPath(posix.join(posix.dirname(importer), specifier));
};

export const collectStaticJsAssetPaths = (entry, sourceByPath) => {
  const normalizedEntry = normalizeAssetPath(entry);
  if (!(sourceByPath instanceof Map)) throw new Error('Invalid bundle source map');
  const pending = [normalizedEntry];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    if (visited.size >= MAX_STATIC_ASSET_COUNT) {
      throw new Error('Static bundle import graph exceeds supported size');
    }
    const source = sourceByPath.get(current);
    if (typeof source !== 'string') throw new Error(`Missing static bundle asset: ${current}`);
    visited.add(current);
    for (const specifier of readStaticJsImports(source)) {
      pending.push(resolveStaticAssetPath(current, specifier));
    }
  }
  return [...visited];
};
