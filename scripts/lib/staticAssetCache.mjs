export const STATIC_ASSET_CACHE_POLICY = 'fingerprinted-assets-v1';
export const IMMUTABLE_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Restrict long-lived caching to compiler-style opaque names in /assets.
 * Readable version names and unhashed public files keep normal revalidation.
 * @param {unknown} name
 */
export function isFingerprintedStaticAsset(name) {
  if (typeof name !== 'string' || name.length > 512) return false;
  const match = /^assets\/[A-Za-z0-9_.-]+-([A-Za-z0-9_-]{8})\.(?:js|css|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|wasm)$/.exec(name);
  return !!match && /[A-Z0-9_]/.test(match[1]);
}

/** Exact inventoried paths only: a hash-looking missing file must stay a 404.
 * @param {readonly string[]} names
 */
export function fingerprintedAssetCacheRoutes(names) {
  if (!Array.isArray(names) || names.length > 5000 || names.some(name => typeof name !== 'string' || name.length > 512)) {
    throw new Error('Invalid static cache inventory');
  }
  const paths = [...new Set(names.filter(isFingerprintedStaticAsset))].sort();
  const batches = [];
  let current = [];
  let length = 0;
  for (const path of paths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (current.length && (current.length >= 32 || length + escaped.length > 3000)) {
      batches.push(current); current = []; length = 0;
    }
    current.push(escaped); length += escaped.length + 1;
  }
  if (current.length) batches.push(current);
  if (batches.length > 256) throw new Error('Static cache routing budget exceeded');
  return batches.map(batch => ({ src: '^/(?:' + batch.join('|') + ')$', methods: ['GET', 'HEAD'],
    caseSensitive: true, headers: { 'Cache-Control': IMMUTABLE_ASSET_CACHE_CONTROL }, continue: true }));
}
