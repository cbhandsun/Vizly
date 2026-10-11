// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { createCollaborationSocket, createDocumentSendQueue } from '../collaborationSocket';

const wire = (update: Uint8Array, kind = 0, subtype = 2) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, kind);
  encoding.writeVarUint(encoder, subtype);
  encoding.writeVarUint8Array(encoder, update);
  return encoding.toUint8Array(encoder);
};
afterEach(() => vi.useRealTimers());

describe('causal document transport batching', () => {
  it('closes and cancels timers even when flushing the final operation fails', () => {
    vi.useFakeTimers();
    class SocketFixture extends EventTarget {
      static OPEN = 1;
      readyState = 1;
      failSend = false;
      sent = vi.fn();
      closed = vi.fn();
      constructor(_url: string | URL) { super(); }
      send(data: unknown) { if (this.failSend) throw new Error('send failed'); this.sent(data); }
      close() { this.readyState = 3; this.closed(); this.dispatchEvent(new Event('close')); }
    }
    const Socket = createCollaborationSocket(SocketFixture as unknown as typeof WebSocket);
    const socket = new Socket('ws://fixture.invalid') as unknown as SocketFixture;
    socket.send(wire(new Uint8Array([0, 0])));
    socket.send(wire(new Uint8Array([0, 0])));
    socket.failSend = true;
    expect(() => socket.close()).toThrow('send failed');
    expect(socket.closed).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(socket.sent).toHaveBeenCalledOnce();
  });
  it('keeps every operation, final drag position and a concurrent peer addition while limiting wire messages', () => {
    vi.useFakeTimers();
    const local = new Y.Doc(); const received = new Y.Doc(); const peer = new Y.Doc();
    let messages = 0;
    const queue = createDocumentSendQueue(data => {
      expect(data).toBeInstanceOf(Uint8Array);
      const decoder = decoding.createDecoder(data as Uint8Array);
      expect(decoding.readVarUint(decoder)).toBe(0);
      expect(decoding.readVarUint(decoder)).toBe(2);
      Y.applyUpdate(received, decoding.readVarUint8Array(decoder)); messages++;
    }, () => true);
    local.on('update', (update, origin) => { if (origin !== 'remote') queue.send(wire(update)); });
    try {
      for (let frame = 0; frame < 600; frame++) {
        local.getMap('nodes').set('drag', { x: frame, y: -frame });
        if (frame === 150) local.getMap('nodes').set('created', { label: 'keep' });
        if (frame === 200) {
          peer.getMap('nodes').set('peer', { label: 'other user' });
          Y.applyUpdate(local, Y.encodeStateAsUpdate(peer), 'remote');
          Y.applyUpdate(received, Y.encodeStateAsUpdate(peer));
        }
        if (frame === 300) local.getMap('edges').set('edge', { source: 'created', target: 'peer' });
        if (frame === 400) local.getMap('nodes').delete('created');
        vi.advanceTimersByTime(16);
      }
      vi.advanceTimersByTime(200);
      expect(messages).toBeLessThanOrEqual(50);
      expect(received.getMap('nodes').toJSON()).toEqual(local.getMap('nodes').toJSON());
      expect(received.getMap('nodes').get('drag')).toEqual({ x: 599, y: -599 });
      expect(received.getMap('nodes').has('peer')).toBe(true);
      expect(received.getMap('nodes').has('created')).toBe(false);
      expect(received.getMap('edges').toJSON()).toEqual(local.getMap('edges').toJSON());
    } finally { queue.cancel(); local.destroy(); received.destroy(); peer.destroy(); }
  });
  it('passes handshake, presence and nonbinary frames through unchanged', () => {
    const send = vi.fn(); const queue = createDocumentSendQueue(send, () => true);
    const frames = [wire(new Uint8Array(), 0, 1), wire(new Uint8Array(), 1), 'message', new Uint8Array([255])];
    for (const frame of frames) queue.send(frame);
    expect(send.mock.calls.map(call => call[0])).toEqual(frames);
    queue.cancel();
  });
  it('flushes a final operation before close and cancels pending work on disposal', () => {
    vi.useFakeTimers(); const doc = new Y.Doc(); const send = vi.fn();
    const queue = createDocumentSendQueue(send, () => true);
    doc.on('update', update => queue.send(wire(update)));
    try {
      doc.getMap('nodes').set('a', 1); doc.getMap('nodes').set('a', 2);
      expect(send).toHaveBeenCalledTimes(1); queue.flush();
      expect(send).toHaveBeenCalledTimes(2);
      doc.getMap('nodes').set('a', 3); queue.cancel();
      vi.advanceTimersByTime(1000); expect(send).toHaveBeenCalledTimes(2);
    } finally { queue.cancel(); doc.destroy(); }
  });
  it('does not send to a closed connection or send an empty pending batch', () => {
    const send = vi.fn(); const queue = createDocumentSendQueue(send, () => false);
    const doc = new Y.Doc();
    try {
      queue.flush(); queue.send(wire(Y.encodeStateAsUpdate(doc))); queue.flush();
      expect(send).not.toHaveBeenCalled();
    } finally { queue.cancel(); doc.destroy(); }
  });
  it('rejects excessive updates and propagates send and malformed merge failures', () => {
    vi.useFakeTimers();
    const failure = new Error('transport failure');
    const broken = createDocumentSendQueue(() => { throw failure; }, () => true);
    expect(() => broken.send(wire(new Uint8Array(2 * 1024 * 1024 + 1)))).toThrow('budget');
    expect(() => broken.send(wire(new Uint8Array([0, 0])))).toThrow(failure);
    broken.cancel();
    const queue = createDocumentSendQueue(vi.fn(), () => true);
    queue.send(wire(new Uint8Array([0, 0])));
    queue.send(wire(new Uint8Array([255])));
    expect(() => queue.send(wire(new Uint8Array([255])))).toThrow();
    queue.cancel();
  });
});
