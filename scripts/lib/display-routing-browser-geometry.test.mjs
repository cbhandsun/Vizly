import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readDisplayRoutingNodePanGesture,
  readDisplayRoutingViewportZoom,
  readDisplayRoutingVisualScaleAudit,
  readRenderedDisplayEdgeNodeIntersections,
  readVisibleDisplayRoutingNodeRect,
} from './display-routing-browser-geometry.mjs';
import { assertDisplayRoutingVisualScaleAudit } from './display-routing-browser-visual-audit.mjs';

const rect = (x, y, width, height) => ({
  x,
  y,
  width,
  height,
  left: x,
  top: y,
  right: x + width,
  bottom: y + height,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const style = (overrides = {}) => ({
  display: 'block',
  visibility: 'visible',
  opacity: '1',
  stroke: '#334155',
  strokeWidth: '2px',
  strokeOpacity: '1',
  vectorEffect: 'non-scaling-stroke',
  markerEnd: 'none',
  fill: 'none',
  fillOpacity: '1',
  backgroundColor: '#ffffff',
  fontSize: '12px',
  ...overrides,
});

describe('display routing browser geometry', () => {
  it('bounds the viewport zoom used to normalize drag distance', () => {
    vi.stubGlobal('window', {
      reactFlowInstance: { getViewport: () => ({ zoom: 0.625 }) },
    });
    expect(readDisplayRoutingViewportZoom()).toBe(0.625);
    window.reactFlowInstance.getViewport = () => ({ zoom: Number.POSITIVE_INFINITY });
    expect(readDisplayRoutingViewportZoom()).toBeNull();
  });

  it('rejects duplicate interaction paths and unresolved marker contrast at the final SVG gate', () => {
    const audit = {
      zoom: 1,
      routeSignature: 'route-v2:test',
      pathCount: 1,
      paintedPathCount: 1,
      invalidNonScalingPathCount: 0,
      invalidStrokeWidthCount: 0,
      lowContrastPathCount: 0,
      markerCount: 1,
      markerContrastAuditedCount: 0,
      lowContrastMarkerCount: 1,
      interactionEdgeCount: 1,
      interactionPathCount: 2,
      missingInteractionPathCount: 0,
      duplicateInteractionPathCount: 1,
      duplicateMarkerEdgeCount: 0,
      edgeAccessibleNameMissingCount: 0,
      labelCount: 1,
      labelNodeOverlapCount: 0,
      zoomedOut: false,
      visibleLabelCount: 1,
      minimumVisibleLabelHeight: 20,
      maximumVisibleLabelHeight: 20,
      invalidVisibleLabelFontSizeCount: 0,
    };
    expect(() => assertDisplayRoutingVisualScaleAudit({
      name: 'unit',
      audit,
      expectedSignature: 'route-v2:test',
      expectedEdgeCount: 1,
    })).toThrow(/Fixed visual scale audit failed/);
  });

  it('returns a rendered node only after its center is visible and pointer-reachable', () => {
    const child = {};
    const node = {
      getAttribute: () => 'tms',
      getBoundingClientRect: () => rect(300, 180, 80, 40),
      contains: candidate => candidate === child,
    };
    vi.stubGlobal('document', {
      querySelectorAll: () => [node],
      querySelector: () => ({ getBoundingClientRect: () => rect(0, 0, 754, 480) }),
      elementsFromPoint: () => [child],
    });

    expect(readVisibleDisplayRoutingNodeRect('tms')).toEqual({
      x: 300,
      y: 180,
      width: 80,
      height: 40,
    });
  });

  it('waits while auto-fit leaves the target outside the pane', () => {
    const pane = { getBoundingClientRect: () => rect(0, 0, 754, 480) };
    const node = {
      getAttribute: () => 'tms',
      getBoundingClientRect: () => rect(900, 800, 80, 40),
      contains: () => true,
    };
    vi.stubGlobal('document', {
      querySelectorAll: () => [node],
      querySelector: () => pane,
      elementsFromPoint: () => [node],
      elementFromPoint: () => pane,
    });

    expect(readVisibleDisplayRoutingNodeRect('tms')).toBeNull();
    expect(readDisplayRoutingNodePanGesture('tms')).toEqual({
      startX: 377,
      startY: 240,
      endX: 8,
      endY: 8,
    });
  });

  it('rejects covered and malformed drag targets', () => {
    const node = {
      getAttribute: () => 'tms',
      getBoundingClientRect: () => rect(300, 180, 80, 40),
      contains: () => false,
    };
    vi.stubGlobal('document', {
      querySelectorAll: () => [node],
      querySelector: () => ({ getBoundingClientRect: () => rect(0, 0, 754, 480) }),
      elementsFromPoint: () => [{}],
      elementFromPoint: () => ({}),
    });

    expect(readVisibleDisplayRoutingNodeRect('tms')).toBeNull();
    expect(readDisplayRoutingNodePanGesture('tms')).toBeNull();
    expect(readVisibleDisplayRoutingNodeRect('')).toBeNull();
    expect(readVisibleDisplayRoutingNodeRect('x'.repeat(501))).toBeNull();
  });

  it('reports a rendered edge that crosses an unrelated business node', () => {
    const nodes = [
      { id: 'source', bounds: rect(0, 40, 20, 20) },
      { id: 'obstacle', bounds: rect(45, 35, 20, 30) },
      { id: 'target', bounds: rect(90, 40, 20, 20) },
    ].map(({ id, bounds }) => ({
      getAttribute: name => name === 'data-id' ? id : null,
      getBoundingClientRect: () => bounds,
    }));
    const path = {
      getTotalLength: () => 100,
      getPointAtLength: distance => ({ x: distance, y: 50 }),
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    };
    const wrapper = {
      getAttribute: name => name === 'data-testid' ? 'rf__edge-edge-1' : null,
      querySelector: () => path,
    };
    vi.stubGlobal('document', {
      querySelectorAll: selector => selector.startsWith('.react-flow__node')
        ? nodes
        : [wrapper],
    });

    expect(readRenderedDisplayEdgeNodeIntersections([
      { id: 'edge-1', source: 'source', target: 'target' },
    ])).toMatchObject({
      edgeCount: 1,
      auditedPathCount: 1,
      invalidEdgeIds: [],
      intersections: [{ edgeId: 'edge-1', nodeId: 'obstacle' }],
    });
  });

  it('audits the complete shared-trunk route instead of its first visible fragment', () => {
    const nodes = [
      { id: 'source', bounds: rect(0, 40, 20, 20) },
      { id: 'obstacle', bounds: rect(70, 35, 20, 30) },
      { id: 'target', bounds: rect(110, 40, 20, 20) },
    ].map(({ id, bounds }) => ({
      getAttribute: name => name === 'data-id' ? id : null,
      getBoundingClientRect: () => bounds,
    }));
    const fragmentPath = {
      getTotalLength: () => 30,
      getPointAtLength: distance => ({ x: distance, y: 50 }),
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    };
    const completePath = {
      getTotalLength: () => 120,
      getPointAtLength: distance => ({ x: distance, y: 50 }),
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    };
    const wrapper = {
      getAttribute: name => name === 'data-testid' ? 'rf__edge-edge-1' : null,
      querySelector: selector => selector === '.shared-trunk-edge-interaction'
        ? completePath
        : selector === '.react-flow__edge-path' ? fragmentPath : null,
    };
    vi.stubGlobal('document', {
      querySelectorAll: selector => selector.startsWith('.react-flow__node')
        ? nodes
        : [wrapper],
    });

    expect(readRenderedDisplayEdgeNodeIntersections([
      { id: 'edge-1', source: 'source', target: 'target' },
    ])).toMatchObject({
      auditedPathCount: 1,
      invalidEdgeIds: [],
      intersections: [{ edgeId: 'edge-1', nodeId: 'obstacle' }],
    });
  });

  it('reports a rendered edge that stays outside a node but violates commercial clearance', () => {
    const nodes = [
      { id: 'source', bounds: rect(0, 40, 20, 20) },
      { id: 'obstacle', bounds: rect(45, 88, 20, 20) },
      { id: 'target', bounds: rect(90, 40, 20, 20) },
    ].map(({ id, bounds }) => ({
      getAttribute: name => name === 'data-id' ? id : null,
      getBoundingClientRect: () => bounds,
    }));
    const path = {
      getTotalLength: () => 100,
      getPointAtLength: distance => ({ x: distance, y: 50 }),
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    };
    const wrapper = {
      getAttribute: name => name === 'data-testid' ? 'rf__edge-edge-1' : null,
      querySelector: () => path,
    };
    vi.stubGlobal('document', {
      querySelectorAll: selector => selector.startsWith('.react-flow__node')
        ? nodes
        : [wrapper],
    });

    expect(readRenderedDisplayEdgeNodeIntersections([
      { id: 'edge-1', source: 'source', target: 'target' },
    ])).toMatchObject({
      intersections: [],
      clearanceRisks: [{
        edgeId: 'edge-1',
        nodeId: 'obstacle',
        clearance: 38,
        requiredClearance: 48,
      }],
    });

    expect(readRenderedDisplayEdgeNodeIntersections([
      { id: 'edge-1', source: 'source', target: 'target' },
    ], 16)).toMatchObject({
      intersections: [],
      clearanceRisks: [],
    });
  });

  it('accepts a clear rendered path and rejects malformed edge metadata', () => {
    const node = {
      getAttribute: name => name === 'data-id' ? 'obstacle' : null,
      getBoundingClientRect: () => rect(45, 110, 20, 20),
    };
    const path = {
      getTotalLength: () => 100,
      getPointAtLength: distance => ({ x: distance, y: 50 }),
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    };
    const wrapper = {
      getAttribute: name => name === 'data-testid' ? 'rf__edge-edge-1' : null,
      querySelector: () => path,
    };
    vi.stubGlobal('document', {
      querySelectorAll: selector => selector.startsWith('.react-flow__node')
        ? [node]
        : [wrapper],
    });

    expect(readRenderedDisplayEdgeNodeIntersections([
      { id: 'edge-1', source: 'source', target: 'target' },
      { id: '', source: 'source', target: 'target' },
    ])).toEqual({
      edgeCount: 2,
      auditedPathCount: 1,
      invalidEdgeIds: ['<missing>'],
      intersections: [],
      clearanceRisks: [],
    });
  });

  it('audits fixed-zoom paint, label LOD, markers, and node overlap numerically', () => {
    const root = { classList: { contains: () => false } };
    const path = {
      getAttribute: name => name === 'vector-effect' ? 'non-scaling-stroke' : null,
    };
    const markerPath = {
      classList: { contains: value => value === 'vizly-edge-contrast-marker-outline--dark' },
      getAttribute: name => name === 'marker-end' ? 'url(#arrow)' : null,
    };
    const interactionPath = {};
    const wrapper = {
      getAttribute: name => name === 'data-testid' ? 'rf__edge-edge-1' : null,
      querySelector: name => name === '[aria-label]' ? { getAttribute: () => 'edge 1' } : null,
      querySelectorAll: selector => selector === '.react-flow__edge-interaction'
        ? [interactionPath]
        : selector === 'path' ? [path, markerPath] : [],
    };
    const markerGlyph = {};
    const marker = { querySelector: () => markerGlyph };
    const label = {
      getAttribute: name => name === 'data-edge-label-priority' ? 'primary' : null,
      getBoundingClientRect: () => rect(100, 100, 80, 22),
    };
    const node = {
      getBoundingClientRect: () => rect(300, 300, 100, 80),
    };
    vi.stubGlobal('window', {
      reactFlowInstance: { getViewport: () => ({ x: 0, y: 0, zoom: 0.5 }) },
      __vizlyBaseReactFlowDisplayRouting: { outputRouteSignature: 'route-v2:test' },
    });
    vi.stubGlobal('getComputedStyle', element => (
      element === markerPath ? style({
        stroke: 'none',
        markerEnd: 'url(#arrow)',
        filter: 'drop-shadow(rgb(51, 65, 85) 0px 0px 0.65px)',
        getPropertyValue: name => name === '--vizly-edge-marker-outline-color' ? '#334155' : '',
      })
        : element === markerGlyph ? style({ fill: '#47cacc', stroke: 'none' })
          : style()
    ));
    vi.stubGlobal('document', {
      querySelector: selector => selector === '.diagram-root' ? root : null,
      getElementById: id => id === 'arrow' ? marker : null,
      querySelectorAll: selector => {
        if (selector === '.react-flow__edge path') return [path, markerPath];
        if (selector === '[data-testid^="rf__edge-"]') return [wrapper];
        if (selector === '.stable-path-edge-label') return [label];
        if (selector.startsWith('.react-flow__node')) return [node];
        return [];
      },
    });

    expect(readDisplayRoutingVisualScaleAudit()).toEqual({
      zoom: 0.5,
      routeSignature: 'route-v2:test',
      zoomedOut: false,
      pathCount: 2,
      paintedPathCount: 1,
      invalidNonScalingPathCount: 0,
      invalidStrokeWidthCount: 0,
      lowContrastPathCount: 0,
      lowContrastPaths: [],
      markerCount: 1,
      markerContrastAuditedCount: 1,
      lowContrastMarkerCount: 0,
      lowContrastMarkers: [],
      interactionEdgeCount: 1,
      interactionPathCount: 1,
      missingInteractionPathCount: 0,
      duplicateInteractionPathCount: 0,
      duplicateMarkerEdgeCount: 0,
      duplicateMarkerEdges: [],
      edgeAccessibleNameMissingCount: 0,
      labelCount: 1,
      visibleLabelCount: 1,
      visiblePrimaryLabelCount: 1,
      visibleDetailLabelCount: 0,
      minimumVisibleLabelHeight: 22,
      maximumVisibleLabelHeight: 22,
      invalidVisibleLabelFontSizeCount: 0,
      labelNodeOverlapCount: 0,
      labelNodeOverlaps: [],
    });
  });

  it('fails closed when the live viewport zoom is missing or extreme', () => {
    vi.stubGlobal('window', {
      reactFlowInstance: { getViewport: () => ({ zoom: Number.NaN }) },
    });
    vi.stubGlobal('document', { querySelector: () => null, querySelectorAll: () => [] });
    expect(readDisplayRoutingVisualScaleAudit()).toBeNull();

    window.reactFlowInstance.getViewport = () => ({ zoom: 20 });
    expect(readDisplayRoutingVisualScaleAudit()).toBeNull();
  });

  it('blocks subpixel, low-contrast paint and undersized visible labels', () => {
    const root = { classList: { contains: () => false } };
    const path = { getAttribute: name => name === 'vector-effect' ? 'non-scaling-stroke' : null };
    const label = {
      getAttribute: () => null,
      getBoundingClientRect: () => rect(20, 20, 40, 8),
    };
    vi.stubGlobal('window', {
      reactFlowInstance: { getViewport: () => ({ zoom: 1 }) },
      __vizlyBaseReactFlowDisplayRouting: { outputRouteSignature: 'route-v2:risk' },
    });
    vi.stubGlobal('getComputedStyle', element => element === path
      ? style({ stroke: '#e5e7eb', strokeWidth: '1px' })
      : style({ backgroundColor: '#ffffff', fontSize: '8px' }));
    vi.stubGlobal('document', {
      querySelector: selector => selector === '.diagram-root' ? root : null,
      querySelectorAll: selector => {
        if (selector === '.react-flow__edge path') return [path];
        if (selector === '.stable-path-edge-label') return [label];
        return [];
      },
    });

    expect(readDisplayRoutingVisualScaleAudit()).toMatchObject({
      invalidStrokeWidthCount: 1,
      lowContrastPathCount: 1,
      lowContrastPaths: [expect.objectContaining({ effectiveContrast: expect.any(Number) })],
      invalidVisibleLabelFontSizeCount: 1,
    });
  });

  it('accepts a low-contrast semantic stroke only with its matching 3:1 boundary', () => {
    const root = { classList: { contains: () => false } };
    const underlay = {
      classList: { contains: value => value === 'vizly-edge-contrast-underlay' },
      getAttribute: name => name === 'd' ? 'M 0 0 L 100 0' : null,
    };
    const path = {
      previousElementSibling: underlay,
      getAttribute: name => ({
        'vector-effect': 'non-scaling-stroke',
        'data-edge-contrast': 'underlay',
        d: 'M 0 0 L 100 0',
      })[name] ?? null,
    };
    vi.stubGlobal('window', {
      reactFlowInstance: { getViewport: () => ({ zoom: 1 }) },
      __vizlyBaseReactFlowDisplayRouting: { outputRouteSignature: 'route-v2:boundary' },
    });
    vi.stubGlobal('getComputedStyle', element => element === path
      ? style({ stroke: '#47cacc' })
      : element === underlay
        ? style({ stroke: '#334155', strokeWidth: '5px' })
        : style({ backgroundColor: '#ffffff' }));
    vi.stubGlobal('document', {
      querySelector: selector => selector === '.diagram-root' ? root : null,
      querySelectorAll: selector => selector === '.react-flow__edge path' ? [path] : [],
    });

    expect(readDisplayRoutingVisualScaleAudit()).toMatchObject({
      lowContrastPathCount: 0,
      lowContrastPaths: [],
    });
  });
});
