// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { MAX_DOCUMENT_BYTES, parseConnection, validateDocument } from './boundary.js';

const origin = 'http://localhost:5417';
const origins = new Set([origin]);
const path = '/vizly-room-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?token=synthetic-test';
describe('collaboration external boundaries', () => {
  it('accepts one cloud document identity and rejects empty, malformed, extreme and unsafe connection input', () => {
    expect(parseConnection(path, origin, origins)).toEqual({ diagramId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', token: 'synthetic-test' });
    for (const input of ['', null, {}, '//other.example/room', '/vizly-room-flowchart?token=synthetic-test', path + '&token=duplicate', path + '&role=owner', path.replace('synthetic-test', '%0A'), path.replace('synthetic-test', 'x'.repeat(4097)), path.replace('aaaaaaaa-aaaa', '..%2Faaaaaaaa-aaaa')]) {
      expect(parseConnection(input, origin, origins)).toBeNull();
    }
    expect(parseConnection(path, undefined, origins)).toBeNull();
    expect(parseConnection(path, 'https://other.example', origins)).toBeNull();
  });
  it('accepts empty and valid documents and rejects unsafe shapes, budgets, grouping cycles and dangling edges', () => {
    const run = (setup: (doc: Y.Doc) => void, expected: boolean) => {
      const doc = new Y.Doc();
      try { setup(doc); expect(validateDocument(doc)).toBe(expected); } finally { doc.destroy(); }
    };
    run(() => undefined, true);
    run(doc => doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x: 0, y: 0 }, data: {} }), true);
    run(doc => doc.getMap('secrets').set('a', 'hidden'), false);
    run(doc => doc.getMap('flowchart-nodes').set('a', { id: 'b', position: { x: 0, y: 0 }, data: {} }), false);
    for (const x of [NaN, Infinity, 1_000_001]) run(doc => doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x, y: 0 }, data: {} }), false);
    run(doc => doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x: 0, y: 0 }, data: JSON.parse('{"__proto__":{}}') }), false);
    run(doc => doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x: 0, y: 0 }, data: { label: 'x'.repeat(MAX_DOCUMENT_BYTES) } }), false);
    run(doc => {
      for (let i = 0; i <= 1000; i++) doc.getMap('flowchart-nodes').set(`n${i}`, { id: `n${i}`, position: { x: 0, y: 0 }, data: {} });
    }, false);
    run(doc => doc.getMap('flowchart-edges').set('e', { id: 'e', source: 'missing', target: 'missing' }), false);
    run(doc => {
      doc.getMap('flowchart-nodes').set('a', { id: 'a', position: { x: 0, y: 0 }, data: {}, parentId: 'b' });
      doc.getMap('flowchart-nodes').set('b', { id: 'b', position: { x: 0, y: 0 }, data: {}, parentId: 'a' });
    }, false);
  });
});
