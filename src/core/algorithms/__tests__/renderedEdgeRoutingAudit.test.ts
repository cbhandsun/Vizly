import { describe, expect, it } from 'vitest';
import { auditRenderedEdgeRouting } from '../renderedEdgeRoutingAudit';

describe('auditRenderedEdgeRouting', () => {
  it('accepts rounded orthogonal SVG paths and ignores container nodes as hard obstacles', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'e-ok',
        source: 'source',
        target: 'target',
        path: 'M 100 50 L 140 50 A 8 8 0 0 1 148 58 L 148 92 A 8 8 0 0 0 156 100 L 200 100',
      },
    ], [
      { id: 'source', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target', x: 200, y: 50, width: 100, height: 100 },
      { id: 'titlegroup-domain', type: 'titleGroup', x: 130, y: 40, width: 70, height: 120 },
    ]);

    expect(result.errors).toEqual([]);
  });

  it('reports source endpoint sliding along the node boundary', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'e-bad-source',
        source: 'source',
        target: 'target',
        path: 'M 50 100 L 160 100 L 160 200 L 250 200',
      },
    ], [
      { id: 'source', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target', x: 250, y: 150, width: 100, height: 100 },
    ]);

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ edgeId: 'e-bad-source', rule: 'source-direction' }),
    ]));
  });

  it('reports true business-node obstacle hits', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'e-hit',
        source: 'source',
        target: 'target',
        path: 'M 100 50 L 250 50',
      },
    ], [
      { id: 'source', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target', x: 250, y: 0, width: 100, height: 100 },
      { id: 'middle', x: 150, y: 20, width: 50, height: 60 },
    ]);

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edgeId: 'e-hit',
        rule: 'obstacle-hit',
        relatedNodeIds: ['middle'],
      }),
    ]));
  });

  it('reports close visual passes near unrelated business nodes', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'e-near',
        source: 'source',
        target: 'target',
        path: 'M 100 50 L 250 50',
      },
    ], [
      { id: 'source', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target', x: 250, y: 0, width: 100, height: 100 },
      { id: 'nearby', x: 150, y: 58, width: 50, height: 60 },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edgeId: 'e-near',
        rule: 'business-node-near-path',
        measuredValue: 8,
        relatedNodeIds: ['nearby'],
      }),
    ]));
  });

  it('reports aligned local doglegs as visual warnings', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'e5',
        source: 'check-limit',
        target: 'pool-a-entry',
        path: 'M 249 1850 L 249 1882 A 8 8 0 0 0 257 1890 L 289 1890 A 8 8 0 0 1 297 1898 L 297 1962 A 8 8 0 0 1 289 1970 L 257 1970 A 8 8 0 0 0 249 1978 L 249 2010',
      },
    ], [
      { id: 'check-limit', x: 145, y: 1754, width: 208, height: 96 },
      { id: 'pool-a-entry', x: 145, y: 2010, width: 208, height: 96 },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edgeId: 'e5',
        rule: 'aligned-local-dogleg',
        measuredValue: 48,
      }),
    ]));
  });
});
