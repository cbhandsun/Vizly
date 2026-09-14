import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { clickLayout } from '../../../scripts/lib/display-routing-matrix-layout-command.mjs';
import { findDisplayRoutingMenuElementByKey, resolveDisplayRoutingMenuPointerTarget } from '../../../scripts/lib/display-routing-matrix-cases.mjs';
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

const readPointForExpression = async (session, expression, label) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const point = await session.evaluate(expression);
    if (point?.x && point?.y) return point;
    await delay(120);
  }
  throw new Error(`${label} was not clickable`);
};

const layoutTriggerPointExpression = `(() => {
  const button = Array.from(document.querySelectorAll('button'))
    .find(candidate => candidate.hasAttribute('data-flowchart-layout-selection'));
  if (!button) return null;
  const rect = button.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
})()`;

const scopedMenuPointExpression = `(() => {
  const findByKey = ${findDisplayRoutingMenuElementByKey.toString()};
  const pointerTarget = ${resolveDisplayRoutingMenuPointerTarget.toString()};
  const item = findByKey(
    document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'),
    'scoped-selection-layout',
  );
  if (!item || item.getBoundingClientRect().width === 0) return null;
  item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const disabled = item.getAttribute('aria-disabled') === 'true'
    || item.classList.contains('ant-dropdown-menu-item-disabled')
    || item.classList.contains('ant-menu-item-disabled');
  const labels = Array.from(document.querySelectorAll('.flowchart-layout-menu [data-menu-id]'))
    .map(candidate => ({ key: candidate.getAttribute('data-menu-id'), text: candidate.textContent?.trim() || '', disabled: candidate.getAttribute('aria-disabled') === 'true' }))
    .filter(candidate => candidate.text.includes('布局'));
  if (disabled) return { disabled, labels };
  const point = pointerTarget(item.getBoundingClientRect(), { width: innerWidth, height: innerHeight });
  if (!point || !item.contains(document.elementFromPoint(point.x, point.y))) return { inaccessible: true, labels };
  return { ...point, disabled, labels, text: item.textContent?.trim() || '' };
})()`;

const result = await withPrecompiledRouteBrowser(async session => {
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT });
  const target = DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.find(candidate => candidate.presetId === presetId);
  if (!target) throw new Error(`Missing preset target: ${presetId}`);
  parseCanonicalPresetIdentity(JSON.parse(await readFile(target.sourcePath, 'utf8')), presetId);
  await session.send('Page.navigate', {
    url: `${BASE_URL}/?canonicalPreset=${encodeURIComponent(presetId)}&routingMatrix=scoped-ui-${Date.now()}#/?diagram=${encodeURIComponent(presetId)}`,
  });
  await waitForValue(session, initialReady, 'initial route');

  const before = await session.evaluate(`(() => ({
    nodeCount: window.reactFlowInstance?.getNodes?.().length || 0,
    edgeCount: window.reactFlowInstance?.getEdges?.().length || 0,
  }))()`);
  const firstJobId = await session.evaluate('window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0');
  await clickLayout(session, cleanLayoutCase);
  await waitForValue(session, `(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    return (routing.layoutTransactionJobId ?? 0) > ${JSON.stringify(firstJobId)}
      && routing.layoutTransactionStatus === 'committed'
      ? routing
      : null;
  })()`, 'clean full layout before scoped UI command');

  const selected = await session.evaluate(`(() => {
    const instance = window.reactFlowInstance;
    const nodes = instance?.getNodes?.() || [];
    const id = nodes.find(node => !node.parentId && !['titleGroup','subGroup','group','domain','subDomain','swimlane'].includes(node.type || ''))?.id
      ?? nodes.find(node => !['titleGroup','subGroup','group','domain','subDomain','swimlane'].includes(node.type || ''))?.id
      ?? null;
    if (!id) return null;
    const node = nodes.find(candidate => candidate.id === id);
    instance.setNodes(current => current.map(candidate => ({ ...candidate, selected: candidate.id === id })));
    window.dispatchEvent(new CustomEvent('editor:focus-entity', { detail: { id, type: 'node' } }));
    return { id, type: node?.type || '', parentId: node?.parentId || '' };
  })()`);
  if (!selected?.id) throw new Error('No selectable node found');
  await delay(300);

  const triggerPoint = await readPointForExpression(session, layoutTriggerPointExpression, 'Layout trigger');
  await dispatchMouseClick(session, triggerPoint);
  await delay(350);
  const scopedMenuPoint = await session.evaluate(scopedMenuPointExpression);
  if (!scopedMenuPoint) throw new Error('Scoped layout menu item was not found');
  if (scopedMenuPoint.disabled) {
    throw new Error(`Scoped layout menu item stayed disabled: ${JSON.stringify(scopedMenuPoint.labels)}`);
  }
  if (scopedMenuPoint.inaccessible) {
    throw new Error(`Scoped layout menu item was inaccessible: ${JSON.stringify(scopedMenuPoint.labels)}`);
  }

  const previousJobId = await session.evaluate('window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0');
  await dispatchMouseClick(session, scopedMenuPoint);
  const committed = await waitForValue(session, `(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    if ((routing.layoutTransactionJobId ?? 0) <= ${JSON.stringify(previousJobId)}) return null;
    if (routing.layoutTransactionStatus !== 'committed') return null;
    const nodes = window.reactFlowInstance?.getNodes?.() || [];
    const edges = window.reactFlowInstance?.getEdges?.() || [];
    return {
      layoutTransactionStatus: routing.layoutTransactionStatus,
      layoutTransactionJobId: routing.layoutTransactionJobId,
      positionMismatchCount: routing.nodeGeometryParity?.positionMismatchCount ?? null,
      maxPositionDelta: routing.nodeGeometryParity?.maxPositionDelta ?? null,
      hardClean: routing.layoutGeometryReport?.clean ?? null,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      preservedEdgeCount: edges.length === ${JSON.stringify(before.edgeCount)},
      selectedStillPresent: nodes.some(node => node.id === ${JSON.stringify(selected.id)}),
    };
  })()`, 'scoped UI layout commit');
  if (before.edgeCount > 0 && committed.edgeCount !== before.edgeCount) {
    throw new Error(`Scoped layout changed edge count from ${before.edgeCount} to ${committed.edgeCount}`);
  }

  return {
    selected,
    before,
    menuItem: {
      text: scopedMenuPoint.text,
      labelCount: scopedMenuPoint.labels?.length ?? 0,
    },
    committed,
  };
});

console.log(JSON.stringify(result, null, 2));
