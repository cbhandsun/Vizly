import { readFile } from 'node:fs/promises';

const LOCAL_DIST_INDEX_URL = new URL('../../dist/index.html', import.meta.url);
const VITE_ENTRY_ASSET_PATTERN = /<script[^>]+src=["']([^"']*\/assets\/[^"']+\.js)["']/i;

const readViteEntryAsset = (html) => {
  if (typeof html !== 'string' || html.length > 2_000_000) return null;
  const match = html.match(VITE_ENTRY_ASSET_PATTERN);
  if (!match) return null;
  try {
    const pathname = new URL(match[1], 'http://vizly.invalid').pathname;
    return /^\/assets\/[A-Za-z0-9._-]{1,240}\.js$/.test(pathname) ? pathname : null;
  } catch {
    return null;
  }
};

export const assertDisplayRoutingProductionPreview = async (
  baseUrl,
  fetchImpl = fetch,
  readLocalIndex = () => readFile(LOCAL_DIST_INDEX_URL, 'utf8'),
) => {
  if (!baseUrl) {
    throw new Error(
      'PRECOMPILED_ROUTE_BASE_URL must point to a production `vite preview` server',
    );
  }
  const response = await fetchImpl(`${baseUrl}/`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Production preview returned HTTP ${response.status}`);
  const html = await response.text();
  const servedEntryAsset = readViteEntryAsset(html);
  if (
    html.includes('/@vite/client')
    || !servedEntryAsset
  ) {
    throw new Error('PRECOMPILED_ROUTE_BASE_URL is not a production Vite preview');
  }
  let localHtml;
  try {
    localHtml = await readLocalIndex();
  } catch {
    throw new Error('Local production build is unavailable; run `npm run build` first');
  }
  const localEntryAsset = readViteEntryAsset(localHtml);
  if (!localEntryAsset) {
    throw new Error('Local production build has no valid Vite entry asset');
  }
  if (servedEntryAsset !== localEntryAsset) {
    throw new Error('Production preview does not match the current local build');
  }
};
