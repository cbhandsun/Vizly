import { isRoomGeneration, isRoomVersion, parseAtomicRoomSnapshot, type AtomicRoomSnapshot } from './atomicRoomCommit.js';
import { acceptPersistedRoomState } from './acceptedRoomState.js';
import { decodeRoomRecord } from './roomCheckpoint.js';
import type { RoomPresenceFrame } from './distributedPresence.js';
import { createRoomPresenceTransport, type RoomPresenceAdmission } from './roomPresenceTransport.js';

export interface RoomCommitNotice { source: string; generation: string; version: string }
export interface RoomNoticeSubscription {
  publish: (notice: RoomCommitNotice) => Promise<void>;
  publishPresence?: (frame: RoomPresenceFrame) => Promise<void>;
  close: () => Promise<void>;
}
export interface RoomNoticeBus {
  subscribe: (roomId: string, receive: (input: unknown) => void, catchUp: () => void,
    receivePresence?: (input: unknown) => void) => Promise<RoomNoticeSubscription>;
}
export interface RoomSynchronization {
  assertActive: () => void;
  notifyCommitted: () => Promise<void>;
  notifyPresence?: () => Promise<void>;
  close: () => Promise<void>;
}
export interface RoomSyncAdmission {
  roomId: string; generation: string;
  accept: (snapshot: AtomicRoomSnapshot) => Promise<void>;
  /** Serialize the durable read and acceptance with local committed edits. */
  serialize?: (operation: () => Promise<void>) => Promise<void>;
  unavailable: () => void;
  presence?: RoomPresenceAdmission & { publicationFailed: () => void };
}
export type OpenRoomSynchronization = (admission: RoomSyncAdmission) => Promise<RoomSynchronization>;

/** Notices carry metadata only. Durable reads, never notice contents, authorize state. */
export const parseRoomCommitNotice = (input: unknown): RoomCommitNotice | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || !('source' in input) || !isRoomGeneration(input.source)
    || !('generation' in input) || !isRoomGeneration(input.generation)
    || !('version' in input) || !isRoomVersion(input.version)
    || Object.keys(input).some(key => !['source', 'generation', 'version'].includes(key))) return null;
  return { source: input.source.toLowerCase(), generation: input.generation.toLowerCase(), version: input.version };
};

/** Subscribe before loading, coalesce bursts, and catch up after lost notifications. */
export const createDistributedRoomSync = (options: {
  source: string; bus: RoomNoticeBus;
  read: (id: string) => Promise<AtomicRoomSnapshot | null>;
  catchUpMs?: number;
}): OpenRoomSynchronization => {
  const catchUpMs = options.catchUpMs ?? 10_000;
  if (!isRoomGeneration(options.source) || !Number.isSafeInteger(catchUpMs) || catchUpMs < 1000 || catchUpMs > 30_000) {
    throw new Error('Invalid room synchronization configuration');
  }
  const source = options.source.toLowerCase();
  return async admission => {
    if (!isRoomGeneration(admission.roomId) || !isRoomGeneration(admission.generation)) throw new Error('Invalid synchronization identity');
    const roomId = admission.roomId.toLowerCase(); const generation = admission.generation.toLowerCase();
    let subscription: RoomNoticeSubscription | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false; let failed = false; let dirty = false;
    let last: AtomicRoomSnapshot | undefined;
    let running: Promise<void> | undefined; let closePromise: Promise<void> | undefined;
    const guard = () => { if (closed || failed) throw new Error('Room synchronization unavailable'); };
    const presence = admission.presence ? createRoomPresenceTransport({ ...admission.presence, generation,
      serialize: operation => admission.serialize ? admission.serialize(operation) : operation(),
      publish: async frame => {
        if (!subscription?.publishPresence) throw new Error('Presence transport unavailable');
        await subscription.publishPresence(frame);
      },
      failed: () => { if (!closed && !failed) { failed = true; if (timer) clearInterval(timer); admission.unavailable(); } },
    }) : undefined;
    const refresh = (): Promise<void> => {
      guard(); dirty = true;
      if (running) return running;
      // Publish running before a synchronous reader can cause a reentrant notice.
      running = Promise.resolve().then(async () => {
        while (dirty && !closed && !failed) {
          dirty = false;
          const readAndAccept = async () => {
          const raw = await options.read(roomId);
          if (closed) return;
          guard();
          if (raw === null) {
            if (last) throw new Error('Committed room disappeared');
            return;
          }
          const snapshot = parseAtomicRoomSnapshot(raw);
          if (snapshot.generation !== generation) throw new Error('Room synchronization generation changed');
          if (last && BigInt(snapshot.version) < BigInt(last.version)) throw new Error('Room storage version regressed');
          if (last && snapshot.version === last.version) {
            if (!Buffer.from(snapshot.record).equals(Buffer.from(last.record))) throw new Error('Room version contents changed');
            return;
          }
          if (last) acceptPersistedRoomState(decodeRoomRecord(last.record).state, decodeRoomRecord(snapshot.record).state);
          await admission.accept(snapshot);
          if (closed) return;
          guard(); last = snapshot;
          };
          await (admission.serialize ? admission.serialize(readAndAccept) : readAndAccept());
        }
      }).catch(() => {
        if (!closed && !failed) { failed = true; if (timer) clearInterval(timer); admission.unavailable(); }
        throw new Error('Room synchronization unavailable');
      }).finally(() => { running = undefined; });
      return running;
    };
    const catchUp = () => {
      if (closed || failed) return;
      // Background failure closes the room through unavailable; no detached rejection.
      void refresh().catch(() => undefined);
      presence?.catchUp();
    };
    const close = () => {
      if (closePromise) return closePromise;
      closed = true; if (timer) clearInterval(timer);
      closePromise = Promise.resolve().then(async () => {
        const results = await Promise.allSettled([presence?.close(), running]);
        try { await subscription?.close(); }
        catch { throw new Error('Room subscription disposal failed'); }
        if (results[0].status === 'rejected') throw new Error('Room presence disposal failed');
      });
      return closePromise;
    };
    try {
      subscription = await options.bus.subscribe(roomId, input => {
        const notice = parseRoomCommitNotice(input);
        if (!notice || notice.source === source || closed || failed) return;
        if (notice.generation === generation && last && BigInt(notice.version) <= BigInt(last.version)) return;
        catchUp();
      }, catchUp, presence ? input => presence.receive(input) : undefined);
      if (presence && !subscription.publishPresence) throw new Error('Presence transport unavailable');
      await refresh();
      guard(); timer = setInterval(catchUp, catchUpMs); timer.unref();
      presence?.start();
      return {
        assertActive: guard,
        async notifyCommitted() {
          await refresh(); guard();
          if (!last || !subscription) throw new Error('Missing room commit metadata');
          await subscription.publish({ source, generation, version: last.version });
          guard();
        }, ...(presence ? { notifyPresence: presence.refresh } : {}), close,
      };
    } catch (error: unknown) { await close(); throw error; }
  };
};
