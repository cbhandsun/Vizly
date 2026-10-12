import { setTimeout } from 'node:timers/promises';

/**
 * The Docker image's initialization server accepts Unix socket connections,
 * then stops. Only the final server accepts TCP on the container loopback.
 * @param {{container: string, probe: (args: string[]) => unknown, pause?: () => Promise<void>}} options
 */
export const waitForIsolatedPostgres = async ({ container, probe, pause = () => setTimeout(500) }) => {
  if (typeof container !== 'string' || !/^vizly-rls-regression-[0-9]{1,12}$/.test(container)
    || typeof probe !== 'function' || typeof pause !== 'function') throw new Error('Invalid isolated Postgres readiness options');
  const args = ['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'];
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = probe([...args]);
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || !('status' in result) || (result.status !== 0 && result.status !== 1 && result.status !== 2)
      || ('error' in result && result.error != null)
      || ('signal' in result && result.signal != null)) throw new Error('Isolated Postgres readiness probe failed');
    if (result.status === 0) return;
    if (attempt < 29) await pause();
  }
  throw new Error('Isolated Postgres did not become ready');
};
