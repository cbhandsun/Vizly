import { createHash, timingSafeEqual } from 'node:crypto';
import * as Y from 'yjs';
import { MAX_DOCUMENT_BYTES, validateDocument } from './boundary.js';

export interface RoomCheckpoint { revision: string; base: Uint8Array; state: Uint8Array }
export interface RoomRecord { state: Uint8Array; checkpoint: { revision: string; base: Uint8Array } | null }
const magic = Buffer.from('VIZLY-ROOM-CHECKPOINT\n');
const prefixBytes = magic.length + 12;
const digestBytes = 32;
export const MAX_CHECKPOINT_BYTES = prefixBytes + 40 + MAX_DOCUMENT_BYTES * 2 + digestBytes;

const revisionValid = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 40) return false;
  const parts = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::\d{2})?)$/.exec(value);
  if (!parts || parts[1].startsWith('0000')) return false;
  const local = `${parts[1]}T${parts[2]}Z`;
  const parsed = new Date(local);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== local.slice(0, 19)) return false;
  const zone = parts[4];
  const hours = Number(zone.slice(1, 3));
  const minutes = Number(zone.slice(4) || 0);
  return zone === 'Z' || (hours <= 14 && minutes <= 59 && (hours !== 14 || minutes === 0));
};
const stateValid = (state: unknown): state is Uint8Array => {
  if (!(state instanceof Uint8Array) || state.byteLength === 0 || state.byteLength > MAX_DOCUMENT_BYTES) return false;
  const doc = new Y.Doc();
  try { Y.applyUpdate(doc, state); return validateDocument(doc); }
  catch { return false; }
  finally { doc.destroy(); }
};
const invalid = () => new Error('Invalid room checkpoint');

export const compareCloudCheckpointRevisions = (left: string, right: string): number => {
  const ticks = (value: string): bigint => {
    if (!revisionValid(value)) throw invalid();
    const parts = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::\d{2})?)$/.exec(value);
    if (!parts) throw invalid();
    const zone = parts[4].length === 3 ? `${parts[4]}:00` : parts[4];
    const milliseconds = Date.parse(`${parts[1]}T${parts[2]}${zone}`);
    return BigInt(milliseconds) * 1000n + BigInt((parts[3] ?? '').padEnd(6, '0'));
  };
  const difference = ticks(left) - ticks(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

/** One checksum covers the revision, cloud base and accepted collaborative state. */
export const encodeRoomCheckpoint = (checkpoint: RoomCheckpoint): Uint8Array => {
  if (!revisionValid(checkpoint.revision) || !stateValid(checkpoint.base) || !stateValid(checkpoint.state)) throw invalid();
  const revision = Buffer.from(checkpoint.revision);
  const header = Buffer.alloc(prefixBytes);
  magic.copy(header);
  header.writeUInt32BE(revision.length, magic.length);
  header.writeUInt32BE(checkpoint.base.byteLength, magic.length + 4);
  header.writeUInt32BE(checkpoint.state.byteLength, magic.length + 8);
  const body = Buffer.concat([header, revision, checkpoint.base, checkpoint.state]);
  return Buffer.concat([body, createHash('sha256').update(body).digest()]);
};

/** Legacy records remain readable but have no inferred cloud baseline. */
export const decodeRoomRecord = (input: Uint8Array): RoomRecord => {
  if (!(input instanceof Uint8Array) || input.byteLength > MAX_CHECKPOINT_BYTES) throw invalid();
  const bytes = Buffer.from(input);
  if (!bytes.subarray(0, magic.length).equals(magic)) {
    if (!stateValid(bytes)) throw invalid();
    return { state: Uint8Array.from(bytes), checkpoint: null };
  }
  if (bytes.length < prefixBytes + digestBytes) throw invalid();
  const revisionSize = bytes.readUInt32BE(magic.length);
  const baseSize = bytes.readUInt32BE(magic.length + 4);
  const stateSize = bytes.readUInt32BE(magic.length + 8);
  if (!revisionSize || revisionSize > 40 || !baseSize || baseSize > MAX_DOCUMENT_BYTES || !stateSize || stateSize > MAX_DOCUMENT_BYTES
    || bytes.length !== prefixBytes + revisionSize + baseSize + stateSize + digestBytes) throw invalid();
  const body = bytes.subarray(0, -digestBytes);
  if (!timingSafeEqual(createHash('sha256').update(body).digest(), bytes.subarray(-digestBytes))) throw invalid();
  const revisionEnd = prefixBytes + revisionSize;
  const revision = bytes.subarray(prefixBytes, revisionEnd).toString('utf8');
  const base = Uint8Array.from(bytes.subarray(revisionEnd, revisionEnd + baseSize));
  const state = Uint8Array.from(bytes.subarray(revisionEnd + baseSize, -digestBytes));
  if (!revisionValid(revision) || !stateValid(base) || !stateValid(state)) throw invalid();
  return { state, checkpoint: { revision, base } };
};
