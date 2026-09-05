import { assertDisplayRoutingVisualScaleAudit } from './display-routing-browser-visual-audit.mjs';
import { afterEach, expect, it, vi } from 'vitest';
import { readDisplayRoutingVisualScaleAudit, readRenderedDisplayEdgeNodeIntersections } from './display-routing-browser-geometry.mjs';

const rect = (x, y, width = 20, height = 20) => ({ left: x, top: y, right: x + width, bottom: y + height, width, height });
const node = (id, type = 'flowchart', data = {}) => ({ id, type, data });
const element = (id, bounds = rect(40, 40), hidden = false) => ({ getAttribute: key => key === 'data-id' ? id : null, getBoundingClientRect: () => bounds, hidden });
const label = (id, bounds, hidden = false) => ({ ...element(id, bounds, hidden), getAttribute: key => key === 'data-edge-id' ? id : 'primary' });
const mount = (models, elements, labels = []) => {
  vi.stubGlobal('window', { reactFlowInstance: { getViewport: () => ({ zoom: 1 }), getNodes: () => models } });
  vi.stubGlobal('getComputedStyle', item => ({ display: item?.hidden ? 'none' : 'block', visibility: 'visible', opacity: '1', backgroundColor: '#ffffff', fontSize: '12px' }));
  vi.stubGlobal('document', { querySelector: () => null, querySelectorAll: selector => selector === '.react-flow__node[data-id]' ? elements : selector === '.stable-path-edge-label' ? labels : [] });
};
afterEach(() => vi.unstubAllGlobals());
it('scans model-backed node types and excludes only expanded containers', () => {
  mount([node('a'), node('b', 'custom'), node('c', 'titleGroup'), node('d', 'subGroup', { collapsed: true })], ['a', 'b', 'c', 'd'].map(id => element(id)));
  const audit = readDisplayRoutingVisualScaleAudit();
  expect(audit).toMatchObject({ inputNodeCount: 4, scannedNodeCount: 3, excludedContainerCount: 1, omittedNodeCount: 0, nodeScanComplete: true });
});
it('fails closed for absent, hidden, invalid and unknown DOM coverage', () => {
  for (const elements of [[], [element('a', rect(NaN, 0))], [element('a', rect(0, 0), true)], [element('unknown')]]) {
    mount([node('a')], elements);
    expect(readDisplayRoutingVisualScaleAudit()).toMatchObject({ nodeScanComplete: false });
  }
  mount([], []);
  expect(readDisplayRoutingVisualScaleAudit()).toMatchObject({ nodeScanComplete: false, scannedNodeCount: 0 });
});
it('counts only overlapping pairs of actually visible labels', () => {
  mount([node('a')], [element('a', rect(500, 500))], [label('one', rect(0, 0)), label('two', rect(10, 10)), label('hidden', rect(0, 0), true), label('clear', rect(100, 100))]);
  expect(readDisplayRoutingVisualScaleAudit()).toMatchObject({ labelLabelOverlapCount: 1, labelLabelOverlaps: [{ edgeA: 'one', edgeB: 'two' }] });
});
it('serialized readers remain independent of module scope', () => {
  mount([node('a')], [element('a')]);
  expect((0, eval)(`(${readDisplayRoutingVisualScaleAudit.toString()})`)()).toMatchObject({ nodeScanComplete: true });
  expect((0, eval)(`(${readRenderedDisplayEdgeNodeIntersections.toString()})`)([])).toMatchObject({ nodeScanComplete: true, scannedNodeCount: 1 });
});
it('audits a flowchart obstacle and a collapsed container against a real route', () => {
  const route = { getTotalLength: () => 100, getPointAtLength: x => ({ x, y: 50 }), getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) };
  const wrapper = { getAttribute: () => 'rf__edge-edge', querySelector: () => route };
  for (const model of [node('obstacle'), node('obstacle', 'subGroup', { collapsed: true })]) {
    mount([model], [element('obstacle')]);
    const query = document.querySelectorAll;
    document.querySelectorAll = selector => selector.startsWith('[data-testid') ? [wrapper] : query(selector);
    expect(readRenderedDisplayEdgeNodeIntersections([{ id: 'edge', source: 'a', target: 'b' }])).toMatchObject({
      nodeScanComplete: true, intersections: [{ nodeId: 'obstacle' }],
    });
  }
});
it('excludes expanded container rectangles from label obstacles but includes collapsed containers', () => {
  for (const collapsed of [false, true]) {
    mount([node('container', 'titleGroup', { collapsed }), node('a')], [element('container', rect(0, 0, 100, 100)), element('a', rect(500, 500))], [label('edge', rect(20, 20))]);
    expect(readDisplayRoutingVisualScaleAudit().labelNodeOverlapCount).toBe(collapsed ? 1 : 0);
  }
});
it('fails closed on duplicate, invalid and excessive models, and excludes intentionally hidden nodes', () => {
  for (const models of [[node('a'), node('a')], [null], [node('a', 'custom', { collapsed: 'true' })], Array.from({ length: 5001 }, (_, i) => node(String(i)))]) {
    mount(models, [element('a')]);
    expect(readDisplayRoutingVisualScaleAudit().nodeScanComplete).toBe(false);
  }
  mount([node('a'), { ...node('hidden'), hidden: true }], [element('a')]);
  expect(readDisplayRoutingVisualScaleAudit()).toMatchObject({ nodeScanComplete: true, hiddenModelNodeCount: 1 });
});
it('ignores labels hidden by an ancestor and edge-touching label pairs', () => {
  const hidden = label('hidden', rect(0, 0));
  hidden.parentElement = { hidden: true };
  mount([node('a')], [element('a', rect(500, 500))], [label('one', rect(0, 0)), label('two', rect(20, 0)), hidden]);
  expect(readDisplayRoutingVisualScaleAudit()).toMatchObject({ visibleLabelCount: 2, labelLabelOverlapCount: 0 });
});
it('the visual gate independently rejects missing coverage and label collisions', () => {
  const clean = {
    zoom: 1, routeSignature: 'route', pathCount: 1, paintedPathCount: 1,
    invalidNonScalingPathCount: 0, invalidStrokeWidthCount: 0, lowContrastPathCount: 0,
    markerCount: 1, markerContrastAuditedCount: 1, lowContrastMarkerCount: 0,
    interactionEdgeCount: 1, interactionPathCount: 1, missingInteractionPathCount: 0,
    duplicateInteractionPathCount: 0, computedRenderPathCount: 1, fallbackRenderPathCount: 0,
    missingRenderPathSourceCount: 0, duplicateMarkerEdgeCount: 0, edgeAccessibleNameMissingCount: 0,
    labelCount: 1, visibleLabelCount: 1, labelNodeOverlapCount: 0, labelLabelOverlapCount: 0,
    nodeScanComplete: true, scannedNodeCount: 1, zoomedOut: false,
    minimumVisibleLabelHeight: 20, maximumVisibleLabelHeight: 20, invalidVisibleLabelFontSizeCount: 0,
  };
  const assertAudit = audit => assertDisplayRoutingVisualScaleAudit({ name: 'coverage', audit, expectedSignature: 'route', expectedEdgeCount: 1 });
  expect(() => assertAudit(clean)).not.toThrow();
  for (const defect of [{ nodeScanComplete: false }, { nodeScanComplete: undefined }, { scannedNodeCount: 0 }, { labelLabelOverlapCount: 1 }, { labelLabelOverlapCount: undefined }]) {
    expect(() => assertAudit({ ...clean, ...defect })).toThrow(/Fixed visual scale audit failed/);
  }
});
