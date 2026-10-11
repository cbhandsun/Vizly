// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { publishCollaborationElement, readCollaborationElement, upgradeCollaborationDocument } from './documentModel.js';

const initial = { id: 'shared', position: { x: 10, y: 20 }, data: { label: 'Initial', color: 'red' }, style: { opacity: 1 } };
const exchange = (first: Y.Doc, second: Y.Doc) => {
  const left = Y.encodeStateAsUpdate(first);
  const right = Y.encodeStateAsUpdate(second);
  Y.applyUpdate(first, right); Y.applyUpdate(second, left);
};
const pair = () => {
  const first = new Y.Doc(); const second = new Y.Doc();
  publishCollaborationElement(first.getMap('flowchart-nodes'), initial.id, initial);
  exchange(first, second);
  return { first, second, left: first.getMap<unknown>('flowchart-nodes'), right: second.getMap<unknown>('flowchart-nodes'),
    dispose: () => { first.destroy(); second.destroy(); } };
};

describe('field-level collaboration document', () => {
  it('excludes local editor state and generated descriptions from durable collaboration values', () => {
    const input = { ...initial, selected: true, dragging: true, measured: { width: 159, height: 60 },
      data: { ...initial.data, isEditing: true, description: `<b>${initial.data.label}</b>` } };
    expect(readCollaborationElement(input)).toEqual(initial);
    expect(readCollaborationElement({ ...input, data: { ...input.data, description: 'Independent description' } })?.data)
      .toEqual({ ...initial.data, description: 'Independent description' });
  });
  it('preserves simultaneous label and drag changes to the same node', () => {
    const peers = pair();
    try {
      publishCollaborationElement(peers.left, initial.id, { ...initial, data: { ...initial.data, label: 'A text' } }, initial);
      publishCollaborationElement(peers.right, initial.id, { ...initial, position: { x: 99, y: 88 } }, initial);
      exchange(peers.first, peers.second);
      const expected = { ...initial, position: { x: 99, y: 88 }, data: { ...initial.data, label: 'A text' } };
      expect(readCollaborationElement(peers.left.get(initial.id))).toEqual(expected);
      expect(readCollaborationElement(peers.right.get(initial.id))).toEqual(expected);
    } finally { peers.dispose(); }
  });
  it('preserves independent changes inside nested data, position and style', () => {
    const peers = pair();
    try {
      publishCollaborationElement(peers.left, initial.id, { ...initial, position: { x: 90, y: 20 }, data: { ...initial.data, label: 'A' } }, initial);
      publishCollaborationElement(peers.right, initial.id, { ...initial, position: { x: 10, y: 80 }, data: { ...initial.data, color: 'blue' }, style: { opacity: 0.4 } }, initial);
      exchange(peers.first, peers.second);
      expect(readCollaborationElement(peers.left.get(initial.id))).toEqual({ ...initial, position: { x: 90, y: 80 }, data: { label: 'A', color: 'blue' }, style: { opacity: 0.4 } });
    } finally { peers.dispose(); }
  });
  it('does not republish a stale peer field during a subsequent local edit', () => {
    const peers = pair();
    try {
      publishCollaborationElement(peers.right, initial.id, { ...initial, data: { ...initial.data, color: 'blue' } }, initial);
      exchange(peers.first, peers.second);
      publishCollaborationElement(peers.left, initial.id, { ...initial, data: { ...initial.data, label: 'Local' } }, initial);
      exchange(peers.first, peers.second);
      expect(readCollaborationElement(peers.right.get(initial.id))?.data).toEqual({ label: 'Local', color: 'blue' });
    } finally { peers.dispose(); }
  });
  it('keeps same-field conflicts deterministic and allows independent removal', () => {
    const peers = pair();
    try {
      const { style: _style, ...withoutStyle } = initial;
      publishCollaborationElement(peers.left, initial.id, { ...withoutStyle, data: { label: 'A', color: 'red' } }, initial);
      publishCollaborationElement(peers.right, initial.id, { ...initial, data: { label: 'B', color: 'red' } }, initial);
      exchange(peers.first, peers.second);
      expect(readCollaborationElement(peers.left.get(initial.id))).toEqual(readCollaborationElement(peers.right.get(initial.id)));
      expect(readCollaborationElement(peers.right.get(initial.id))).not.toHaveProperty('style');
    } finally { peers.dispose(); }
  });
  it('does not resurrect remotely deleted nodes or optional subtrees from a stale canvas', () => {
    const peers = pair();
    try {
      peers.right.delete(initial.id); exchange(peers.first, peers.second);
      expect(publishCollaborationElement(peers.left, initial.id, { ...initial, position: { x: 40, y: 50 } }, initial)).toBe(false);
      expect(peers.left.size).toBe(0);
      expect(publishCollaborationElement(peers.left, initial.id, initial)).toBe(true);
      const element = peers.left.get(initial.id);
      expect(element).toBeInstanceOf(Y.Map);
      if (!(element instanceof Y.Map)) throw new Error('Missing shared node');
      element.delete('style');
      publishCollaborationElement(peers.left, initial.id, { ...initial, style: { opacity: 0.2 } }, initial);
      expect(readCollaborationElement(element)).not.toHaveProperty('style');
    } finally { peers.dispose(); }
  });
  it('upgrades legacy room objects once and survives encode/load/replay', () => {
    const first = new Y.Doc(); const restored = new Y.Doc();
    try {
      first.getMap('flowchart-nodes').set(initial.id, initial);
      expect(upgradeCollaborationDocument(first)).toBe(true);
      const state = Y.encodeStateAsUpdate(first);
      expect(upgradeCollaborationDocument(first)).toBe(true);
      expect(Y.encodeStateAsUpdate(first)).toEqual(state);
      Y.applyUpdate(restored, state); Y.applyUpdate(restored, state);
      expect(readCollaborationElement(restored.getMap('flowchart-nodes').get(initial.id))).toEqual(initial);
    } finally { first.destroy(); restored.destroy(); }
  });
  it('accepts empty records and optional undefined fields without sharing caller references', () => {
    const doc = new Y.Doc();
    try {
      const input = { ...initial, data: {}, optional: undefined, ports: [{ id: 'p' }] };
      publishCollaborationElement(doc.getMap('flowchart-nodes'), initial.id, input);
      input.ports[0].id = 'changed';
      expect(readCollaborationElement(doc.getMap('flowchart-nodes').get(initial.id))).toEqual({ ...initial, data: {}, ports: [{ id: 'p' }] });
    } finally { doc.destroy(); }
  });
  it.each([null, [], new Date(), new Y.Text('text'), { id: 'wrong' }, { ...initial, data: { invalid: Infinity } },
    { ...initial, data: { label: 'x'.repeat(20_001) } }, { ...initial, ports: Array(2001).fill('p') },
    JSON.parse('{"id":"shared","__proto__":{"polluted":true}}') as unknown,
  ])('rejects illegal input without mutating the accepted document', input => {
    const peers = pair();
    try {
      const before = Y.encodeStateAsUpdate(peers.first);
      expect(publishCollaborationElement(peers.left, initial.id, input, initial)).toBe(false);
      expect(Y.encodeStateAsUpdate(peers.first)).toEqual(before);
    } finally { peers.dispose(); }
  });
  it('rejects cycles, accessors that throw, excessive depth, field count and aggregate bytes', () => {
    const cyclic: Record<string, unknown> = { id: initial.id }; cyclic.self = cyclic;
    const throwing = { get id(): string { throw new Error('Synthetic getter'); } };
    let deep: unknown = 'leaf'; for (let i = 0; i < 10; i++) deep = { nested: deep };
    const wide = Object.fromEntries(Array.from({ length: 201 }, (_, i) => ['key' + i, i]));
    const huge = Object.fromEntries(Array.from({ length: 150 }, (_, i) => ['key' + i, 'x'.repeat(20_000)]));
    for (const input of [cyclic, throwing, { ...initial, data: deep }, wide, huge]) expect(readCollaborationElement(input)).toBeNull();
  });
  it('rejects malformed legacy entries before upgrading any valid neighbour', () => {
    const doc = new Y.Doc();
    try {
      doc.getMap('flowchart-nodes').set(initial.id, initial);
      doc.getMap('flowchart-nodes').set('bad', { id: 'different' });
      const before = Y.encodeStateAsUpdate(doc);
      expect(upgradeCollaborationDocument(doc)).toBe(false);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { doc.destroy(); }
  });
});
