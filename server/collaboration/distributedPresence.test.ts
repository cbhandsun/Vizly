// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRemotePresenceTracker, parseRoomPresenceFrame } from './distributedPresence.js';
const source = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const remote = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const generation = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const peer = { clientId: 42, userId: 'owner-uuid', state: { cursor: { x: 10, y: 20 } } };
const frame = (sequence = 1) => ({ source: remote, generation, sequence, peers: [structuredClone(peer)] });

describe('bounded cross-instance presence protocol', () => {
  it('copies a normalized frame without retaining mutable transport input', () => {
    const input = frame(); input.source = remote.toUpperCase();
    const parsed = parseRoomPresenceFrame(input); expect(parsed).toEqual(frame());
    input.peers[0].state.cursor.x = 999; expect(parsed?.peers[0].state?.cursor?.x).toBe(10);
  });
  it('accepts empty batches, removal, cursor absence and exact coordinate limits', () => {
    for (const state of [null, {}, { cursor: null }, { cursor: { x: -1_000_000, y: 1_000_000 } }]) {
      expect(parseRoomPresenceFrame({ ...frame(), peers: [{ ...peer, clientId: 0xffffffff, state }] })).not.toBeNull();
    }
    expect(parseRoomPresenceFrame({ ...frame(), peers: [] })?.peers).toEqual([]);
  });
  it.each([null, [], {}, { ...frame(), sequence: 0 }, { ...frame(), sequence: Infinity },
    { ...frame(), sequence: Number.MAX_SAFE_INTEGER + 1 }, { ...frame(), source: '../topic' },
    { ...frame(), payload: '<script>' }, { ...frame(), peers: [peer, peer] },
    { ...frame(), peers: Array.from({ length: 33 }, (_, clientId) => ({ ...peer, clientId })) },
    ...[-1, 1.5, 0x100000000].map(clientId => ({ ...frame(), peers: [{ ...peer, clientId }] })),
    ...['', 'a'.repeat(129), '<img>', 'user\nheader'].map(userId => ({ ...frame(), peers: [{ ...peer, userId }] })),
    ...[{ user: { name: 'forged' } }, { cursor: { x: NaN, y: 0 } }, { cursor: { x: 1_000_001, y: 0 } },
      { cursor: { x: 0, y: 0, secret: 'forbidden' } }, undefined].map(state => ({ ...frame(), peers: [{ ...peer, state }] })),
  ])('rejects malformed and hostile frame %#', input => { expect(parseRoomPresenceFrame(input)).toBeNull(); });
  it('separates identical client IDs by source and rejects echoes and other generations', () => {
    const tracker = createRemotePresenceTracker(source, generation);
    expect(tracker.receive(frame()).updated).toHaveLength(1);
    expect(tracker.receive({ ...frame(), source: generation }).updated).toHaveLength(1);
    expect(tracker.receive({ ...frame(), source })).toEqual({ updated: [], removed: [] });
    expect(tracker.receive({ ...frame(2), generation: source })).toEqual({ updated: [], removed: [] });
    expect(tracker.close().removed).toHaveLength(2);
  });
  it('refreshes liveness with newer sequences and retains replay floors after expiry', () => {
    let time = 0; const tracker = createRemotePresenceTracker(source, generation, () => time);
    tracker.receive(frame()); time = 19_000; tracker.receive(frame(2)); time = 20_000;
    expect(tracker.expire().removed).toHaveLength(0); time = 39_000;
    expect(tracker.expire().removed).toHaveLength(1);
    expect(tracker.receive(frame(2)).updated).toHaveLength(0);
    expect(tracker.receive(frame(3)).updated).toHaveLength(1);
  });
  it('applies tombstones immediately and rejects out-of-order resurrection', () => {
    const tracker = createRemotePresenceTracker(source, generation); tracker.receive(frame());
    expect(tracker.receive({ ...frame(3), peers: [{ ...peer, state: null }] }).removed).toHaveLength(1);
    expect(tracker.receive(frame(2)).updated).toHaveLength(0);
    expect(tracker.receive(frame(4)).updated).toHaveLength(1);
    expect(tracker.close().removed).toHaveLength(1); expect(tracker.close().removed).toHaveLength(0);
    expect(tracker.receive(frame(5)).updated).toHaveLength(0);
  });
  it('rejects identity replacement transactionally without consuming sequence', () => {
    const tracker = createRemotePresenceTracker(source, generation); tracker.receive(frame());
    expect(() => tracker.receive({ ...frame(2), peers: [{ ...peer, userId: 'forged' }] })).toThrow('identity');
    expect(tracker.receive(frame(2)).updated).toHaveLength(1);
  });
  it('bounds remembered source replay floors even after all peers expire', () => {
    let time = 0; const tracker = createRemotePresenceTracker(source, generation, () => time);
    for (let index = 0; index < 128; index++) tracker.receive({ ...frame(), source: `${index.toString(16).padStart(8, '0')}-bbbb-4bbb-8bbb-bbbbbbbbbbbb` });
    time = 20_000; expect(tracker.expire().removed).toHaveLength(128);
    expect(() => tracker.receive({ ...frame(), source: generation })).toThrow('capacity');
  });
  it('checks the total peer bound before mutating any batch entry', () => {
    const tracker = createRemotePresenceTracker(source, generation);
    for (let batch = 0; batch < 8; batch++) tracker.receive({ ...frame(batch + 1), peers: Array.from({ length: 32 }, (_, offset) => ({ ...peer, clientId: batch * 32 + offset })) });
    expect(() => tracker.receive({ ...frame(9), peers: [{ ...peer, clientId: 300 }] })).toThrow('capacity');
    expect(tracker.receive({ ...frame(9), peers: [{ ...peer, state: null }] }).removed).toHaveLength(1);
    expect(tracker.receive({ ...frame(10), peers: [{ ...peer, clientId: 300 }] }).updated).toHaveLength(1);
  });
  it('rejects invalid admission identities', () => {
    expect(() => createRemotePresenceTracker('bad', generation)).toThrow('identity');
    expect(() => createRemotePresenceTracker(source, 'bad')).toThrow('identity');
  });
});
