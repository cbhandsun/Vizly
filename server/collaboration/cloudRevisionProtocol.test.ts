// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { hasAcceptedCloudState, readAcceptedCloudRevision, writeAcceptedCloudRevision } from './cloudRevisionProtocol.js';
import { compareCloudRevisions } from './cloudRevision.js';
const revision = '2026-10-08T20:00:00.123456Z';
const payload = (value: string, vector: Uint8Array, trailing = false) => {
  const encoder = encoding.createEncoder(); encoding.writeVarString(encoder, value); encoding.writeVarUint8Array(encoder, vector);
  if (trailing) encoding.writeVarUint(encoder, 1);
  return decoding.createDecoder(encoding.toUint8Array(encoder));
};
describe('accepted cloud revision protocol', () => {
  it('retains exact microseconds and requires the accepted operations to exist locally', () => {
    const source = new Y.Doc(), client = new Y.Doc();
    try {
      source.getMap('nodes').set('a', true);
      const encoder = encoding.createEncoder(); writeAcceptedCloudRevision(encoder, revision, source);
      const accepted = readAcceptedCloudRevision(decoding.createDecoder(encoding.toUint8Array(encoder)))!;
      expect(accepted.revision).toBe(revision);
      expect(hasAcceptedCloudState(client, accepted)).toBe(false);
      Y.applyUpdate(client, Y.encodeStateAsUpdate(source));
      expect(hasAcceptedCloudState(client, accepted)).toBe(true);
      client.getMap('nodes').set('b', true);
      expect(hasAcceptedCloudState(client, accepted)).toBe(true);
    } finally { source.destroy(); client.destroy(); }
  });
  it.each(['', 'bad', '2026-02-29T20:00:00Z', '2026-10-08T20:00:00.1234567Z', 'x'.repeat(100)])('rejects invalid revision %s', value => {
    expect(readAcceptedCloudRevision(payload(value, new Uint8Array([0])))).toBeNull();
  });
  it('rejects truncated, trailing, oversized and duplicate vectors', () => {
    expect(readAcceptedCloudRevision(decoding.createDecoder(new Uint8Array()))).toBeNull();
    for (const vector of [new Uint8Array(), new Uint8Array([1]), new Uint8Array(128 * 1024 + 1), new Uint8Array([2, 1, 1, 1, 2])]) {
      expect(readAcceptedCloudRevision(payload(revision, vector))).toBeNull();
    }
    expect(readAcceptedCloudRevision(payload(revision, new Uint8Array([0]), true))).toBeNull();
    const doc = new Y.Doc();
    try { expect(hasAcceptedCloudState(doc, { revision, vector: new Uint8Array([0]) })).toBe(false); }
    finally { doc.destroy(); }
  });
  it('rejects invalid server revision before writing a frame', () => {
    const doc = new Y.Doc();
    try { expect(() => writeAcceptedCloudRevision(encoding.createEncoder(), 'bad', doc)).toThrow(); }
    finally { doc.destroy(); }
  });
  it('compares microseconds and equivalent timezones without rounding', () => {
    expect(compareCloudRevisions(revision, '2026-10-08T20:00:00.123457Z')).toBe(-1);
    expect(compareCloudRevisions(revision, '2026-10-08 13:00:00.123456-07:00')).toBe(0);
    expect(compareCloudRevisions(revision, '2026-10-08T20:00:00.123455Z')).toBe(1);
    expect(() => compareCloudRevisions('bad', revision)).toThrow();
  });
});
