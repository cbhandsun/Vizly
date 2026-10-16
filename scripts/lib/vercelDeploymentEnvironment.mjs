/** @param {unknown} value */
export function parseDeploymentEnvironment(value) {
  if (value !== 'preview' && value !== 'production') throw new Error('Invalid deployment environment');
  return value;
}

/** @param {unknown} value */
export function parseProductionWebSocketUrl(value) {
  if (typeof value !== 'string' || value.length > 1024 || !/^wss:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:\/[A-Za-z0-9._~/-]*)?$/.test(value)) throw new Error('Invalid production WebSocket endpoint');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Invalid production WebSocket endpoint'); }
  if (parsed.protocol !== 'wss:' || parsed.username || parsed.password || parsed.search || parsed.hash
    || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.localhost')
    || /^[0-9.]+$/.test(parsed.hostname) || parsed.hostname.length > 253
    || parsed.hostname.split('.').some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) throw new Error('Invalid production WebSocket endpoint');
  return value;
}

/** Exact quoted literals only; a hostname prefix or unrelated URL is not proof. */
/** @param {unknown} source @param {unknown} endpoint */
export function containsCompiledEndpoint(source, endpoint) {
  if (typeof source !== 'string' || typeof endpoint !== 'string') return false;
  if (endpoint.includes('`') || endpoint.includes('\\') || endpoint.includes('${')) return false;
  const templateQuote = String.fromCharCode(96);
  return source.includes(JSON.stringify(endpoint)) || source.includes(`'${endpoint}'`)
    || source.includes(templateQuote + endpoint + templateQuote);
}
