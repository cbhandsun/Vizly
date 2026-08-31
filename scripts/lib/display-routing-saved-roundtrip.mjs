import { clickLayout, assertRequestedLayoutSelected } from './display-routing-matrix-layout-command.mjs';
import { DISPLAY_ROUTING_LAYOUT_CASES } from './display-routing-matrix-cases.mjs';
import { auditDisplayRoutingLayoutSemantics } from './display-routing-semantic-audit.mjs';
import { waitForStableDisplayRoutingLayoutVisual } from './display-routing-layout-visual-settle.mjs';

export const parseSavedDisplayRoutingMode = value => {
  if (value === undefined || value === '') return null;
  if (value === 'initial' || value === 'layout') return value;
  throw new Error('DISPLAY_ROUTING_MATRIX_SAVED_RELOAD must be initial or layout');
};

// Self-contained so the same bounded parser can execute inside the test browser.
export const readSavedDisplayRoutingState = (raw, nodes, edges, markedEdgeId = null) => {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const token = value => typeof value === 'string' && value.length > 0 && value.length <= 1024;
  const geometry = values => {
    if (!Array.isArray(values) || values.length === 0 || values.length > 5000) return null;
    const ids = new Set();
    const result = [];
    for (const node of values) {
      if (!record(node) || !token(node.id) || ids.has(node.id) || !record(node.position)) return null;
      ids.add(node.id);
      const width = node.measured?.width ?? node.width ?? node.style?.width;
      const height = node.measured?.height ?? node.height ?? node.style?.height;
      if (![node.position.x, node.position.y, width, height].every(value => (
        typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000
      )) || width <= 0 || height <= 0 || (node.parentId != null && !token(node.parentId))) return null;
      result.push([node.id, node.parentId ?? null, node.position.x, node.position.y, width, height]);
    }
    return result;
  };
  const topology = values => {
    if (!Array.isArray(values) || values.length === 0 || values.length > 300) return null;
    const ids = new Set();
    const result = [];
    for (const edge of values) {
      if (!record(edge) || ![edge.id, edge.source, edge.target].every(token) || ids.has(edge.id)) return null;
      ids.add(edge.id);
      result.push([edge.id, edge.source, edge.target]);
    }
    return result;
  };
  if (typeof raw !== 'string' || raw.length > 2 * 1024 * 1024) return null;
  let saved;
  try { saved = JSON.parse(raw); } catch { return null; }
  if (!record(saved) || saved.routingSnapshot?.candidate?.hardClean !== true) return null;
  const savedGeometry = geometry(saved.nodes);
  const currentGeometry = geometry(nodes);
  const savedTopology = topology(saved.edges);
  const currentTopology = topology(edges);
  if (!savedGeometry || !currentGeometry || !savedTopology || !currentTopology) return null;
  if (JSON.stringify(savedGeometry) !== JSON.stringify(currentGeometry)
    || JSON.stringify(savedTopology) !== JSON.stringify(currentTopology)) return null;
  const nodeIds = new Set(savedGeometry.map(node => node[0]));
  if (savedTopology.some(edge => !nodeIds.has(edge[1]) || !nodeIds.has(edge[2]))) return null;
  if (markedEdgeId !== null && (!token(markedEdgeId)
    || !saved.edges.some(edge => edge.id === markedEdgeId && edge.label === 'saved-check')
    || !edges.some(edge => edge.id === markedEdgeId && edge.label === 'saved-check'))) return null;
  return { geometry: JSON.stringify(savedGeometry), topology: JSON.stringify(savedTopology),
    nodeCount: savedGeometry.length, edgeCount: savedTopology.length };
};

/** Uses an isolated fixture browser, never canonical mount or direct storage writes. */
export const verifySavedDisplayRoutingRoundtrip = async ({
  session, presetId, savedLayoutCase = null, semanticChains,
  waitForValue, readFinalRouteExpression, auditFinalSvg, visualSettleTimeoutMs,
}) => {
  const savedRequestedLabel = await session.evaluate('window.__vizlyRequestedLayoutLabel ?? null');
  const markedEdgeId = savedLayoutCase ? await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const first = instance?.getEdges?.()[0];
    if (!first) return null;
    instance.setEdges(edges => edges.map(edge => edge.id === first.id ? { ...edge, label: 'saved-check' } : edge));
    return first.id;
  })()`) : null;
  if (savedLayoutCase && !markedEdgeId) throw new Error('Saved roundtrip has no editable edge');
  const stateExpression = `(${readSavedDisplayRoutingState.toString()})(
    localStorage.getItem(${JSON.stringify('flowchart-autosave-v2-' + presetId)}),
    window.reactFlowInstance?.getNodes?.(), window.reactFlowInstance?.getEdges?.(),
    ${JSON.stringify(markedEdgeId)})`;
  const before = await waitForValue(session, stateExpression, 'durable routing snapshot');
  await session.evaluate('window.__vizlySavedReloadSentinel = true');
  await session.send('Page.reload', {});
  await waitForValue(session, '!window.__vizlySavedReloadSentinel', 'new saved document');
  const restoredRoute = await waitForValue(session, readFinalRouteExpression(''), 'saved final route');
  const restoredAudit = await auditFinalSvg(session, restoredRoute, 'saved final route');
  const after = await session.evaluate(stateExpression);
  if (!after || before.geometry !== after.geometry || before.topology !== after.topology) {
    throw new Error('Saved graph geometry, topology, routing snapshot or edited label was not retained');
  }
  const restoredSemantics = savedLayoutCase
    ? await auditDisplayRoutingLayoutSemantics(session, savedLayoutCase, semanticChains)
    : { status: 'not-applicable' };
  const continuedSwitches = [];
  if (savedLayoutCase) {
    await session.evaluate('window.__vizlyRequestedLayoutLabel = ' + JSON.stringify(savedRequestedLabel));
    await assertRequestedLayoutSelected(session, savedLayoutCase.id);
    for (const id of ['domain-lanes-tb', 'domain-lanes-lr']) {
      const nextCase = DISPLAY_ROUTING_LAYOUT_CASES.find(candidate => candidate.id === id);
      await session.evaluate('window.__vizlyRoutingRequests = []; window.__vizlyRoutingResponses = []');
      const previousJob = await session.evaluate('window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0');
      await clickLayout(session, nextCase);
      const route = await waitForValue(session, readFinalRouteExpression('layout:', previousJob), 'post-reload layout');
      await waitForStableDisplayRoutingLayoutVisual({ session, expectedRequestId: route.routing.requestId,
        expectedNodeCount: route.request.nodes.length, expectedEdgeCount: route.response.edges.length,
        timeoutMs: visualSettleTimeoutMs });
      await auditFinalSvg(session, route, 'post-reload layout');
      await assertRequestedLayoutSelected(session, id);
      continuedSwitches.push(await auditDisplayRoutingLayoutSemantics(session, nextCase, semanticChains));
    }
  }
  return { status: 'passed', nodeCount: before.nodeCount, edgeCount: before.edgeCount,
    editedLabelRetained: markedEdgeId !== null, restoredAudit, restoredSemantics, continuedSwitches };
};
