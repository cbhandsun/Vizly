import { createRemotePresenceTracker, parseRoomPresenceFrame, type DistributedPresencePeer,
  type PresenceDelta, type RoomPresenceFrame } from './distributedPresence.js';

export interface RoomPresenceAdmission {
  source: string;
  assertActive: () => void;
  readLocal: () => Promise<DistributedPresencePeer[]>;
  accept: (delta: PresenceDelta) => Promise<void>;
}
export const createRoomPresenceTransport = (options: RoomPresenceAdmission & {
  generation: string;
  publish: (frame: RoomPresenceFrame) => Promise<void>;
  serialize: (operation: () => Promise<void>) => Promise<void>;
  assertActive: () => void;
  failed: () => void;
  publicationFailed: () => void;
  now?: () => number;
}) => {
  const now = options.now ?? (() => performance.now());
  const tracker = createRemotePresenceTracker(options.source, options.generation, now);
  const accepting = new Set<Promise<void>>();
  let previous = new Map<number, DistributedPresencePeer>();
  let sequence = 0; let closed = false; let dirty = false;
  let sending: Promise<void> | undefined; let stopping: Promise<{ tombstonesDelivered: boolean }> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pauseTimer: ReturnType<typeof setTimeout> | undefined; let resumePublication: (() => void) | undefined;
  let lastStarted = -Infinity;
  const publishBatch = async (peers: DistributedPresencePeer[]) => {
    for (let index = 0; index < peers.length; index += 32) {
      options.assertActive();
      const frame = parseRoomPresenceFrame({ source: options.source, generation: options.generation,
        sequence: ++sequence, peers: peers.slice(index, index + 32) });
      if (!frame) throw new Error('Invalid local presence');
      await options.publish(frame); options.assertActive();
    }
  };
  const refresh = (): Promise<void> => {
    if (closed) return Promise.resolve();
    dirty = true; if (sending) return sending;
    sending = Promise.resolve().then(async () => {
      while (dirty && !closed) {
        const delay = Math.max(0, 200 - (now() - lastStarted));
        if (delay > 0) await new Promise<void>(resolve => {
          resumePublication = resolve;
          pauseTimer = setTimeout(() => { pauseTimer = undefined; resumePublication = undefined; resolve(); }, delay);
        });
        if (closed) return;
        lastStarted = now();
        dirty = false;
        let local: DistributedPresencePeer[] = [];
        await options.serialize(async () => {
          if (closed) return; options.assertActive();
          local = await options.readLocal();
          options.assertActive();
          if (local.length > 128 || new Set(local.map(peer => peer.clientId)).size !== local.length
            || local.some(peer => peer.state === null)) throw new Error('Invalid local presence snapshot');
        });
        if (closed) return;
        const current = new Map(local.map(peer => [peer.clientId, peer]));
        const departed = [...previous.values()].filter(peer => !current.has(peer.clientId)).map(peer => ({ ...peer, state: null }));
        // Remember all attempted peers so shutdown also removes partially delivered batches.
        for (const peer of local) previous.set(peer.clientId, peer);
        await publishBatch(departed); await publishBatch(local);
        if (!closed) previous = current;
      }
    }).catch(() => { throw new Error('Presence publication unavailable'); }).finally(() => { sending = undefined; });
    return sending;
  };
  const enqueue = (operation: () => Promise<void>) => {
    if (closed || accepting.size >= 16) return;
    const pending = Promise.resolve().then(() => options.serialize(async () => { if (!closed) { options.assertActive(); await operation(); } }))
      .catch(() => { if (!closed) options.failed(); }).finally(() => accepting.delete(pending));
    accepting.add(pending);
  };
  const catchUp = () => { if (!closed) void refresh().catch(() => options.publicationFailed()); };
  return {
    refresh,
    receive(input: unknown) {
      const receivedAt = now();
      const frame = parseRoomPresenceFrame(input);
      if (!frame || frame.source === options.source || frame.generation !== options.generation) return;
      enqueue(async () => {
        const delta = tracker.receive(frame, receivedAt);
        if (delta.updated.length || delta.removed.length) await options.accept(delta);
      });
    },
    start() {
      if (closed || timer) throw new Error('Presence transport unavailable');
      timer = setInterval(() => {
        enqueue(async () => { const delta = tracker.expire(); if (delta.removed.length) await options.accept(delta); });
        catchUp();
      }, 5000); timer.unref(); catchUp();
    },
    catchUp,
    close() {
      if (stopping) return stopping;
      closed = true; if (timer) clearInterval(timer);
      if (pauseTimer) clearTimeout(pauseTimer); resumePublication?.(); resumePublication = undefined;
      stopping = Promise.resolve().then(async () => {
        await Promise.allSettled([sending, ...accepting]);
        let tombstonesDelivered = false;
        try {
          options.assertActive();
          await publishBatch([...previous.values()].map(peer => ({ ...peer, state: null })));
          tombstonesDelivered = true;
        } catch { options.publicationFailed();
        } finally { previous.clear(); tracker.close(); }
        return { tombstonesDelivered };
      });
      return stopping;
    },
  };
};
