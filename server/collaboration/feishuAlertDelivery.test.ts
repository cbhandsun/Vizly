// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createFeishuAlertDelivery } from './feishuAlertDelivery.js';
import { createTelemetryAlerts } from './telemetryAlerts.js';
import type { TelemetryAlert } from './telemetryAlerts.js';
import { createOperationTelemetry } from './operationTelemetry.js';
import { projectTelemetryPayload } from './telemetryPayload.js';

const endpoint = 'https://open.feishu.cn/open-apis/bot/v2/hook/synthetic-hook';
const secret = 'synthetic-feishu-secret';
const alert: TelemetryAlert = { schema: 'vizly-alert-v1', releaseId: 'a'.repeat(40),
  requestId: 'edc03970-c04d-4fb6-a40d-c3b203225ce9', operation: 'save', code: 'conflict' };

it('sends signed Feishu text with a seconds timestamp and only safe alert fields', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 0 }));
  await createFeishuAlertDelivery(endpoint, secret, fetcher, () => 1700000000123)(alert, new AbortController().signal);
  const [url, init] = fetcher.mock.calls[0];
  expect(String(url)).toBe(endpoint);
  expect(init).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit',
    headers: { 'Content-Type': 'application/json' } });
  expect(JSON.parse(String(init?.body))).toEqual({
    timestamp: '1700000000',
    // Independent Python standard-library HMAC fixture, not the production signing function.
    sign: '2f+R3pxkRRymSUdUEnDeITF1OdgQ85+CWPM7pFMuR8s=',
    msg_type: 'text',
    content: { text: ['Vizly 运维告警', '版本：' + alert.releaseId, '请求：' + alert.requestId,
      '操作：save', '错误：conflict'].join('\n') },
  });
  expect(String(init?.body)).not.toContain(secret);
  expect(String(init?.body)).not.toContain(endpoint);
});

it.each([
  'http://open.feishu.cn/open-apis/bot/v2/hook/x',
  'https://open.feishu.cn.evil.test/open-apis/bot/v2/hook/x',
  'https://127.0.0.1/open-apis/bot/v2/hook/x',
  'https://open.feishu.cn:444/open-apis/bot/v2/hook/x',
  endpoint + '?token=secret', endpoint + '#secret',
  'https://user:secret@open.feishu.cn/open-apis/bot/v2/hook/x',
  'https://open.feishu.cn/other', 'not-a-url',
])('rejects invalid bot destinations before fetching: %s', bad => {
  const fetcher = vi.fn<typeof fetch>();
  expect(() => createFeishuAlertDelivery(bad, secret, fetcher)).toThrow('Invalid Feishu alert configuration');
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([undefined, '', '   '])('requires a signing secret: %s', missing => {
  expect(() => createFeishuAlertDelivery(endpoint, missing)).toThrow('Invalid Feishu alert configuration');
});

it.each([
  () => Response.json({ code: 19021, msg: endpoint }),
  () => Response.json({ code: 9499 }),
  () => Response.json({ code: '0' }),
  () => Response.json({}),
  () => new Response('not json'),
  () => new Response('rejected', { status: 429 }),
])('rejects transport or business failures without exposing upstream secrets', async response => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
  await expect(createFeishuAlertDelivery(endpoint, secret, fetcher)(alert, new AbortController().signal))
    .rejects.toThrow(/^Feishu alert delivery failed$/);
});

it('forwards cancellation and sanitizes network errors', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn<typeof fetch>().mockRejectedValue(Error(endpoint + secret));
  await expect(createFeishuAlertDelivery(endpoint, secret, fetcher)(alert, controller.signal))
    .rejects.toThrow(/^Feishu alert delivery failed$/);
  expect(fetcher.mock.calls[0][1]?.signal).toBe(controller.signal);
});

it('retains collector deduplication when the bot rejects delivery', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: 19021 }));
  const alerts = createTelemetryAlerts(createFeishuAlertDelivery(endpoint, secret, fetcher));
  const telemetry = createOperationTelemetry({ releaseId: alert.releaseId,
    transport: async batch => alerts.submit(projectTelemetryPayload(batch)) });
  try {
    telemetry.begin('save')('failure', 'conflict'); await telemetry.flush(); await alerts.drain();
    telemetry.begin('save')('failure', 'conflict'); await telemetry.flush(); await alerts.drain();
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally { telemetry.dispose(); alerts.stop(); }
});
