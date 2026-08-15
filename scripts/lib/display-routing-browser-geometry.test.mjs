import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readDisplayRoutingNodePanGesture,
  readDisplayRoutingVisualScaleAudit,
  readRenderedDisplayEdgeNodeIntersections,
  readVisibleDisplayRoutingNodeRect,
} from './display-routing-browser-geometry.mjs';

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
  ...overrides,
});

describe('display routing browser geometry', () => {
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
      getAttribute: name => name === 'marker-end' ? 'url(#arrow)' : null,
    };
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
      element === markerPath ? style({ stroke: 'none', markerEnd: 'url(#arrow)' }) : style()
    ));
    vi.stubGlobal('document', {
      querySelector: selector => selector === '.diagram-root' ? root : null,
      querySelectorAll: selector => {
        if (selector === '.react-flow__edge path') return [path, markerPath];
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
      markerCount: 1,
      labelCount: 1,
      visibleLabelCount: 1,
      visiblePrimaryLabelCount: 1,
      visibleDetailLabelCount: 0,
      minimumVisibleLabelHeight: 22,
      maximumVisibleLabelHeight: 22,
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
});
