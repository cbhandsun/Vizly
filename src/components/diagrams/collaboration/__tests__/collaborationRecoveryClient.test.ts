import { describe, expect, it, vi } from 'vitest';
import { createCollaborationRecoveryClient } from '../collaborationRecoveryClient';
const diagramId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const plan = { sha256: 'a'.repeat(64), bytes: 2, revision: '2026-10-09T02:04:07.212Z' };
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const fixture = () => {
  const transport = vi.fn<typeof fetch>(async (_input, init) => response(init?.method === 'GET' ? plan
    : { backupId: `${diagramId}.${plan.sha256}.yjs`, previousSha256: plan.sha256, revision: plan.revision }));
  return { transport, client: createCollaborationRecoveryClient({ serverUrl: 'ws://127.0.0.1:5422', diagramId, token: 'synthetic-owner', transport }) };
};
describe('bounded recovery client', () => {
  it('uses an authenticated HTTP endpoint with no query credential, cookies or redirects', async () => {
    const f = fixture(); expect(await f.client.inspect()).toEqual(plan); await f.client.recover(plan);
    expect(f.transport.mock.calls[0][0]).toBe(`http://127.0.0.1:5422/recovery/vizly-room-${diagramId}`);
    expect(f.transport.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: 'Bearer synthetic-owner' } });
    expect(JSON.parse(String(f.transport.mock.calls[1][1]?.body))).toEqual({ sha256: plan.sha256, revision: plan.revision });
  });
  it.each([403, 409, 500])('returns a safe error for HTTP %s without provider contents', async status => {
    const f = fixture(); f.transport.mockResolvedValue(new Response('private synthetic provider details', { status }));
    await expect(f.client.inspect()).rejects.toMatchObject({ code: status === 403 ? 'denied' : status === 409 ? 'changed' : 'unavailable', message: 'Collaboration recovery failed' });
  });
  it.each([null, [], {}, { ...plan, sha256: 'bad' }, { ...plan, bytes: -1 }, { ...plan, bytes: 1.5 }, { ...plan, bytes: 6 * 1024 * 1024 }, { ...plan, revision: 'invalid' },
    { ...plan, revision: '2026-02-30T00:00:00Z' }, { ...plan, revision: '2026-10-09T00:00:00+14:30' }])('rejects an invalid plan', async value => {
    const f = fixture(); f.transport.mockResolvedValue(response(value)); await expect(f.client.inspect()).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([{ backupId: 'outside.yjs' }, { previousSha256: 'b'.repeat(64) }, { revision: '2026-10-09T03:00:00Z' }])('rejects an acknowledgement for a different backup or version', async override => {
    const f = fixture(); f.transport.mockResolvedValue(response({ backupId: `${diagramId}.${plan.sha256}.yjs`, previousSha256: plan.sha256, revision: plan.revision, ...override }));
    await expect(f.client.recover(plan)).rejects.toMatchObject({ code: 'unavailable' });
  });
  it.each([true, false])('enforces declared and streamed response budgets: %s', async declared => {
    const f = fixture(); f.transport.mockResolvedValue(new Response('x'.repeat(4097), { headers: declared ? { 'Content-Length': '4097' } : {} }));
    await expect(f.client.inspect()).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('cancels old-account or old-diagram requests and redacts transport errors', async () => {
    const f = fixture(); const abort = new AbortController(); abort.abort();
    f.transport.mockRejectedValue(new Error('Synthetic secret transport detail'));
    await expect(f.client.inspect(abort.signal)).rejects.toMatchObject({ code: 'cancelled' });
    await expect(f.client.inspect()).rejects.toMatchObject({ code: 'unavailable', message: 'Collaboration recovery failed' });
  });
  it.each(['../outside', '', diagramId.replace('-4aaa-', '-0aaa-')])('rejects unsafe room identity before network access', invalid => {
    expect(() => createCollaborationRecoveryClient({ serverUrl: 'ws://127.0.0.1:5422', diagramId: invalid, token: 'synthetic-owner' })).toThrow();
  });
});
