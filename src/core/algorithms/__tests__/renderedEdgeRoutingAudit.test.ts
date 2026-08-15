import { describe, expect, it } from 'vitest';
import { auditRenderedEdgeRouting } from '../renderedEdgeRoutingAudit';

const presentationNodes = [
  { id: 'source', x: 0, y: 0, width: 100, height: 100 },
  { id: 'target', x: 250, y: 0, width: 100, height: 100 },
];

const presentationEdge = {
  id: 'presentation-edge',
  source: 'source',
  target: 'target',
  path: 'M 100 50 L 250 50',
};

describe('auditRenderedEdgeRouting', () => {
  it('reports a crossing one pixel inside a bend but excludes a true endpoint contact', () => {
    const horizontal = {
      id: 'horizontal',
      source: 'horizontal-source',
      target: 'horizontal-target',
      path: 'M 0 50 L 100 50',
    };
    const nearBend = auditRenderedEdgeRouting([
      horizontal,
      {
        id: 'near-bend',
        source: 'near-source',
        target: 'near-target',
        path: 'M 1 0 L 1 100',
      },
    ], []);
    const endpointContact = auditRenderedEdgeRouting([
      horizontal,
      {
        id: 'endpoint-contact',
        source: 'endpoint-source',
        target: 'endpoint-target',
        path: 'M 0 0 L 0 100',
      },
    ], []);

    expect(nearBend.errors.filter(finding => finding.rule === 'edge-crossing')).toHaveLength(1);
    expect(endpointContact.errors.filter(finding => finding.rule === 'edge-crossing')).toHaveLength(0);
  });

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

  it('reports non-protected shared rendered lanes', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'edge-a',
        source: 'source-a',
        target: 'target-a',
        path: 'M 100 50 L 240 50',
      },
      {
        id: 'edge-b',
        source: 'source-b',
        target: 'target-b',
        path: 'M 120 50 L 260 50',
      },
    ], [
      { id: 'source-a', x: 0, y: 0, width: 100, height: 100 },
      { id: 'source-b', x: 20, y: 100, width: 100, height: 100 },
      { id: 'target-a', x: 240, y: 0, width: 100, height: 100 },
      { id: 'target-b', x: 260, y: 100, width: 100, height: 100 },
    ]);

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'edge-parallel-overlap',
        relatedEdgeIds: ['edge-a', 'edge-b'],
        measuredValue: 120,
      }),
    ]));
  });

  it('does not report the first source trunk overlap for same-source edges', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'edge-left',
        source: 'hub',
        target: 'target-left',
        path: 'M 100 50 L 180 50 L 180 20 L 220 20',
      },
      {
        id: 'edge-right',
        source: 'hub',
        target: 'target-right',
        path: 'M 100 50 L 180 50 L 180 80 L 220 80',
      },
    ], [
      { id: 'hub', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target-left', x: 220, y: -30, width: 100, height: 100 },
      { id: 'target-right', x: 220, y: 50, width: 100, height: 100 },
    ]);

    expect(result.errors.some(error => error.rule === 'edge-parallel-overlap')).toBe(false);
  });

  it('protects every segment in a real multi-segment same-source prefix', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'edge-up', source: 'hub', target: 'target-up',
        path: 'M 100 50 L 180 50 L 180 140 L 260 140 L 260 20 L 320 20',
      },
      {
        id: 'edge-down', source: 'hub', target: 'target-down',
        path: 'M 100 50 L 180 50 L 180 140 L 260 140 L 260 260 L 320 260',
      },
    ], [
      { id: 'hub', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target-up', x: 320, y: -30, width: 100, height: 100 },
      { id: 'target-down', x: 320, y: 210, width: 100, height: 100 },
    ]);

    expect(result.errors.some(error => error.rule === 'edge-parallel-overlap')).toBe(false);
  });

  it('protects every segment in a real multi-segment same-target suffix', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'edge-upper', source: 'source-upper', target: 'target',
        path: 'M 100 50 L 260 50 L 260 200 L 340 200 L 340 240 L 500 240',
      },
      {
        id: 'edge-lower', source: 'source-lower', target: 'target',
        path: 'M 100 350 L 260 350 L 260 200 L 340 200 L 340 240 L 500 240',
      },
    ], [
      { id: 'source-upper', x: 0, y: 0, width: 100, height: 100 },
      { id: 'source-lower', x: 0, y: 300, width: 100, height: 100 },
      { id: 'target', x: 500, y: 190, width: 100, height: 100 },
    ]);

    expect(result.errors.some(error => error.rule === 'edge-parallel-overlap')).toBe(false);
  });

  it('reports the WMS middle-lane overlap after distinct same-source anchors', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'edge-wms-bms', source: 'wms', target: 'bms',
        path: 'M 50 100 L 50 180 L 300 180 L 300 400',
      },
      {
        id: 'edge-wms-visibility', source: 'wms', target: 'visibility',
        path: 'M 150 100 L 150 180 L 350 180 L 350 400',
      },
    ], [
      { id: 'wms', x: 0, y: 0, width: 200, height: 100 },
      { id: 'bms', x: 250, y: 400, width: 100, height: 100 },
      { id: 'visibility', x: 300, y: 400, width: 100, height: 100 },
    ]);

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rule: 'edge-parallel-overlap',
        relatedEdgeIds: ['edge-wms-bms', 'edge-wms-visibility'],
        measuredValue: 150,
      }),
    ]));
  });

  it('does not infer a shared prefix across curved or non-finite path commands', () => {
    const curved = auditRenderedEdgeRouting([
      {
        id: 'curve-a', source: 'hub', target: 'target-a',
        path: 'M 100 50 C 120 50 140 80 160 100 L 300 100 L 300 20 L 360 20',
      },
      {
        id: 'curve-b', source: 'hub', target: 'target-b',
        path: 'M 100 50 Q 130 70 160 100 L 320 100 L 320 180 L 360 180',
      },
    ], [
      { id: 'hub', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target-a', x: 360, y: -30, width: 100, height: 100 },
      { id: 'target-b', x: 360, y: 130, width: 100, height: 100 },
    ]);
    const nonFinite = auditRenderedEdgeRouting([
      { id: 'invalid-a', source: 'hub', target: 'target', path: 'M 100 50 L 1e309 50 L 300 50' },
      { id: 'invalid-b', source: 'hub', target: 'target', path: 'M 100 50 L 1e309 50 L 300 50' },
    ], [
      { id: 'hub', x: 0, y: 0, width: 100, height: 100 },
      { id: 'target', x: 300, y: 0, width: 100, height: 100 },
    ]);

    expect(curved.errors.some(error => error.rule === 'edge-parallel-overlap')).toBe(true);
    expect(nonFinite.errors.some(error => error.rule === 'edge-parallel-overlap')).toBe(true);
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

  it('reports dominant-axis backtracking before a long return route', () => {
    const result = auditRenderedEdgeRouting([
      {
        id: 'edge-tms-execution-oms-order',
        source: 'tms-execution',
        target: 'oms-order',
        path: 'M 701 2638 L 701 2734 L 171 2734 L 171 694 L 260 694 L 260 598',
      },
    ], [
      { id: 'tms-execution', x: 600, y: 2500, width: 202, height: 138 },
      { id: 'oms-order', x: 184, y: 500, width: 152, height: 98 },
    ]);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        edgeId: 'edge-tms-execution-oms-order',
        rule: 'main-axis-backtrack',
        measuredValue: 96,
      }),
    ]));
  });

  it('keeps the default audit geometry-only when presentation fields are absent or malformed', () => {
    const result = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: 'url(javascript:alert(1))',
      strokeWidth: Number.POSITIVE_INFINITY,
      selected: 'yes',
    }], presentationNodes);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('normalizes and compares a complete rendered presentation snapshot', () => {
    const result = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: ' RGB(71, 202, 204) ',
      strokeWidth: '3px',
      strokeDasharray: '6px, 4px',
      opacity: '100%',
      markerStart: null,
      markerEnd: 'url( "#arrow-end" )',
      zoom: '0.75',
      selected: 'false',
      labelVisible: true,
      expectedPresentation: {
        stroke: 'rgb(71,202,204)',
        strokeWidth: 3,
        strokeDasharray: '6 4',
        opacity: 1,
        markerStart: 'none',
        markerEnd: 'url(#arrow-end)',
        zoom: 0.75,
        selected: false,
        labelVisible: 'true',
      },
    }], presentationNodes, { presentation: true });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('reports missing, empty, and malformed presentation contracts without throwing', () => {
    const missing = auditRenderedEdgeRouting([presentationEdge], presentationNodes, { presentation: true });
    const malformed = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: '',
      strokeWidth: 2,
      opacity: 1,
      zoom: 1,
      selected: false,
      labelVisible: true,
      expectedPresentation: [],
    }], presentationNodes, { presentation: true });

    expect(missing.warnings.filter(finding => finding.rule === 'presentation-field-missing')
      .map(finding => finding.presentationField)).toEqual([
      'stroke',
      'strokeWidth',
      'opacity',
      'zoom',
      'selected',
      'labelVisible',
    ]);
    expect(malformed.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'presentation-field-invalid', presentationField: 'stroke' }),
      expect.objectContaining({ rule: 'presentation-expectation-invalid' }),
    ]));
  });

  it('rejects unsafe, non-finite, and out-of-range presentation values', () => {
    const result = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: 'url(javascript:alert(1))',
      strokeWidth: 65,
      strokeDasharray: '4 calc(2px)',
      opacity: '101%',
      markerStart: 'url(https://example.com/marker.svg)',
      markerEnd: `url(#${'x'.repeat(300)})`,
      zoom: 33,
      selected: 'yes',
      labelVisible: {},
    }], presentationNodes, { presentation: true });

    expect(result.warnings.filter(finding => finding.rule === 'presentation-field-invalid')
      .map(finding => finding.presentationField)).toEqual([
      'stroke',
      'strokeWidth',
      'strokeDasharray',
      'opacity',
      'markerStart',
      'markerEnd',
      'zoom',
      'selected',
      'labelVisible',
    ]);
  });

  it('validates presentation policy input and falls back to bounded defaults', () => {
    const result = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: '#ff5722',
      strokeWidth: 3,
      opacity: 1,
      zoom: 1,
      selected: false,
      labelVisible: false,
    }], presentationNodes, {
      presentation: {
        requiredFields: ['stroke', 'unsupported'],
        lowZoomThreshold: Number.POSITIVE_INFINITY,
        minimumVisibleOpacity: -1,
        minimumSelectedOpacity: 'not-a-number',
        minimumSelectedStrokeWidth: 0,
      },
    });

    expect(result.warnings.filter(finding => finding.rule === 'presentation-policy-invalid').length).toBe(5);
    expect(result.warnings.some(finding => finding.rule === 'presentation-field-missing')).toBe(false);
  });

  it('accepts finite boundary values without weakening the presentation bounds', () => {
    const result = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: 'currentColor',
      strokeWidth: '64px',
      strokeDasharray: Array.from({ length: 32 }, () => '10000px').join(','),
      opacity: 0.1,
      markerStart: 'none',
      markerEnd: null,
      zoom: 32,
      selected: false,
      labelVisible: false,
    }], presentationNodes, { presentation: true });

    expect(result.warnings).toEqual([]);
  });

  it('audits selection emphasis and the low-zoom label budget independently', () => {
    const selected = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: '#ff5722',
      strokeWidth: 1,
      opacity: 0.4,
      zoom: 0.2,
      selected: true,
      labelVisible: false,
    }], presentationNodes, { presentation: true });
    const unselected = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: '#ff5722',
      strokeWidth: 3,
      opacity: 1,
      zoom: 0.2,
      selected: false,
      labelVisible: true,
    }], presentationNodes, { presentation: true });

    expect(selected.warnings.map(finding => finding.rule)).toEqual(expect.arrayContaining([
      'selected-edge-low-opacity',
      'selected-edge-too-thin',
      'selected-label-hidden',
    ]));
    expect(selected.warnings.some(finding => finding.rule === 'low-zoom-label-visible')).toBe(false);
    expect(unselected.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'low-zoom-label-visible', presentationField: 'labelVisible' }),
    ]));
  });

  it('reports style, marker, viewport, and state fidelity mismatches per field', () => {
    const result = auditRenderedEdgeRouting([{
      ...presentationEdge,
      stroke: '#ff5722',
      strokeWidth: 3,
      strokeDasharray: 'none',
      opacity: 1,
      markerStart: null,
      markerEnd: 'url(#end)',
      zoom: 1,
      selected: false,
      labelVisible: true,
      expectedPresentation: {
        stroke: '#47cacc',
        strokeWidth: 2,
        strokeDasharray: '6 4',
        opacity: 0.75,
        markerStart: 'url(#start)',
        markerEnd: 'none',
        zoom: 0.8,
        selected: true,
        labelVisible: false,
      },
    }], presentationNodes, { presentation: true });

    expect(result.warnings.filter(finding => finding.rule === 'presentation-field-mismatch')
      .map(finding => finding.presentationField)).toEqual([
      'stroke',
      'strokeWidth',
      'strokeDasharray',
      'opacity',
      'markerStart',
      'markerEnd',
      'zoom',
      'selected',
      'labelVisible',
    ]);
  });
});
