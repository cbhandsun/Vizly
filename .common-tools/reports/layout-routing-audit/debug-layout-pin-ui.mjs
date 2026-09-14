import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from '../../../scripts/lib/display-routing-browser-capture.mjs';
import { withPrecompiledRouteBrowser } from '../../../scripts/lib/precompiled-display-route-cdp.mjs';
import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from '../../../scripts/lib/display-routing-matrix-presets.mjs';
import { parseCanonicalPresetIdentity } from '../../../scripts/lib/display-routing-canonical-preset.mjs';
import { createDisplayRoutingMatrixWaiter } from '../../../scripts/lib/display-routing-matrix-wait.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
if (!BASE_URL) throw new Error('PRECOMPILED_ROUTE_BASE_URL is required');
const presetId = 'wms-demand-allocation-strategy-v2';
const waitForValue = createDisplayRoutingMatrixWaiter(30_000);

const initialReady = `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return routing.stage === 'final-applied' && routing.renderAuthorityStatus === 'accepted' ? routing : null;
})()`;

const dispatchMouseClick = async (session, point) => {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await session.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      ...(type === 'mouseMoved' ? {} : { button: 'left', clickCount: 1 }),
    });
  }
};

const result = await withPrecompiledRouteBrowser(async session => {
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT });
  const target = DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.find(candidate => candidate.presetId === presetId);
  if (!target) throw new Error(`Missing preset target: ${presetId}`);
  parseCanonicalPresetIdentity(JSON.parse(await readFile(target.sourcePath, 'utf8')), presetId);
  await session.send('Page.navigate', {
    url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}&routingMatrix=layout-pin-ui-${Date.now()}#/?diagram=${encodeURIComponent(presetId)}`,
  });
  await waitForValue(session, initialReady, 'initial route');

  const selected = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const nodes = instance?.getNodes?.() || [];
    const id = nodes.find(node => !['titleGroup','subGroup','group','domain','subDomain','swimlane'].includes(node.type || ''))?.id ?? null;
    if (!id) return null;
    window.dispatchEvent(new CustomEvent('editor:focus-entity', { detail: { nodeId: id, preserveZoom: true } }));
    return id;
  })()`);
  if (!selected) throw new Error('No selectable node found');

  const buttonPoint = await waitForValue(session, `(() => {
    const button = Array.from(document.querySelectorAll('button[aria-label]'))
      .find(candidate => /固定布局位置|Pin layout position/i.test(candidate.getAttribute('aria-label') || ''));
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      label: button.getAttribute('aria-label'),
      disabled: button.getAttribute('aria-disabled') === 'true',
    };
  })()`, 'layout pin toolbar button');
  if (buttonPoint.disabled) throw new Error(`Layout pin button was disabled: ${buttonPoint.label}`);
  const clicked = await session.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button[aria-label]'))
      .find(candidate => /固定布局位置|Pin layout position/i.test(candidate.getAttribute('aria-label') || ''));
    button?.click();
    return Boolean(button);
  })()`);
  if (!clicked) throw new Error('Layout pin button disappeared before click');

  const afterPin = await waitForValue(session, `(() => {
    const node = window.reactFlowInstance?.getNodes?.().find(candidate => candidate.id === ${JSON.stringify(selected)});
    if (!node?.data?.fixed) return null;
    return node ? {
      id: node.id,
      fixed: node.data?.fixed,
      locked: node.data?.locked,
      draggable: node.draggable ?? null,
    } : null;
  })()`, 'layout pin state');
  if (!afterPin?.fixed) throw new Error(`Node was not layout-pinned: ${JSON.stringify(afterPin)}`);
  if (afterPin.locked === true || afterPin.draggable === false) {
    throw new Error(`Layout pin unexpectedly mutation-locked the node: ${JSON.stringify(afterPin)}`);
  }

  return { selected, buttonLabel: buttonPoint.label, afterPin };
});

console.log(JSON.stringify(result, null, 2));
