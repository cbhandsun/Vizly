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
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it('persists before signed Feishu delivery and keeps the event when Feishu rejects it', async () => {
  const order: string[] = [];
  const accept = vi.fn(async () => { order.push('persist'); });
  factories.cloud.mockReturnValue({ accept, drain: vi.fn() });
  const fetcher = vi.fn<typeof fetch>(async () => {
    order.push('notify'); return Response.json({ code: 19021 });
  });
  vi.stubGlobal('fetch', fetcher);
  const runtime = createServerTelemetryRuntime({ ...environment, VERCEL: '1',
    VIZLY_TELEMETRY_ALERT_PROVIDER: 'feishu',
    VIZLY_TELEMETRY_ALERT_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/synthetic-hook',
    VIZLY_TELEMETRY_FEISHU_SIGNING_SECRET: 'synthetic-secret' });
  runtime.collector.begin('save')('failure', 'conflict');
  await expect(runtime.stop()).resolves.toBeUndefined();
  expect(order).toEqual(['persist', 'notify']);
  expect(accept).toHaveBeenCalledTimes(1);
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ msg_type: 'text' });
});

it('rejects unsupported alert providers instead of silently selecting generic delivery', () => {
  factories.cloud.mockReturnValue({ accept: vi.fn(), drain: vi.fn() });
  expect(() => createServerTelemetryRuntime({ ...environment, VERCEL: '1',
    VIZLY_TELEMETRY_ALERT_PROVIDER: 'unknown', VIZLY_TELEMETRY_ALERT_URL: 'https://example.test/alerts',
  })).toThrow('Invalid telemetry alert provider');
});

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


it('registers unfinished delivery before returning acceptance without delaying the response', async () => {
  factories.cloud.mockReturnValue({ accept: vi.fn(), drain: vi.fn() });
  let complete!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { complete = resolve; })));
  const tasks: Promise<void>[] = [];
  const runtime = createServerTelemetryRuntime({ ...environment, VERCEL: '1',
    VIZLY_TELEMETRY_ALERT_PROVIDER: 'feishu',
    VIZLY_TELEMETRY_ALERT_URL: 'https://open.feishu.cn/open-apis/bot/v2/hook/synthetic-hook',
    VIZLY_TELEMETRY_FEISHU_SIGNING_SECRET: 'synthetic-secret' }, task => { tasks.push(task); });
  runtime.collector.begin('save')('failure', 'conflict');
  await runtime.collector.flush();
  expect(tasks).toHaveLength(1);
  let settled = false;
  void tasks[0].then(() => { settled = true; });
  await Promise.resolve();
  expect(settled).toBe(false);
  complete(Response.json({ code: 0 }));
  await tasks[0];
  expect(settled).toBe(true);
  await runtime.stop();
});
