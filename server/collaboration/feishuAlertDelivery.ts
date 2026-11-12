import { createHmac } from 'node:crypto';
import type { AlertDelivery } from './telemetryAlerts.js';

/** A configured bot is a server credential; never accept its address from browser input. */
export function createFeishuAlertDelivery(
  endpoint: string, signingSecret: unknown, fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): AlertDelivery {
  let url: URL;
  try { url = new URL(endpoint); } catch { throw Error('Invalid Feishu alert configuration'); }
  if (url.protocol !== 'https:' || url.hostname !== 'open.feishu.cn' || url.port
    || !/^\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9_-]+$/.test(url.pathname)
    || url.username || url.password || url.search || url.hash
    || typeof signingSecret !== 'string' || !signingSecret.trim()) {
    throw Error('Invalid Feishu alert configuration');
  }
  return async (alert, signal) => {
    const timestamp = String(Math.floor(now() / 1000));
    // Feishu uses timestamp + newline + secret as the HMAC key, with an empty message.
    const sign = createHmac('sha256', timestamp + '\n' + signingSecret).update('').digest('base64');
    const text = [
      'Vizly 运维告警',
      '版本：' + alert.releaseId,
      '请求：' + alert.requestId,
      '操作：' + alert.operation,
      '错误：' + alert.code,
    ].join('\n');
    try {
      const response = await fetcher(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp, sign, msg_type: 'text', content: { text } }),
        signal, redirect: 'error', credentials: 'omit',
      });
      if (!response.ok) throw Error('Rejected');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || !('code' in result) || result.code !== 0) {
        throw Error('Rejected');
      }
    } catch {
      // Network errors and upstream bodies can contain the secret webhook path.
      throw Error('Feishu alert delivery failed');
    }
  };
}
