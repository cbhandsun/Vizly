import { setTimeout } from 'node:timers/promises';
import { constants } from 'node:os';
import { performance } from 'node:perf_hooks';

const knownSignals = new Set(Object.keys(constants.signals));
const knownErrorCodes = new Set([...Object.keys(constants.errno), 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER']);
/** @param {unknown} value @param {string} field @returns {unknown} */
const readField = (value, field) => {
  try { return value && typeof value === 'object' ? Reflect.get(value, field) : undefined; }
  catch { return undefined; }
};

// Only fixed vocabulary and bounded numbers may enter diagnostics. Child
// messages, output and environment can contain private host/provider details.
/** @param {string} message @param {number} attempt @param {number} elapsedMs @param {unknown} result */
const readinessError = (message, attempt, elapsedMs, result) => {
  const status = readField(result, 'status');
  const signal = readField(result, 'signal');
  const error = readField(result, 'error');
  const errorCode = readField(error, 'code');
  const diagnostics = Object.freeze({
    attempt,
    // This is the duration of the last individual probe, not the entire wait.
    elapsedMs: Number.isFinite(elapsedMs) ? Math.min(2147483647, Math.max(0, Math.round(elapsedMs))) : 'unknown',
    status: status === null ? null : typeof status === 'number' && Number.isInteger(status) && status >= -2147483648 && status <= 2147483647 ? status : 'unknown',
    signal: signal == null ? 'none' : typeof signal === 'string' && knownSignals.has(signal) ? signal : 'unknown',
    errorCode: error == null ? 'none' : typeof errorCode === 'string' && knownErrorCodes.has(errorCode) ? errorCode : 'unknown',
  });
  return Object.assign(new Error(`${message} (attempt=${diagnostics.attempt}, elapsedMs=${diagnostics.elapsedMs}, status=${diagnostics.status}, signal=${diagnostics.signal}, error.code=${diagnostics.errorCode})`), { diagnostics });
};

/**
 * The Docker image's initialization server accepts Unix socket connections,
 * then stops. Only the final server accepts TCP on the container loopback.
 * @param {{container: string, probe: (args: string[]) => unknown, pause?: () => Promise<void>}} options
 */
export const waitForIsolatedPostgres = async ({ container, probe, pause = () => setTimeout(500) }) => {
  if (typeof container !== 'string' || !/^vizly-rls-regression-[0-9]{1,12}$/.test(container)
    || typeof probe !== 'function' || typeof pause !== 'function') throw new Error('Invalid isolated Postgres readiness options');
  const args = ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'];
  let lastResult;
  let lastElapsedMs = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    const started = performance.now();
    const result = probe([...args]);
    lastElapsedMs = performance.now() - started;
    lastResult = result;
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || !('status' in result) || (result.status !== 0 && result.status !== 1 && result.status !== 2)
      || ('error' in result && result.error != null)
      || ('signal' in result && result.signal != null)) throw readinessError('Isolated Postgres readiness probe failed', attempt + 1, lastElapsedMs, result);
    if (result.status === 0) return;
    if (attempt < 29) await pause();
  }
  throw readinessError('Isolated Postgres did not become ready', 30, lastElapsedMs, lastResult);
};
