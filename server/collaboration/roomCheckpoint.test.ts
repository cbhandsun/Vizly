// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { compareCloudCheckpointRevisions, decodeRoomRecord, encodeRoomCheckpoint, MAX_CHECKPOINT_BYTES } from './roomCheckpoint.js';
import { MAX_DOCUMENT_BYTES } from './boundary.js';
const revision = '2026-10-08T20:00:00.123456+00:00';
const docs: Y.Doc[] = [];
afterEach(() => { for (const doc of docs.splice(0)) doc.destroy(); });
const state = (label = 'a') => {
  const doc = new Y.Doc(); docs.push(doc);
  doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x: 0, y: 0 }, data: { label } });
  return Y.encodeStateAsUpdate(doc);
};
describe('bounded atomic checkpoint record codec', () => {
  it('orders microseconds accurately across supported timezone representations', () => {
    expect(compareCloudCheckpointRevisions('2026-10-08T20:00:00.123457Z', revision)).toBe(1);
    expect(compareCloudCheckpointRevisions('2026-10-08 20:00:00.123456+00', revision)).toBe(0);
    expect(compareCloudCheckpointRevisions('2026-10-08T21:00:00.123455+01:00', revision)).toBe(-1);
    expect(() => compareCloudCheckpointRevisions('invalid', revision)).toThrow();
  });
  it('preserves exact microsecond revision and separate cloud/live states', () => {
    const checkpoint = { revision, base: state('Cloud'), state: state('Live') };
    expect(decodeRoomRecord(encodeRoomCheckpoint(checkpoint))).toEqual({ state: checkpoint.state, checkpoint: { revision, base: checkpoint.base } });
  });
  it('reads legacy state without fabricating a cloud base or revision', () => {
    const legacy = state();
    expect(decodeRoomRecord(legacy)).toEqual({ state: legacy, checkpoint: null });
  });
  it('returns detached buffers so callers cannot corrupt subsequent record reads', () => {
    const encoded = encodeRoomCheckpoint({ revision, base: state(), state: state() });
    const record = decodeRoomRecord(encoded);
    record.state.fill(0); record.checkpoint?.base.fill(0);
    expect(() => decodeRoomRecord(encoded)).not.toThrow();
  });
  it('rejects byte corruption, trailing bytes and truncation', () => {
    const encoded = encodeRoomCheckpoint({ revision, base: state(), state: state() });
    const corrupt = Uint8Array.from(encoded); corrupt[corrupt.length - 40] ^= 1;
    for (const invalid of [corrupt, encoded.subarray(0, encoded.length - 1), new Uint8Array([...encoded, 0]), encoded.subarray(0, 25)]) {
      expect(() => decodeRoomRecord(invalid)).toThrow('Invalid room checkpoint');
    }
  });
  it.each(['', 'bad', '2026-02-30T00:00:00Z', '2026-10-08T24:00:00Z', '2026-10-08T00:00:00+14:01',
    '2026-10-08T00:00:00+00:99', '2026-10-08T00:00:00.1234567Z', '0000-01-01T00:00:00Z'])('rejects illegal revision %s', value => {
    expect(() => encodeRoomCheckpoint({ revision: value, base: state(), state: state() })).toThrow();
  });
  it('supports intentionally empty states while rejecting invalid or excessive states', () => {
    const empty = new Uint8Array([0, 0]);
    expect(decodeRoomRecord(encodeRoomCheckpoint({ revision, base: empty, state: empty })).state).toEqual(empty);
    for (const invalid of [new Uint8Array(), new Uint8Array([255]), new Uint8Array(MAX_DOCUMENT_BYTES + 1)]) {
      expect(() => encodeRoomCheckpoint({ revision, base: invalid, state: empty })).toThrow();
      expect(() => encodeRoomCheckpoint({ revision, base: empty, state: invalid })).toThrow();
    }
    expect(() => decodeRoomRecord(new Uint8Array(MAX_CHECKPOINT_BYTES + 1))).toThrow();
  });
  it('rejects valid Yjs encoding with unauthorized roots', () => {
    const doc = new Y.Doc(); docs.push(doc);
    doc.getMap('untrusted').set('value', 'fixture');
    const invalid = Y.encodeStateAsUpdate(doc);
    expect(() => decodeRoomRecord(invalid)).toThrow();
    expect(() => encodeRoomCheckpoint({ revision, base: invalid, state: state() })).toThrow();
  });
});
