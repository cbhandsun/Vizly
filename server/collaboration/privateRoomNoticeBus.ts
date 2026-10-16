import { isRoomGeneration } from './atomicRoomCommit.js';
import { parseRoomCommitNotice, type RoomCommitNotice, type RoomNoticeBus } from './distributedRoomSync.js';
import { parseRoomPresenceFrame, type RoomPresenceFrame } from './distributedPresence.js';

export interface PrivateRoomChannel {
  receive: (callback: (input: unknown) => void) => void;
  subscribe: (callback: (status: string) => void) => void;
  send: (notice: RoomCommitNotice) => Promise<boolean>;
  receivePresence?: (callback: (input: unknown) => void) => void;
  sendPresence?: (frame: RoomPresenceFrame) => Promise<boolean>;
  close: () => Promise<boolean>;
}
export interface PrivateRoomRealtime {
  channel: (topic: string) => PrivateRoomChannel;
  disconnect: () => void;
}
const unavailable = () => new Error('Private room notification unavailable');
const deadlineMs = 8000;
const bounded = async <T>(operation: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(unavailable()), deadlineMs); })]);
  } finally { if (timer) clearTimeout(timer); }
};

/** Backend-only topics, bounded admission and publication, and explicit cleanup receipts. */
export const createPrivateRoomNoticeBus = (client: PrivateRoomRealtime): RoomNoticeBus & { stop: () => Promise<void> } => {
  const channels = new Map<string, { close: () => Promise<void> }>();
  let stopped = false; let stopPromise: Promise<void> | undefined;
  return {
    async subscribe(id, receive, catchUp, receivePresence) {
      if (!isRoomGeneration(id) || stopped || channels.size >= 64) throw unavailable();
      const roomId = id.toLowerCase();
      if (channels.has(roomId)) throw unavailable();
      const channel = client.channel(`vizly-backend:v1:${roomId}`);
      let closed = false; let ready = false; let joined = false; let publishers = 0;
      const publishing = new Set<Promise<void>>();
      let closePromise: Promise<void> | undefined;
      let resolveReady: () => void = () => { throw unavailable(); };
      let rejectReady: (error: Error) => void = () => { throw unavailable(); };
      const readyPromise = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      // Attach rejection handling before close/stop can cancel a pending admission.
      const awaitedReady = bounded(readyPromise);
      void awaitedReady.catch(() => undefined);
      const close = () => {
        if (closePromise) return closePromise;
        closed = true; ready = false; rejectReady(unavailable());
        closePromise = Promise.resolve().then(async () => {
          try {
            const results = await Promise.allSettled([bounded(channel.close()), ...publishing]);
            if (results[0].status !== 'fulfilled' || results[0].value !== true) throw unavailable();
          }
          catch { throw new Error('Private room subscription disposal failed'); }
          finally { if (channels.get(roomId)?.close === close) channels.delete(roomId); }
        });
        return closePromise;
      };
      channels.set(roomId, { close });
      const publish = async (valid: boolean, operation: () => Promise<boolean>) => {
        if (!valid || stopped || closed || !ready || publishers >= 16) throw unavailable();
        publishers++;
        const sending = Promise.resolve().then(async () => {
          if (closed || stopped || !ready) throw unavailable();
          if (await bounded(operation()) !== true || closed || stopped || !ready) throw unavailable();
        }).catch(() => { throw unavailable(); });
        publishing.add(sending);
        try { await sending; }
        finally { publishers--; publishing.delete(sending); }
      };
      try {
        if (receivePresence) {
          if (!channel.receivePresence || !channel.sendPresence) throw unavailable();
          channel.receivePresence(input => {
            if (!closed && ready) { const frame = parseRoomPresenceFrame(input); if (frame) receivePresence(frame); }
          });
        }
        channel.receive(input => {
          if (!closed && ready) { const notice = parseRoomCommitNotice(input); if (notice) receive(notice); }
        });
        channel.subscribe(status => {
          if (closed || stopped) return;
          if (status === 'SUBSCRIBED') {
            ready = true;
            if (!joined) { joined = true; resolveReady(); }
            else catchUp();
          } else {
            ready = false;
            if (!joined) rejectReady(unavailable());
          }
        });
        await awaitedReady;
        if (closed || stopped || !ready) throw unavailable();
        return {
          async publish(input) {
            const notice = parseRoomCommitNotice(input);
            return publish(notice !== null, () => { if (!notice) throw unavailable(); return channel.send(notice); });
          },
          ...(channel.sendPresence ? { async publishPresence(input: RoomPresenceFrame) {
            const frame = parseRoomPresenceFrame(input);
            return publish(frame !== null, () => {
              if (!frame || !channel.sendPresence) throw unavailable(); return channel.sendPresence(frame);
            });
          } } : {}), close,
        };
      } catch { await close(); throw unavailable(); }
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopped = true;
      stopPromise = Promise.resolve().then(async () => {
        const results = await Promise.allSettled([...channels.values()].map(subscription => subscription.close()));
        try { client.disconnect(); } catch { throw new Error('Private room notification disposal failed'); }
        if (results.some(result => result.status === 'rejected')) throw new Error('Private room notification disposal failed');
      });
      return stopPromise;
    },
  };
};
