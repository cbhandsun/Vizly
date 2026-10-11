import { createServer } from 'node:http';
import type { Duplex } from 'node:stream';
import WebSocket, { WebSocketServer, type RawData } from 'ws';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as sync from 'y-protocols/sync';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { MAX_DOCUMENT_BYTES, parseConnection, validateDocument } from './boundary.js';
import type { AuthorizeDiagram, DiagramPermission } from './authorization.js';
import type { RoomPersistence } from './persistence.js';
import { acceptPersistedRoomState } from './acceptedRoomState.js';
import type { DistributedRoomLease } from './distributedRoomLease.js';
import type { OpenRoomSynchronization, RoomSynchronization } from './distributedRoomSync.js';
import { decodeRoomRecord, compareCloudCheckpointRevisions } from './roomCheckpoint.js';
import { sanitizePresence } from './presence.js';
import { createRemoteRoomAwareness } from './remoteRoomAwareness.js';
import type { DistributedPresencePeer } from './distributedPresence.js';
import { formatCollaborationAccess, hasSharedCollaborationElements, upgradeCollaborationDocument } from './documentModel.js';
import type { BootstrapIdentity } from './roomBootstrap.js';
import { createRoomLifetime, type RoomLease } from './roomLifetime.js';
import { CloudRoomConflictError } from './cloudRoomReconciliation.js';
import { COORDINATION_STATUS_MESSAGE } from './coordinationStatus.js';
import { CLOUD_REVISION_MESSAGE, writeAcceptedCloudRevision } from './cloudRevisionProtocol.js';
import { createRoomRecoveryHttp } from './roomRecoveryHttp.js';
import type { createRoomRecovery } from './roomRecovery.js';

type SafeEvent = 'authorization-failed' | 'invalid-message' | 'persistence-failed' | 'room-load-failed' | 'cloud-coordination-failed' | 'room-synchronization-failed' | 'room-notification-failed';
interface Connection { socket: WebSocket; token: string; diagramId: string; permission: DiagramPermission; awarenessId?: number; presenceId?: number; pending: number; window: number; messages: number; queuedPresence?: Uint8Array; queuedDocument?: Uint8Array }
interface Room { doc: Y.Doc; awareness: Awareness; connections: Set<Connection>; queue: Promise<void>; cloudRevision?: string;
  distributedLease?: DistributedRoomLease; detachLease?: () => void; synchronization?: RoomSynchronization;
  nextPresenceId: number; remoteAwareness: ReturnType<typeof createRemoteRoomAwareness> }
export interface CollaborationServerOptions {
  authorize: AuthorizeDiagram;
  persistence: RoomPersistence;
  acquireRoomLease?: (diagramId: string) => Promise<DistributedRoomLease>;
  openRoomSynchronization?: OpenRoomSynchronization;
  bootstrap?: (identity: BootstrapIdentity) => Promise<Uint8Array>;
  loadInitialRoom?: (identity: BootstrapIdentity) => Promise<Uint8Array>;
  coordinateActiveRoom?: (identity: BootstrapIdentity, liveState: Uint8Array) => Promise<Uint8Array | null>;
  readAcceptedRoomRevision?: (diagramId: string) => Promise<string | undefined>;
  origins: ReadonlySet<string>;
  recheckMs?: number;
  log?: (event: SafeEvent) => void;
  recovery?: { authorizeOwner: AuthorizeDiagram; operations: ReturnType<typeof createRoomRecovery> };
}
const message = (kind: number, body: (encoder: encoding.Encoder) => void) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, kind);
  body(encoder);
  return encoding.toUint8Array(encoder);
};
const bytes = (data: RawData): Uint8Array => data instanceof ArrayBuffer ? new Uint8Array(data)
  : Array.isArray(data) ? Buffer.concat(data) : data;
const rejectUpgrade = (socket: Duplex) => {
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
};

/** Loopback-only runtime. Authorization and durability precede every accepted update. */
export const createCollaborationServer = (options: CollaborationServerOptions) => {
  const activeRooms = new Map<string, Room>();
  const rooms = createRoomLifetime<Room>(64, async room => {
    try { await room.synchronization?.close(); await room.queue; }
    finally {
      for (const [id, active] of activeRooms) if (active === room) activeRooms.delete(id);
      room.detachLease?.();
      try { await room.distributedLease?.close(); }
      finally { room.awareness.destroy(); room.doc.destroy(); }
    }
  });
  const connections = new Set<Connection>();
  let pendingUpgrades = 0;
  let stopped = false;
  let stopPromise: Promise<void> | undefined;
  const upgrades = new Set<Duplex>();
  const pendingRooms = new Map<string, number>();
  const recoveringRooms = new Set<string>();
  const recoverHttp = options.recovery ? createRoomRecoveryHttp({ ...options.recovery, origins: options.origins,
    reserveIdleRoom: id => {
      if (stopped || activeRooms.has(id) || pendingRooms.has(id) || recoveringRooms.has(id)) return null;
      recoveringRooms.add(id);
      return () => { recoveringRooms.delete(id); };
    },
  }) : undefined;
  const http = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(stopped ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ status: stopped ? 'stopping' : 'ready' }));
    } else if (recoverHttp && request.url?.startsWith('/recovery/')) {
      void recoverHttp(request, response);
    } else { response.writeHead(404); response.end(); }
  });
  const websocket = new WebSocketServer({ noServer: true, maxPayload: MAX_DOCUMENT_BYTES, perMessageDeflate: false });
  const close = (connection: Connection) => {
    connection.socket.close(1008, 'Access or message rejected');
    // Bound close-handshake lifetime even for an unresponsive client.
    const timer = setTimeout(() => connection.socket.terminate(), 500);
    timer.unref();
  };
  const authorize = async (token: string, diagramId: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        options.authorize(token, diagramId),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 6000); }),
      ]);
    } catch { options.log?.('authorization-failed'); return null; }
    finally { if (timer) clearTimeout(timer); }
  };
  const allowed = async (connection: Connection) => {
    if (stopped || connection.socket.readyState !== WebSocket.OPEN) return false;
    try { const room = activeRooms.get(connection.diagramId); room?.distributedLease?.assertActive(); room?.synchronization?.assertActive(); }
    catch { close(connection); return false; }
    const permission = await authorize(connection.token, connection.diagramId);
    try { const room = activeRooms.get(connection.diagramId); room?.distributedLease?.assertActive(); room?.synchronization?.assertActive(); }
    catch { close(connection); return false; }
    if (!permission || permission.userId !== connection.permission.userId) { close(connection); return false; }
    const roleChanged = permission.role !== connection.permission.role;
    connection.permission = permission;
    if (roleChanged && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(message(4, encoder => encoding.writeVarString(encoder, formatCollaborationAccess(permission.role))));
    }
    return connection.socket.readyState === WebSocket.OPEN;
  };
  const send = async (connection: Connection, payload: Uint8Array) => {
    if (!await allowed(connection)) return;
    if (connection.socket.bufferedAmount > MAX_DOCUMENT_BYTES) { close(connection); return; }
    connection.socket.send(payload);
  };
  const broadcast = (room: Room, payload: Uint8Array) => Promise.all([...room.connections].map(connection => send(connection, payload)));
  const getRoom = async (diagramId: string, token: string, userId: string): Promise<RoomLease<Room>> => {
    const lease = await rooms.acquire(diagramId, async (): Promise<Room> => {
      const doc = new Y.Doc();
      let distributedLease: DistributedRoomLease | undefined;
      let initializingRoom: Room | undefined;
      try {
        distributedLease = await options.acquireRoomLease?.(diagramId);
        distributedLease?.assertActive();
        const state = options.loadInitialRoom
          ? await options.loadInitialRoom({ token, diagramId, userId })
          : await options.persistence.load(diagramId);
        if (state) Y.applyUpdate(doc, state);
        else if (options.bootstrap) Y.applyUpdate(doc, await options.bootstrap({ token, diagramId, userId }));
        if (!validateDocument(doc)) throw new Error('Invalid persisted room');
        distributedLease?.assertActive();
        const previous = Y.encodeStateAsUpdate(doc);
        if (!upgradeCollaborationDocument(doc) || !validateDocument(doc)) throw new Error('Invalid upgraded room');
        const upgraded = Y.encodeStateAsUpdate(doc);
        if ((!state && options.bootstrap) || (state && !Buffer.from(previous).equals(Buffer.from(upgraded)))) {
          const committed = acceptPersistedRoomState(upgraded, await options.persistence.save(diagramId, Uint8Array.from(upgraded)));
          Y.applyUpdate(doc, committed);
          distributedLease?.assertActive();
          if (!hasSharedCollaborationElements(doc)) throw new Error('Unsupported persisted document format');
        }
        const cloudRevision = await options.readAcceptedRoomRevision?.(diagramId);
        distributedLease?.assertActive();
        if (cloudRevision) message(CLOUD_REVISION_MESSAGE, encoder => writeAcceptedCloudRevision(encoder, cloudRevision, doc));
        const awareness = new Awareness(doc);
        awareness.setLocalState(null);
        const room: Room = { doc, awareness, connections: new Set(), queue: Promise.resolve(), cloudRevision, distributedLease,
          nextPresenceId: 0, remoteAwareness: createRemoteRoomAwareness(awareness) };
        initializingRoom = room;
        if (distributedLease) {
          const lost = () => { for (const connection of room.connections) close(connection); };
          distributedLease.signal.addEventListener('abort', lost, { once: true });
          room.detachLease = () => distributedLease?.signal.removeEventListener('abort', lost);
        }
        activeRooms.set(diagramId, room);
        if (options.openRoomSynchronization) {
          if (!distributedLease) throw new Error('Synchronization requires admitted generation');
          room.synchronization = await options.openRoomSynchronization({ roomId: diagramId, generation: distributedLease.generation,
            presence: { source: distributedLease.leaseId, assertActive: distributedLease.assertActive,
              publicationFailed: () => options.log?.('room-notification-failed'),
              readLocal: async () => {
                const peers = await Promise.all([...room.connections].map(async connection => {
                  if (connection.awarenessId === undefined || connection.presenceId === undefined || !await allowed(connection)) return null;
                  const state = room.awareness.getStates().get(connection.awarenessId);
                  if (state === undefined) return null;
                  const safe = sanitizePresence(state, connection.permission.userId);
                  if (!safe) return null;
                  return { clientId: connection.presenceId, userId: connection.permission.userId,
                    state: safe.cursor === undefined ? {} : { cursor: safe.cursor } };
                }));
                return peers.filter((peer): peer is DistributedPresencePeer & { state: NonNullable<DistributedPresencePeer['state']> } => peer !== null);
              },
              accept: async delta => {
                if (stopped) return; room.distributedLease?.assertActive();
                const reserved = new Set([...room.connections].flatMap(connection => connection.awarenessId === undefined ? [] : [connection.awarenessId]));
                const update = room.remoteAwareness.apply(delta, reserved);
                if (update) await broadcast(room, message(1, encoder => encoding.writeVarUint8Array(encoder, update)));
              },
            },
            unavailable: () => { options.log?.('room-synchronization-failed'); for (const connection of room.connections) close(connection); },
            serialize: operation => {
              const result = room.queue.then(operation);
              // The synchronizer receives rejection and fences the room.
              room.queue = result.catch(() => undefined);
              return result;
            },
            accept: async snapshot => {
                if (stopped) return;
                room.distributedLease?.assertActive();
                const record = decodeRoomRecord(snapshot.record);
                const candidate = new Y.Doc();
                try {
                  // Read and acceptance run under the room queue. All live
                  // operations were committed before this read, so omission
                  // is a durability failure, including omitted deletions.
                  const committed = acceptPersistedRoomState(Y.encodeStateAsUpdate(room.doc), record.state);
                  Y.applyUpdate(candidate, committed);
                  if (!validateDocument(candidate) || !hasSharedCollaborationElements(candidate)) throw new Error('Invalid synchronized room');
                  const revision = record.checkpoint?.revision;
                  if (revision && room.cloudRevision && compareCloudCheckpointRevisions(revision, room.cloudRevision) < 0) {
                    throw new Error('Synchronized cloud revision regressed');
                  }
                  const payload = revision ? message(CLOUD_REVISION_MESSAGE,
                    encoder => writeAcceptedCloudRevision(encoder, revision, candidate)) : null;
                  room.distributedLease?.assertActive();
                  const update = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(room.doc));
                  Y.applyUpdate(room.doc, update);
                  if (revision) room.cloudRevision = revision;
                  await broadcast(room, message(0, encoder => sync.writeUpdate(encoder, update)));
                  if (payload) await broadcast(room, payload);
                } finally { candidate.destroy(); }
            },
          });
        }
        return room;
      } catch (error: unknown) {
        activeRooms.delete(diagramId);
        initializingRoom?.detachLease?.();
        initializingRoom?.awareness.destroy();
        doc.destroy();
        await distributedLease?.close();
        if (error instanceof CloudRoomConflictError) throw error;
        throw new Error('Room unavailable', { cause: error });
      }
    });
    try { lease.value.distributedLease?.assertActive(); lease.value.synchronization?.assertActive(); }
    catch (error: unknown) { await lease.release(); throw error; }
    const departing = [...lease.value.connections];
    if (departing.length > 0 && departing.every(connection => connection.socket.readyState !== WebSocket.OPEN)) {
      // A client can receive its close notification before the server's close
      // listeners have released the final room reservation. Do not admit the
      // next peer into that retiring room and bypass cold cloud reconciliation.
      const closed = Promise.all(departing.map(connection => connection.socket.readyState === WebSocket.CLOSED
        ? Promise.resolve() : new Promise<void>(resolve => connection.socket.once('close', () => resolve()))));
      await lease.release();
      await closed;
      return getRoom(diagramId, token, userId);
    }
    return lease;
  };
  const applyUpdate = async (room: Room, connection: Connection, update: Uint8Array) => {
    const candidate = new Y.Doc();
    try {
      const previous = Y.encodeStateAsUpdate(room.doc);
      Y.applyUpdate(candidate, previous);
      Y.applyUpdate(candidate, update);
      if (!validateDocument(candidate)) throw new Error('Invalid document');
      if (!hasSharedCollaborationElements(candidate)) throw new Error('Unsupported document format');
      const next = Y.encodeStateAsUpdate(candidate);
      if (Buffer.from(previous).equals(Buffer.from(next))) return;
      if (connection.permission.role !== 'editor') throw new Error('Read-only document');
      try {
        room.distributedLease?.assertActive();
        const committed = acceptPersistedRoomState(next, await options.persistence.save(connection.diagramId, Uint8Array.from(next)));
        room.distributedLease?.assertActive();
        Y.applyUpdate(candidate, committed);
        if (!validateDocument(candidate) || !hasSharedCollaborationElements(candidate)) throw new Error('Invalid accepted document');
      }
      catch { options.log?.('persistence-failed'); throw new Error('Room persistence failed'); }
      const acceptedUpdate = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(room.doc));
      Y.applyUpdate(room.doc, acceptedUpdate);
      await broadcast(room, message(0, encoder => sync.writeUpdate(encoder, acceptedUpdate)));
      // Refresh acceptance queues behind this operation; awaiting it here would deadlock.
      void room.synchronization?.notifyCommitted().catch(() => options.log?.('room-notification-failed'));
    } finally { candidate.destroy(); }
  };
  const handleMessage = async (room: Room, connection: Connection, input: Uint8Array) => {
    if (!await allowed(connection)) return;
    const decoder = decoding.createDecoder(input);
    const kind = decoding.readVarUint(decoder);
    if (kind === 0) {
      const subtype = decoding.readVarUint(decoder);
      const payload = decoding.readVarUint8Array(decoder);
      if (decoding.hasContent(decoder)) throw new Error('Unexpected trailing message');
      if (subtype === sync.messageYjsSyncStep1) {
        await send(connection, message(0, encoder => sync.writeSyncStep2(encoder, room.doc, payload)));
        const revision = room.cloudRevision;
        if (revision) await send(connection, message(CLOUD_REVISION_MESSAGE,
          encoder => writeAcceptedCloudRevision(encoder, revision, room.doc)));
      } else if (subtype === sync.messageYjsSyncStep2 || subtype === sync.messageYjsUpdate) {
        await applyUpdate(room, connection, payload);
      } else throw new Error('Unknown synchronization message');
    } else if (kind === 1) {
      const update = decoding.readVarUint8Array(decoder);
      if (decoding.hasContent(decoder) || update.byteLength > 8192) throw new Error('Invalid presence update');
      const presence = decoding.createDecoder(update);
      if (decoding.readVarUint(presence) !== 1) throw new Error('Invalid presence count');
      const clientId = decoding.readVarUint(presence);
      const clock = decoding.readVarUint(presence);
      const rawState = decoding.readVarString(presence);
      const state: unknown = JSON.parse(rawState);
      if (decoding.hasContent(presence) || clientId > 0xffffffff || clock > 0xffffffff
        || (state !== null && (typeof state !== 'object' || Array.isArray(state)))
        || (connection.awarenessId !== undefined && connection.awarenessId !== clientId)
        || [...room.connections].some(other => other !== connection && other.awarenessId === clientId)) throw new Error('Invalid presence identity');
      connection.awarenessId = clientId;
      const sanitized = encoding.createEncoder();
      encoding.writeVarUint(sanitized, 1);
      encoding.writeVarUint(sanitized, clientId);
      encoding.writeVarUint(sanitized, clock);
      encoding.writeVarString(sanitized, JSON.stringify(sanitizePresence(state, connection.permission.userId)));
      const safeUpdate = encoding.toUint8Array(sanitized);
      applyAwarenessUpdate(room.awareness, safeUpdate, connection);
      await broadcast(room, message(1, encoder => encoding.writeVarUint8Array(encoder, safeUpdate)));
      void room.synchronization?.notifyPresence?.().catch(() => options.log?.('room-notification-failed'));
    } else if (kind === 3 && !decoding.hasContent(decoder)) {
      await send(connection, message(1, encoder => encoding.writeVarUint8Array(encoder, encodeAwarenessUpdate(room.awareness, [...room.awareness.getStates().keys()]))));
    } else throw new Error('Unknown message');
  };
  http.on('upgrade', (request, socket, head) => {
    const parsed = parseConnection(request.url, request.headers.origin, options.origins);
    if (!parsed || stopped || recoveringRooms.has(parsed.diagramId) || connections.size + pendingUpgrades >= 128) { rejectUpgrade(socket); return; }
    pendingUpgrades++;
    pendingRooms.set(parsed.diagramId, (pendingRooms.get(parsed.diagramId) ?? 0) + 1);
    upgrades.add(socket);
    let lease: RoomLease<Room> | undefined;
    let connected = false;
    void (async () => {
      const permission = await authorize(parsed.token, parsed.diagramId);
      if (!permission || stopped || socket.destroyed) { rejectUpgrade(socket); return; }
      try { lease = await getRoom(parsed.diagramId, parsed.token, permission.userId); }
      catch (error: unknown) {
        if (!options.loadInitialRoom || stopped || socket.destroyed) throw error;
        // Report a content-free recovery state only after revalidating access.
        // This socket never joins a room and never accepts document updates.
        const fresh = await authorize(parsed.token, parsed.diagramId);
        if (!fresh || fresh.userId !== permission.userId || stopped || socket.destroyed) { rejectUpgrade(socket); return; }
        websocket.handleUpgrade(request, socket, head, ws => {
          const recovery: Connection = { socket: ws, ...parsed, permission: fresh, pending: 0, window: Date.now(), messages: 0 };
          connections.add(recovery);
          ws.on('error', () => close(recovery));
          ws.on('message', () => close(recovery));
          ws.once('close', () => connections.delete(recovery));
          ws.send(message(COORDINATION_STATUS_MESSAGE, encoder => encoding.writeVarString(encoder,
            error instanceof CloudRoomConflictError ? 'cloud-conflict' : 'cloud-unavailable')), () => close(recovery));
        });
        options.log?.('room-load-failed');
        return;
      }
      const room = lease.value;
      const reservation = lease;
      if (stopped || socket.destroyed) { rejectUpgrade(socket); return; }
      if (room.nextPresenceId > 0xffffffff) { rejectUpgrade(socket); return; }
      websocket.handleUpgrade(request, socket, head, ws => {
        connected = true;
        const connection: Connection = { socket: ws, ...parsed, permission, presenceId: room.nextPresenceId++, pending: 0, window: Date.now(), messages: 0 };
        room.connections.add(connection);
        connections.add(connection);
        ws.on('error', () => close(connection));
        ws.on('message', (raw: RawData, binary: boolean) => {
          const now = Date.now();
          if (now - connection.window >= 10_000) { connection.window = now; connection.messages = 0; }
          if (!binary || ++connection.messages > 120) { close(connection); return; }
          const input = bytes(raw);
          let presenceMessage = false;
          let documentUpdate: Uint8Array | undefined;
          try {
            const decoder = decoding.createDecoder(input);
            const kind = decoding.readVarUint(decoder);
            presenceMessage = kind === 1;
            if (kind === 0 && decoding.readVarUint(decoder) === sync.messageYjsUpdate) {
              documentUpdate = decoding.readVarUint8Array(decoder);
              if (decoding.hasContent(decoder)) throw new Error('Invalid update frame');
              // CRDT merge preserves all operations and their causal ordering.
              const previous = connection.queuedDocument;
              const merged = previous ? Y.mergeUpdates([previous, documentUpdate]) : Uint8Array.from(documentUpdate);
              if (merged.byteLength > MAX_DOCUMENT_BYTES) throw new Error('Queued update exceeds budget');
              connection.queuedDocument = merged;
              if (previous) return;
            }
          } catch { options.log?.('invalid-message'); close(connection); return; }
          // Presence is replaceable, unlike durable Yjs operations. Bound the
          // queued presence to one payload per connection under slow auth.
          if (presenceMessage) {
            if (input.byteLength > 8208) { close(connection); return; }
            if (connection.queuedPresence) { connection.queuedPresence = Uint8Array.from(input); return; }
            connection.queuedPresence = Uint8Array.from(input);
          }
          if (++connection.pending > 16) { close(connection); return; }
          room.queue = room.queue.then(() => {
            const current = presenceMessage ? connection.queuedPresence : documentUpdate
              ? message(0, encoder => sync.writeUpdate(encoder, connection.queuedDocument ?? documentUpdate)) : input;
            if (presenceMessage) connection.queuedPresence = undefined;
            if (documentUpdate) connection.queuedDocument = undefined;
            return current ? handleMessage(room, connection, current) : undefined;
          })
            .catch(() => { options.log?.('invalid-message'); close(connection); })
            .finally(() => { connection.pending--; });
        });
        ws.on('close', () => {
          connections.delete(connection);
          room.connections.delete(connection);
          void room.synchronization?.notifyPresence?.().catch(() => options.log?.('room-notification-failed'));
          if (!stopped && connection.awarenessId !== undefined && room.awareness.meta.has(connection.awarenessId)) {
            removeAwarenessStates(room.awareness, [connection.awarenessId], connection);
            const update = encodeAwarenessUpdate(room.awareness, [connection.awarenessId]);
            room.queue = room.queue.then(async () => { await broadcast(room, message(1, encoder => encoding.writeVarUint8Array(encoder, update))); })
              .catch(() => options.log?.('authorization-failed'));
          }
          void reservation.release().catch(() => options.log?.('room-load-failed'));
        });
        void send(connection, message(4, encoder => encoding.writeVarString(encoder, formatCollaborationAccess(permission.role))))
          .then(() => send(connection, message(0, encoder => sync.writeSyncStep1(encoder, room.doc))))
          .catch(() => close(connection));
      });
    })().catch(() => { options.log?.('room-load-failed'); rejectUpgrade(socket); })
      .finally(async () => {
        pendingUpgrades--; upgrades.delete(socket);
        if (!connected) await lease?.release().catch(() => options.log?.('room-load-failed'));
        const remaining = (pendingRooms.get(parsed.diagramId) ?? 1) - 1;
        if (remaining === 0) pendingRooms.delete(parsed.diagramId); else pendingRooms.set(parsed.diagramId, remaining);
      });
  });
  let checking = false;
  const recheck = setInterval(() => {
    if (checking || stopped) return;
    checking = true;
    void Promise.all([...connections].map(connection => allowed(connection)))
      .then(async () => {
        if (!options.coordinateActiveRoom || stopped) return;
        await Promise.all([...activeRooms].map(async ([diagramId, room]) => {
          if (room.connections.size === 0) return;
          room.queue = room.queue.then(async () => {
            const connection = [...room.connections].find(peer => peer.socket.readyState === WebSocket.OPEN);
            if (!connection || !await allowed(connection) || stopped) return;
            const next = await options.coordinateActiveRoom?.({ token: connection.token, diagramId, userId: connection.permission.userId }, Y.encodeStateAsUpdate(room.doc));
            if (!next || stopped) return;
            const candidate = new Y.Doc();
            try {
              Y.applyUpdate(candidate, next);
              if (!validateDocument(candidate)) throw new Error('Invalid coordinated room');
              const cloudRevision = await options.readAcceptedRoomRevision?.(diagramId);
              const revisionMessage = cloudRevision ? message(CLOUD_REVISION_MESSAGE,
                encoder => writeAcceptedCloudRevision(encoder, cloudRevision, candidate)) : null;
              const update = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(room.doc));
              Y.applyUpdate(room.doc, update);
              room.cloudRevision = cloudRevision;
              await broadcast(room, message(0, encoder => sync.writeUpdate(encoder, update)));
              if (revisionMessage) await broadcast(room, revisionMessage);
              void room.synchronization?.notifyCommitted().catch(() => options.log?.('room-notification-failed'));
            } finally { candidate.destroy(); }
          }).catch(async (error: unknown) => {
            options.log?.('cloud-coordination-failed');
            try {
              await broadcast(room, message(COORDINATION_STATUS_MESSAGE, encoder => encoding.writeVarString(encoder,
                error instanceof CloudRoomConflictError ? 'cloud-conflict' : 'cloud-unavailable')));
            } finally { for (const connection of room.connections) close(connection); }
          });
          await room.queue;
        }));
      })
      .catch(() => options.log?.('authorization-failed'))
      .finally(() => { checking = false; });
  }, options.recheckMs ?? 3000);
  recheck.unref();
  return {
    http,
    async listen(port = 0) {
      await new Promise<void>((accept, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', accept); });
      const address = http.address();
      if (!address || typeof address === 'string') throw new Error('Server address unavailable');
      return { port: address.port, url: `ws://127.0.0.1:${address.port}` };
    },
    stop() {
      if (stopPromise) return stopPromise;
      stopped = true;
      clearInterval(recheck);
      // Publish shutdown before close/abort observers can re-enter it. Complete
      // every cleanup even if one fails, and retain a failed disposal receipt.
      stopPromise = Promise.resolve().then(async () => {
        for (const socket of upgrades) socket.destroy();
        for (const connection of connections) connection.socket.terminate();
        const results = await Promise.allSettled([recoverHttp?.stop(), rooms.stop(),
          new Promise<void>((accept, reject) => websocket.close(error => error ? reject(error) : accept())),
          http.listening ? new Promise<void>((accept, reject) => http.close(error => error ? reject(error) : accept())) : Promise.resolve(),
        ]);
        if (results.some(result => result.status === 'rejected')) {
          options.log?.('room-load-failed');
          throw new Error('Collaboration service disposal failed');
        }
      });
      return stopPromise;
    },
  };
};
