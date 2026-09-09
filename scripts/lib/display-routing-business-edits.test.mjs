// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { selectBusinessEditTarget, assertBusinessEditStability, assertBusinessEditRepairScope, assertBusinessEditProcessEvidence } from './display-routing-business-edits.mjs';
import { measureDisplayRoutingEditStability } from './display-routing-edit-stability.mjs';
import { createDisplayRoutingMatrixCaseIds, parseDisplayRoutingMatrixCase } from './display-routing-matrix-cases.mjs';
import { verifyDisplayRoutingBrowserCases } from './display-routing-matrix-browser-cases.mjs';
import { createEditProcessSampler, parseEditProcessLabelTransform, readEditProcessDomPoints, projectEditProcessReport } from './display-routing-edit-process.mjs';
import { assertHistoryRestored, assertHistoryRetainedRoutes, captureBusinessHistoryState, verifyBusinessHistoryRoundtrip } from './display-routing-history-edits.mjs';
import { installHeldRoutingResponse } from './display-routing-held-response.mjs';

const node = id => ({ id, position: { x: 0, y: 0 } });
const nodes = [node('a'), node('b'), node('c')];
const edges = [{ id: 'ab', source: 'a', target: 'b', data: { computedPath: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } },
  { id: 'bc', source: 'b', target: 'c', data: { computedPath: [{ x: 10, y: 0 }, { x: 20, y: 0 }] } }];
const validMetrics = () => measureDisplayRoutingEditStability({ nodes, edges }, { nodes, edges }, ['a']);

const heldResponseHarness = () => {
  class Event {
    constructor(type, { data }) { this.type = type; this.data = data; this.stopped = false; }
    stopImmediatePropagation() { this.stopped = true; }
  }
  class Worker {
    listeners = [];
    posted = [];
    postMessage(...args) { if (this.fail) throw new Error('send failed'); this.posted.push(args); }
    addEventListener(_type, listener, capture = false) { this.listeners.push({ listener, capture }); }
    removeEventListener(_type, listener) { this.listeners = this.listeners.filter(item => item.listener !== listener); }
    dispatchEvent(event) {
      for (const item of [...this.listeners].sort((a, b) => Number(b.capture) - Number(a.capture))) {
        item.listener(event);
        if (event.stopped) break;
      }
    }
  }
  const original = Worker.prototype.postMessage;
  const hold = vm.runInNewContext(`(${installHeldRoutingResponse.toString()})()`, { window: { Worker }, MessageEvent: Event });
  const worker = new Worker();
  const received = [];
  worker.addEventListener('message', event => received.push(event.data));
  const emit = data => worker.dispatchEvent(new Event('message', { data }));
  const final = { requestId: 'held', routingPatches: [], hardClean: true };
  return { Worker, original, hold, worker, received, emit, final };
};

describe('deterministic pending routing response', () => {
  it.each([null, {}, { operation: 'incremental-route' }, { operation: 'incremental-route', requestId: '' },
    { operation: 'incremental-route', requestId: 3 }, { operation: 'incremental-route', requestId: 'x'.repeat(513) }])('does not arm on malformed request identity', message => {
    const h = heldResponseHarness(); h.worker.postMessage(message);
    expect(h.hold.state().matched).toBe(false);
    expect(h.worker.posted).toHaveLength(1);
    h.hold.dispose();
  });
  it('does not overwrite a newer prototype hook when disposed', () => {
    const h = heldResponseHarness(); const newer = () => {};
    h.Worker.prototype.postMessage = newer;
    h.hold.dispose();
    expect(h.Worker.prototype.postMessage).toBe(newer);
  });
  it('holds only the matched final response and explicitly releases it once', () => {
    const h = heldResponseHarness();
    h.worker.postMessage({ operation: 'other', requestId: 'other' });
    expect(h.hold.state().matched).toBe(false);
    h.worker.postMessage({ operation: 'incremental-route', requestId: 'held' }, ['transfer']);
    expect(h.Worker.prototype.postMessage).toBe(h.original);
    h.emit({ ...h.final, requestId: 'other' });
    h.emit({ requestId: 'held', phaseProgress: {} });
    expect(h.received).toHaveLength(2);
    h.emit(h.final);
    expect(h.received).toHaveLength(2);
    expect(h.hold.state()).toEqual({ matched: true, held: true, released: false, overflow: false, disposed: false });
    expect(h.worker.posted.at(-1)[1]).toEqual(['transfer']);
    h.hold.release();
    expect(h.received.at(-1)).toBe(h.final);
    expect(() => h.hold.release()).toThrow('Invalid held');
    h.hold.dispose();
    expect(h.worker.listeners).toHaveLength(1);
  });
  it('disposes without replaying a queued response and rejects premature release', () => {
    const h = heldResponseHarness();
    expect(() => h.hold.release()).toThrow('Invalid held');
    h.worker.postMessage({ operation: 'incremental-route', requestId: 'held' });
    h.emit(h.final); h.hold.dispose();
    expect(h.received).toEqual([]);
    expect(() => h.hold.release()).toThrow('Invalid held');
    expect(h.worker.listeners).toHaveLength(1);
  });
  it('reports duplicate finals instead of retaining an unbounded response queue', () => {
    const h = heldResponseHarness();
    h.worker.postMessage({ operation: 'incremental-route', requestId: 'held' });
    h.emit(h.final); h.emit(h.final);
    expect(h.hold.state().overflow).toBe(true);
    expect(() => h.hold.release()).toThrow('Invalid held');
    h.hold.dispose();
  });
  it('restores the prototype and listeners on send failure or unused disposal', () => {
    const unused = heldResponseHarness(); unused.hold.dispose();
    expect(unused.Worker.prototype.postMessage).toBe(unused.original);
    const h = heldResponseHarness(); h.worker.fail = true;
    expect(() => h.worker.postMessage({ operation: 'incremental-route', requestId: 'held' })).toThrow('send failed');
    expect(h.hold.state().disposed).toBe(true);
    expect(h.worker.listeners).toHaveLength(1);
    expect(h.Worker.prototype.postMessage).toBe(h.original);
  });
});

describe('business history restoration contract', () => {
  it.each([true, false])('requires final routes after pending history positions restore (routes ready=%s)', async routesReady => {
    const before = structuredClone({ nodes, edges });
    const after = structuredClone(before);
    after.nodes[0].position.x = 20;
    after.edges.forEach(edge => { edge.data.computedPath = null; });
    let current = after;
    const window = { __vizlyBusinessHistory: { before, after }, reactFlowInstance: {
      getNodes: () => current.nodes, getEdges: () => current.edges,
    } };
    const session = {
      send: async (_method, event) => {
        if (event.type === 'keyDown') current = event.modifiers === 2 ? before : after;
      },
      evaluate: async expression => vm.runInNewContext(expression, { window }),
    };
    const route = { routing: { requestId: 'current' }, request: { nodes }, response: { edges } };
    const result = verifyBusinessHistoryRoundtrip({ session, editedNodeId: 'a',
      waitForValue: async (_session, expression, label) => {
        if (!label.endsWith(' route')) return session.evaluate(expression);
        if (routesReady) current = { nodes: current.nodes, edges: before.edges };
        return route;
      }, readFinalRouteExpression: () => 'route', waitForVisual: async () => {}, auditFinalSvg: async () => ({}) });
    if (!routesReady) {
      await expect(result).rejects.toThrow('Invalid edit stability snapshot');
      expect(window.__vizlyBusinessHistory).toBeUndefined();
      return;
    }
    const restored = await result;
    expect(restored[1].stability.movedNodeCount).toBe(0);
    expect(restored[1].retained.changedGeometryCount).toBe(0);
    expect(window.__vizlyBusinessHistory).toBeUndefined();
  });
  it('compares retained redo routes to the committed state, not a pending preview', async () => {
    const before = structuredClone({ nodes, edges });
    const after = structuredClone(before);
    after.nodes[0].position.x = 20;
    after.edges[1].data.computedPath[0].x = 99;
    let current = after;
    const window = { __vizlyBusinessHistory: { before, after }, reactFlowInstance: {
      getNodes: () => current.nodes, getEdges: () => current.edges,
    } };
    const session = {
      send: async (_method, event) => {
        if (event.type === 'keyDown') current = event.modifiers === 2 ? before : { nodes: after.nodes, edges: before.edges };
      },
      evaluate: async expression => vm.runInNewContext(expression, { window }),
    };
    const route = { routing: { requestId: 'current' }, request: { nodes }, response: { edges } };
    const restored = await verifyBusinessHistoryRoundtrip({ session, editedNodeId: 'a',
      waitForValue: async (_session, expression, label) => label.endsWith(' route') ? route : session.evaluate(expression),
      readFinalRouteExpression: () => 'route', waitForVisual: async () => {}, auditFinalSvg: async () => ({}) });
    expect(restored[1].stability.changedGeometryCount).toBeUndefined();
    expect(restored[1].retained.changedGeometryCount).toBe(0);
    expect(window.__vizlyBusinessHistory).toBeUndefined();
  });
  it.each([null, { ...validMetrics(), comparedEdgeCount: 0 }, { ...validMetrics(), changedPortCount: 1 },
    { ...validMetrics(), changedPathCount: 1, changedGeometryCount: 1 }])('rejects missing or changed nonincident routes', value => {
    expect(() => assertHistoryRetainedRoutes(value)).toThrow('retained');
  });
  it('accepts restored positions and topology while reporting route changes separately', () => {
    expect(assertHistoryRestored({ ...validMetrics(), changedPathCount: 1, changedGeometryCount: 1 }).changedGeometryCount).toBeUndefined();
  });
  it.each(['movedNodeCount', 'addedNodeCount', 'removedNodeCount', 'addedEdgeCount', 'removedEdgeCount', 'rewiredEdgeCount'])('rejects a history mismatch: %s', key => {
    expect(() => assertHistoryRestored({ ...validMetrics(), [key]: 1 })).toThrow('did not restore');
  });
  it.each([null, {}, { comparedNodeCount: 0 }, { ...validMetrics(), comparedEdgeCount: 0 },
    { ...validMetrics(), movedNodeCount: NaN }])('rejects incomplete evidence', value => {
    expect(() => assertHistoryRestored(value)).toThrow('Incomplete');
  });
  it('keeps independent before/after snapshots in the page and returns no graph data', async () => {
    const state = structuredClone({ nodes, edges });
    const window = { reactFlowInstance: { getNodes: () => state.nodes, getEdges: () => state.edges } };
    const session = { evaluate: expression => vm.runInNewContext(expression, { window }) };
    expect(await captureBusinessHistoryState(session, 'before')).toBeUndefined();
    state.nodes[0].position.x = 20;
    await captureBusinessHistoryState(session, 'after');
    expect(window.__vizlyBusinessHistory.before.nodes[0].position.x).toBe(0);
    expect(window.__vizlyBusinessHistory.after.nodes[0].position.x).toBe(20);
  });
  it.each(['', 'secret', null, {}])('rejects unsupported snapshot slots before browser evaluation', async phase => {
    const session = { evaluate: vi.fn() };
    await expect(captureBusinessHistoryState(session, phase)).rejects.toThrow('Invalid history capture');
    expect(session.evaluate).not.toHaveBeenCalled();
  });
  it.each([false, true])('rechecks positions after routing and clears the capture (late drift=%s)', async drift => {
    const session = { send: vi.fn(async () => {}), evaluate: vi.fn(async expression =>
      expression.startsWith('delete ') ? true : drift ? null : { stability: validMetrics(), retained: validMetrics() }) };
    const route = { routing: { requestId: 'current' }, request: { nodes }, response: { edges } };
    const waitForValue = vi.fn(async (_session, _expression, label) => label.endsWith(' route') ? route : validMetrics());
    const waitForVisual = vi.fn(async () => {});
    const auditFinalSvg = vi.fn(async () => ({ checked: true }));
    const result = verifyBusinessHistoryRoundtrip({ session, editedNodeId: 'a', waitForValue, waitForVisual, auditFinalSvg,
      readFinalRouteExpression: () => 'route expression' });
    if (drift) {
      await expect(result).rejects.toThrow('Incomplete history');
      expect(auditFinalSvg).not.toHaveBeenCalled();
    } else {
      expect((await result).map(item => item.operation)).toEqual(['undo', 'redo']);
      expect(session.send.mock.calls.map(([, event]) => event.modifiers)).toEqual([2, 2, 10, 10]);
      expect(auditFinalSvg).toHaveBeenCalledTimes(2);
    }
    expect(waitForVisual).toHaveBeenCalled();
    expect(session.evaluate).toHaveBeenLastCalledWith('delete window.__vizlyBusinessHistory');
  });
});

const processProbe = read => {
  let tick;
  let expire;
  let time = 0;
  const cancelFrame = vi.fn();
  const clearTimer = vi.fn();
  const sampler = createEditProcessSampler({ read, now: () => time,
    requestFrame: callback => { tick = callback; return 1; }, cancelFrame,
    setTimer: (callback, delay) => { expect(delay).toBe(10000); expire = callback; return 2; }, clearTimer });
  return { sampler, cancelFrame, clearTimer, tick: () => { time += 16; tick(); }, expire: () => expire() };
};

describe('bounded edit process sampling', () => {
  it('requires non-vacuous completed browser process evidence', () => {
    const report = processProbe(() => ({ points: [{ id: 'node', x: 0, y: 0 }],
      routes: [{ id: 'edge', path: 'M0 0L1 0', sourceHandle: null, targetHandle: null }],
      labels: [{ id: 'edge', x: 0, y: 0, visible: true, conflicts: 0 }] })).sampler;
    const probe = report.stop();
    expect(assertBusinessEditProcessEvidence({ ...probe, sampleCount: 2 })).toMatchObject({ status: 'completed' });
    for (const value of [null, { ...probe, status: 'unavailable' }, { ...probe, sampleCount: 1 },
      { ...probe, monitoredNodeCount: 0 }, { ...probe, monitoredRouteCount: 0 }, { ...probe, monitoredLabelCount: 0 }]) {
      expect(() => assertBusinessEditProcessEvidence(value)).toThrow('incomplete');
    }
  });
  it('separates initial, frame and final observation costs', () => {
    let time = 0;
    let tick;
    const sampler = createEditProcessSampler({
      read: () => { time += 3; return [{ id: 'node', x: 0, y: 0 }]; }, now: () => time,
      requestFrame: callback => { tick = callback; }, cancelFrame: () => {},
      setTimer: () => {}, clearTimer: () => {},
    });
    tick();
    expect(sampler.stop()).toMatchObject({ initialMs: 3, frameMs: 3, finalMs: 3,
      frameCount: 1, measurementMs: 9, readMs: 9, comparisonMs: 0 });
  });
  it('projects only finite process metrics and fixed states from browser output', () => {
    const report = processProbe(() => [{ id: 'x', x: 0, y: 0 }]).sampler.stop();
    expect(projectEditProcessReport({ ...report, content: 'secret' })).toEqual(report);
    for (const bad of [null, [], { ...report, readMs: Infinity }, { ...report, sampleCount: 257 },
      { ...report, status: 'secret' }, { ...report, maxSampleMs: 'secret' }]) {
      expect(projectEditProcessReport(bad)).toBeNull();
    }
  });
  const readDom = (style = {}, nested = false) => vm.runInNewContext(
    `(${readEditProcessDomPoints.toString()})('edited')`, {
      document: { querySelectorAll: () => ['edited', 'retained'].map(id => ({
        getAttribute: () => id, parentElement: { closest: () => nested ? {} : null, getAttribute: () => null },
        getBoundingClientRect: () => { throw new Error('Unexpected layout read'); },
      })) },
      getComputedStyle: () => ({ transform: 'rendered-transform', left: '0px', top: '0px', transitionProperty: 'none', transitionDuration: '0s', ...style }),
      DOMMatrix: class {
        constructor(transform) {
          expect(transform).toBe('rendered-transform');
          Object.assign(this, { is2D: true, a: 1, d: 1, b: 0, c: 0, e: 156, f: 1428 });
        }
      },
    },
  );
  it('reads committed DOM transforms without rectangle layout reads or viewport dependence', () => {
    expect(readDom()).toEqual([{ id: 'retained', x: 156, y: 1428 }]);
  });
  it('uses React Flow inline transforms without a synchronous computed-style read', () => {
    const getComputedStyle = vi.fn(() => { throw new Error('Unexpected computed style'); });
    const element = { style: { transform: 'inline-transform', left: '0px', top: '0px' },
      getAnimations: () => [], getAttribute: () => 'retained', parentElement: { closest: () => null } };
    const points = vm.runInNewContext(`(${readEditProcessDomPoints.toString()})('edited')`, {
      document: { querySelectorAll: () => [element] }, getComputedStyle,
      DOMMatrix: class { constructor(value) { expect(value).toBe('inline-transform');
        Object.assign(this, { is2D: true, a: 1, d: 1, b: 0, c: 0, e: 20, f: 30 }); } },
    });
    expect(points).toEqual([{ id: 'retained', x: 20, y: 30 }]);
    expect(getComputedStyle).not.toHaveBeenCalled();
  });
  it('rejects unsupported DOM offsets or nested node placement', () => {
    expect(() => readDom({ left: '12px' })).toThrow('unsupported');
    expect(() => readDom({}, true)).toThrow('unsupported');
  });
  it.each(['translate', 'rotate', 'scale', 'offsetPath'])('rejects independent %s instead of reporting zero displacement', key => {
    expect(() => readDom({ [key]: '20px' })).toThrow('unsupported');
  });
  it('reads changing computed transforms even when DOM attributes do not change', () => {
    const nodeStyle = 'first';
    const parentClass = 'first';
    let x = 0;
    const getComputedStyle = vi.fn(() => ({ transform: 'matrix', left: '0px', top: '0px',
      animationName: 'none', transitionDuration: '0.25s', transitionProperty: 'opacity' }));
    const parent = { closest: () => null, getAttribute: () => parentClass };
    const element = { parentElement: parent, getAttribute: key => key === 'data-id' ? 'retained' : nodeStyle };
    const context = vm.createContext({ document: { querySelectorAll: () => [element] },
      getComputedStyle, DOMMatrix: class { constructor() { Object.assign(this, { is2D: true, a: 1, d: 1, b: 0, c: 0, e: x, f: 0 }); } } });
    context.animated = new Set([element]);
    const read = () => vm.runInContext(`(${readEditProcessDomPoints.toString()})('edited', animated)`, context);
    read(); read();
    expect(getComputedStyle).toHaveBeenCalledTimes(2);
    x = 20;
    expect(read()[0].x).toBe(20);
    x = 30;
    expect(read()[0].x).toBe(30);
    expect(getComputedStyle).toHaveBeenCalledTimes(4);
  });
  it('retains a transient movement even when the final position returns to baseline', () => {
    let x = 0;
    const probe = processProbe(() => [{ id: 'private-node', x, y: 0 }]);
    x = 20; probe.tick(); x = 0; probe.tick();
    const report = probe.sampler.stop();
    expect(report).toMatchObject({ status: 'completed', sampleCount: 4, monitoredNodeCount: 1,
      maxNodeDisplacement: 20, movedNodeCount: 1, maxSampleGapMs: 16 });
    expect(JSON.stringify(report)).not.toContain('private-node');
    expect(probe.cancelFrame).toHaveBeenCalled();
    expect(probe.clearTimer).toHaveBeenCalled();
  });
  it('retains transient route, port and label changes after the final frame returns to baseline', () => {
    let path = 'M0 0L10 0', sourceHandle = 'right', labelX = 0, visible = true, conflicts = 0;
    const read = () => ({
      points: [{ id: 'retained-node', x: 0, y: 0 }],
      routes: [{ id: 'edge', path, sourceHandle, targetHandle: 'left' }],
      labels: [{ id: 'edge', x: labelX, y: 0, visible, conflicts }],
    });
    const probe = processProbe(read);
    path = 'M0 0L0 10L10 10'; sourceHandle = 'bottom'; labelX = 20; visible = false; conflicts = 2;
    probe.tick();
    path = 'M0 0L10 0'; sourceHandle = 'right'; labelX = 0; visible = true; conflicts = 0;
    probe.tick();
    const report = probe.sampler.stop();
    expect(report).toMatchObject({ monitoredRouteCount: 1, monitoredLabelCount: 1,
      routePathSwitchCount: 2, portSwitchCount: 2, maxMissingRouteCount: 0, routeMissingSampleCount: 0,
      maxLabelDisplacement: 20, movedLabelCount: 1, maxMissingLabelCount: 0,
      labelMissingSampleCount: 0, maxHiddenLabelCount: 1, maxLabelConflictCount: 2,
      finalQuietMs: 0 });
    expect(JSON.stringify(report)).not.toMatch(/retained-node|M0|right|edge/);
  });
  it('reports bounded missing rendered routes and labels without returning their identities', () => {
    let routes = [{ id: 'edge', path: 'M0 0L10 0', sourceHandle: null, targetHandle: null }];
    let labels = [{ id: 'edge', x: 0, y: 0, visible: true, conflicts: 0 }];
    const probe = processProbe(() => ({ points: [{ id: 'node', x: 0, y: 0 }], routes, labels }));
    routes = []; labels = []; probe.tick();
    expect(probe.sampler.stop()).toMatchObject({ maxMissingRouteCount: 1, routeMissingSampleCount: 2,
      maxMissingLabelCount: 1, labelMissingSampleCount: 2 });
  });
  it('parses only bounded label transforms emitted by the edge renderer', () => {
    expect(parseEditProcessLabelTransform('translate(-50%, -50%) translate(123.5px,-42px) scale(var(--scale, 1))'))
      .toEqual({ x: 123.5, y: -42 });
    expect(parseEditProcessLabelTransform('translate(-50%,-50%) translate(1e2px, .5px)')).toEqual({ x: 100, y: 0.5 });
    for (const value of [null, '', 'matrix(1,0,0,1,2,3)', 'translate(-50%,-50%) translate(NaNpx,0px)',
      `translate(-50%,-50%) translate(${'1'.repeat(513)}px,0px)`]) {
      expect(parseEditProcessLabelTransform(value)).toBeNull();
    }
  });
  it.each([null, [], [{ id: 'x', x: NaN, y: 0 }], Array(257).fill({ id: 'x', x: 0, y: 0 }),
    [{ id: 'x', x: 0, y: 0 }, { id: 'x', x: 0, y: 0 }]])('marks invalid or oversized observations unavailable', points => {
    expect(processProbe(() => points).sampler.stop().status).toBe('unavailable');
  });
  it('does not report a missing node, read error or exhausted budget as complete', () => {
    let points = [{ id: 'x', x: 0, y: 0 }];
    const missing = processProbe(() => points);
    points = [{ id: 'other', x: 0, y: 0 }]; missing.tick();
    expect(missing.sampler.stop().status).toBe('unavailable');
    expect(processProbe(() => { throw new Error('private'); }).sampler.stop().status).toBe('unavailable');
    const bounded = processProbe(() => points);
    for (let index = 0; index < 239; index += 1) bounded.tick();
    expect(bounded.sampler.stop()).toMatchObject({ status: 'sample-limit', sampleCount: 240 });
    const timed = processProbe(() => points); timed.expire();
    expect(timed.sampler.stop().status).toBe('time-limit');
  });
});
// Serialize through the real Node entry point once. Vitest rewrites imported
// names inside function bodies, which would test SSR internals in the browser VM.
const expressions = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
  import { businessEditFinalRouteExpression, businessEditPositionExpression } from './scripts/lib/display-routing-business-edits.mjs';
  process.stdout.write(JSON.stringify({valid:businessEditFinalRouteExpression('a','old'),
    opaque:businessEditFinalRouteExpression('a";throw new Error()','old'),
    position:businessEditPositionExpression('a";throw new Error()')}));
`], {encoding:'utf8',timeout:10000,windowsHide:true}));

const committedEdit = () => {
  const signature='route-v2:2:4:0123456789abcdef';
  const request={requestId:'new',operation:'incremental-route',changeSet:{changedNodeIds:['a']},edges,
    __browserRequestOrdinal:2,__browserAttemptOrdinal:1,__browserWorkerInstanceId:'worker'};
  const response={...request,hardClean:true,hardReport:{hardClean:true},routingPatches:edges,
    outputRouteSignature:signature,commitReceipt:{outputRouteSignature:signature}};
  return {__vizlyRoutingRequests:[request],__vizlyRoutingResponses:[response],
    __vizlyBaseReactFlowDisplayRouting:{stage:'final-applied',renderAuthorityStatus:'accepted',
      cacheTrustLevel:'runtime-committed',outputRouteSignature:signature},
    reactFlowInstance:{getEdges:()=>edges}};
};
const evaluateEdit = state => vm.runInNewContext(expressions.valid,
  {window:state,document:{querySelectorAll:()=>edges}});

describe('business edit transaction evidence',()=>{
  it('measures canvas coordinates when parent restoration changes local coordinates', () => {
    const read = internal => vm.runInNewContext(expressions.position, {
      window: { reactFlowInstance: { getInternalNode: id => {
        expect(id).toBe('a";throw new Error()');
        return internal;
      } } },
    });
    expect(read({ position: { x: 136, y: 116 }, parentId: 'parent',
      internals: { positionAbsolute: { x: 156, y: 1428 } } })).toEqual({ x: 156, y: 1428 });
    for (const internal of [null, {}, { position: { x: 136, y: 116 } },
      { internals: { positionAbsolute: { x: Infinity, y: 0 } } },
      { internals: { positionAbsolute: { x: '156', y: 1428 } } }]) {
      expect(read(internal)).toBeNull();
    }
  });
  it('accepts runtime committed cache with matching receipt and exact paths',()=>{
    expect(evaluateEdit(committedEdit())?.request.requestId).toBe('new');
  });
  it.each(['signature','receipt','attempt','worker','path','stale'])('rejects mismatched %s evidence',defect=>{
    const state=committedEdit();
    if(defect==='signature') state.__vizlyBaseReactFlowDisplayRouting.outputRouteSignature='different';
    if(defect==='receipt') state.__vizlyRoutingResponses[0].commitReceipt.outputRouteSignature='different';
    if(defect==='attempt') state.__vizlyRoutingResponses[0].__browserAttemptOrdinal=3;
    if(defect==='worker') state.__vizlyRoutingResponses[0].__browserWorkerInstanceId='older';
    if(defect==='path') state.reactFlowInstance.getEdges=()=>edges.map(e=>({...e,data:{computedPath:[]}}));
    if(defect==='stale') state.__vizlyRoutingRequests[0].requestId='old';
    expect(evaluateEdit(state)).toBeNull();
  });
  it('ignores a later phase notification and does not execute opaque node ids',()=>{
    const state=committedEdit();
    state.__vizlyRoutingResponses.push({requestId:'new',phase:'quality'});
    expect(evaluateEdit(state)?.response.hardClean).toBe(true);
    expect(vm.runInNewContext(expressions.opaque,
      {window:state,document:{querySelectorAll:()=>edges}})).toBeNull();
  });
});

describe('business diagram edit coverage', () => {
  it('enforces unchanged routes outside final scope without treating full fallback as zero changes', () => {
    const evidence = metrics => ({ finalRepairScope: { status: 'available', outsideFinalRepairGroup: metrics } });
    expect(() => assertBusinessEditRepairScope(evidence(validMetrics()))).not.toThrow();
    expect(() => assertBusinessEditRepairScope({ finalRepairScope: { status: 'full-route' } })).not.toThrow();
    for (const change of [{ sourceHandle: 'changed-port' },
      { data: { computedPath: [{ x: 10, y: 0 }, { x: 30, y: 0 }] } }]) {
      const afterEdges = [edges[0], { ...edges[1], ...change }];
      const metrics = measureDisplayRoutingEditStability({ nodes, edges }, { nodes, edges: afterEdges }, ['a']);
      expect(() => assertBusinessEditRepairScope(evidence(metrics))).toThrow('outside final');
    }
    for (const value of [null, {}, { finalRepairScope: { status: 'unavailable' } }, evidence(null)]) {
      expect(() => assertBusinessEditRepairScope(value)).toThrow('unavailable');
    }
  });
  it('selects a deterministic connected leaf with unrelated routes to compare', () => {
    expect(selectBusinessEditTarget(nodes, edges)).toEqual({ nodeId: 'a', nodeIndex: 0, degree: 1 });
    expect(selectBusinessEditTarget(nodes.toReversed(), edges)?.nodeId).toBe('a');
    expect(selectBusinessEditTarget(nodes.slice(0, 2), edges.slice(0, 1))).toBeNull();
  });

  it.each([{ hidden: true }, { draggable: false }, { type: 'titleGroup' }])('excludes unavailable drag targets: %j', flags => {
    expect(selectBusinessEditTarget([{ ...nodes[0], ...flags }, ...nodes.slice(1)], edges)?.nodeId).toBe('c');
  });

  it('excludes parents and handles opaque identifiers without property lookup', () => {
    expect(selectBusinessEditTarget([...nodes, { ...node('child'), parentId: 'a' }], edges)?.nodeId).toBe('c');
    const renamed = nodes.map(n => n.id === 'a' ? { ...n, id: '__proto__' } : n);
    expect(selectBusinessEditTarget(renamed, edges.map(e => e.source === 'a' ? { ...e, source: '__proto__' } : e))?.nodeId).toBe('__proto__');
  });

  it.each([null, {}, [], [null], [node('a'), node('a')], Array(5_001).fill(node('a'))])('rejects malformed, empty or oversized node sets', value => {
    expect(selectBusinessEditTarget(value, edges)).toBeNull();
  });

  it.each([null, {}, [null], [{ source: 'missing', target: 'b' }], Array(5_001).fill(edges[0])])('rejects malformed or oversized edge sets', value => {
    expect(selectBusinessEditTarget(nodes, value)).toBeNull();
  });

  it('accepts the graph item limit without quadratic degree scans', () => {
    expect(selectBusinessEditTarget([...nodes, ...Array.from({ length: 4_997 }, (_, i) => node(`extra-${i}`))], edges)?.nodeId).toBe('a');
  });

  it('rejects nonincident route drift in the canonical leaf-drag fixtures', () => {
    const metrics = { ...validMetrics(), changedPathCount: 1, changedGeometryCount: 1, afterPathLength: 30 };
    expect(() => assertBusinessEditStability(metrics, 16)).toThrow('nonincident');
  });

  it.each([NaN, Infinity, 0, -1, undefined])('rejects missing or ineffective gestures', displacement => {
    expect(() => assertBusinessEditStability(validMetrics(), displacement)).toThrow('Incomplete');
  });

  it.each(['movedNodeCount', 'addedNodeCount', 'removedNodeCount', 'addedEdgeCount', 'removedEdgeCount', 'rewiredEdgeCount'])('rejects unrelated changes: %s', key => {
    expect(() => assertBusinessEditStability({ ...validMetrics(), [key]: 1 }, 16)).toThrow('unrelated');
  });

  it('fails closed on missing metrics and vacuous comparisons', () => {
    for (const value of [null, {}, { ...validMetrics(), comparedEdgeCount: 0 }]) {
      expect(() => assertBusinessEditStability(value, 16)).toThrow('Incomplete');
    }
  });

  it.each(['business-edit-stability', 'swimlane-edit-stability'])('registers %s and invokes only its verifier', async id => {
    expect(parseDisplayRoutingMatrixCase(id, createDisplayRoutingMatrixCaseIds([]))).toBe(id);
    const verifyBusinessEdits = vi.fn(async () => [{ presetId: 'fixture' }]);
    const verifyTopology = vi.fn();
    const verifyMultiPage = vi.fn();
    const result = await verifyDisplayRoutingBrowserCases({ requestedCase: id,
      verifyBusinessEdits, verifyTopology, verifyMultiPage });
    expect(result.businessEditResults).toEqual([{ presetId: 'fixture' }]);
    expect(verifyBusinessEdits).toHaveBeenCalledOnce();
    expect(verifyBusinessEdits.mock.calls[0][0].layoutCase?.id)
      .toBe(id === 'swimlane-edit-stability' ? 'domain-lanes-tb' : undefined);
    expect(verifyTopology).not.toHaveBeenCalled();
    expect(verifyMultiPage).not.toHaveBeenCalled();
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(workflow).toMatch(/DISPLAY_ROUTING_MATRIX_CASE = 'business-edit-stability'\s+npm run verify:display-routing-matrix/);
    expect(workflow).toMatch(/DISPLAY_ROUTING_MATRIX_CASE = 'swimlane-edit-stability'\s+npm run verify:display-routing-matrix/);
  });
});
