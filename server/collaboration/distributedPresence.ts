import { isRoomGeneration } from './atomicRoomCommit.js';
import { isRecord } from './boundary.js';

export interface PresenceCursor { x: number; y: number }
export interface DistributedPresencePeer {
  clientId: number;
  userId: string;
  state: { cursor?: PresenceCursor | null } | null;
}
export interface RoomPresenceFrame {
  source: string;
  generation: string;
  sequence: number;
  peers: DistributedPresencePeer[];
}
export interface RemotePresencePeer extends DistributedPresencePeer { source: string }
export interface PresenceDelta { updated: RemotePresencePeer[]; removed: RemotePresencePeer[] }
const keysOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const validInteger = (input: unknown, maximum: number): input is number => typeof input === 'number'
  && Number.isSafeInteger(input) && input >= 0 && input <= maximum;

/** Backend-authored identities and coordinates only; no names, HTML or arbitrary metadata. */
export const parseRoomPresenceFrame = (input: unknown): RoomPresenceFrame | null => {
  if (!isRecord(input) || !keysOnly(input, ['source', 'generation', 'sequence', 'peers'])
    || !isRoomGeneration(input.source) || !isRoomGeneration(input.generation)
    || !validInteger(input.sequence, Number.MAX_SAFE_INTEGER) || input.sequence === 0
    || !Array.isArray(input.peers) || input.peers.length > 32) return null;
  const peers: DistributedPresencePeer[] = [];
  const ids = new Set<number>();
  for (const peer of input.peers) {
    if (!isRecord(peer) || !keysOnly(peer, ['clientId', 'userId', 'state'])
      || !validInteger(peer.clientId, 0xffffffff) || ids.has(peer.clientId)
      || typeof peer.userId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(peer.userId)) return null;
    let state: DistributedPresencePeer['state'] = null;
    if (peer.state !== null) {
      if (!isRecord(peer.state) || !keysOnly(peer.state, ['cursor'])) return null;
      const cursor = peer.state.cursor;
      if (cursor === undefined) state = {};
      else if (cursor === null) state = { cursor: null };
      else {
        if (!isRecord(cursor) || !keysOnly(cursor, ['x', 'y'])
          || typeof cursor.x !== 'number' || typeof cursor.y !== 'number'
          || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)
          || Math.abs(cursor.x) > 1_000_000 || Math.abs(cursor.y) > 1_000_000) return null;
        state = { cursor: { x: cursor.x, y: cursor.y } };
      }
    }
    ids.add(peer.clientId);
    peers.push({ clientId: peer.clientId, userId: peer.userId, state });
  }
  return { source: input.source.toLowerCase(), generation: input.generation.toLowerCase(), sequence: input.sequence, peers };
};

/** Replay floors survive expiry. A room lease, not a process ID, identifies each source. */
export const createRemotePresenceTracker = (source: string, generation: string, now: () => number = () => performance.now()) => {
  if (!isRoomGeneration(source) || !isRoomGeneration(generation)) throw new Error('Invalid presence identity');
  const ownSource = source.toLowerCase(); const admittedGeneration = generation.toLowerCase();
  const sources = new Map<string, number>();
  const peers = new Map<string, { peer: RemotePresencePeer; deadline: number }>();
  let closed = false;
  const empty = (): PresenceDelta => ({ updated: [], removed: [] });
  return {
    receive(input: unknown, receivedAt: number = now()): PresenceDelta {
      if (closed) return empty();
      if (!Number.isFinite(receivedAt) || receivedAt > now() || now() - receivedAt >= 20_000) return empty();
      const frame = parseRoomPresenceFrame(input);
      if (!frame || frame.source === ownSource || frame.generation !== admittedGeneration
        || frame.sequence <= (sources.get(frame.source) ?? 0)) return empty();
      if (!sources.has(frame.source) && sources.size >= 128) throw new Error('Presence source capacity exceeded');
      const delta = empty();
      // Capacity and identity checks precede all mutation, including the replay floor.
      const nextKeys = new Set(peers.keys());
      for (const peer of frame.peers) {
        const key = `${frame.source}:${peer.clientId}`;
        const previous = peers.get(key);
        if (previous && previous.peer.userId !== peer.userId) throw new Error('Presence identity changed');
        if (peer.state === null) nextKeys.delete(key); else nextKeys.add(key);
      }
      if (nextKeys.size > 256) throw new Error('Presence peer capacity exceeded');
      const deadline = receivedAt + 20_000;
      sources.set(frame.source, frame.sequence);
      for (const peer of frame.peers) {
        const key = `${frame.source}:${peer.clientId}`;
        const remote = { ...peer, source: frame.source };
        if (peer.state === null) {
          const previous = peers.get(key);
          if (previous) delta.removed.push(previous.peer);
          peers.delete(key);
        } else { peers.set(key, { peer: remote, deadline }); delta.updated.push(remote); }
      }
      return delta;
    },
    expire(): PresenceDelta {
      const delta = empty(); const current = now();
      for (const [key, entry] of peers) if (entry.deadline <= current) { peers.delete(key); delta.removed.push(entry.peer); }
      return delta;
    },
    close(): PresenceDelta {
      if (closed) return empty();
      closed = true;
      const removed = [...peers.values()].map(entry => entry.peer); peers.clear(); sources.clear();
      return { updated: [], removed };
    },
  };
};
