// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { acceptPersistedRoomState } from './acceptedRoomState.js';
import { MAX_DOCUMENT_BYTES } from './boundary.js';
import { publishCollaborationElement } from './documentModel.js';

const add = (doc: Y.Doc, id: string) => {
  publishCollaborationElement(doc.getMap('flowchart-nodes'), id, { id, position: { x: 0, y: 0 }, data: { label: id } });
};
describe('committed room persistence receipts', () => {
  it('accepts empty valid rooms and legacy void receipts without retaining mutable buffers', () => {
    const doc = new Y.Doc();
    try {
      const state = Y.encodeStateAsUpdate(doc);
      const accepted = acceptPersistedRoomState(state, undefined);
      expect(accepted).toEqual(state);
      expect(accepted).not.toBe(state);
    } finally { doc.destroy(); }
  });
  it('retains remote and submitted changes in a merged committed state', () => {
    const local = new Y.Doc(); const remote = new Y.Doc(); const result = new Y.Doc();
    try {
      add(local, 'local'); add(remote, 'remote');
      const submitted = Y.encodeStateAsUpdate(local);
      Y.applyUpdate(remote, submitted);
      Y.applyUpdate(result, acceptPersistedRoomState(submitted, Y.encodeStateAsUpdate(remote)));
      expect([...result.getMap('flowchart-nodes').keys()].sort()).toEqual(['local', 'remote']);
    } finally { local.destroy(); remote.destroy(); result.destroy(); }
  });
  it('rejects a stale receipt that drops submitted structures', () => {
    const before = new Y.Doc(); const edited = new Y.Doc();
    try {
      add(before, 'base'); Y.applyUpdate(edited, Y.encodeStateAsUpdate(before)); add(edited, 'new');
      expect(() => acceptPersistedRoomState(Y.encodeStateAsUpdate(edited), Y.encodeStateAsUpdate(before))).toThrow('omitted');
    } finally { before.destroy(); edited.destroy(); }
  });
  it('rejects a stale receipt that drops a deletion despite identical state vectors', () => {
    const doc = new Y.Doc();
    try {
      add(doc, 'deleted'); const stale = Y.encodeStateAsUpdate(doc); const vector = Y.encodeStateVector(doc);
      doc.getMap('flowchart-nodes').delete('deleted');
      expect(Y.encodeStateVector(doc)).toEqual(vector);
      expect(() => acceptPersistedRoomState(Y.encodeStateAsUpdate(doc), stale)).toThrow('omitted');
    } finally { doc.destroy(); }
  });
  it.each([null, {}, new Uint8Array(), Uint8Array.from([255]), new Uint8Array(MAX_DOCUMENT_BYTES + 1)])('rejects invalid or excessive receipts %#', receipt => {
    const doc = new Y.Doc();
    try { expect(() => acceptPersistedRoomState(Y.encodeStateAsUpdate(doc), receipt)).toThrow(); }
    finally { doc.destroy(); }
  });
  it('rejects unexpected shared types and invalid submitted documents', () => {
    const doc = new Y.Doc(); const empty = new Y.Doc();
    try {
      doc.getMap('private-data').set('content', 'synthetic');
      expect(() => acceptPersistedRoomState(Y.encodeStateAsUpdate(empty), Y.encodeStateAsUpdate(doc))).toThrow();
      expect(() => acceptPersistedRoomState(Y.encodeStateAsUpdate(doc), undefined)).toThrow();
    } finally { doc.destroy(); empty.destroy(); }
  });
});
