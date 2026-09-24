import { describe, expect, it } from 'vitest';
import { parseVizlyDocument } from './document.js';

const validDocument = () => ({
  schemaVersion: 1,
  id: 'diagram-1',
  title: 'Example',
  nodes: [
    { id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } },
    { id: 'b', position: { x: 100, y: 0 }, data: { label: 'B' } },
  ],
  edges: [{ id: 'a-b', source: 'a', target: 'b' }],
});

describe('parseVizlyDocument', () => {
  it('accepts a valid portable document and owns nested data', () => {
    const input = validDocument();
    const result = parseVizlyDocument(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    input.nodes[0].data.label = 'changed';
    expect(result.value.nodes[0].data.label).toBe('A');
  });

  it('accepts an empty canvas', () => {
    expect(parseVizlyDocument({ ...validDocument(), nodes: [], edges: [] }).ok).toBe(true);
  });

  it.each([
    null,
    {},
    { ...validDocument(), id: '' },
    { ...validDocument(), nodes: [{ id: 'x', position: { x: Number.NaN, y: 0 }, data: {} }] },
    { ...validDocument(), edges: [{ id: 'bad', source: 'a', target: 'missing' }] },
  ])('rejects malformed input %#', (input) => {
    expect(parseVizlyDocument(input).ok).toBe(false);
  });

  it('rejects duplicate ids and extreme collections', () => {
    const duplicate = validDocument();
    duplicate.nodes.push({ ...duplicate.nodes[0] });
    expect(parseVizlyDocument(duplicate)).toMatchObject({ ok: false, code: 'duplicate-node-id' });
    expect(parseVizlyDocument({ ...validDocument(), nodes: Array.from({ length: 10_001 }, (_, id) => ({
      id: `n-${id}`,
      position: { x: 0, y: 0 },
      data: {},
    })), edges: [] })).toMatchObject({ ok: false, code: 'too-many-nodes' });
  });

  it('drops prototype-pollution keys and bounds nested strings', () => {
    const document = validDocument();
    document.nodes[0].data = JSON.parse('{"label":"A","__proto__":{"polluted":true},"long":"' + 'x'.repeat(20_100) + '"}');
    const result = parseVizlyDocument(document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(result.value.nodes[0].data).not.toHaveProperty('__proto__');
    expect(String(result.value.nodes[0].data.long)).toHaveLength(20_000);
  });
});
