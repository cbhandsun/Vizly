// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { selectBusinessEditTarget, assertBusinessEditStability, assertBusinessEditRepairScope } from './display-routing-business-edits.mjs';
import { measureDisplayRoutingEditStability } from './display-routing-edit-stability.mjs';
import { createDisplayRoutingMatrixCaseIds, parseDisplayRoutingMatrixCase } from './display-routing-matrix-cases.mjs';
import { verifyDisplayRoutingBrowserCases } from './display-routing-matrix-browser-cases.mjs';
import { createEditProcessSampler, readEditProcessDomPoints, projectEditProcessReport } from './display-routing-edit-process.mjs';

const node = id => ({ id, position: { x: 0, y: 0 } });
const nodes = [node('a'), node('b'), node('c')];
const edges = [{ id: 'ab', source: 'a', target: 'b', data: { computedPath: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } },
  { id: 'bc', source: 'b', target: 'c', data: { computedPath: [{ x: 10, y: 0 }, { x: 20, y: 0 }] } }];
const validMetrics = () => measureDisplayRoutingEditStability({ nodes, edges }, { nodes, edges }, ['a']);

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
    const read = () => vm.runInContext(`(${readEditProcessDomPoints.toString()})('edited')`, context);
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

  it('registers the matrix case and invokes only its verifier', async () => {
    const id = 'business-edit-stability';
    expect(parseDisplayRoutingMatrixCase(id, createDisplayRoutingMatrixCaseIds([]))).toBe(id);
    const verifyBusinessEdits = vi.fn(async () => [{ presetId: 'fixture' }]);
    const verifyTopology = vi.fn();
    const verifyMultiPage = vi.fn();
    const result = await verifyDisplayRoutingBrowserCases({ requestedCase: id,
      verifyBusinessEdits, verifyTopology, verifyMultiPage });
    expect(result.businessEditResults).toEqual([{ presetId: 'fixture' }]);
    expect(verifyBusinessEdits).toHaveBeenCalledOnce();
    expect(verifyTopology).not.toHaveBeenCalled();
    expect(verifyMultiPage).not.toHaveBeenCalled();
    const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(workflow).toMatch(/DISPLAY_ROUTING_MATRIX_CASE = 'business-edit-stability'\s+npm run verify:display-routing-matrix/);
  });
});
