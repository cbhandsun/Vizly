import { resolve } from 'node:path';
import { createOperationTelemetry } from './operationTelemetry.js';
import { createHttpAlertDelivery, createTelemetryAlerts } from './telemetryAlerts.js';
import { createTelemetryJournal } from './telemetryJournal.js';
import { projectTelemetryPayload } from './telemetryPayload.js';
import { createSupabaseTelemetryJournal } from './supabaseTelemetryJournal.js';

/** Each runtime owns its collector and journal. No global registration. */
export function createServerTelemetryRuntime(environment: Record<string, unknown>) {
  const release = environment.VIZLY_RELEASE_ID;
  const enabled = environment.VIZLY_TELEMETRY_ENABLED === 'true'
    && typeof release === 'string' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(release);
  const directory = environment.VIZLY_TELEMETRY_DATA_DIR;
  const storage = environment.VIZLY_TELEMETRY_STORAGE ?? (environment.VERCEL === '1' ? 'supabase' : 'file');
  if (enabled && (storage !== 'file' && storage !== 'supabase'
    || (storage === 'file' && environment.VERCEL === '1'))) throw Error('Invalid telemetry storage configuration');
  const journal = !enabled ? undefined : storage === 'supabase'
    ? createSupabaseTelemetryJournal(environment.SUPABASE_URL, environment.SUPABASE_SERVER_KEY)
    : createTelemetryJournal(resolve(typeof directory === 'string' && directory ? directory : '.telemetry-data'));
  const endpoint = environment.VIZLY_TELEMETRY_ALERT_URL;
  const alerts = journal && typeof endpoint === 'string' && endpoint
    ? createTelemetryAlerts(createHttpAlertDelivery(endpoint)) : undefined;
  const receiver = journal ? { accept: async (batch: unknown, signal: AbortSignal) => {
    await journal.accept(batch, signal);
    alerts?.submit(projectTelemetryPayload(batch));
  } } : undefined;
  const collector = createOperationTelemetry({ releaseId: typeof release === 'string' ? release : 'development',
    transport: receiver?.accept });
  let stopping: Promise<void> | undefined;
  return { receiver, collector, stop() {
    stopping ??= (async () => {
      try { await collector.flush(); await journal?.drain(); await alerts?.drain(); }
      finally { collector.dispose(); alerts?.stop(); }
    })();
    return stopping;
  } };
}
