import { describe, expect, it, vi } from 'vitest';
import { restoreCloudCollaboration } from '../collaborationRecoveryFlow';
const plan = { sha256: 'a'.repeat(64), bytes: 2, revision: '2026-10-09T02:04:07.212Z' };
const fixture = () => ({ client: { inspect: vi.fn(async () => plan), recover: vi.fn(async () => undefined) }, saveLocalCopy: vi.fn(async () => 'durable-copy'), reconnect: vi.fn(), signal: new AbortController().signal });
describe('durable local copy precedes cloud recovery', () => {
  it('waits for durable copy completion before submitting and reconnects only after acknowledgement', async () => {
    const f = fixture(); let finish: (id: string) => void = () => { throw new Error('Not initialized'); };
    f.saveLocalCopy.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const running = restoreCloudCollaboration(f);
    await vi.waitFor(() => expect(f.saveLocalCopy).toHaveBeenCalledOnce());
    expect(f.client.recover).not.toHaveBeenCalled(); expect(f.reconnect).not.toHaveBeenCalled();
    finish('durable-copy'); expect(await running).toBe('durable-copy');
    expect(f.client.recover).toHaveBeenCalledWith(plan, f.signal); expect(f.reconnect).toHaveBeenCalledOnce();
  });
  it('does not save or restore if inspection denies ownership', async () => {
    const f = fixture(); f.client.inspect.mockRejectedValue(new Error('Synthetic denied'));
    await expect(restoreCloudCollaboration(f)).rejects.toThrow();
    expect(f.saveLocalCopy).not.toHaveBeenCalled(); expect(f.client.recover).not.toHaveBeenCalled();
  });
  it.each(['reject', 'empty'])('does not submit if local copy fails: %s', async failure => {
    const f = fixture();
    if (failure === 'reject') f.saveLocalCopy.mockRejectedValue(new Error('Synthetic quota failure')); else f.saveLocalCopy.mockResolvedValue('');
    await expect(restoreCloudCollaboration(f)).rejects.toThrow();
    expect(f.client.recover).not.toHaveBeenCalled(); expect(f.reconnect).not.toHaveBeenCalled();
  });
  it('keeps the durable copy and does not reconnect if the server rejects recovery', async () => {
    const f = fixture(); f.client.recover.mockRejectedValue(new Error('Changed cloud revision'));
    await expect(restoreCloudCollaboration(f)).rejects.toThrow();
    expect(f.saveLocalCopy).toHaveBeenCalledOnce(); expect(f.reconnect).not.toHaveBeenCalled();
  });
  it('cancels if the diagram or account changes during copy persistence', async () => {
    const f = fixture(); const abort = new AbortController(); f.signal = abort.signal;
    f.saveLocalCopy.mockImplementation(async () => { abort.abort(); return 'durable-copy'; });
    await expect(restoreCloudCollaboration(f)).rejects.toMatchObject({ code: 'cancelled' });
    expect(f.client.recover).not.toHaveBeenCalled(); expect(f.reconnect).not.toHaveBeenCalled();
  });
  it('does not reconnect an old diagram if identity changes while awaiting recovery acknowledgement', async () => {
    const f = fixture(); const abort = new AbortController(); f.signal = abort.signal;
    f.client.recover.mockImplementation(async () => { abort.abort(); });
    await expect(restoreCloudCollaboration(f)).rejects.toMatchObject({ code: 'cancelled' });
    expect(f.reconnect).not.toHaveBeenCalled();
  });
});
