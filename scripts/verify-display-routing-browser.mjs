import { setTimeout as delay } from 'node:timers/promises';

import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import {
  readDisplayRoutingNodePanGesture,
  readDisplayRoutingVisualScaleAudit,
  readRenderedDisplayEdgeNodeIntersections,
  readVisibleDisplayRoutingNodeRect,
} from './lib/display-routing-browser-geometry.mjs';
import { assertDisplayRoutingPerformanceBudget } from './lib/display-routing-browser-performance.mjs';
import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from './lib/display-routing-browser-capture.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const LOGISTICS_PRESET_ID = 'logistics-architecture-v1';
const WAIT_TIMEOUT_MS = 60_000;
const DRAG_CASES = Object.freeze([
  { nodeId: 'tms', expectedMutableCount: 6, expectedAffectedCount: 6 },
  { nodeId: 'wms', expectedMutableCount: 4 },
  { nodeId: 'l-oms', expectedMutableCount: 5 },
]);
const FIXED_VISUAL_ZOOMS = Object.freeze([0.5, 1, 2]);
const INCLUDE_INCREMENTAL_REQUEST_DIAGNOSTICS = process.env
  .DISPLAY_ROUTING_BROWSER_DEBUG_REQUEST === '1';
const EXPECTED_INCREMENTAL_PHASES = Object.freeze([
  'incremental-closure',
  'local-route',
  'hard-gate',
  'final-clearance',
  'final-hard-safety',
  'final-endpoint-seed',
  'final-endpoint-topology',
  'final-endpoint-order',
  'final-endpoint-closure',
  'final-safety-closure',
  'final-endpoint-seed',
  'final-endpoint-topology',
  'final-endpoint-order',
  'final-endpoint-closure',
]);

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
  const diagnostics = await session.evaluate(`(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    return {
      url: location.href,
      routing,
      requestCount: (window.__vizlyRoutingRequests || []).length,
      responseCount: (window.__vizlyRoutingResponses || []).length,
      requests: (window.__vizlyRoutingRequests || []).map(request => ({
        requestId: request?.requestId,
        operation: request?.operation,
        edgeCount: Array.isArray(request?.edges) ? request.edges.length : null,
      })),
      responses: (window.__vizlyRoutingResponses || []).map(response => ({
        requestId: response?.requestId,
        hardClean: response?.hardClean,
        routeResolution: response?.routeResolution,
        edgeCount: Array.isArray(response?.edges) ? response.edges.length : null,
        error: response?.error,
      })),
      renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
      renderedPathCount: document.querySelectorAll(
        '.react-flow__edge .react-flow__edge-path',
      ).length,
      visibleRouteSamples: window.__vizlyRenderedRouteSamples || [],
    };
  })()`);
  throw new Error(
    `Timed out waiting for browser state: ${expression.slice(0, 120)}\n`
    + JSON.stringify(diagnostics, null, 2),
  );
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
  const boundedResponses = window.__vizlyBoundedCandidates || [];
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
    debugRequest: ${INCLUDE_INCREMENTAL_REQUEST_DIAGNOSTICS ? `{
      changeSet: request.changeSet,
      mutableEdgeIds: request.mutableEdgeIds,
      contextEdgeIds: request.contextEdgeIds,
      nodes: request.nodes.map(node => ({
        id: node.id,
        type: node.type,
        parentId: node.parentId,
        position: node.position,
        positionAbsolute: node.positionAbsolute,
        width: node.width,
        height: node.height,
        measured: node.measured,
      })),
      baselineNodes: request.baselineNodes.map(node => ({
        id: node.id,
        type: node.type,
        parentId: node.parentId,
        position: node.position,
        positionAbsolute: node.positionAbsolute,
        width: node.width,
        height: node.height,
        measured: node.measured,
      })),
      edges: request.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        data: {
          autoSource: edge.data?.autoSource,
          autoTarget: edge.data?.autoTarget,
          auto: edge.data?.auto,
          computedPath: edge.data?.computedPath,
        },
      })),
      baselinePatches: request.baselinePatches,
    }` : 'null'},
    requestOperation: request.operation,
    workerRequestAt: request.__browserCapturedAt,
    workerResponseAt: response.__browserCapturedAt,
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
    boundedCandidates: boundedResponses
      .filter(item => item?.requestId === request.requestId && item?.boundedCandidate)
      .map(item => item.boundedCandidate)
      .slice(-4),
    routing: {
      routeMs: routing.routeMs,
      scheduledAt: routing.scheduledAt,
      workerStartedAt: routing.workerStartedAt,
      finalAppliedAt: routing.finalAppliedAt,
      geometryBarrierMs: routing.geometryBarrierMs,
      geometryBarrierSamples: routing.geometryBarrierSamples,
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
    renderedEdgesWithPathCount: [...document.querySelectorAll('.react-flow__edge')]
      .filter(edge => edge.querySelector('.react-flow__edge-path')).length,
    nodeTransform: node?.getAttribute('transform') || null,
  };
})()`;

const normalReadyExpression = `(() => {
  const responses = window.__vizlyRoutingResponses || [];
  const response = [...responses].reverse().find(item => (
    item?.hardClean === true
    && Array.isArray(item.edges)
    && item.edges.length === 14
  ));
  return response
    && document.querySelectorAll('.react-flow__edge').length === 14
    && document.querySelectorAll('.react-flow__edge .react-flow__edge-path').length >= 14
    ? {
      requestId: response.requestId,
      routeResolution: response.routeResolution,
      phaseTrace: response.phaseTrace,
      outputRouteSignature: window.__vizlyBaseReactFlowDisplayRouting?.outputRouteSignature,
    }
    : null;
})()`;

const renderedObstacleAuditExpression = requiredClearance => `(() => {
  const auditRenderedEdges = ${readRenderedDisplayEdgeNodeIntersections.toString()};
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const responses = window.__vizlyRoutingResponses || [];
  const response = [...responses].reverse().find(item => (
    routing.requestId ? item?.requestId === routing.requestId : Array.isArray(item?.edges)
  ));
  return auditRenderedEdges(response?.edges, ${JSON.stringify(requiredClearance)});
})()`;

const assertRenderedObstacleAudit = (stage, audit) => {
  if (
    audit?.edgeCount !== 14
    || audit.auditedPathCount !== 14
    || audit.invalidEdgeIds?.length !== 0
    || audit.intersections?.length !== 0
    || audit.clearanceRisks?.length !== 0
  ) {
    throw new Error(`Rendered SVG obstacle audit failed at ${stage}:\n${JSON.stringify(
      audit,
      null,
      2,
    )}`);
  }
};

const waitForRenderedObstacleAudit = async (
  session,
  stage,
  timeoutMs = 3_000,
  requiredClearance = 48,
) => {
  const deadline = Date.now() + timeoutMs;
  let audit;
  while (Date.now() < deadline) {
    audit = await session.evaluate(renderedObstacleAuditExpression(requiredClearance));
    if (
      audit?.edgeCount === 14
      && audit.auditedPathCount === 14
      && audit.invalidEdgeIds?.length === 0
      && audit.intersections?.length === 0
      && audit.clearanceRisks?.length === 0
    ) {
      if (requiredClearance >= 48) return audit;
      const commercialAudit = await session.evaluate(renderedObstacleAuditExpression(48));
      const commercialClearanceDiagnostics = commercialAudit?.clearanceRisks?.length > 0
        ? await session.evaluate(`(() => {
          const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
          const responses = window.__vizlyRoutingResponses || [];
          const requests = window.__vizlyRoutingRequests || [];
          const response = [...responses].reverse().find(item => (
            item?.requestId === routing.requestId
          ));
          const request = [...requests].reverse().find(item => (
            item?.requestId === routing.requestId
          ));
          const risks = ${JSON.stringify(commercialAudit?.clearanceRisks ?? [])};
          return risks.slice(0, 8).map(risk => {
            const edge = response?.edges?.find(item => item?.id === risk.edgeId);
            const node = request?.nodes?.find(item => item?.id === risk.nodeId);
            const element = document.querySelector(
              '.react-flow__node[data-id="' + risk.nodeId + '"]',
            );
            const rect = element?.getBoundingClientRect();
            return {
              ...risk,
              responsePath: edge?.data?.computedPath,
              requestNode: node,
              changedNode: request?.nodes?.find(item => item?.id === 'wms'),
              changedNodeIds: request?.changeSet?.changedNodeIds,
              domNodeRect: rect ? {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              } : null,
            };
          });
        })()`)
        : [];
      return {
        ...audit,
        commercialClearanceRisks: commercialAudit?.clearanceRisks ?? [],
        commercialClearanceDiagnostics,
      };
    }
    await delay(50);
  }
  const diagnosticEdgeId = audit?.clearanceRisks?.[0]?.edgeId || 'edge-loms-customs';
  const renderDiagnostics = await session.evaluate(`(() => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
    const response = [...(window.__vizlyRoutingResponses || [])].reverse()
      .find(item => item?.requestId === routing.requestId);
    const request = [...(window.__vizlyRoutingRequests || [])].reverse()
      .find(item => item?.requestId === routing.requestId);
    const edgeId = ${JSON.stringify(diagnosticEdgeId)};
    const edge = response?.edges?.find(item => item?.id === edgeId);
    const wrapper = document.querySelector('[data-testid="rf__edge-' + edgeId + '"]');
    const path = wrapper?.querySelector('.shared-trunk-edge-interaction')
      ?? wrapper?.querySelector('.react-flow__edge-path');
    return {
      responseType: edge?.type,
      sourceHandle: edge?.sourceHandle,
      targetHandle: edge?.targetHandle,
      responsePath: edge?.data?.computedPath,
      wcsRequestNode: request?.nodes?.find(item => item?.id === 'wcs'),
      wcsDomRect: (() => {
        const rect = document.querySelector('.react-flow__node[data-id="wcs"]')
          ?.getBoundingClientRect();
        return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null;
      })(),
      wrapperClass: wrapper?.getAttribute('class') || null,
      renderedPath: path?.getAttribute('d') || null,
    };
  })()`);
  audit = { ...audit, renderDiagnostics };
  assertRenderedObstacleAudit(stage, audit);
  return audit;
};

const readVisualScaleAudit = async session => session.evaluate(`(() => {
  const readVisualAudit = ${readDisplayRoutingVisualScaleAudit.toString()};
  return readVisualAudit();
})()`);

const setCenteredViewportZoom = async (session, targetZoom) => {
  const result = await session.evaluate(`(async () => {
    const targetZoom = ${JSON.stringify(targetZoom)};
    const instance = window.reactFlowInstance;
    const pane = document.querySelector('.react-flow__pane');
    if (!instance || typeof instance.getViewport !== 'function'
      || typeof instance.setViewport !== 'function' || !pane) return null;
    const current = instance.getViewport();
    const bounds = pane.getBoundingClientRect();
    if (![current?.x, current?.y, current?.zoom, bounds.width, bounds.height]
      .every(Number.isFinite) || current.zoom <= 0) return null;
    const centerWorldX = (bounds.width / 2 - current.x) / current.zoom;
    const centerWorldY = (bounds.height / 2 - current.y) / current.zoom;
    await instance.setViewport({
      x: bounds.width / 2 - centerWorldX * targetZoom,
      y: bounds.height / 2 - centerWorldY * targetZoom,
      zoom: targetZoom,
    });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return instance.getViewport();
  })()`);
  if (!result || Math.abs(result.zoom - targetZoom) > 0.01) {
    throw new Error(`Could not set fixed visual zoom ${targetZoom}: ${JSON.stringify(result)}`);
  }
};

const assertVisualScaleAudit = (name, audit, expectedSignature, expectedZoom = null) => {
  const expectsOverviewLod = audit?.zoom < 0.4;
  const invalid = !audit
    || (expectedZoom !== null && Math.abs(audit.zoom - expectedZoom) > 0.01)
    || audit.routeSignature !== expectedSignature
    || audit.pathCount < 14
    || audit.paintedPathCount < 14
    || audit.invalidNonScalingPathCount !== 0
    || audit.invalidStrokeWidthCount !== 0
    || audit.markerCount < 1
    || audit.labelCount !== 14
    || audit.labelNodeOverlapCount !== 0
    || (expectsOverviewLod
      ? (!audit.zoomedOut
        || audit.visiblePrimaryLabelCount < 1
        || audit.visibleDetailLabelCount !== 0)
      : (audit.zoomedOut || audit.visibleLabelCount !== audit.labelCount))
    || (audit.visibleLabelCount > 0 && (
      !Number.isFinite(audit.minimumVisibleLabelHeight)
      || audit.minimumVisibleLabelHeight < 6
      || !Number.isFinite(audit.maximumVisibleLabelHeight)
      || audit.maximumVisibleLabelHeight > 120
    ));
  if (invalid) {
    throw new Error(`Fixed visual scale audit failed at ${name}:\n${JSON.stringify(audit, null, 2)}`);
  }
};

const verifyFixedVisualScales = async (session, expectedSignature) => {
  const results = [];
  const fitAudit = await readVisualScaleAudit(session);
  assertVisualScaleAudit('fit-all', fitAudit, expectedSignature);
  results.push({ name: 'fit-all', ...fitAudit });
  for (const zoom of FIXED_VISUAL_ZOOMS) {
    await setCenteredViewportZoom(session, zoom);
    const audit = await readVisualScaleAudit(session);
    assertVisualScaleAudit(`${zoom * 100}%`, audit, expectedSignature, zoom);
    assertRenderedObstacleAudit(
      `${zoom * 100}% visual scale`,
      await waitForRenderedObstacleAudit(session, `${zoom * 100}% visual scale`),
    );
    results.push({ name: `${zoom * 100}%`, ...audit });
  }
  return results;
};

const assertDragResult = (dragCase, result) => {
  const diagnostics = JSON.stringify(INCLUDE_INCREMENTAL_REQUEST_DIAGNOSTICS
    ? { dragCase, debugRequest: result.debugRequest, boundedCandidates: result.boundedCandidates }
    : { dragCase, result }, null, 2);
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
    || result.renderedEdgesWithPathCount !== 14
    || !/^route-v2:\d{1,3}:\d{1,6}:[0-9a-f]{16}$/.test(
      result.routing.outputRouteSignature || '',
    )
  ) {
    throw new Error(`Final render did not match the committed route:\n${diagnostics}`);
  }
  if (
    !Array.isArray(result.response.phaseTrace)
    || result.response.phaseTrace.map(trace => trace.phase).join('|')
      !== EXPECTED_INCREMENTAL_PHASES.join('|')
    || !result.response.phaseTrace.slice(0, 3)
      .every(trace => trace.resolution === 'accepted')
  ) {
    throw new Error(`Incremental phase trace was incomplete:\n${diagnostics}`);
  }
};

const verifyNormalRenderedObstacleAudit = async () => withPrecompiledRouteBrowser(
  async session => {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1_600,
      height: 1_200,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await session.send('Page.addScriptToEvaluateOnNewDocument', {
      source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT,
    });
    const url = `${BASE_URL}/?canonicalPreset=${encodeURIComponent(LOGISTICS_PRESET_ID)}`
      + `&browserVerification=normal-${Date.now()}`
      + `#/?diagram=${encodeURIComponent(LOGISTICS_PRESET_ID)}`;
    await session.send('Page.navigate', { url });
    const route = await waitForValue(session, normalReadyExpression);
    const audit = await waitForRenderedObstacleAudit(session, 'normal preset route');
    await delay(7_000);
    const stability = await session.evaluate(`(() => {
      const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
      const samples = (window.__vizlyRenderedRouteSamples || [])
        .filter(sample => sample?.pathCount === 14);
      return {
        samples,
        distinctRouteCount: new Set(samples.map(sample => sample.fingerprint)).size,
        requestId: routing.requestId,
        outputRouteSignature: routing.outputRouteSignature,
        workerResolution: routing.workerResolution,
        workerStartCount: routing.workerStartCount,
      workerAbortCount: routing.workerAbortCount,
      responses: (window.__vizlyRoutingResponses || []).map(response => ({
        requestId: response?.requestId,
        hardClean: response?.hardClean,
        routeResolution: response?.routeResolution,
        phaseTrace: response?.phaseTrace,
      })),
      };
    })()`);
    if (
      stability.samples.length === 0
      || stability.distinctRouteCount !== 1
      || stability.workerResolution !== 'validated-candidate'
      || stability.workerStartCount !== 1
      || stability.workerAbortCount !== 0
    ) {
      throw new Error(`Normal preset route changed after first visible paint:\n${JSON.stringify(
        stability,
        null,
        2,
      )}`);
    }
    const visualScales = await verifyFixedVisualScales(
      session,
      route.outputRouteSignature,
    );
    return { route, audit, stability, visualScales };
  },
);

const main = async () => {
  await assertProductionPreview();
  const normal = await verifyNormalRenderedObstacleAudit();
  const results = [];
  for (const dragCase of DRAG_CASES) {
    const captured = await withPrecompiledRouteBrowser(async session => {
      await session.send('Emulation.setDeviceMetricsOverride', {
        width: 1_600,
        height: 1_200,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await session.send('Page.addScriptToEvaluateOnNewDocument', {
        source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT,
      });
      const url = `${BASE_URL}/?precompiledCapture=${encodeURIComponent(LOGISTICS_PRESET_ID)}`
        + `&browserVerification=${encodeURIComponent(dragCase.nodeId)}-${Date.now()}`
        + `#/?diagram=${encodeURIComponent(LOGISTICS_PRESET_ID)}`;
      await session.send('Page.navigate', { url });
      const initial = await waitForValue(session, initialReadyExpression);
      // finalAppliedAt records the state transaction, which can precede React's
      // SVG commit by one or two frames. Audit the rendered path only after the
      // browser has had the same settling window as the normal preset case.
      const initialRenderedObstacleAudit = await waitForRenderedObstacleAudit(
        session,
        'initial route',
      );
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
      const observedAt = Date.now();
      incremental.releaseToObservedMs = observedAt - drag.releasedAt;
      incremental.releaseToFinalMs = Number.isFinite(incremental.routing.finalAppliedAt)
        ? incremental.routing.finalAppliedAt - drag.releasedAt
        : incremental.releaseToObservedMs;
      incremental.scheduledToWorkerMs = Number.isFinite(incremental.routing.scheduledAt)
        && Number.isFinite(incremental.routing.workerStartedAt)
        ? incremental.routing.workerStartedAt - incremental.routing.scheduledAt
        : null;
      incremental.workerToFinalMs = Number.isFinite(incremental.workerRequestAt)
        && Number.isFinite(incremental.routing.finalAppliedAt)
        ? incremental.routing.finalAppliedAt - incremental.workerRequestAt
        : Number.isFinite(incremental.routing.workerStartedAt)
        && Number.isFinite(incremental.routing.finalAppliedAt)
        ? incremental.routing.finalAppliedAt - incremental.routing.workerStartedAt
        : null;
      incremental.finalToObservedMs = Number.isFinite(incremental.routing.finalAppliedAt)
        ? observedAt - incremental.routing.finalAppliedAt
        : null;
      assertDragResult(dragCase, incremental);
      const incrementalRenderedObstacleAudit = await waitForRenderedObstacleAudit(
        session,
        `${dragCase.nodeId} incremental route`,
        3_000,
        16,
      );
      assertDisplayRoutingPerformanceBudget(dragCase, initial, incremental);
      return {
        nodeId: dragCase.nodeId,
        initial,
        incremental,
        initialRenderedObstacleAudit,
        incrementalRenderedObstacleAudit,
      };
    });
    results.push(captured);
  }
  for (const result of results) {
    const localRoute = result.incremental.response.phaseTrace
      .find(trace => trace.phase === 'local-route');
    const commercialClearanceRisks = result.incrementalRenderedObstacleAudit
      .commercialClearanceRisks ?? [];
    const commercialClearanceSummary = commercialClearanceRisks.length === 0
      ? 'none'
      : commercialClearanceRisks.map(risk => (
        `${risk.edgeId}->${risk.nodeId}:${Number(risk.clearance).toFixed(1)}px`
      )).join(',');
    console.log(
      `${result.nodeId}: initial=${result.initial.routeMs}ms, `
      + `releaseToFinal=${result.incremental.releaseToFinalMs}ms, `
      + `scheduleToWorker=${result.incremental.scheduledToWorkerMs}ms, `
      + `workerToFinal=${result.incremental.workerToFinalMs}ms, `
      + `finalToObserved<=${result.incremental.finalToObservedMs}ms, `
      + `local=${localRoute?.durationMs}ms, `
      + `mutable=${result.incremental.mutableEdgeCount}, `
      + `affected=${result.incremental.response.affectedEdgeCount}, `
      + `commercialClearanceDegrades=${commercialClearanceRisks.length}`
      + ` (${commercialClearanceSummary}).`,
    );
    if (commercialClearanceRisks.length > 0) {
      console.log(JSON.stringify(
        result.incrementalRenderedObstacleAudit.commercialClearanceDiagnostics ?? [],
        null,
        2,
      ));
    }
  }
  console.log(
    `normal: resolution=${normal.route.routeResolution}, `
    + `renderedObstacleHits=${normal.audit.intersections.length}, `
    + `renderedClearanceRisks=${normal.audit.clearanceRisks.length}, `
    + `visibleRouteVariants=${normal.stability.distinctRouteCount}.`,
  );
  console.log(`visual-scales: ${normal.visualScales.map(audit => (
    `${audit.name}=${audit.zoom.toFixed(3)}x/${audit.visibleLabelCount}labels`
  )).join(', ')}.`);
};

await main();
