// @vitest-environment node
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const factories = vi.hoisted(() => ({ file: vi.fn(), cloud: vi.fn() }));
vi.mock('./telemetryJournal.js', () => ({ createTelemetryJournal: factories.file }));
vi.mock('./supabaseTelemetryJournal.js', () => ({ createSupabaseTelemetryJournal: factories.cloud }));
import { createServerTelemetryRuntime } from './telemetryRuntime.js';
const environment = { VIZLY_RELEASE_ID: 'a'.repeat(40), VIZLY_TELEMETRY_ENABLED: 'true',
  SUPABASE_URL: 'https://telemetry.example.test', SUPABASE_SERVER_KEY: 'sb_secret_SYNTHETIC_12345678' };
afterEach(() => vi.clearAllMocks());

it('uses external persistence on Vercel and explicitly configured cloud deployments', async () => {
  factories.cloud.mockReturnValue({ accept: vi.fn(), drain: vi.fn() });
  for (const selection of [{ VERCEL: '1' }, { VIZLY_TELEMETRY_STORAGE: 'supabase' }]) {
    const runtime = createServerTelemetryRuntime({ ...environment, ...selection });
    expect(runtime.receiver).toBeDefined(); await runtime.stop();
  }
  expect(factories.cloud).toHaveBeenCalledTimes(2);
  expect(factories.cloud).toHaveBeenCalledWith(environment.SUPABASE_URL, environment.SUPABASE_SERVER_KEY);
  expect(factories.file).not.toHaveBeenCalled();
});
it('retains the private-directory journal for the local service', async () => {
  factories.file.mockReturnValue({ accept: vi.fn(), drain: vi.fn() });
  const directory = join(tmpdir(), 'vizly-private-test-journal');
  const runtime = createServerTelemetryRuntime({ ...environment, VIZLY_TELEMETRY_DATA_DIR: directory });
  expect(factories.file).toHaveBeenCalledWith(directory);
  expect(factories.cloud).not.toHaveBeenCalled(); await runtime.stop();
});
it('rejects an unknown storage or a filesystem journal selected on Vercel', () => {
  for (const selection of [{ VIZLY_TELEMETRY_STORAGE: 'unknown' }, { VIZLY_TELEMETRY_STORAGE: 'file', VERCEL: '1' }]) {
    expect(() => createServerTelemetryRuntime({ ...environment, ...selection })).toThrow('Invalid telemetry storage configuration');
  }
  expect(factories.file).not.toHaveBeenCalled(); expect(factories.cloud).not.toHaveBeenCalled();
});
it('does not initialize a sink when collection or the release identity is disabled', async () => {
  for (const selection of [{ VIZLY_TELEMETRY_ENABLED: 'false' }, { VIZLY_RELEASE_ID: 'development' }]) {
    const runtime = createServerTelemetryRuntime({ ...environment, ...selection, VERCEL: '1', VIZLY_TELEMETRY_STORAGE: 'invalid' });
    expect(runtime.receiver).toBeUndefined(); await runtime.stop();
  }
  expect(factories.file).not.toHaveBeenCalled(); expect(factories.cloud).not.toHaveBeenCalled();
});
