/**
 * @param {unknown} endpoint
 * @param {{timeoutMs?: number, fetchImpl?: typeof fetch}} [options]
 */
export const probeS3Readiness = async (endpoint, { timeoutMs = 1000, fetchImpl = fetch } = {}) => {
  const portMatch = typeof endpoint === 'string' && endpoint.length <= 64
    ? /^http:\/\/127\.0\.0\.1:(\d+)$/.exec(endpoint) : null;
  const port = portMatch ? Number(portMatch[1]) : NaN;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid isolated S3 endpoint');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 1000 || typeof fetchImpl !== 'function') {
    throw new Error('Invalid isolated S3 readiness options');
  }
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  // AbortSignal.timeout uses an unreferenced timer. A pending fetch must keep
  // this standalone gate alive until its bounded readiness decision settles.
  /** @type {Promise<boolean>} */
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);
  });
  const request = (async () => {
    try {
      const response = await fetchImpl(`${endpoint}/minio/health/ready`, {
        signal: controller.signal, redirect: 'error',
      });
      await response.body?.cancel();
      return response.ok;
    } catch {
      // Connection refusal and abort are expected while the owned service starts.
      return false;
    }
  })();
  try {
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timer);
  }
};
