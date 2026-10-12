// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate } from 'y-protocols/awareness';
import { createRemoteRoomAwareness } from './remoteRoomAwareness.js';
import type { RemotePresencePeer } from './distributedPresence.js';
const peers: RemotePresencePeer[] = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
  .map((source, index) => ({ source, clientId: 42, userId: `remote-${index}`, state: { cursor: { x: index, y: 20 } } }));
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
const fixture = () => {
  const doc = new Y.Doc(); doc.clientID = 0xffffffff; const awareness = new Awareness(doc);
  awareness.setLocalState({ user: { name: 'local-owned' } });
  cleanup.push(() => { awareness.destroy(); doc.destroy(); });
  return { awareness, mapper: createRemoteRoomAwareness(awareness) };
};
describe('server-owned remote awareness identity mapping', () => {
  it('keeps colliding remote client IDs separate and preserves the local uint32 identity', () => {
    const f = fixture(); const update = f.mapper.apply({ updated: peers, removed: [] }, new Set([0xffffffff]));
    expect(update).not.toBeNull(); expect(f.awareness.getStates().size).toBe(3);
    expect(f.awareness.getLocalState()).toEqual({ user: { name: 'local-owned' } });
    expect([...f.awareness.getStates().keys()].filter(id => id > 0xffffffff)).toHaveLength(2);
    const observer = fixture(); if (!update) throw new Error('Missing update'); applyAwarenessUpdate(observer.awareness, update, 'server');
    expect(observer.awareness.getStates().get(0x100000000)).toEqual({ user: { name: 'User remote-0', color: '#0ea5e9' }, cursor: { x: 0, y: 20 } });
  });
  it('advances remote clocks for unchanged heartbeat states and removes tombstones', () => {
    const f = fixture(); f.mapper.apply({ updated: [peers[0]], removed: [] }, new Set());
    const id = 0x100000000; const clock = f.awareness.meta.get(id)?.clock;
    f.mapper.apply({ updated: [peers[0]], removed: [] }, new Set()); expect(f.awareness.meta.get(id)?.clock).toBe((clock ?? 0) + 1);
    f.mapper.apply({ updated: [], removed: [peers[0]] }, new Set()); expect(f.awareness.getStates().has(id)).toBe(false);
    expect(f.mapper.apply({ updated: [], removed: [peers[0]] }, new Set())).toBeNull();
  });
  it('safely reuses a retired ID within one removal/update frame using increasing clocks', () => {
    const f = fixture(); f.mapper.apply({ updated: [peers[0]], removed: [] }, new Set());
    const observer = fixture(); const first = f.mapper.apply({ updated: [peers[0]], removed: [] }, new Set());
    if (first) applyAwarenessUpdate(observer.awareness, first, 'server');
    const next = f.mapper.apply({ removed: [peers[0]], updated: [peers[1]] }, new Set());
    if (!next) throw new Error('Missing update'); applyAwarenessUpdate(observer.awareness, next, 'server');
    expect(f.awareness.getStates().get(0x100000000)?.user.name).toBe('User remote-1');
    expect(observer.awareness.getStates().get(0x100000000)?.user.name).toBe('User remote-1');
  });
  it('bounds remote allocations and fences clock exhaustion', () => {
    const f = fixture(); const states = Array.from({ length: 256 }, (_, clientId) => ({ ...peers[0], clientId }));
    f.mapper.apply({ updated: states, removed: [] }, new Set());
    expect(() => f.mapper.apply({ updated: [{ ...peers[1], clientId: 999 }], removed: [] }, new Set())).toThrow('capacity');
    const entry = f.awareness.meta.get(0x100000000); if (!entry) throw new Error('Missing metadata'); entry.clock = 0xffffffff;
    expect(() => f.mapper.apply({ updated: [states[0]], removed: [] }, new Set())).toThrow('clock');
  });
});
