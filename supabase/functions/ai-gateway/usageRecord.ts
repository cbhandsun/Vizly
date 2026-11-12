export type GatewayOutcome = 'completed' | 'cancelled' | 'timeout' | 'failed' | 'limited' | 'unavailable';
export interface GatewayUsageRecord {
  event: 'ai_gateway_usage_v1';
  requestId: string;
  userHash: string;
  outcome: GatewayOutcome;
  durationMs: number;
  outputBytes: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

// Only explicitly selected numeric usage fields may cross the logging boundary.
// Missing provider usage is unknown, never zero or an estimate of billing.
const tokenCount = (value: unknown): number | null => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
);

export const createGatewayUsageRecorder = (
  verifiedUserId: string,
  sink?: (record: Readonly<GatewayUsageRecord>) => void | Promise<void>,
  waitUntil?: (task: Promise<void>) => void,
) => {
  const started = performance.now();
  let finished = false;
  let outputBytes = 0;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  return {
    bytes(count: number) {
      if (!finished && Number.isSafeInteger(count) && count >= 0) outputBytes += count;
    },
    tokens(usage: { inputTokens?: unknown; outputTokens?: unknown }) {
      if (finished) return;
      inputTokens = tokenCount(usage.inputTokens);
      outputTokens = tokenCount(usage.outputTokens);
    },
    finish(outcome: GatewayOutcome) {
      if (finished) return;
      finished = true;
      if (!sink) return;
      const durationMs = Math.max(0, Math.round(performance.now() - started));
      const task = Promise.resolve().then(async () => {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`vizly-ai-usage-v1:${verifiedUserId}`));
        const userHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        await sink(Object.freeze({ event: 'ai_gateway_usage_v1', requestId: crypto.randomUUID(),
          userHash, outcome, durationMs, outputBytes, inputTokens, outputTokens }));
      }).catch(() => undefined);
      try { waitUntil?.(task); } catch { /* Logging cannot break generation or cleanup. */ }
    },
  };
};

export type GatewayUsageRecorder = ReturnType<typeof createGatewayUsageRecorder>;
