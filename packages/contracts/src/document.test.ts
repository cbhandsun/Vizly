import { describe, expect, it } from 'vitest';
import { importLegacyVizlyDocument, parseVizlyDocument } from './document.js';

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
  it.each([
    ['missing', 'missing-node-parent', 0],
    ['a', 'self-node-parent', 0],
    ['b', 'cyclic-node-parent', 1],
  ] as const)('rejects parent %s with a precise code and path', (parentId, code, index) => {
    const input = { ...validDocument(), nodes: [
      { ...validDocument().nodes[0], parentId }, { ...validDocument().nodes[1], parentId: 'a' },
    ] };
    expect(parseVizlyDocument(input)).toEqual({ ok: false, code, path: `$.nodes[${index}].parentId` });
  });
  it('accepts a maximum-size deep tree in arbitrary array order without recursion', () => {
    const nodes = Array.from({ length: 10_000 }, (_, i) => ({ id: `n-${i}`, position: { x: 1, y: 1 },
      data: {}, ...(i ? { parentId: `n-${i - 1}` } : {}) })).reverse();
    expect(parseVizlyDocument({ ...validDocument(), nodes, edges: [] }).ok).toBe(true);
    nodes.at(-1)!.parentId = 'n-9999';
    expect(parseVizlyDocument({ ...validDocument(), nodes, edges: [] })).toMatchObject({ ok: false, code: 'cyclic-node-parent' });
  });
  it('explicitly repairs legacy invalid links, preserves content, and returns an auditable report', () => {
    const node = (id: string, parentId: string) => ({ id, parentId, position: { x: 12, y: 34 }, data: { label: id } });
    const input = { ...validDocument(), nodes: [node('a', 'b'), node('b', 'a'), node('c', 'missing'),
      node('d', 'd'), node('e', 'a')], edges: [{ id: 'edge', source: 'a', target: 'e' }] };
    const original = JSON.stringify(input);
    const result = importLegacyVizlyDocument(input, { hierarchy: 'detach-invalid-parents' });
    expect(JSON.stringify(input)).toBe(original);
    expect(result.ok).toBe(true); if (!result.ok) return;
    expect(result.repairs.map(issue => [issue.nodeId, issue.code])).toEqual([
      ['b', 'cyclic-node-parent'], ['c', 'missing-node-parent'], ['d', 'self-node-parent'],
    ]);
    expect(result.value.nodes).toHaveLength(5); expect(result.value.edges).toEqual(input.edges);
    expect(result.value.nodes.map(item => item.position)).toEqual(input.nodes.map(item => item.position));
    expect(result.value.nodes[4].parentId).toBe('a');
    expect(parseVizlyDocument(result.value).ok).toBe(true);
    const repeated = importLegacyVizlyDocument(result.value, { hierarchy: 'detach-invalid-parents' });
    expect(repeated).toMatchObject({ ok: true, repairs: [], value: result.value });
  });
  it('never repairs unrelated structural failures or enables recovery without an explicit policy', () => {
    expect(importLegacyVizlyDocument({ ...validDocument(), edges: [{ id: 'bad', source: 'a', target: 'missing' }] },
      { hierarchy: 'detach-invalid-parents' })).toMatchObject({ ok: false, code: 'missing-edge-endpoint' });
    expect(importLegacyVizlyDocument(validDocument(), undefined as never)).toMatchObject({ ok: false, code: 'invalid-document' });
  });
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
