import { mergeUpdates } from 'yjs';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';

const maxBytes = 2 * 1024 * 1024;
const intervalMs = 200;
type SocketData = string | ArrayBufferLike | Blob | ArrayBufferView;

/** Merge causal Yjs operations, rather than replacing local canvas snapshots. */
export const createDocumentSendQueue = (send: (data: SocketData) => void, isOpen: () => boolean) => {
  let pending: Uint8Array | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSent = -Infinity;
  const cancel = () => { if (timer) clearTimeout(timer); timer = undefined; pending = undefined; };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const update = pending;
    pending = undefined;
    if (!update || !isOpen()) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    encoding.writeVarUint(encoder, 2);
    encoding.writeVarUint8Array(encoder, update);
    lastSent = Date.now();
    send(encoding.toUint8Array(encoder));
  };
  return {
    send(data: SocketData) {
      const binary = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
      if (!binary) { send(data); return; }
      let update: Uint8Array | undefined;
      try {
        const decoder = decoding.createDecoder(binary);
        if (decoding.readVarUint(decoder) === 0 && decoding.readVarUint(decoder) === 2) {
          update = decoding.readVarUint8Array(decoder);
          if (decoding.hasContent(decoder)) update = undefined;
        }
      } catch { update = undefined; }
      if (!update) { send(data); return; }
      if (update.byteLength > maxBytes) throw new Error('Collaboration update exceeds budget');
      const merged = pending ? mergeUpdates([pending, update]) : Uint8Array.from(update);
      if (merged.byteLength > maxBytes) throw new Error('Collaboration update exceeds budget');
      pending = merged;
      if (Date.now() - lastSent >= intervalMs) flush();
      else timer ??= setTimeout(flush, intervalMs - (Date.now() - lastSent));
    },
    flush,
    cancel,
  };
};

/** Public provider injection point; no y-websocket private listeners modified. */
export const createCollaborationSocket = (BaseSocket: typeof WebSocket = globalThis.WebSocket): typeof WebSocket =>
  class CollaborationSocket extends BaseSocket {
    private readonly documentQueue = createDocumentSendQueue(data => {
      if (typeof data === 'string' || data instanceof Blob) super.send(data);
      else if (ArrayBuffer.isView(data)) super.send(Uint8Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)));
      else super.send(Uint8Array.from(new Uint8Array(data)));
    }, () => this.readyState === BaseSocket.OPEN);
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      this.addEventListener('close', () => this.documentQueue.cancel());
    }
    override send(data: SocketData): void { this.documentQueue.send(data); }
    override close(code?: number, reason?: string): void {
      try { this.documentQueue.flush(); }
      finally { this.documentQueue.cancel(); super.close(code, reason); }
    }
  };
