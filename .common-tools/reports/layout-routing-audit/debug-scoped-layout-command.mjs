import { readFile } from 'node:fs/promises';
import { clickLayout } from '../../../scripts/lib/display-routing-matrix-layout-command.mjs';
import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';
import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from '../../../scripts/lib/display-routing-matrix-presets.mjs';
import { parseCanonicalPresetIdentity } from '../../../scripts/lib/display-routing-canonical-preset.mjs';
import { createDisplayRoutingMatrixWaiter } from '../../../scripts/lib/display-routing-matrix-wait.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
if (!BASE_URL) throw new Error('PRECOMPILED_ROUTE_BASE_URL is required');
const presetId = 'wms-demand-allocation-strategy-v2';
const cleanLayoutCase = { id: 'domain-compound-elk-lr', strategy: 'domain-compound-elk', direction: 'LR' };
const waitForValue = createDisplayRoutingMatrixWaiter(30_000);

const initialReady = `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return routing.stage === 'final-applied' && routing.renderAuthorityStatus === 'accepted' ? routing : null;
})()`;

const result = await withPrecompiledRouteBrowser(async session => {
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT });
  const target = DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.find(candidate => candidate.presetId === presetId);
  if (!target) throw new Error(`Missing preset target: ${presetId}`);
  parseCanonicalPresetIdentity(JSON.parse(await readFile(target.sourcePath, 'utf8')), presetId);
  await session.send('Page.navigate', {
    url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}&routingMatrix=scoped-command-${Date.now()}#/?diagram=${encodeURIComponent(presetId)}`,
  });
  await waitForValue(session, initialReady, 'initial route');
  const before = await session.evaluate(`(() => {
    const nodes = window.reactFlowInstance?.getNodes?.() || [];
    return { nodeCount: nodes.length, edgeCount: window.reactFlowInstance?.getEdges?.().length || 0 };
  })()`);
  const firstJobId = await session.evaluate('window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0');
  await clickLayout(session, cleanLayoutCase);
  await waitForValue(session, `(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    return (routing.layoutTransactionJobId ?? 0) > ${JSON.stringify(firstJobId)}
      && routing.layoutTransactionStatus === 'committed'
      ? routing
      : null;
  })()`, 'clean full layout before scoped command');
  const previousJobId = await session.evaluate('window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0');
  const selected = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const nodes = instance?.getNodes?.() || [];
    const id = nodes.find(node => !node.parentId && !['titleGroup','subGroup','group','domain','subDomain','swimlane'].includes(node.type || ''))?.id
      ?? nodes.find(node => !['titleGroup','subGroup','group','domain','subDomain','swimlane'].includes(node.type || ''))?.id
      ?? null;
    if (!id) return null;
    instance.setNodes(current => current.map(node => ({ ...node, selected: node.id === id })));
    window.dispatchEvent(new CustomEvent('editor:command', { detail: {
      action: 'apply-layout',
      strategy: 'tree',
      direction: 'TB',
      scope: 'selection',
      selectedNodeIds: [id]
    }}));
    return id;
  })()`);
  if (!selected) throw new Error('No selectable node found');
  const committed = await waitForValue(session, `(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    if ((routing.layoutTransactionJobId ?? 0) <= ${JSON.stringify(previousJobId)}) return null;
    if (routing.layoutTransactionStatus !== 'committed') return null;
    const nodes = window.reactFlowInstance?.getNodes?.() || [];
    const edges = window.reactFlowInstance?.getEdges?.() || [];
    const selectedNode = nodes.find(node => node.id === ${JSON.stringify(selected)}) || null;
    return {
      routing,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      selectedNode: selectedNode ? {
        id: selectedNode.id,
        type: selectedNode.type,
        parentId: selectedNode.parentId,
        position: selectedNode.position,
        width: selectedNode.width,
        height: selectedNode.height,
        measured: selectedNode.measured,
      } : null,
      selectedStillPresent: nodes.some(node => node.id === ${JSON.stringify(selected)}),
    };
  })()`, 'scoped command layout commit');
  return { selected, before, committed };
});
console.log(JSON.stringify(result, null, 2));
