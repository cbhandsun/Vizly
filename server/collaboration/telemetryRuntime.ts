import { resolve } from 'node:path';
import { createOperationTelemetry } from './operationTelemetry.js';
import { createHttpAlertDelivery, createTelemetryAlerts } from './telemetryAlerts.js';
import { createFeishuAlertDelivery } from './feishuAlertDelivery.js';
import { createTelemetryJournal } from './telemetryJournal.js';
import { projectTelemetryPayload } from './telemetryPayload.js';
import { createSupabaseTelemetryJournal, type TelemetryProducer } from './supabaseTelemetryJournal.js';

/** Each runtime owns its collector and journal. No global registration. */
export function createServerTelemetryRuntime(environment: Record<string, unknown>,
  waitForBackground?: (task: Promise<void>) => void) {
  const release = environment.VIZLY_RELEASE_ID;
  const enabled = environment.VIZLY_TELEMETRY_ENABLED === 'true'
    && typeof release === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(release);
  const directory = environment.VIZLY_TELEMETRY_DATA_DIR;
  const storage = environment.VIZLY_TELEMETRY_STORAGE ?? (environment.VERCEL === '1' ? 'supabase' : 'file');
  if (enabled && (storage !== 'file' && storage !== 'supabase'
    || (storage === 'file' && environment.VERCEL === '1'))) throw Error('Invalid telemetry storage configuration');
  const cloudJournal = enabled && storage === 'supabase'
    ? createSupabaseTelemetryJournal(environment.SUPABASE_URL, environment.SUPABASE_SERVER_KEY) : undefined;
  const journal = !enabled ? undefined : cloudJournal ?? createTelemetryJournal(resolve(typeof directory === 'string' && directory ? directory : '.telemetry-data'));
  const endpoint = environment.VIZLY_TELEMETRY_ALERT_URL;
  const provider = environment.VIZLY_TELEMETRY_ALERT_PROVIDER ?? 'http';
  if (journal && endpoint && provider !== 'http' && provider !== 'feishu') {
    throw Error('Invalid telemetry alert provider');
  }
  const deliver = journal && typeof endpoint === 'string' && endpoint
    ? provider === 'feishu'
      ? createFeishuAlertDelivery(endpoint, environment.VIZLY_TELEMETRY_FEISHU_SIGNING_SECRET)
      : createHttpAlertDelivery(endpoint)
    : undefined;
  const alerts = deliver && !cloudJournal ? createTelemetryAlerts(deliver) : undefined;
  const deliveries = new Set<Promise<void>>();
  const accept = async (batch: unknown, signal: AbortSignal, source: 'server' | 'browser') => {
    if (cloudJournal && deliver) {
      const producer: TelemetryProducer = environment.VERCEL_ENV === 'preview' ? `preview-${source}` : source;
      const notifications = await cloudJournal.accept(batch, signal, producer);
      for (const notification of notifications) {
        const task = deliver(notification, AbortSignal.timeout(3000))
          .catch(() => {}).finally(() => deliveries.delete(task));
        deliveries.add(task);
        waitForBackground?.(task);
      }
      return;
    }
    await journal?.accept(batch, signal);
    if (alerts) {
      alerts.submit(projectTelemetryPayload(batch));
      waitForBackground?.(alerts.drain());
    }
  };
  const receiver = journal ? { accept: (batch: unknown, signal: AbortSignal) => accept(batch, signal, 'browser') } : undefined;
  const collector = createOperationTelemetry({ releaseId: typeof release === 'string' ? release : 'development',
    transport: journal ? (batch, signal) => accept(batch, signal, 'server') : undefined });
  let stopping: Promise<void> | undefined;
  return { receiver, collector, stop() {
    stopping ??= (async () => {
      try { await collector.flush(); await journal?.drain(); await alerts?.drain(); await Promise.all(deliveries); }
      finally { collector.dispose(); alerts?.stop(); }
    })();
    return stopping;
  } };
}
