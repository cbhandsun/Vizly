// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createCloudRoomRevisionSource, createCloudRoomSource } from './cloudRoomSource.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const graph = () => ({ id, name: 'Synthetic', type: 'flowchart', version: '1.0.0', nodes: [
  { id: 'n1', description: 'Synthetic label', type: 'flowchart', domain: 'default', metadata: { canvasPosition: { x: 7, y: 9 } } },
], edges: [] });
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const fixture = (content: unknown = graph(), userId = user) => {
  const row = { id, title: 'Synthetic', content, updated_at: '2026-10-08T20:00:00.123456+00:00' };
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-session');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const url = String(input);
    if (url.includes('/auth/v1/user')) return response({ id: userId, is_anonymous: false });
    expect(new URL(url).searchParams.get('id')).toBe(`eq.${id}`);
    expect(new URL(url).searchParams.get('select')).toBe('id,title,content,updated_at');
    return response(row);
  });
  return { transport, row, source: createCloudRoomSource('https://project.example.com', 'publishable-test', transport) };
};
describe('cloud room source boundary', () => {
  it('polls only authorized identity/revision fields while preserving exact microseconds', async () => {
    const revision = '2026-10-08T20:00:00.123456+00:00';
    const transport = vi.fn<typeof fetch>(async (input, init) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-session');
      if (String(input).includes('/auth/')) return response({ id: user, is_anonymous: false });
      const url = new URL(String(input));
      expect(url.searchParams.get('select')).toBe('id,updated_at');
      expect(url.searchParams.get('id')).toBe(`eq.${id}`);
      return response({ id, updated_at: revision });
    });
    expect(await createCloudRoomRevisionSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user)).toBe(revision);
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('rejects changed or anonymous revision-poll identities before database reads', async () => {
    for (const identity of [{ id, is_anonymous: false }, { id: user, is_anonymous: true }]) {
      const transport = vi.fn<typeof fetch>(async () => response(identity));
      await expect(createCloudRoomRevisionSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user)).rejects.toThrow('source unavailable');
      expect(transport).toHaveBeenCalledOnce();
    }
  });
  it('rejects inaccessible or malformed revision rows', async () => {
    for (const row of [null, { id: user, updated_at: '2026-10-08T20:00:00Z' }, { id, updated_at: '2026-02-30T00:00:00Z' }, { id, updated_at: 'bad' }, { id, updated_at: null }]) {
      const transport = vi.fn<typeof fetch>(async input => String(input).includes('/auth/') ? response({ id: user, is_anonymous: false }) : response(row));
      await expect(createCloudRoomRevisionSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user)).rejects.toThrow('source unavailable');
    }
  });
  it('reads only the authorized graph, preserving saved fields and exact cloud revision', async () => {
    const { source, transport, row } = fixture();
    const result = await source('synthetic-session', id, user);
    expect(result.diagramId).toBe(id);
    expect(result.revision).toBe(row.updated_at);
    expect(result.content.nodes[0].metadata?.canvasPosition).toEqual({ x: 7, y: 9 });
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('accepts an intentionally empty cloud graph', async () => {
    const { source } = fixture({ ...graph(), nodes: [] });
    expect((await source('synthetic-session', id, user)).content.nodes).toEqual([]);
  });
  it('rejects changed identity before reading any graph', async () => {
    const { source, transport } = fixture(graph(), id);
    await expect(source('synthetic-session', id, user)).rejects.toThrow('Cloud collaboration source unavailable');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rejects anonymous and failed authentication before querying graph content', async () => {
    for (const auth of [response({ id: user, is_anonymous: true }), response({ message: 'Synthetic invalid session' }, 401)]) {
      const transport = vi.fn<typeof fetch>(async () => auth);
      await expect(createCloudRoomSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user))
        .rejects.toThrow('Cloud collaboration source unavailable');
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it('fails closed on database errors and broken response streams', async () => {
    for (const broken of [false, true]) {
      const transport = vi.fn<typeof fetch>(async input => {
        if (String(input).includes('/auth/')) return response({ id: user });
        if (!broken) return response({ message: 'Private synthetic DB details' }, 403);
        return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('Private stream details')); } }));
      });
      await expect(createCloudRoomSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user))
        .rejects.toThrow(/^Cloud collaboration source unavailable$/);
      expect(transport).toHaveBeenCalledTimes(2);
    }
  });
  it.each([null, {}, { nodes: 'bad', edges: [] }, { ...graph(), nodes: Array.from({ length: 1001 }, (_, i) => ({ ...graph().nodes[0], id: `node-${i}` })) }])(
    'rejects malformed or excessive cloud documents', async content => {
      await expect(fixture(content).source('synthetic-session', id, user)).rejects.toThrow('Cloud collaboration source unavailable');
    },
  );
  it('rejects missing/inaccessible and mismatched rows and bad revisions', async () => {
    for (const mutate of [(row: Record<string, unknown>) => { row.id = user; }, (row: Record<string, unknown>) => { row.updated_at = ''; }]) {
      const test = fixture(); mutate(test.row);
      await expect(test.source('synthetic-session', id, user)).rejects.toThrow('Cloud collaboration source unavailable');
    }
    const transport = vi.fn<typeof fetch>(async input => String(input).includes('/auth/') ? response({ id: user }) : response(null));
    await expect(createCloudRoomSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user)).rejects.toThrow('Cloud collaboration source unavailable');
  });
  it('rejects invalid connection inputs without transport', async () => {
    const test = fixture();
    for (const token of ['', null, 'x'.repeat(4097), 'bad\nclaim']) await expect(test.source(token, id, user)).rejects.toThrow();
    await expect(test.source('synthetic-session', '../outside', user)).rejects.toThrow();
    await expect(test.source('synthetic-session', id, null)).rejects.toThrow();
    expect(test.transport).not.toHaveBeenCalled();
  });
  it('sanitizes unsafe JSON keys in remote metadata', async () => {
    const content = graph();
    Object.assign(content.nodes[0].metadata, JSON.parse('{"constructor":{"polluted":true},"__proto__":{"polluted":true}}'));
    const result = await fixture(content).source('synthetic-session', id, user);
    expect(Object.hasOwn(result.content.nodes[0].metadata ?? {}, 'constructor')).toBe(false);
    expect(Object.hasOwn(result.content.nodes[0].metadata ?? {}, '__proto__')).toBe(false);
  });
  it('bounds declared and streamed bytes, cancels excessive streams and returns safe errors', async () => {
    for (const declared of [true, false]) {
      const cancelled = vi.fn();
      const transport = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new Uint8Array(5 * 1024 * 1024 + 1)); }, cancel: cancelled,
      }), { headers: declared ? { 'Content-Length': String(5 * 1024 * 1024 + 1) } : {} }));
      await expect(createCloudRoomSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user)).rejects.toThrow('Cloud collaboration source unavailable');
      expect(cancelled).toHaveBeenCalledOnce();
    }
  });
  it('does not expose server content or credentials on network errors', async () => {
    const transport = vi.fn<typeof fetch>(async () => { throw new Error('synthetic-session PRIVATE CONTENT'); });
    await expect(createCloudRoomSource('https://project.example.com', 'publishable-test', transport)('synthetic-session', id, user)).rejects.toThrow(/^Cloud collaboration source unavailable$/);
  });
});
