import { describe, expect, it, vi } from 'vitest';
import { createGatewayResourceStore } from '../functions/ai-gateway/resourceStore';

const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
describe('gateway shared resource RPC adapter', () => {
  it('uses backend credentials and generated lease IDs, and releases independently of cancelled requests', async () => {
    const calls: { name: string; body: Record<string, string>; signal: AbortSignal }[] = [];
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('https://project.invalid');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-service-key');
      expect(init?.redirect).toBe('error');
      const body = JSON.parse(String(init?.body));
      calls.push({ name: url.pathname, body, signal: init!.signal! });
      return url.pathname.endsWith('acquire_ai_lease')
        ? response({ admitted: true, lease_id: body.p_lease_id, expires_at: new Date(Date.now() + 150_000).toISOString() }) : response(true);
    });
    const controller = new AbortController();
    const decision = await createGatewayResourceStore('https://project.invalid', 'synthetic-service-key', transport)!.acquire(user, controller.signal);
    expect(decision.admitted).toBe(true);
    controller.abort();
    if (!decision.admitted) throw new Error('Expected admission');
    await Promise.all([decision.release(), decision.release()]);
    expect(calls).toHaveLength(2);
    expect(calls[0].body.p_user_id).toBe(user);
    expect(calls[0].body.p_lease_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(calls[1].body).toEqual(calls[0].body);
    expect(calls[1].signal.aborted).toBe(false);
  });
  it.each(['rate', 'concurrency'])('returns bounded %s retry information', async reason => {
    const transport = vi.fn<typeof fetch>(async () => response({ admitted: false, reason, retry_after_seconds: 60 }));
    const store = createGatewayResourceStore('https://project.invalid', 'synthetic-key', transport)!;
    await expect(store.acquire(user, new AbortController().signal)).resolves.toEqual({ admitted: false, retryAfterSeconds: 60 });
  });
  it.each([null, {}, { admitted: false, reason: 'rate', retry_after_seconds: 0 },
    { admitted: false, reason: 'rate', retry_after_seconds: 151 }, { admitted: true, lease_id: 'wrong' }])('rejects malformed admission %#', async value => {
    const transport = vi.fn<typeof fetch>(async () => response(value));
    await expect(createGatewayResourceStore('https://project.invalid', 'synthetic-key', transport)!.acquire(user, new AbortController().signal)).rejects.toThrow();
  });
  it('rejects leases too short to safely cover the generation deadline', async () => {
    const transport = vi.fn<typeof fetch>(async (_, init) => response({ admitted: true,
      lease_id: JSON.parse(String(init?.body)).p_lease_id, expires_at: new Date(Date.now() + 1000).toISOString() }));
    await expect(createGatewayResourceStore('https://project.invalid', 'synthetic-key', transport)!.acquire(user, new AbortController().signal)).rejects.toThrow();
  });
  it('bounds RPC response bytes and rejects upstream failures', async () => {
    for (const result of [new Response('x'.repeat(16385)), new Response('private failure', { status: 500 })]) {
      const store = createGatewayResourceStore('https://project.invalid', 'synthetic-key', async () => result)!;
      await expect(store.acquire(user, new AbortController().signal)).rejects.toThrow();
    }
  });
  it('rejects unsafe configuration and invalid user identities before transport', async () => {
    for (const url of [undefined, 'http://remote.invalid', 'https://u:p@project.invalid', 'https://project.invalid/path']) {
      expect(createGatewayResourceStore(url, 'synthetic-key')).toBeUndefined();
    }
    const transport = vi.fn<typeof fetch>();
    await expect(createGatewayResourceStore('https://project.invalid', 'synthetic-key', transport)!.acquire('forged', new AbortController().signal)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
});
