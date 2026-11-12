import { afterEach, expect, it, vi } from 'vitest';
import { createCollaborationSessionLifecycle } from '../collaborationSessionLifecycle';
const jwt = (exp: number) => `e30.${btoa(JSON.stringify({ exp }))}.signature`;
afterEach(() => vi.useRealTimers());
it('never connects in a hidden tab and resolves new credentials on foreground recovery', async () => {
  let visible = false;
  const connect = vi.fn(), disconnect = vi.fn(), resolveToken = vi.fn(async () => jwt(Date.now() / 1000 + 3600));
  const lifecycle = createCollaborationSessionLifecycle({ connect, disconnect, resolveToken, visible: () => visible });
  lifecycle.start(); await Promise.resolve(); expect(resolveToken).not.toHaveBeenCalled();
  visible = true; lifecycle.visibilityChanged(); await Promise.resolve();
  expect(connect).toHaveBeenCalledTimes(1);
  visible = false; lifecycle.visibilityChanged(); expect(disconnect).toHaveBeenCalledTimes(2);
  lifecycle.stop();
});
it('does not send an expired token, and resumes only after credentials change', async () => {
  const connect = vi.fn(); let token = jwt(Date.now() / 1000 - 10);
  const lifecycle = createCollaborationSessionLifecycle({ connect, disconnect: vi.fn(), resolveToken: async () => token, visible: () => true });
  lifecycle.start(); await Promise.resolve(); expect(connect).not.toHaveBeenCalled();
  token = jwt(Date.now() / 1000 + 3600); lifecycle.credentialsChanged(token); await Promise.resolve();
  expect(connect).toHaveBeenCalledWith(token); lifecycle.stop();
});
it('ignores late session resolution after hiding or disposal', async () => {
  let complete!: (token: string) => void; const connect = vi.fn();
  const lifecycle = createCollaborationSessionLifecycle({ connect, disconnect: vi.fn(), resolveToken: () => new Promise(resolve => { complete = resolve; }), visible: () => true });
  lifecycle.start(); lifecycle.stop(); complete('stale'); await Promise.resolve(); expect(connect).not.toHaveBeenCalled();
});
it('refreshes before expiry and blocks policy rejection instead of retrying', async () => {
  vi.useFakeTimers(); const connect = vi.fn(); let i = 0;
  const lifecycle = createCollaborationSessionLifecycle({ connect, disconnect: vi.fn(), resolveToken: async () => jwt(Date.now() / 1000 + (++i === 1 ? 60 : 3600)), visible: () => true });
  lifecycle.start(); await vi.advanceTimersByTimeAsync(30_000); expect(connect).toHaveBeenCalledTimes(2);
  lifecycle.closed(1008); await vi.advanceTimersByTimeAsync(120_000); expect(connect).toHaveBeenCalledTimes(2); lifecycle.stop();
});
it('bounds failed handshakes and session errors with backoff', async () => {
  vi.useFakeTimers(); const resolveToken = vi.fn(async () => { throw Error('offline'); });
  const lifecycle = createCollaborationSessionLifecycle({ connect: vi.fn(), disconnect: vi.fn(), resolveToken, visible: () => true });
  lifecycle.start(); await vi.advanceTimersByTimeAsync(120_000); expect(resolveToken).toHaveBeenCalledTimes(5); lifecycle.stop();
});

it('does not restart a conflicted document when credentials rotate', async () => {
 const connect = vi.fn(); let token = 'first';
 const lifecycle = createCollaborationSessionLifecycle({ connect, disconnect: vi.fn(), resolveToken: async () => token, visible: () => true });
 lifecycle.start(); await Promise.resolve(); lifecycle.suspend(); token = 'second'; lifecycle.credentialsChanged(token); await Promise.resolve();
 expect(connect).toHaveBeenCalledTimes(1); lifecycle.stop();
});

it('rechecks the session after a real network/foreground recovery without reopening a denied socket', async () => {
 vi.useFakeTimers(); let offline = true; const connect = vi.fn();
 const lifecycle = createCollaborationSessionLifecycle({ connect, disconnect: vi.fn(), resolveToken: async () => { if (offline) throw Error('offline'); return 'fresh'; }, visible: () => true });
 lifecycle.start(); await vi.advanceTimersByTimeAsync(120_000); expect(connect).not.toHaveBeenCalled();
 offline = false; lifecycle.visibilityChanged(); await Promise.resolve(); expect(connect).toHaveBeenCalledTimes(1);
 lifecycle.closed(1008); lifecycle.visibilityChanged(); await vi.advanceTimersByTimeAsync(60_000); expect(connect).toHaveBeenCalledTimes(1); lifecycle.stop();
});

it('preserves optional-token transports while refusing a missing authenticated session', async () => {
 const anonymousConnect = vi.fn(), authenticatedConnect = vi.fn();
 const anonymous = createCollaborationSessionLifecycle({ connect: anonymousConnect, disconnect: vi.fn(), resolveToken: async () => '', visible: () => true });
 const authenticated = createCollaborationSessionLifecycle({ connect: authenticatedConnect, disconnect: vi.fn(), resolveToken: async () => null, visible: () => true });
 anonymous.start(); authenticated.start(); await Promise.resolve();
 expect(anonymousConnect).toHaveBeenCalledWith(''); expect(authenticatedConnect).not.toHaveBeenCalled();
 anonymous.stop(); authenticated.stop();
});

it('does not spin reconnecting when a resolver returns an unchanged near-expiry token', async () => {
 vi.useFakeTimers(); const connect = vi.fn(), token = jwt(Date.now() / 1000 + 60);
 const lifecycle = createCollaborationSessionLifecycle({ connect, disconnect: vi.fn(), resolveToken: async () => token, visible: () => true });
 lifecycle.start(); await vi.advanceTimersByTimeAsync(120_000);
 expect(connect).toHaveBeenCalledTimes(2); lifecycle.stop();
});
