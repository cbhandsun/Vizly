import { measureDisplayRoutingEditStability, projectDisplayRoutingEditStability } from './display-routing-edit-stability.mjs';
import { readTopologyStabilitySnapshot } from './display-routing-topology-stability.mjs';
import { waitForStableDisplayRoutingLayoutVisual } from './display-routing-layout-visual-settle.mjs';

export const assertHistoryRestored = value => {
  const metrics = projectDisplayRoutingEditStability(value);
  if (!metrics || metrics.comparedNodeCount === 0 || metrics.comparedEdgeCount === 0) {
    throw new Error('Incomplete history restoration evidence');
  }
  if (['movedNodeCount', 'addedNodeCount', 'removedNodeCount', 'addedEdgeCount',
    'removedEdgeCount', 'rewiredEdgeCount'].some(key => metrics[key] !== 0)) {
    throw new Error('History did not restore diagram positions and topology');
  }
  return metrics;
};

export const assertHistoryRetainedRoutes = value => {
  const metrics = projectDisplayRoutingEditStability(value);
  if (!metrics || metrics.comparedEdgeCount === 0 || metrics.changedPortCount !== 0 || metrics.changedGeometryCount !== 0) {
    throw new Error('History changed retained nonincident routes');
  }
  return metrics;
};

export const captureBusinessHistoryState = async (session, phase) => {
  if (!['before', 'after'].includes(phase)) throw new Error('Invalid history capture phase');
  await session.evaluate(`(() => {
    const state = (${readTopologyStabilitySnapshot.toString()})();
    window.__vizlyBusinessHistory ??= {};
    window.__vizlyBusinessHistory[${JSON.stringify(phase)}] = state;
  })()`);
};

export const verifyBusinessHistoryRoundtrip = async ({ session, editedNodeId, waitForValue, readFinalRouteExpression, auditFinalSvg,
  waitForVisual = waitForStableDisplayRoutingLayoutVisual }) => {
  const operations = [];
  try {
    for (const [operation, phase, modifiers] of [['undo', 'before', 2], ['redo', 'after', 10]]) {
      await session.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers });
      await session.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers });
      const expression = `(() => {
        const read = ${readTopologyStabilitySnapshot.toString()};
        const measure = ${measureDisplayRoutingEditStability.toString()};
        const baseline = window.__vizlyBusinessHistory?.[${JSON.stringify(phase)}];
        if (!baseline) throw new Error('Missing history baseline');
        const current = read();
        const metrics = measure(baseline, current, []);
        return metrics.movedNodeCount === 0 && metrics.addedNodeCount === 0 && metrics.removedNodeCount === 0
          && metrics.addedEdgeCount === 0 && metrics.removedEdgeCount === 0 && metrics.rewiredEdgeCount === 0
          ? { stability: metrics, retained: measure(baseline, current, [${JSON.stringify(editedNodeId)}]) } : null;
      })()`;
      await waitForValue(session, expression, `business ${operation} positions`);
      const route = await waitForValue(session, readFinalRouteExpression(''), `business ${operation} route`);
      await waitForVisual({ session,
        ...(route.routing.requestId ? { expectedRequestId: route.routing.requestId }
          : { expectedCommittedRouteSignature: route.response.outputRouteSignature }),
        expectedNodeCount: route.request.nodes.length, expectedEdgeCount: route.response.edges.length });
      // Check again after routing: an obsolete response must not overwrite undo.
      const observed = await session.evaluate(expression);
      const stability = assertHistoryRestored(observed?.stability);
      const retained = assertHistoryRetainedRoutes(observed?.retained);
      operations.push({ operation, stability, retained, ...(await auditFinalSvg(session, route, `business ${operation} route`)) });
    }
    return operations;
  } finally {
    await session.evaluate('delete window.__vizlyBusinessHistory');
  }
};
