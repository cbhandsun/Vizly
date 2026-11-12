import { describe, expect, it, vi } from 'vitest';
import type { TextStreamPart, ToolSet } from 'ai';
import { createGatewayUsageRecorder, type GatewayUsageRecord } from '../functions/ai-gateway/usageRecord';
import { createGatewayStreamResponse } from '../functions/ai-gateway/streamResponse';

const recorder = (user = 'verified-private-user') => {
  const records: Readonly<GatewayUsageRecord>[] = [];
  const tasks: Promise<void>[] = [];
  const usage = createGatewayUsageRecorder(user, record => { records.push(record); }, task => { tasks.push(task); });
  return { usage, records, tasks };
};
const stream = (parts: unknown[]) => (async function* () { yield* parts; })() as AsyncIterable<TextStreamPart<ToolSet>>;

describe('gateway redacted usage records', () => {
  it('records exact emitted bytes and provider totals without content or identifiers', async () => {
    const { usage, records, tasks } = recorder();
    const body = await createGatewayStreamResponse(stream([
      { type: 'text-delta', id: 'private-provider-id', text: 'secret response 图' },
      { type: 'finish', totalUsage: { inputTokens: 12, outputTokens: 34, private: 'secret metadata' } },
    ]), new Headers(), undefined, undefined, usage).text();
    await Promise.all(tasks);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({ event: 'ai_gateway_usage_v1', requestId: expect.any(String),
      userHash: expect.stringMatching(/^[a-f0-9]{64}$/), outcome: 'completed', durationMs: expect.any(Number),
      outputBytes: new TextEncoder().encode(body).byteLength, inputTokens: 12, outputTokens: 34 });
    expect(JSON.stringify(records)).not.toMatch(/secret|private|verified/);
    expect(Object.isFrozen(records[0])).toBe(true);
  });
  it('uses stable pseudonyms for the verified identity and separates different users', async () => {
    const entries = [recorder('user-a'), recorder('user-a'), recorder('user-b')];
    for (const entry of entries) entry.usage.finish('limited');
    await Promise.all(entries.flatMap(entry => entry.tasks));
    expect(entries[0].records[0].userHash).toBe(entries[1].records[0].userHash);
    expect(entries[0].records[0].userHash).not.toBe(entries[2].records[0].userHash);
    expect(entries[0].records[0].requestId).not.toBe(entries[1].records[0].requestId);
  });
  it.each([undefined, -1, 1.5, NaN, Infinity, '123', Number.MAX_SAFE_INTEGER + 1])('keeps invalid/missing token usage unknown: %s', async input => {
    const { usage, records, tasks } = recorder();
    usage.tokens({ inputTokens: input, outputTokens: input }); usage.finish('completed');
    await Promise.all(tasks);
    expect(records[0].inputTokens).toBeNull(); expect(records[0].outputTokens).toBeNull();
  });
  it.each(['error', 'abort'] as const)('records upstream %s without a false successful completion', async type => {
    const { usage, records, tasks } = recorder();
    const cancel = vi.fn();
    const body = await createGatewayStreamResponse(stream([{ type, error: 'private error', reason: 'private reason' }]),
      new Headers(), cancel, undefined, usage).text();
    await Promise.all(tasks);
    expect(body).not.toContain('[DONE]'); expect(body).not.toContain('private');
    expect(cancel).toHaveBeenCalledOnce();
    expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe(type === 'abort' ? 'cancelled' : 'failed');
  });
  it('freezes the first terminal result and ignores late usage after cancellation', async () => {
    const { usage, records, tasks } = recorder();
    usage.bytes(5); usage.finish('timeout'); usage.bytes(6); usage.tokens({ inputTokens: 10 }); usage.finish('completed');
    await Promise.all(tasks);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ outcome: 'timeout', outputBytes: 5, inputTokens: null });
  });
  it('contains sink and waitUntil failures without rejecting stream consumption', async () => {
    const sink = vi.fn(async () => { throw new Error('private log outage'); });
    let task: Promise<void> | undefined;
    const usage = createGatewayUsageRecorder('verified-user', sink, pending => { task = pending; throw new Error('runtime gone'); });
    await expect(createGatewayStreamResponse(stream([]), new Headers(), undefined, undefined, usage).text()).resolves.toContain('[DONE]');
    await expect(task).resolves.toBeUndefined(); expect(sink).toHaveBeenCalledOnce();
  });
});
