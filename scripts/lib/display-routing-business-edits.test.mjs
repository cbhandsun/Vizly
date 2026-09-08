// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { selectBusinessEditTarget, assertBusinessEditStability, assertBusinessEditRepairScope } from './display-routing-business-edits.mjs';
import { measureDisplayRoutingEditStability } from './display-routing-edit-stability.mjs';
import { createDisplayRoutingMatrixCaseIds, parseDisplayRoutingMatrixCase } from './display-routing-matrix-cases.mjs';
import { verifyDisplayRoutingBrowserCases } from './display-routing-matrix-browser-cases.mjs';

const node = id => ({ id, position: { x: 0, y: 0 } });
const nodes = [node('a'), node('b'), node('c')];
const edges = [{ id: 'ab', source: 'a', target: 'b', data: { computedPath: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } },
  { id: 'bc', source: 'b', target: 'c', data: { computedPath: [{ x: 10, y: 0 }, { x: 20, y: 0 }] } }];
const validMetrics = () => measureDisplayRoutingEditStability({ nodes, edges }, { nodes, edges }, ['a']);
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

  it('records route changes without fabricating a zero-change contract', () => {
    const metrics = { ...validMetrics(), changedPathCount: 1, changedGeometryCount: 1, afterPathLength: 30 };
    expect(assertBusinessEditStability(metrics, 16)).toEqual(metrics);
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
