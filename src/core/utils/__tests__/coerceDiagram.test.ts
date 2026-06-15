import { describe, expect, it } from 'vitest';
import {
  coerceToStandardDiagramData,
  coerceToStandardDiagramDataWithReport,
} from '../coerceDiagram';

describe('coerceDiagram', () => {
  it('sanitizes dangerous keys and does not preserve unbounded raw diagram fields', () => {
    const diagram = coerceToStandardDiagramData(JSON.parse(`{
      "id": " diagram-1 ",
      "name": "Imported",
      "type": "flowchart",
      "version": "1.0.0",
      "constructor": { "polluted": true },
      "nodes": [{
        "id": " n1 ",
        "description": "Node",
        "domain": "ops",
        "constructor": { "polluted": true },
        "data": {
          "label": "Node",
          "__proto__": { "polluted": true }
        }
      }],
      "edges": [],
      "metadata": {
        "title": "Safe",
        "prototype": { "polluted": true }
      }
    }`), { id: 'fallback', title: 'Fallback' });

    expect(diagram).toMatchObject({
      id: 'diagram-1',
      name: 'Imported',
      nodes: [expect.objectContaining({ id: 'n1', description: 'Node', domain: 'ops' })],
      metadata: { title: 'Safe' },
    });
    expect(Object.hasOwn(diagram, 'constructor')).toBe(false);
    expect(Object.hasOwn(diagram.nodes[0], 'constructor')).toBe(false);
    expect(diagram.nodes[0].data).toEqual({ label: 'Node' });
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('bounds node and edge collections and drops edges that do not target valid nodes', () => {
    const report = coerceToStandardDiagramDataWithReport({
      nodes: [
        { id: 'n1', description: 'One', domain: 'ops' },
        { id: 'n2', description: 'Two', domain: 'ops' },
      ],
      edges: [
        { id: 'valid', source: 'n1', target: 'n2' },
        { id: 'missing-source', source: 'ghost', target: 'n2' },
        { id: 'missing-target', source: 'n1', target: 'ghost' },
      ],
    }, { id: 'fallback', title: 'Fallback' });

    expect(report.diagram.edges).toEqual([
      expect.objectContaining({ id: 'valid', source: 'n1', target: 'n2' }),
    ]);
    expect(report.issues.some(issue => issue.message.includes('edges dropped'))).toBe(true);
  });

  it('truncates oversized text fields before returning a diagram', () => {
    const long = 'x'.repeat(25_000);
    const diagram = coerceToStandardDiagramData({
      id: 'diagram',
      name: long,
      nodes: [{ id: 'n1', description: long, domain: long }],
      edges: [],
    }, { id: 'fallback', title: 'Fallback' });

    expect(diagram.name).toHaveLength(160);
    expect(diagram.nodes[0].description).toHaveLength(20_000);
    expect(diagram.nodes[0].domain).toHaveLength(256);
  });

  it('rejects prototype-pollution sentinel values as diagram, node, and edge ids', () => {
    const diagram = coerceToStandardDiagramData({
      id: '__proto__',
      name: 'Imported',
      nodes: [
        { id: '__proto__', description: 'Unsafe', domain: 'ops' },
        { id: 'safe-node', description: 'Safe', domain: 'ops' },
      ],
      edges: [
        { id: 'constructor', source: '__proto__', target: 'safe-node' },
        { id: 'safe-edge', source: 'safe-node', target: 'safe-node' },
      ],
    }, { id: 'fallback-diagram', title: 'Fallback' });

    expect(diagram.id).toBe('fallback-diagram');
    expect(diagram.nodes.map(node => node.id)).toEqual(['node-0', 'safe-node']);
    expect(diagram.edges).toEqual([
      expect.objectContaining({ id: 'safe-edge', source: 'safe-node', target: 'safe-node' }),
    ]);
    expect(Object.prototype).not.toHaveProperty('safe-node');
  });
});
