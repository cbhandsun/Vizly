import WebSocket from 'ws';

class RoomSocketCloseEvent extends Event implements CloseEvent {
  readonly code: number; readonly reason: string; readonly wasClean: boolean;
  constructor(code: number) {
    super('close'); this.code = code; this.reason = ''; this.wasClean = code === 1000;
  }
}
/** DOM event bridge with a bounded native transport; no ws/DOM type assertion. */
export class BoundedRealtimeSocket extends EventTarget {
  static readonly CONNECTING = WebSocket.CONNECTING;
  static readonly OPEN = WebSocket.OPEN;
  static readonly CLOSING = WebSocket.CLOSING;
  static readonly CLOSED = WebSocket.CLOSED;
  readonly CONNECTING = WebSocket.CONNECTING; readonly OPEN = WebSocket.OPEN;
  readonly CLOSING = WebSocket.CLOSING; readonly CLOSED = WebSocket.CLOSED;
  private readonly socket: WebSocket;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(address: string | URL, protocols?: string | string[]) {
    super();
    this.socket = new WebSocket(address, protocols, { maxPayload: 16 * 1024, perMessageDeflate: false });
    const deliver = (callback: () => void) => {
      try { callback(); }
      catch { this.socket.close(1008); }
    };
    this.addEventListener('open', event => deliver(() => this.onopen?.(event)));
    this.addEventListener('message', event => deliver(() => { if (event instanceof MessageEvent) this.onmessage?.(event); }));
    this.addEventListener('close', event => deliver(() => { if (event instanceof RoomSocketCloseEvent) this.onclose?.(event); }));
    this.addEventListener('error', event => deliver(() => this.onerror?.(event)));
    this.socket.on('open', () => this.dispatchEvent(new Event('open')));
    this.socket.on('error', () => this.dispatchEvent(new Event('error')));
    this.socket.on('close', code => this.dispatchEvent(new RoomSocketCloseEvent(code)));
    this.socket.on('message', (data, binary) => {
      const buffer = data instanceof ArrayBuffer ? Buffer.from(data) : Array.isArray(data) ? Buffer.concat(data) : data;
      this.dispatchEvent(new MessageEvent('message', { data: binary ? Uint8Array.from(buffer).buffer : buffer.toString('utf8') }));
    });
  }
  get readyState() { return this.socket.readyState; }
  get url() { return this.socket.url; }
  get protocol() { return this.socket.protocol; }
  get bufferedAmount() { return this.socket.bufferedAmount; }
  get extensions() { return this.socket.extensions; }
  get binaryType() { return 'arraybuffer'; }
  set binaryType(value: string) { if (value !== 'arraybuffer') throw new Error('Unsupported private notification encoding'); }
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (data instanceof Blob) throw new Error('Unsupported private notification encoding');
    const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8')
      : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data);
    if (bytes.byteLength > 16 * 1024 || this.socket.bufferedAmount > 64 * 1024) throw new Error('Private notification transport budget exceeded');
    this.socket.send(typeof data === 'string' ? data : bytes);
  }
  close(code?: number, reason?: string) { this.socket.close(code, reason); }
}
