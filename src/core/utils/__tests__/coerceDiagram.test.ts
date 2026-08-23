import { describe, expect, it } from 'vitest';
import {
  coerceToStandardDiagramData,
  coerceToStandardDiagramDataWithReport,
} from '../coerceDiagram';
import {
  createPersistedRoutingCandidate,
  createRoutingOnlyDocumentSnapshot,
} from '../../routing/persistedRoutingCandidate';
import { EDGE_ROUTING_CACHE_VERSION } from '../../routing/routingVersion';

describe('coerceDiagram', () => {
  it('preserves only a current, bounded routing-only document snapshot', () => {
    const candidate = createPersistedRoutingCandidate({
      routingVersion: EDGE_ROUTING_CACHE_VERSION,
      inputSignature: '1234',
      inputGeometryDigest: `geometry-v1:${'a'.repeat(32)}`,
      outputRouteSignature: 'route-v2:1:2:0123456789abcdef',
      writtenAt: 42,
      patches: [{
        id: 'edge-1',
        source: 'node-1',
        target: 'node-1',
        data: { computedPath: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      }],
    });
    if (!candidate) throw new Error('expected a valid routing fixture');
    const routingSnapshot = createRoutingOnlyDocumentSnapshot(candidate);
    if (!routingSnapshot) throw new Error('expected a valid routing snapshot');
    const input = {
      id: 'diagram',
      name: 'Diagram',
      nodes: [{ id: 'node-1', description: 'Node', domain: 'ops' }],
      edges: [],
    };

    expect(coerceToStandardDiagramData({ ...input, routingSnapshot }, { id: 'fallback' }))
      .toMatchObject({ routingSnapshot });
    expect(coerceToStandardDiagramData({
      ...input,
      routingSnapshot: {
        ...routingSnapshot,
        candidate: { ...candidate, routingVersion: 'old' },
      },
    }, { id: 'fallback' }).routingSnapshot).toBeUndefined();
  });

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

  it('migrates legacy timeline node types only inside timeline diagrams', () => {
    const timeline = coerceToStandardDiagramData({
      id: 'timeline-1',
      name: 'Timeline',
      type: 'timeline',
      nodes: [{ id: 'root', type: 'timeline', description: 'Launch', domain: 'timeline' }],
      edges: [],
    }, { id: 'fallback' });
    const flowchart = coerceToStandardDiagramData({
      id: 'flowchart-1',
      name: 'Flowchart',
      type: 'flowchart',
      nodes: [{ id: 'root', type: 'timeline', description: 'Legacy label', domain: 'default' }],
      edges: [],
    }, { id: 'fallback' });

    expect(timeline.nodes[0].type).toBe('timelineNode');
    expect(flowchart.nodes[0].type).toBe('timeline');
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

  it('preserves bounded groups and their saved canvas geometry', () => {
    const report = coerceToStandardDiagramDataWithReport({
      nodes: [{
        id: 'child',
        description: 'Child',
        domain: 'ops',
        parentId: 'group-1',
        metadata: { canvasPosition: { x: 25, y: 35 }, parentId: 'group-1' },
      }],
      edges: [],
      groups: [{
        id: 'group-1',
        type: 'group',
        description: 'Operations',
        domain: 'ops',
        position: { x: 400, y: 200 },
        measured: { width: 640, height: 420 },
        metadata: { canvasPosition: { x: 410, y: 210 } },
        data: { label: 'Operations' },
      }],
    }, { id: 'fallback', title: 'Fallback' });

    expect(report.diagram.groups).toEqual([
      expect.objectContaining({
        id: 'group-1',
        position: { x: 400, y: 200 },
        measured: { width: 640, height: 420 },
        metadata: expect.objectContaining({ canvasPosition: { x: 410, y: 210 } }),
      }),
    ]);
    expect(report.issues).not.toContainEqual(expect.objectContaining({ message: 'groups is not an array' }));
  });

  it('sanitizes malformed group geometry and rejects dangerous group identifiers', () => {
    const diagram = coerceToStandardDiagramData({
      nodes: [],
      edges: [],
      groups: [{
        id: 'constructor',
        type: 'group',
        position: { x: Number.POSITIVE_INFINITY, y: 'bad' },
        measured: { width: 0, height: 2_000_000 },
        metadata: { canvasPosition: { x: -20_000_000, y: null } },
      }],
    }, { id: 'fallback', title: 'Fallback' });

    expect(diagram.groups).toEqual([
      expect.objectContaining({
        id: 'group-0',
        position: { x: 0, y: 0 },
        measured: { width: 1, height: 1_000_000 },
        metadata: expect.objectContaining({ canvasPosition: { x: -10_000_000, y: 0 } }),
      }),
    ]);
  });

  it('drops non-array groups with an explicit report issue', () => {
    const report = coerceToStandardDiagramDataWithReport({ nodes: [], edges: [], groups: {} }, {
      id: 'fallback',
      title: 'Fallback',
    });

    expect(report.diagram.groups).toBeUndefined();
    expect(report.issues).toContainEqual({ level: 'warn', message: 'groups is not an array' });
  });
});
