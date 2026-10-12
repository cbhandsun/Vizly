// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { CloudRoomConflictError, reconcileCloudRoom } from './cloudRoomReconciliation.js';
import { publishCollaborationElement, readCollaborationElement } from './documentModel.js';
const documents: Y.Doc[] = [];
afterEach(() => { for (const doc of documents.splice(0)) doc.destroy(); });
const node = (id: string, label = id) => ({ id, position: { x: 10, y: 20 }, data: { label }, style: { width: 160, height: 60 } });
const document = (nodes: unknown[] = [], edges: unknown[] = []) => {
  const doc = new Y.Doc(); documents.push(doc);
  for (const [name, elements] of [['flowchart-nodes', nodes], ['flowchart-edges', edges]] as const) {
    for (const element of elements) {
      const value = readCollaborationElement(element);
      if (!value || typeof value.id !== 'string' || !publishCollaborationElement(doc.getMap(name), value.id, value)) throw new Error('Invalid fixture');
    }
  }
  return doc;
};
const snapshot = (doc: Y.Doc) => ({
  nodes: [...doc.getMap('flowchart-nodes')].map(([id, value]) => [id, readCollaborationElement(value)]),
  edges: [...doc.getMap('flowchart-edges')].map(([id, value]) => [id, readCollaborationElement(value)]),
});
const result = (base: Y.Doc, live: Y.Doc, cloud: Y.Doc) => {
  const doc = document();
  Y.applyUpdate(doc, reconcileCloudRoom(base, live, cloud));
  return doc;
};
const read = (doc: Y.Doc, id = 'a') => readCollaborationElement(doc.getMap('flowchart-nodes').get(id));

describe('cloud checkpoint three-way reconciliation', () => {
  it('retains unsaved collaborative edits when cloud is unchanged', () => {
    const base = document([node('a')]);
    const live = document([{ ...node('a'), position: { x: 99, y: 20 } }]);
    expect(read(result(base, live, document([node('a')])))).toEqual(read(live));
  });
  it('merges a cloud label and a collaborative drag on the same node', () => {
    const base = document([node('a')]);
    const live = document([{ ...node('a'), position: { x: 99, y: 20 } }]);
    const cloud = document([node('a', 'Cloud label')]);
    const before = [base, live, cloud].map(snapshot);
    expect(read(result(base, live, cloud))).toEqual({ ...node('a', 'Cloud label'), position: { x: 99, y: 20 } });
    expect([base, live, cloud].map(snapshot)).toEqual(before);
  });
  it('applies cloud deletion and independent collaborative addition', () => {
    const reconciled = result(document([node('a')]), document([node('a'), node('b')]), document());
    expect(read(reconciled)).toBeNull();
    expect(read(reconciled, 'b')).toEqual(node('b'));
  });
  it('accepts identical concurrent edits and treats key ordering as immaterial', () => {
    const edited = node('a', 'Both');
    expect(read(result(document([node('a')]), document([edited]), document([{ data: edited.data, style: edited.style, position: edited.position, id: edited.id }])))).toEqual(edited);
  });
  it('merges nested field removal with a change to a different field', () => {
    const base = document([{ ...node('a'), data: { label: 'a', custom: { first: 'one', second: 'two' } } }]);
    const live = document([{ ...node('a'), data: { label: 'a', custom: { first: 'edited', second: 'two' } } }]);
    const cloud = document([{ ...node('a'), data: { label: 'a', custom: { first: 'one' } } }]);
    expect(read(result(base, live, cloud))?.data).toEqual({ label: 'a', custom: { first: 'edited' } });
  });
  it('rejects conflicting edits to the same field without mutating accepted data', () => {
    const base = document([node('a')]);
    const live = document([node('a', 'Live')]);
    const cloud = document([node('a', 'Cloud')]);
    const before = [base, live, cloud].map(snapshot);
    expect(() => reconcileCloudRoom(base, live, cloud)).toThrow(CloudRoomConflictError);
    expect([base, live, cloud].map(snapshot)).toEqual(before);
  });
  it.each(['cloud', 'live'])('rejects %s deletion against an edit', deletion => {
    const base = document([node('a')]);
    const empty = document();
    const edited = document([node('a', 'Edited')]);
    expect(() => reconcileCloudRoom(base, deletion === 'cloud' ? edited : empty, deletion === 'cloud' ? empty : edited)).toThrow(CloudRoomConflictError);
  });
  it('rejects different additions with the same identity', () => {
    expect(() => reconcileCloudRoom(document(), document([node('a', 'Live')]), document([node('a', 'Cloud')]))).toThrow(CloudRoomConflictError);
  });
  it('merges a newly created node saved with complementary cloud metadata without losing live fields', () => {
    const liveNode = { id: 'new-node', type: 'flowchart', position: { x: 100, y: 200 },
      ariaLabel: 'Start', data: { label: 'Edited start', layer: 'layer-0', shape: 'pill' } };
    const cloudNode = { id: 'new-node', type: 'flowchart', position: { x: 100, y: 200 },
      width: 158, height: 54, style: { width: 158, height: 54 },
      data: { label: 'Edited start', shape: 'pill', domain: 'Business', domainClass: 'core', sequence: '1' } };
    const base = document(), live = document([liveNode]), cloud = document([cloudNode]);
    const before = [base, live, cloud].map(snapshot);
    expect(read(result(base, live, cloud), 'new-node')).toEqual({ ...cloudNode,
      ariaLabel: liveNode.ariaLabel, data: { ...cloudNode.data, layer: liveNode.data.layer } });
    expect([base, live, cloud].map(snapshot)).toEqual(before);
  });
  it('rejects arrays edited on both sides instead of merging indexes', () => {
    const fixture = (items: number[]) => document([{ ...node('a'), data: { label: 'a', items } }]);
    expect(() => reconcileCloudRoom(fixture([1]), fixture([1, 2]), fixture([0, 1]))).toThrow(CloudRoomConflictError);
  });
  it('rejects a cloud deletion that would orphan a new collaborative edge', () => {
    const base = document([node('a'), node('b')]);
    const live = document([node('a'), node('b')], [{ id: 'edge', source: 'a', target: 'b' }]);
    const cloud = document([node('b')]);
    expect(() => reconcileCloudRoom(base, live, cloud)).toThrow(CloudRoomConflictError);
    expect(live.getMap('flowchart-edges').size).toBe(1);
  });
  it('supports empty graphs and preserves the existing CRDT history', () => {
    const live = document([node('a')]);
    live.getMap('flowchart-nodes').delete('a');
    const merged = result(document(), live, document());
    expect(snapshot(merged)).toEqual({ nodes: [], edges: [] });
    expect(Y.encodeStateVector(merged)).toEqual(Y.encodeStateVector(live));
  });
  it('rejects unsafe, excessive and dangling input documents before merging', () => {
    const unsafe = document(); unsafe.getMap('unauthorized').set('secret', 'fixture');
    // Bypass the publishing boundary deliberately: invalid external documents
    // must be rejected even when they were never produced by our serializer.
    const nonfinite = document();
    nonfinite.getMap('flowchart-nodes').set('a', { ...node('a'), position: { x: Infinity, y: 0 } });
    const dangling = document([node('a')], [{ id: 'bad', source: 'a', target: 'missing' }]);
    const excessive = document(Array.from({ length: 1001 }, (_, index) => node(`n${index}`)));
    for (const invalid of [unsafe, nonfinite, dangling, excessive]) {
      expect(() => reconcileCloudRoom(document(), invalid, document())).toThrow('Invalid reconciliation document');
    }
  });
});
