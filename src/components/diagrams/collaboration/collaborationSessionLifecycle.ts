/** Own retries so every handshake gets a current session, including after sleep. */
export function createCollaborationSessionLifecycle(options: {
  connect(token: string): void;
  disconnect(): void;
  resolveToken(): Promise<string | null>;
  visible(): boolean;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let stopped = false, blocked = false, generation = 0, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let token: string | undefined;
  const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
  const pause = () => { generation++; clear(); options.disconnect(); };
  const attempt = async () => {
    if (stopped || blocked || !options.visible()) return;
    clear(); const current = ++generation;
    try {
      const next = await options.resolveToken();
      if (stopped || current !== generation || !options.visible()) return;
      if (!next) { blocked = true; return; }
      // Decoding only prevents stale local handshakes; the server verifies authority.
      let expiry: number | undefined;
      if (next.split('.').length === 3) {
        try {
          const value: unknown = JSON.parse(atob(next.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (value && typeof value === 'object' && 'exp' in value && typeof value.exp === 'number') expiry = value.exp * 1000;
        } catch { blocked = true; return; }
        if (!expiry || expiry <= now() + 5000) { blocked = true; return; }
      }
      token = next;
      options.connect(next);
      if (expiry) timer = setTimeout(() => { pause(); void attempt(); }, Math.min(2_147_000_000, Math.max(1000, expiry - now() - 30_000)));
    } catch {
      if (!stopped && current === generation) retry();
    }
  };
  const retry = () => {
    clear();
    if (stopped || blocked || !options.visible()) return;
    if (++failures >= 5) { blocked = true; return; }
    timer = setTimeout(() => { void attempt(); }, Math.min(30_000, 1000 * 2 ** (failures - 1)));
  };
  return {
    start() { void attempt(); },
    closed(code?: number) {
      generation++; clear();
      if (code === 1008) blocked = true;
      retry();
    },
    synced() { failures = 0; },
    suspend() { blocked = true; pause(); },
    visibilityChanged() { pause(); if (!blocked) void attempt(); },
    credentialsChanged(next?: string) {
      if (next && next !== token) { blocked = false; failures = 0; pause(); void attempt(); }
    },
    stop() { stopped = true; pause(); },
  };
}
