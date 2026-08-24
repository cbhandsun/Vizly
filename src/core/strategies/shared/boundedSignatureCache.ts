export function rememberBoundedSignatureValue<T>(
  cache: Map<string, T>,
  signature: string,
  value: T,
  limit: number,
): void {
  if (cache.has(signature)) cache.delete(signature);
  cache.set(signature, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== 'string') break;
    cache.delete(oldest);
  }
}

export function readSignatureValue<T>(cache: Map<string, T>, signature: string): T | undefined {
  const value = cache.get(signature);
  if (typeof value === 'undefined') return undefined;
  cache.delete(signature);
  cache.set(signature, value);
  return value;
}
