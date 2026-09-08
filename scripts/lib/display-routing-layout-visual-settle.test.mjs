import { describe, expect, it } from 'vitest';
import vm from 'node:vm';

import { resolveDisplayRoutingLayoutVisualTimeoutMs, displayRoutingLayoutVisualSnapshotExpression,
  displayRoutingLayoutVisualSnapshotsMatch, waitForStableDisplayRoutingLayoutVisual } from './display-routing-layout-visual-settle.mjs';

const signature = 'route-v2:0:0:0123456789abcdef';
const options = { expectedCommittedRouteSignature: signature, expectedNodeCount: 0, expectedEdgeCount: 0 };
const readSnapshot = (extraOptions = {}, extraRouting = {}) => vm.runInNewContext(
  displayRoutingLayoutVisualSnapshotExpression({ ...options, ...extraOptions }), {
    window: {
      __vizlyBaseReactFlowDisplayRouting: { stage: 'final-applied', renderAuthorityStatus: 'accepted',
        cacheTrustLevel: 'runtime-committed', outputRouteSignature: signature, ...extraRouting },
      reactFlowInstance: { getViewport: () => ({ x: 0, y: 0, zoom: 1 }), getNodes: () => [], getEdges: () => [] },
    },
    document: { querySelector: () => null, querySelectorAll: selector => selector === 'button'
      ? [{ getAttribute: name => name === 'aria-label' ? 'Auto layout' : 'false' }] : [] },
    performance: { timeOrigin: 1000, now: () => 0 },
  },
);

describe('explicit committed-cache visual identity', () => {
  it('accepts a runtime committed signature without inventing a request id', () => {
    expect(readSnapshot()).toMatchObject({ready:true,requestId:null,committedRouteSignature:signature});
  });
  it.each([null, '', 7, 'route-v2:invalid', 'x'.repeat(10000)])('rejects invalid signatures', value => {
    expect(readSnapshot({ expectedCommittedRouteSignature: value }).ready).toBe(false);
  });
  it.each([
    {cacheTrustLevel:'persisted'}, {cacheTrustLevel:undefined}, {outputRouteSignature:'route-v2:0:0:0000000000000000'},
    {stage:'pending'}, {renderAuthorityStatus:'rejected'},
  ])('rejects untrusted or different snapshots: %j', routing => {
    expect(readSnapshot({},routing).ready).toBe(false);
  });
  it('keeps strict request mode and refuses ambiguous identity options', () => {
    expect(readSnapshot({expectedRequestId:'one'}).ready).toBe(false);
    expect(readSnapshot({expectedRequestId:'one',expectedCommittedRouteSignature:undefined},{requestId:'two'}).ready).toBe(false);
    expect(readSnapshot({expectedRequestId:'one',expectedCommittedRouteSignature:undefined},{requestId:'one'}).ready).toBe(true);
    expect(readSnapshot({expectedNodeCount:1}).ready).toBe(false);
  });
  it('restarts the quiet window when the committed signature changes', () => {
    const first=readSnapshot();
    expect(displayRoutingLayoutVisualSnapshotsMatch(first,{...first})).toBe(true);
    expect(displayRoutingLayoutVisualSnapshotsMatch(first,{...first,committedRouteSignature:'route-v2:0:0:0000000000000000'})).toBe(false);
  });
  it('accepts the explicit mode through the host waiter and rejects mixed modes', async () => {
    let now=0;
    const session={evaluate:async()=>({...readSnapshot(),sampledAt:now})};
    await expect(waitForStableDisplayRoutingLayoutVisual({session,...options,now:()=>now,
      wait:async ms=>{now+=ms;}})).resolves.toMatchObject({snapshot:{ready:true,requestId:null}});
    await expect(waitForStableDisplayRoutingLayoutVisual({session,...options,expectedRequestId:''})).rejects.toThrow('request id');
  });
});

describe('resolveDisplayRoutingLayoutVisualTimeoutMs', () => {
  it('preserves a finite matrix timeout within the visual-settle bounds', () => {
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(12_000)).toBe(12_000);
  });

  it('clamps empty, extreme, and invalid timeout values safely', () => {
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(0)).toBe(100);
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(120_000)).toBe(30_000);
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(Number.POSITIVE_INFINITY)).toBe(5_000);
    expect(resolveDisplayRoutingLayoutVisualTimeoutMs(undefined, 8_000)).toBe(8_000);
  });
});
