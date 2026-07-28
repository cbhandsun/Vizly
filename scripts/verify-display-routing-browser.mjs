import { setTimeout as delay } from 'node:timers/promises';

import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import {
  readDisplayRoutingNodePanGesture,
  readVisibleDisplayRoutingNodeRect,
} from './lib/display-routing-browser-geometry.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const LOGISTICS_PRESET_ID = 'logistics-architecture-v1';
const WAIT_TIMEOUT_MS = 60_000;
const DRAG_CASES = Object.freeze([
  { nodeId: 'tms', expectedMutableCount: 6, expectedAffectedCount: 7 },
  { nodeId: 'wms', expectedMutableCount: 4 },
  { nodeId: 'l-oms', expectedMutableCount: 5 },
]);

const captureScript = `(() => {
  const NativeWorker = window.Worker;
  window.__vizlyRoutingRequests = [];
  window.__vizlyRoutingResponses = [];
  class CapturingWorker extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', event => {
        const response = event?.data;
        if (!response || typeof response.requestId !== 'string') return;
        try {
          window.__vizlyRoutingResponses.push(structuredClone(response));
          window.__vizlyRoutingResponses = window.__vizlyRoutingResponses.slice(-16);
        } catch {}
      });
    }
    postMessage(message, transfer) {
      if (message && typeof message.requestId === 'string') {
        try {
          window.__vizlyRoutingRequests.push(structuredClone(message));
          window.__vizlyRoutingRequests = window.__vizlyRoutingRequests.slice(-16);
        } catch {}
      }
      return typeof transfer === 'undefined'
        ? super.postMessage(message)
        : super.postMessage(message, transfer);
    }
  }
  window.Worker = CapturingWorker;
})()`;

const assertProductionPreview = async () => {
  if (!BASE_URL) {
    throw new Error(
      'PRECOMPILED_ROUTE_BASE_URL must point to a production `vite preview` server',
    );
  }
  const response = await fetch(`${BASE_URL}/`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Production preview returned HTTP ${response.status}`);
  const html = await response.text();
  if (
    html.includes('/@vite/client')
    || !/<script[^>]+src=["'][^"']*\/assets\/[^"']+\.js["']/i.test(html)
  ) {
    throw new Error('PRECOMPILED_ROUTE_BASE_URL is not a production Vite preview');
  }
};

const waitForValue = async (session, expression, timeoutMs = WAIT_TIMEOUT_MS) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await session.evaluate(expression);
    if (value) return value;
    await delay(100);
  }
  throw new Error(`Timed out waiting for browser state: ${expression.slice(0, 120)}`);
};

const initialReadyExpression = `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  return routing.stage === 'final-applied'
    && routing.workerAbortCount === 0
    && document.querySelectorAll('.react-flow__edge').length === 14
    && typeof routing.outputRouteSignature === 'string'
    ? {
      requestId: routing.requestId,
      routeMs: routing.routeMs,
      workerStartCount: routing.workerStartCount,
      workerAbortCount: routing.workerAbortCount,
      workerResolution: routing.workerResolution,
      phaseTrace: routing.phaseTrace,
    }
    : null;
})()`;

const dragNode = async (session, nodeId) => {
  const visibleRectExpression = `(() => {
    const readVisibleNodeRect = ${readVisibleDisplayRoutingNodeRect.toString()};
    return readVisibleNodeRect(${JSON.stringify(nodeId)});
  })()`;
  const panGestureExpression = `(() => {
    const readNodePanGesture = ${readDisplayRoutingNodePanGesture.toString()};
    return readNodePanGesture(${JSON.stringify(nodeId)});
  })()`;
  let rect = await session.evaluate(visibleRectExpression);
  for (let attempt = 0; !rect && attempt < 8; attempt += 1) {
    const gesture = await session.evaluate(panGestureExpression);
    if (!gesture) {
      await delay(100);
      rect = await session.evaluate(visibleRectExpression);
      continue;
    }
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: gesture.startX,
      y: gesture.startY,
      button: 'none',
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: gesture.startX,
      y: gesture.startY,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    for (let step = 1; step <= 4; step += 1) {
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: gesture.startX + ((gesture.endX - gesture.startX) * step) / 4,
        y: gesture.startY + ((gesture.endY - gesture.startY) * step) / 4,
        button: 'left',
        buttons: 1,
      });
      await delay(20);
    }
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: gesture.endX,
      y: gesture.endY,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
    await delay(150);
    rect = await session.evaluate(visibleRectExpression);
  }
  rect ??= await waitForValue(session, visibleRectExpression);
  const startX = rect.x + rect.width / 2;
  const startY = rect.y + rect.height / 2;
  const endX = startX + 24;
  const endY = startY + 8;
  const hitStack = await session.evaluate(`(() => (
    document.elementsFromPoint(${startX}, ${startY})
      .slice(0, 8)
      .map(element => ({
        tag: element.tagName,
        className: String(element.className || ''),
        dataId: element.getAttribute('data-id'),
      }))
  ))()`);
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: startX,
    y: startY,
    button: 'none',
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: startX,
    y: startY,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  for (let step = 1; step <= 4; step += 1) {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: startX + ((endX - startX) * step) / 4,
      y: startY + ((endY - startY) * step) / 4,
      button: 'left',
      buttons: 1,
    });
    await delay(20);
  }
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: endX,
    y: endY,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  return {
    startX,
    startY,
    endX,
    endY,
    releasedAt: Date.now(),
    hitStack,
  };
};

const finalIncrementalExpression = nodeId => `(() => {
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const request = [...requests].reverse().find(item => item?.operation === 'incremental-route');
  if (!request) return null;
  const response = [...responses].reverse().find(item => item?.requestId === request.requestId);
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  if (
    !response
    || routing.stage !== 'final-applied'
    || routing.requestId !== response.requestId
  ) return null;
  const node = document.querySelector(
    '.react-flow__node[data-id=${JSON.stringify(nodeId)}]',
  );
  return {
    requestId: request.requestId,
    requestOperation: request.operation,
    mutableEdgeCount: Array.isArray(request.mutableEdgeIds)
      ? request.mutableEdgeIds.length
      : null,
    contextEdgeCount: Array.isArray(request.contextEdgeIds)
      ? request.contextEdgeIds.length
      : null,
    response: {
      hardClean: response.hardClean,
      routeResolution: response.routeResolution,
      affectedEdgeCount: response.affectedEdgeCount,
      fallbackLevel: response.fallbackLevel,
      phaseTrace: response.phaseTrace,
      edgeCount: Array.isArray(response.edges) ? response.edges.length : null,
    },
    routing: {
      routeMs: routing.routeMs,
      workerStartCount: routing.workerStartCount,
      workerAbortCount: routing.workerAbortCount,
      workerResolution: routing.workerResolution,
      affectedEdgeCount: routing.affectedEdgeCount,
      fallbackLevel: routing.fallbackLevel,
      outputRouteSignature: routing.outputRouteSignature,
    },
    renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
    renderedPathCount: document.querySelectorAll(
      '.react-flow__edge .react-flow__edge-path',
    ).length,
    nodeTransform: node?.getAttribute('transform') || null,
  };
})()`;

const assertDragResult = (dragCase, result) => {
  const diagnostics = JSON.stringify({ dragCase, result }, null, 2);
  if (result.mutableEdgeCount !== dragCase.expectedMutableCount) {
    throw new Error(`Unexpected mutable closure:\n${diagnostics}`);
  }
  if (
    result.response.hardClean !== true
    || result.response.routeResolution !== 'incremental-route'
    || result.response.fallbackLevel !== 'none'
    || result.routing.fallbackLevel !== 'none'
    || result.routing.workerAbortCount !== 0
  ) {
    throw new Error(`Incremental route did not commit cleanly:\n${diagnostics}`);
  }
  if (
    dragCase.expectedAffectedCount !== undefined
    && result.response.affectedEdgeCount !== dragCase.expectedAffectedCount
  ) {
    throw new Error(`Unexpected affected edge count:\n${diagnostics}`);
  }
  if (
    result.response.edgeCount !== 14
    || result.renderedEdgeCount !== 14
    || result.renderedPathCount !== 14
    || !/^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(
      result.routing.outputRouteSignature || '',
    )
  ) {
    throw new Error(`Final render did not match the committed route:\n${diagnostics}`);
  }
  const expectedPhases = ['incremental-closure', 'local-route', 'hard-gate'];
  if (
    !Array.isArray(result.response.phaseTrace)
    || result.response.phaseTrace.map(trace => trace.phase).join('|')
      !== expectedPhases.join('|')
    || !result.response.phaseTrace.every(trace => trace.resolution === 'accepted')
  ) {
    throw new Error(`Incremental phase trace was incomplete:\n${diagnostics}`);
  }
};

const main = async () => {
  await assertProductionPreview();
  const results = await withPrecompiledRouteBrowser(async session => {
    await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source: captureScript,
    });
    const captured = [];
    for (const dragCase of DRAG_CASES) {
      const url = `${BASE_URL}/?precompiledCapture=${encodeURIComponent(LOGISTICS_PRESET_ID)}`
        + `&browserVerification=${encodeURIComponent(dragCase.nodeId)}-${Date.now()}`
        + `#/?diagram=${encodeURIComponent(LOGISTICS_PRESET_ID)}`;
      await session.send('Page.navigate', { url });
      const initial = await waitForValue(session, initialReadyExpression);
      await session.evaluate(`(() => {
        window.__vizlyRoutingRequests = [];
        window.__vizlyRoutingResponses = [];
        for (const minimap of document.querySelectorAll('.fixed-minimap-container')) {
          minimap.style.display = 'none';
        }
        return true;
      })()`);
      const drag = await dragNode(session, dragCase.nodeId);
      let incremental;
      try {
        incremental = await waitForValue(
          session,
          finalIncrementalExpression(dragCase.nodeId),
        );
      } catch (error) {
        const status = await session.evaluate(`(() => ({
          routing: window.__vizlyBaseReactFlowDisplayRouting || {},
          requests: (window.__vizlyRoutingRequests || []).map(item => ({
            requestId: item?.requestId,
            operation: item?.operation,
            mutableEdgeCount: item?.mutableEdgeIds?.length,
          })),
          responses: (window.__vizlyRoutingResponses || []).map(item => ({
            requestId: item?.requestId,
            routeResolution: item?.routeResolution,
            hardClean: item?.hardClean,
          })),
          nodeTransform: document.querySelector(
            '.react-flow__node[data-id=${JSON.stringify(dragCase.nodeId)}]',
          )?.getAttribute('transform') || null,
        }))()`);
        throw new Error(
          `${error instanceof Error ? error.message : 'Incremental wait failed'}\n`
          + JSON.stringify({ dragCase, drag, status }, null, 2),
        );
      }
      incremental.releaseToFinalMs = Date.now() - drag.releasedAt;
      assertDragResult(dragCase, incremental);
      captured.push({ nodeId: dragCase.nodeId, initial, incremental });
    }
    return captured;
  });
  for (const result of results) {
    const localRoute = result.incremental.response.phaseTrace
      .find(trace => trace.phase === 'local-route');
    console.log(
      `${result.nodeId}: initial=${result.initial.routeMs}ms, `
      + `releaseToFinal<=${result.incremental.releaseToFinalMs}ms, `
      + `local=${localRoute?.durationMs}ms, `
      + `mutable=${result.incremental.mutableEdgeCount}, `
      + `affected=${result.incremental.response.affectedEdgeCount}.`,
    );
  }
};

await main();
