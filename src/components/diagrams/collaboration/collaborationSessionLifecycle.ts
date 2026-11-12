/** Own retries so every handshake gets a current session, including after sleep. */
export function createCollaborationSessionLifecycle(options: {
  connect(token: string): void;
  disconnect(): void;
  resolveToken(): Promise<string | null>;
  visible(): boolean;
  unavailable?(): void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let stopped = false, blocked = false, suspended = false, retryExhausted = false, generation = 0, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token: string | undefined;
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const pause = () => { generation++; clear(); options.disconnect(); };
  const attempt = async () => {
    if (stopped || blocked || suspended || !options.visible()) return;
    clear(); const current = ++generation;
    try {
      const next = await options.resolveToken();
      if (stopped || current !== generation || !options.visible()) return;
      // An empty string preserves the optional-token transport contract. A null
      // authenticated session must never fall back to anonymous or stale credentials.
      if (next === null) { blocked = true; options.unavailable?.(); return; }
      // Decoding only prevents stale local handshakes; the server verifies authority.
      let expiry: number | undefined;
      if (next.split('.').length === 3) {
        try {
          const value: unknown = JSON.parse(atob(next.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (value && typeof value === 'object' && 'exp' in value && typeof value.exp === 'number') expiry = value.exp * 1000;
        } catch { blocked = true; options.unavailable?.(); return; }
        if (!expiry || expiry <= now() + 5000) { blocked = true; options.unavailable?.(); return; }
      }
      token = next;
      options.connect(next);
      if (expiry) {
        const refreshDelay = expiry - now() - 30_000;
        // A resolver may return an unchanged short-lived token. Wait for its
        // safety boundary instead of reconnecting with it every second.
        const delay = refreshDelay > 0 ? refreshDelay : Math.max(1000, expiry - now() - 5000);
        timer = setTimeout(() => { pause(); void attempt(); }, Math.min(2_147_000_000, delay));
      }
    } catch {
      if (!stopped && current === generation) { options.unavailable?.(); retry(); }
    }
  };
  const retry = () => {
    clear();
    if (stopped || blocked || suspended || !options.visible()) return;
    if (++failures >= 5) { blocked = true; retryExhausted = true; return; }
    timer = setTimeout(() => { void attempt(); }, Math.min(30_000, 1000 * 2 ** (failures - 1)));
  };
  return {
    start() { void attempt(); },
    closed(code?: number) {
      generation++; clear();
      if (code === 1008) { blocked = true; retryExhausted = false; }
      retry();
    },
    synced() { failures = 0; },
    suspend() { suspended = true; pause(); },
    visibilityChanged() {
      // A real foreground/online transition may recover an outage, never a policy rejection.
      if (options.visible() && retryExhausted && !suspended) { blocked = false; retryExhausted = false; failures = 0; }
      pause(); if (!blocked) void attempt();
    },
    credentialsChanged(next?: string) {
      if (!suspended && next && next !== token) { blocked = false; retryExhausted = false; failures = 0; pause(); void attempt(); }
    },
    stop() { stopped = true; pause(); },
  };
}
