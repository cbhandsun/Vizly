import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { clickLayout } from '../../../scripts/lib/display-routing-matrix-layout-command.mjs';
import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';
import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from '../../../scripts/lib/display-routing-matrix-presets.mjs';
import { parseCanonicalPresetIdentity } from '../../../scripts/lib/display-routing-canonical-preset.mjs';
import { createDisplayRoutingMatrixWaiter } from '../../../scripts/lib/display-routing-matrix-wait.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
if (!BASE_URL) throw new Error('PRECOMPILED_ROUTE_BASE_URL is required');
const presetId = 'wms-demand-allocation-strategy-v2';
const layoutCase = { id: 'domain-compound-elk-lr', strategy: 'domain-compound-elk', direction: 'LR' };
const waitForValue = createDisplayRoutingMatrixWaiter(30_000);
const initialReady = `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return routing.stage === 'final-applied' && routing.renderAuthorityStatus === 'accepted' ? routing : null;
})()`;

const result = await withPrecompiledRouteBrowser(async session => {
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT });
  const target = DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.find(candidate => candidate.presetId === presetId);
  parseCanonicalPresetIdentity(JSON.parse(await readFile(target.sourcePath, 'utf8')), presetId);
  await session.send('Page.navigate', { url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}&routingMatrix=debug-fixed-${Date.now()}#/?diagram=${encodeURIComponent(presetId)}` });
  await waitForValue(session, initialReady, 'initial route');
  const before = await session.evaluate(`(() => {
    const nodes = window.reactFlowInstance?.getNodes?.() || [];
    return nodes.map(n => ({ id:n.id, type:n.type, parentId:n.parentId, position:n.position, width:n.width, height:n.height, measured:n.measured, draggable:n.draggable, locked:n.data?.locked, fixed:n.data?.fixed, collapsed:n.data?.collapsed })).filter(n => n.locked===true || n.fixed===true || n.draggable===false || ['titleGroup','subGroup','domain','group','swimlane'].includes(n.type));
  })()`);
  await session.evaluate('window.__vizlyRoutingResponses = []; window.__vizlyRoutingRequests = [];');
  await clickLayout(session, layoutCase);
  await delay(2000);
  const after = await session.evaluate(`(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    const nodes = window.reactFlowInstance?.getNodes?.() || [];
    const fixedish = nodes.map(n => ({ id:n.id, type:n.type, parentId:n.parentId, position:n.position, width:n.width, height:n.height, measured:n.measured, draggable:n.draggable, locked:n.data?.locked, fixed:n.data?.fixed, collapsed:n.data?.collapsed })).filter(n => n.locked===true || n.fixed===true || n.draggable===false || ['titleGroup','subGroup','domain','group','swimlane'].includes(n.type));
    return { routing, requestCount:(window.__vizlyRoutingRequests||[]).length, responseCount:(window.__vizlyRoutingResponses||[]).length, requests:window.__vizlyRoutingRequests||[], responses:window.__vizlyRoutingResponses||[], fixedish };
  })()`);
  return { before, after };
});
console.log(JSON.stringify(result, null, 2));
