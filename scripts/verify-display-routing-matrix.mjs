import { setTimeout as delay } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import { clickLayout, assertRequestedLayoutSelected } from './lib/display-routing-matrix-layout-command.mjs';

import { DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT } from './lib/display-routing-browser-capture.mjs';
import {
  isDisplayRoutingClosurePhase,
  summarizeSlowestDisplayRoutingPhases,
} from './lib/display-routing-browser-performance.mjs';
import {
  displayRoutingFinalSvgGeometryIsClean,
  readDisplayRoutingNodeGeometryParity,
  readDisplayRoutingVisualScaleAudit,
  readRenderedDisplayEdgeNodeIntersections,
} from './lib/display-routing-browser-geometry.mjs';
import { readRenderedDisplayEdgeHardGeometryAudit } from './lib/display-routing-browser-hard-geometry.mjs';
import { withPrecompiledRouteBrowser } from './lib/precompiled-display-route-cdp.mjs';
import { PRECOMPILED_DISPLAY_ROUTE_TARGETS } from './lib/precompiled-display-route-targets.mjs';
import {
  parseCanonicalPresetIdentity,
  verifyCanonicalPresetMount,
} from './lib/display-routing-canonical-preset.mjs';
import {
  createDisplayRoutingMatrixCaseIds,
  DISPLAY_ROUTING_LAYOUT_CASES,
  DISPLAY_ROUTING_TOPOLOGY_CASE_ID,
  parseDisplayRoutingMatrixCase,
  parseDisplayRoutingMatrixCaseList,
  parseDisplayRoutingMatrixPreset,
  parseDisplayRoutingMatrixTimeoutMs,
  parseDisplayRoutingMatrixViewport,
  resolveDisplayRoutingConnectedDragDelta,
} from './lib/display-routing-matrix-cases.mjs';
import {
  displayRoutingWaitStateHasTerminalFailure,
  summarizeDisplayRoutingWaitState,
} from './lib/display-routing-matrix-wait-state.mjs';
import { assertDisplayRoutingVisualScaleAudit } from './lib/display-routing-browser-visual-audit.mjs';
import {
  displayRoutingCommittedEdgesMatchWorkerPatches,
  verifyDisplayRoutingTopologyMatrix,
} from './lib/display-routing-browser-topology-matrix.mjs';
import {
  assertDisplayRoutingCommittedReuse,
  readDisplayRoutingCommittedReuseSnapshot,
} from './lib/display-routing-browser-diagnostics.mjs';
import {
  findDisplayRoutingRequestForResponse,
  resolveDisplayRoutingFinalRouteSnapshot,
} from './lib/display-routing-matrix-final-route.mjs';
import {
  resolveDisplayRoutingLayoutVisualTimeoutMs,
  waitForStableDisplayRoutingLayoutVisual,
} from './lib/display-routing-layout-visual-settle.mjs';
import {
  assertDisplayRoutingLayoutFitTimeline,
  assertDisplayRoutingLayoutProgressTimeline,
  summarizeDisplayRoutingLayoutVisualTimeline,
} from './lib/display-routing-layout-visual-timeline.mjs';
import { assertDisplayRoutingProductionPreview } from './lib/display-routing-production-preview.mjs';
import { DISPLAY_ROUTING_MATRIX_PRESET_TARGETS } from './lib/display-routing-matrix-presets.mjs';
import { readDisplayRoutingLayoutDiagnostics } from './lib/display-routing-layout-diagnostics.mjs';
import { auditDisplayRoutingLayoutSemantics } from './lib/display-routing-semantic-audit.mjs';
import { parseSavedDisplayRoutingMode, verifySavedDisplayRoutingRoundtrip } from './lib/display-routing-saved-roundtrip.mjs';

const BASE_URL = String(process.env.PRECOMPILED_ROUTE_BASE_URL || '').trim().replace(/\/$/, '');
const WAIT_TIMEOUT_MS = parseDisplayRoutingMatrixTimeoutMs(
  process.env.DISPLAY_ROUTING_MATRIX_WAIT_TIMEOUT_MS,
);
const MAX_LAYOUT_ROUTE_MS = 30_000;
const SAVED_RELOAD_MODE = parseSavedDisplayRoutingMode(process.env.DISPLAY_ROUTING_MATRIX_SAVED_RELOAD);
const MATRIX_VIEWPORT = parseDisplayRoutingMatrixViewport(process.env.DISPLAY_ROUTING_MATRIX_VIEWPORT);
const VISUAL_SETTLE_TIMEOUT_MS = resolveDisplayRoutingLayoutVisualTimeoutMs(WAIT_TIMEOUT_MS);
const MATRIX_CASE_IDS = createDisplayRoutingMatrixCaseIds(
  PRECOMPILED_DISPLAY_ROUTE_TARGETS.map(target => target.presetId),
);
const REQUESTED_CASE = parseDisplayRoutingMatrixCase(
  process.env.DISPLAY_ROUTING_MATRIX_CASE,
  MATRIX_CASE_IDS,
);
const LAYOUT_PRESET_ID = parseDisplayRoutingMatrixPreset(
  process.env.DISPLAY_ROUTING_MATRIX_PRESET,
  new Set(DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.map(target => target.presetId)),
  'wms-demand-allocation-strategy-v2',
);
if (SAVED_RELOAD_MODE && !DISPLAY_ROUTING_LAYOUT_CASES.some(item => item.id === REQUESTED_CASE)) {
  throw new Error('Saved recovery requires one explicit DISPLAY_ROUTING_MATRIX_CASE layout');
}
const WARM_LAYOUT_CASE_IDS = parseDisplayRoutingMatrixCaseList(
  process.env.DISPLAY_ROUTING_MATRIX_WARM_CASES
    ?? process.env.DISPLAY_ROUTING_MATRIX_WARM_CASE,
  new Set(DISPLAY_ROUTING_LAYOUT_CASES.map(candidate => candidate.id)),
  DISPLAY_ROUTING_LAYOUT_CASES.length - 1,
);
const WARM_LAYOUT_CASES = WARM_LAYOUT_CASE_IDS.map(id => (
  DISPLAY_ROUTING_LAYOUT_CASES.find(candidate => candidate.id === id)
)).filter(Boolean);

const waitForValue = async (session, expression, label) => {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await session.evaluate(expression);
    if (value) return value;
    const state = await session.evaluate(`(() => {
      const summarize = ${summarizeDisplayRoutingWaitState.toString()};
      return summarize(
        window.__vizlyBaseReactFlowDisplayRouting || {},
        window.__vizlyRoutingResponses || [],
        document.querySelectorAll('.react-flow__edge').length,
        window.__vizlyRoutingRequests || [],
      );
    })()`);
    if (displayRoutingWaitStateHasTerminalFailure(state)) {
      throw new Error(`Routing failed while waiting for ${label}:\n${JSON.stringify(state, null, 2)}`);
    }
    await delay(100);
  }
  const state = await session.evaluate(`(() => {
    const summarize = ${summarizeDisplayRoutingWaitState.toString()};
    return summarize(
      window.__vizlyBaseReactFlowDisplayRouting || {},
      window.__vizlyRoutingResponses || [],
      document.querySelectorAll('.react-flow__edge').length,
      window.__vizlyRoutingRequests || [],
    );
  })()`);
  throw new Error(`Timed out waiting for ${label}:\n${JSON.stringify(state, null, 2)}`);
};

const prepareSession = async session => {
  await session.send('Emulation.setDeviceMetricsOverride', {
    ...MATRIX_VIEWPORT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.send('Page.addScriptToEvaluateOnNewDocument', {
    source: DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT,
  });
};

const readFinalRouteExpression = (
  expectedRequestPrefix,
  minimumExclusiveLayoutJobId,
) => `(() => {
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  if (routing.stage !== 'final-applied') return null;
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const renderedEdgeCount = document.querySelectorAll('.react-flow__edge').length;
  const findDisplayRoutingRequestForResponse = ${findDisplayRoutingRequestForResponse.toString()};
  const resolveFinalRoute = ${resolveDisplayRoutingFinalRouteSnapshot.toString()};
  return resolveFinalRoute({
    routing,
    requests,
    responses,
    currentNodes: window.reactFlowInstance?.getNodes?.() || [],
    currentEdges: window.reactFlowInstance?.getEdges?.() || [],
    renderedEdgeCount,
    expectedRequestPrefix: ${JSON.stringify(expectedRequestPrefix)},
    minimumExclusiveLayoutJobId: ${JSON.stringify(minimumExclusiveLayoutJobId)},
  });
})()`;

const readLatestCompletedRouteExpression = `(() => {
  const committedEdgesMatchWorkerPatches = ${displayRoutingCommittedEdgesMatchWorkerPatches.toString()};
  const findRequestForResponse = ${findDisplayRoutingRequestForResponse.toString()};
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const requests = window.__vizlyRoutingRequests || [];
  const responses = window.__vizlyRoutingResponses || [];
  const response = [...responses].reverse().find(item => item?.hardClean === true);
  const request = findRequestForResponse(requests, response)
    ?? requests.at(-1);
  const currentEdges = window.reactFlowInstance?.getEdges?.() || [];
  const responsePatches = response?.routingPatches ?? response?.edges;
  return routing.stage === 'final-applied'
    && routing.renderAuthorityStatus === 'accepted'
    && routing.requestId === response?.requestId
    && request?.requestId === response?.requestId
    && currentEdges.length > 0
    && committedEdgesMatchWorkerPatches(currentEdges, responsePatches)
    ? {
      routing,
      request,
      response: { ...response, edges: Array.isArray(response.edges) ? response.edges : currentEdges },
      renderedEdgeCount: document.querySelectorAll('.react-flow__edge').length,
    }
    : null;
})()`;

const waitForNodeGeometryParity = async (session, rawNodes, label) => {
  const expression = `(${readDisplayRoutingNodeGeometryParity.toString()})(${JSON.stringify(rawNodes)})`;
  const deadline = Date.now() + 5_000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await session.evaluate(expression);
    if (
      latest
      && latest.comparedNodeCount > 0
      && latest.positionMismatchCount === 0
      && latest.sizeMismatchCount === 0
    ) return latest;
    await delay(100);
  }
  throw new Error(`Worker/DOM node geometry parity failed for ${label}: ${JSON.stringify(latest)}`);
};

const auditFinalSvg = async (session, route, label) => {
  const nodeGeometryParity = await waitForNodeGeometryParity(
    session,
    route.request?.nodes,
    label,
  );
  const audit = await session.evaluate(
    `(${readRenderedDisplayEdgeNodeIntersections.toString()})(${JSON.stringify(route.response.edges)}, 16)`,
  );
  const commercialAudit = await session.evaluate(
    `(${readRenderedDisplayEdgeNodeIntersections.toString()})(${JSON.stringify(route.response.edges)}, 48)`,
  );
  const hardAudit = await session.evaluate(
    `(${readRenderedDisplayEdgeHardGeometryAudit.toString()})(${JSON.stringify(route.response.edges)}, ${JSON.stringify(route.request?.nodes)})`,
  );
  const visualAudit = await session.evaluate(
    `(${readDisplayRoutingVisualScaleAudit.toString()})()`,
  );
  if (!displayRoutingFinalSvgGeometryIsClean({
    audit,
    commercialAudit,
    hardAudit,
    expectedPathCount: route.response.edges.length,
  })) {
    const renderAuthorityStatus = await session.evaluate(
      'window.__vizlyBaseReactFlowDisplayRouting?.renderAuthorityStatus ?? null',
    );
    throw new Error(`Final SVG geometry failed for ${label}: ${JSON.stringify({
      expectedPathCount: route.response.edges.length,
      auditedPathCount: audit?.auditedPathCount,
      invalidPathCount: audit?.invalidEdgeIds?.length,
      obstacleHitCount: audit?.intersections?.length,
      minimumClearanceRiskCount: audit?.clearanceRisks?.length,
      commercialClearanceRiskCount: commercialAudit?.clearanceRisks?.length,
      nonOrthogonalPathCount: hardAudit?.nonOrthogonalEdgeIds?.length,
      detachedTerminalPathCount: hardAudit?.detachedTerminalEdgeIds?.length,
      detachedTerminalPathIndexes: hardAudit?.detachedTerminalEdgeIds?.map(edgeId => (
        route.response.edges.findIndex(edge => edge?.id === edgeId)
      )),
      detachedTerminalFindings: hardAudit?.detachedTerminalFindings,
      computedRenderPathCount: visualAudit?.computedRenderPathCount,
      fallbackRenderPathCount: visualAudit?.fallbackRenderPathCount,
      missingRenderPathSourceCount: visualAudit?.missingRenderPathSourceCount,
      acceptedRenderAuthorityCount: visualAudit?.acceptedRenderAuthorityCount,
      rejectedRenderAuthorityCount: visualAudit?.rejectedRenderAuthorityCount,
      acceptedRenderAttachmentCount: visualAudit?.acceptedRenderAttachmentCount,
      rejectedRenderAttachmentCount: visualAudit?.rejectedRenderAttachmentCount,
      renderAuthorityStatus,
      shortEndpointStubPathCount: hardAudit?.shortEndpointStubEdgeIds?.length,
      tinyInteriorDoglegPathCount: hardAudit?.tinyInteriorDoglegEdgeIds?.length,
      excessiveBendPathCount: hardAudit?.excessiveBendEdgeIds?.length,
      hairpinPathCount: hardAudit?.hairpinEdgeIds?.length,
      strictCrossingCount: hardAudit?.strictCrossings?.length,
      illegalOverlapCount: hardAudit?.illegalOverlaps?.length,
    })}`);
  }
  assertDisplayRoutingVisualScaleAudit({
    name: label,
    audit: visualAudit,
    expectedSignature: route.routing.outputRouteSignature,
    expectedEdgeCount: route.response.edges.length,
    expectedLabelCount: null,
    requireOverviewPrimaryLabel: false,
  });
  return {
    obstacleHits: audit.intersections.length,
    minimumClearanceRisks: audit.clearanceRisks.length,
    commercialClearanceRisks: commercialAudit.clearanceRisks.length,
    hardGeometryAudit: hardAudit,
    nodeGeometryParity,
    visualAudit,
  };
};

const verifyPreset = target => withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  const identity = parseCanonicalPresetIdentity(
    JSON.parse(await readFile(target.sourcePath, 'utf8')),
    target.presetId,
  );
  const url = `${BASE_URL}/?canonicalPreset=${encodeURIComponent(target.presetId)}`
    + `&routingMatrix=${Date.now()}`
    + `#/?diagram=${encodeURIComponent(target.presetId)}`;
  await session.send('Page.navigate', { url });
  const route = await waitForValue(session, readFinalRouteExpression(''), target.presetId);
  const usedValidatedExternalCandidate = route.routing.cacheTrustLevel === 'external-candidate'
    && ['validated-candidate', 'repaired-candidate'].includes(route.response.routeResolution)
    && route.response.phaseTrace?.some(trace => (
      trace?.phase === 'candidate-validation' && trace?.resolution === 'hit'
    ));
  if (!usedValidatedExternalCandidate) {
    const candidateFailures = await session.evaluate(`(() => (
      (window.__vizlyRoutingResponses || []).flatMap(item => {
        const report = item?.boundedCandidate;
        if (!report || typeof report !== 'object') return [];
        return [{
          candidate: report.candidate,
          hardClean: report.hardClean,
          obstacleHits: report.obstacleHits,
          terminalsAttached: report.terminalsAttached,
          terminalsAnchored: report.terminalsAnchored,
          quality: report.quality,
          minimumClearanceViolations: report.minimumClearanceViolations,
          commercialClearanceViolations: report.commercialClearanceViolations,
        }];
      })
    ))()`);
    throw new Error(`${target.presetId} did not use its validated precompiled route:\n${JSON.stringify({
      responseResolution: route.response.routeResolution,
      candidateFailures,
      routing: route.routing,
      requestInputSignature: route.request?.inputSignature,
      requestInputGeometryDigest: route.request?.inputGeometryDigest,
    }, null, 2)}`);
  }
  const mounted = await session.evaluate(`(() => ({
    nodes: window.reactFlowInstance?.getNodes?.().map(node => ({ id: node.id })) || [],
    edges: window.reactFlowInstance?.getEdges?.().map(edge => ({ id: edge.id })) || [],
  }))()`);
  const canonicalMount = verifyCanonicalPresetMount({
    identity,
    requestNodes: route.request?.nodes,
    requestEdges: route.request?.edges,
    mountedNodes: mounted.nodes,
    mountedEdges: mounted.edges,
  });
  let committedReuse = null;
  if (target.presetId === 'wms-process-flow-v1') {
    const readSnapshotExpression = `(${readDisplayRoutingCommittedReuseSnapshot.toString()})()`;
    const before = await session.evaluate(readSnapshotExpression);
    await session.evaluate(`(() => {
      window.location.hash = '#/manage';
      return true;
    })()`);
    await waitForValue(session, `(() => (
      document.querySelectorAll('.react-flow__edge').length === 0
      ? { unmounted: true }
      : null
    ))()`, `${target.presetId} canvas unmount`);
    await session.evaluate(`(() => {
      window.__vizlyRoutingRequests = [];
      window.__vizlyRoutingResponses = [];
      window.location.hash = ${JSON.stringify(`#/?diagram=${target.presetId}`)};
      return true;
    })()`);
    const after = await waitForValue(session, `(() => {
      const readSnapshot = ${readDisplayRoutingCommittedReuseSnapshot.toString()};
      const snapshot = readSnapshot();
      return snapshot.stage === 'final-applied'
        && snapshot.renderedEdgeCount === ${route.response.edges.length}
        ? snapshot
        : null;
    })()`, `${target.presetId} committed snapshot reuse`);
    assertDisplayRoutingCommittedReuse({
      before,
      after,
      expectedEdgeCount: route.response.edges.length,
    });
    committedReuse = {
      cacheTrustLevel: after.cacheTrustLevel,
      workerStartCount: after.workerStartCount,
      workerAbortCount: after.workerAbortCount,
      outputRouteSignature: after.outputRouteSignature,
      renderedPathDigest: after.renderedPathDigest,
    };
  }
  return {
    id: target.presetId,
    resolution: route.response.routeResolution,
    routeMs: Number.isFinite(route.request?.__browserCapturedAt)
      && Number.isFinite(route.response.__browserCapturedAt)
      ? route.response.__browserCapturedAt - route.request.__browserCapturedAt
      : route.routing.routeMs,
    totalRouteMs: route.routing.totalRouteMs,
    slowestPhases: summarizeSlowestDisplayRoutingPhases(route.response.phaseTrace),
    canonicalMount,
    committedReuse,
    ...(await auditFinalSvg(session, route, target.presetId)),
  };
});


const verifyLayout = layoutCase => withPrecompiledRouteBrowser(async session => {
  await prepareSession(session);
  const presetId = LAYOUT_PRESET_ID;
  const target = DISPLAY_ROUTING_MATRIX_PRESET_TARGETS.find(candidate => candidate.presetId === presetId);
  if (!target) throw new Error(`Canonical layout preset target is missing: ${presetId}`);
  const identity = parseCanonicalPresetIdentity(
    JSON.parse(await readFile(target.sourcePath, 'utf8')),
    presetId,
  );
  const initialStartedAt = Date.now();
  await session.send('Page.navigate', {
    url: `${BASE_URL}/?${SAVED_RELOAD_MODE ? 'diagram' : 'canonicalPreset'}=${encodeURIComponent(presetId)}`
      + `&routingMatrix=${layoutCase.id}-${Date.now()}`
      + `#/?diagram=${encodeURIComponent(presetId)}`,
  });
  const initialRoute = await waitForValue(
    session,
    readFinalRouteExpression(''),
    `${layoutCase.id} initial route`,
  );
  const initialRouteMs = Date.now() - initialStartedAt;
  const savedRoundtripOptions = { session, presetId, semanticChains: target.semanticChains,
    waitForValue, readFinalRouteExpression, auditFinalSvg, visualSettleTimeoutMs: VISUAL_SETTLE_TIMEOUT_MS };
  if (SAVED_RELOAD_MODE === 'initial') return {
    id: layoutCase.id, initialRouteMs,
    savedRoundtrip: await verifySavedDisplayRoutingRoundtrip(savedRoundtripOptions),
  };
  await session.evaluate('window.__vizlyRoutingResponses = []');
  const previousLayoutJobId = await session.evaluate(
    'window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0',
  );
  const clickedAt = await clickLayout(session, layoutCase);
  const route = await waitForValue(
    session,
    readFinalRouteExpression('layout:', previousLayoutJobId),
    `${layoutCase.id} layout route`,
  );
  const visualSettle = await waitForStableDisplayRoutingLayoutVisual({
    session,
    expectedRequestId: route.routing.requestId,
    expectedNodeCount: route.request?.nodes?.length,
    expectedEdgeCount: route.response?.edges?.length,
    timeoutMs: VISUAL_SETTLE_TIMEOUT_MS,
  });
  const totalRouteMs = Number.isFinite(route.routing.finalAppliedAt)
    ? route.routing.finalAppliedAt - clickedAt
    : route.routing.totalRouteMs;
  const layoutTiming = await session.evaluate(`(() => {
    const clickedAtEpoch = ${JSON.stringify(clickedAt)};
    const layoutRequests = (window.__vizlyRoutingRequests || []).filter(request => (
      typeof request?.requestId === 'string' && request.requestId.startsWith('layout:')
    ));
    const firstRequestAt = Math.min(
      ...layoutRequests.map(request => request.__browserCapturedAt).filter(Number.isFinite),
    );
    const finalAppliedAt = window.__vizlyBaseReactFlowDisplayRouting?.finalAppliedAt;
    const longTasks = (window.__vizlyLongTasks || []).filter(task => (
      Number.isFinite(task?.startedAt)
      && Number.isFinite(task?.durationMs)
      && task.startedAt >= clickedAtEpoch
      && (!Number.isFinite(finalAppliedAt) || task.startedAt <= finalAppliedAt)
    ));
    const attempts = (window.__vizlyRoutingResponses || []).filter(response => (
      typeof response?.requestId === 'string'
      && response.requestId.startsWith('layout:')
      && typeof response.hardClean === 'boolean'
    )).map(response => {
      const request = [...layoutRequests].reverse().find(candidate => (
        candidate.requestId === response.requestId
        && (
          !Number.isSafeInteger(response.__browserRequestOrdinal)
          || candidate.__browserRequestOrdinal === response.__browserRequestOrdinal
        )
        && (
          typeof response.__browserWorkerInstanceId !== 'string'
          || candidate.__browserWorkerInstanceId === response.__browserWorkerInstanceId
        )
        && (
          !Number.isFinite(candidate.__browserCapturedAt)
          || !Number.isFinite(response.__browserCapturedAt)
          || candidate.__browserCapturedAt <= response.__browserCapturedAt
        )
      ));
      const summarize = ${summarizeSlowestDisplayRoutingPhases.toString()};
      const isClosurePhase = ${isDisplayRoutingClosurePhase.toString()};
      return {
        requestId: response.requestId,
        workerInstanceId: response.__browserWorkerInstanceId ?? null,
        requestOrdinal: response.__browserRequestOrdinal ?? null,
        attemptOrdinal: response.__browserAttemptOrdinal ?? null,
        responseOrdinal: response.__browserResponseOrdinalWithinRequest ?? null,
        protocolVersion: response.__browserProtocolVersion ?? null,
        routingVersion: response.__browserRoutingVersion
          ?? request?.__browserRoutingVersion
          ?? null,
        geometryDigest: request?.inputIdentity?.inputGeometryDigest ?? null,
        layoutSeedAudit: request?.__browserLayoutSeedAudit ?? null,
        operation: request?.operation,
        resolution: response.routeResolution,
        hardClean: response.hardClean,
        workerDurationMs: response.workerDurationMs,
        hardReport: response.hardReport && {
          obstacleHits: response.hardReport.obstacleHits,
          terminalsAttached: response.hardReport.terminalsAttached,
          terminalsAnchored: response.hardReport.terminalsAnchored,
          minimumClearanceViolations: response.hardReport.minimumClearanceViolations,
          commercialClearanceViolations: response.hardReport.commercialClearanceViolations,
          quality: response.hardReport.quality,
        },
        requestResponseMs: Number.isFinite(request?.__browserCapturedAt)
          && Number.isFinite(response.__browserCapturedAt)
          ? response.__browserCapturedAt - request.__browserCapturedAt
          : null,
        closurePhases: summarize(
          Array.isArray(response.phaseTrace)
            ? response.phaseTrace.filter(isClosurePhase)
            : [],
          8,
        ),
        slowestPhases: summarize(response.phaseTrace),
      };
    });
    return {
      inputToFirstWorkerMs: Number.isFinite(firstRequestAt)
        ? firstRequestAt - clickedAtEpoch
        : null,
      layoutStartDelayMs: Number.isFinite(firstRequestAt)
        ? firstRequestAt - clickedAtEpoch
        : null,
      longTaskCount: longTasks.length,
      longTaskTotalMs: longTasks.reduce((sum, task) => sum + task.durationMs, 0),
      longTaskMaxMs: Math.max(0, ...longTasks.map(task => task.durationMs)),
      attempts,
    };
  })()`);
  if (!Number.isFinite(totalRouteMs) || totalRouteMs > MAX_LAYOUT_ROUTE_MS) {
    throw new Error(`${layoutCase.id} exceeded ${MAX_LAYOUT_ROUTE_MS}ms: ${totalRouteMs}`);
  }
  const inputToRoutingCommitMs = Number.isFinite(route.routing.finalAppliedAt)
    ? route.routing.finalAppliedAt - clickedAt
    : null;
  const routingCommitToVisualStableMs = Number.isFinite(route.routing.finalAppliedAt)
    ? visualSettle.stableSinceAt - route.routing.finalAppliedAt
    : null;
  const inputToVisualStableMs = visualSettle.stableSinceAt - clickedAt;
  const layoutDiagnostics = await session.evaluate(`(() => {
    const readDiagnostics = ${readDisplayRoutingLayoutDiagnostics.toString()};
    return readDiagnostics({
      routingValue: window.__vizlyBaseReactFlowDisplayRouting,
      heartbeatValue: window.__vizlyWorkerHeartbeats,
      clickedAt: ${JSON.stringify(clickedAt)},
      confirmedAt: ${JSON.stringify(visualSettle.confirmedAt)},
    });
  })()`);
  const visualTimeline = summarizeDisplayRoutingLayoutVisualTimeline({
    events: await session.evaluate('window.__vizlyLayoutVisualEvents || []'),
    inputAt: clickedAt,
    layoutPhaseTrace: layoutDiagnostics.phaseTrace,
    routingCommitAt: route.routing.finalAppliedAt,
    visualStableAt: visualSettle.stableSinceAt,
  });
  assertDisplayRoutingLayoutProgressTimeline(visualTimeline, layoutCase.id);
  assertDisplayRoutingLayoutFitTimeline(visualTimeline, layoutCase.id);
  await assertRequestedLayoutSelected(session, layoutCase.id);
  if (route.routing.workerStartCount !== initialRoute.routing.workerStartCount) {
    throw new Error(`${layoutCase.id} started a duplicate Canvas display Worker: ${JSON.stringify({
      before: initialRoute.routing.workerStartCount,
      after: route.routing.workerStartCount,
    })}`);
  }
  const mounted = await session.evaluate(`(() => ({
    nodes: window.reactFlowInstance?.getNodes?.().map(node => ({ id: node.id })) || [],
    edges: window.reactFlowInstance?.getEdges?.().map(edge => ({ id: edge.id })) || [],
  }))()`);
  const canonicalMount = verifyCanonicalPresetMount({
    identity,
    requestNodes: route.request?.nodes,
    requestEdges: route.request?.edges,
    mountedNodes: mounted.nodes,
    mountedEdges: mounted.edges,
  });
  const layoutAudit = await auditFinalSvg(session, route, layoutCase.id);
  const semanticAudit = await auditDisplayRoutingLayoutSemantics(session, layoutCase, target.semanticChains);
  const warmLayoutSwitches = [];
  for (const warmLayoutCase of WARM_LAYOUT_CASES) {
    await session.evaluate(`(() => {
      window.__vizlyRoutingRequests = [];
      window.__vizlyRoutingResponses = [];
      return true;
    })()`);
    const previousWarmLayoutJobId = await session.evaluate(
      'window.__vizlyBaseReactFlowDisplayRouting?.layoutTransactionJobId ?? 0',
    );
    const warmClickedAt = await clickLayout(session, warmLayoutCase);
    const warmRoute = await waitForValue(
      session,
      readFinalRouteExpression('layout:', previousWarmLayoutJobId),
      `${layoutCase.id} to ${warmLayoutCase.id} warm layout route`,
    );
    const warmVisualSettle = await waitForStableDisplayRoutingLayoutVisual({
      session,
      expectedRequestId: warmRoute.routing.requestId,
      expectedNodeCount: warmRoute.request?.nodes?.length,
      expectedEdgeCount: warmRoute.response?.edges?.length,
      timeoutMs: VISUAL_SETTLE_TIMEOUT_MS,
    });
    await assertRequestedLayoutSelected(session, warmLayoutCase.id);
    const warmTotalRouteMs = Number.isFinite(warmRoute.routing.finalAppliedAt)
      ? warmRoute.routing.finalAppliedAt - warmClickedAt
      : warmRoute.routing.totalRouteMs;
    if (!Number.isFinite(warmTotalRouteMs) || warmTotalRouteMs > MAX_LAYOUT_ROUTE_MS) {
      throw new Error(
        `${layoutCase.id} warm repeat exceeded ${MAX_LAYOUT_ROUTE_MS}ms: ${warmTotalRouteMs}`,
      );
    }
    if (warmRoute.routing.workerStartCount !== initialRoute.routing.workerStartCount) {
      throw new Error(`${layoutCase.id} warm repeat started a duplicate Canvas display Worker`);
    }
    const warmFirstRequestAt = await session.evaluate(`Math.min(
      ...(window.__vizlyRoutingRequests || [])
        .filter(request => typeof request?.requestId === 'string'
          && request.requestId.startsWith('layout:'))
        .map(request => request.__browserCapturedAt)
        .filter(Number.isFinite)
    )`);
    warmLayoutSwitches.push({
      id: warmLayoutCase.id,
      semanticAudit: await auditDisplayRoutingLayoutSemantics(session, warmLayoutCase, target.semanticChains),
      inputToFirstWorkerMs: Number.isFinite(warmFirstRequestAt)
        ? warmFirstRequestAt - warmClickedAt
        : null,
      routeMs: Number.isFinite(warmRoute.request?.__browserCapturedAt)
        && Number.isFinite(warmRoute.response?.__browserCapturedAt)
        ? warmRoute.response.__browserCapturedAt - warmRoute.request.__browserCapturedAt
        : warmRoute.routing.routeMs,
      totalRouteMs: warmTotalRouteMs,
      inputToRoutingCommitMs: Number.isFinite(warmRoute.routing.finalAppliedAt)
        ? warmRoute.routing.finalAppliedAt - warmClickedAt
        : null,
      routingCommitToVisualStableMs: Number.isFinite(warmRoute.routing.finalAppliedAt)
        ? warmVisualSettle.stableSinceAt - warmRoute.routing.finalAppliedAt
        : null,
      inputToVisualStableMs: warmVisualSettle.stableSinceAt - warmClickedAt,
      visualTimeline: summarizeDisplayRoutingLayoutVisualTimeline({
        events: await session.evaluate('window.__vizlyLayoutVisualEvents || []'),
        inputAt: warmClickedAt,
        routingCommitAt: warmRoute.routing.finalAppliedAt,
        visualStableAt: warmVisualSettle.stableSinceAt,
      }),
      ...(await auditFinalSvg(
        session,
        warmRoute,
        `${layoutCase.id} to ${warmLayoutCase.id} warm layout`,
      )),
    });
  }
  const warmLayoutSwitch = warmLayoutSwitches[0] ?? null;
  const savedRoundtrip = SAVED_RELOAD_MODE === 'layout'
    ? await verifySavedDisplayRoutingRoundtrip({ ...savedRoundtripOptions,
      savedLayoutCase: WARM_LAYOUT_CASES.at(-1) ?? layoutCase }) : null;
  let postLayoutMove = null;
  if (layoutCase.id === 'domain-compound-elk-lr') {
    const dragTarget = await session.evaluate(`(() => {
      const instance = window.reactFlowInstance;
      const edges = instance?.getEdges?.() || [];
      const incidentIds = new Set(edges.flatMap(edge => [edge.source, edge.target]));
      const connected = (instance?.getNodes?.() || []).filter(node => incidentIds.has(node.id));
      const nodeId = connected.find(node => !node.parentId)?.id ?? connected[0]?.id ?? null;
      const resolveDelta = ${resolveDisplayRoutingConnectedDragDelta.toString()};
      const delta = nodeId ? resolveDelta(instance.getNodes(), edges, nodeId) : null;
      return nodeId && delta ? { nodeId, delta } : null;
    })()`);
    const dragNodeId = dragTarget?.nodeId;
    if (!dragNodeId) throw new Error(`${layoutCase.id} has no connected drag target`);
    await session.evaluate(`(() => {
      window.__vizlyRoutingRequests = [];
      window.__vizlyRoutingResponses = [];
      return true;
    })()`);
    const moved = await session.evaluate(`(() => {
      const instance = window.reactFlowInstance;
      if (!instance?.setNodes) return false;
      instance.setNodes(nodes => nodes.map(node => node.id === ${JSON.stringify(dragNodeId)} ? {
        ...node,
        position: {
          x: Number(node.position?.x || 0) + ${JSON.stringify(dragTarget.delta.x)},
          y: Number(node.position?.y || 0) + ${JSON.stringify(dragTarget.delta.y)},
        },
      } : node));
      return true;
    })()`);
    if (!moved) throw new Error(`${layoutCase.id} could not move ${dragNodeId}`);
    const incremental = await waitForValue(
      session,
      readLatestCompletedRouteExpression,
      `${layoutCase.id} post-layout move`,
    );
    if (
      incremental.request?.operation !== 'incremental-route'
      || incremental.response.routeResolution !== 'incremental-route'
      || incremental.routing.workerStartCount !== initialRoute.routing.workerStartCount + 1
    ) {
      throw new Error(`${layoutCase.id} did not preserve its incremental Worker session: ${JSON.stringify({
        requestOperation: incremental.request?.operation,
        nodeId: dragNodeId,
        routeResolution: incremental.response.routeResolution,
        initialWorkerStartCount: initialRoute.routing.workerStartCount,
        finalWorkerStartCount: incremental.routing.workerStartCount,
        incrementalPlanStatus: incremental.routing.incrementalPlanStatus,
        incrementalBaselineSignature: incremental.routing.incrementalBaselineSignature,
        hasBaselineSessionRef: Boolean(incremental.request?.baselineSessionRef),
        affectedEdgeCount: incremental.response.affectedEdgeCount,
        fallbackLevel: incremental.response.fallbackLevel,
        phaseTrace: incremental.response.phaseTrace?.map(trace => ({
          phase: trace.phase,
          resolution: trace.resolution,
          candidateCount: trace.candidateCount,
          changedEdgeCount: trace.changedEdgeCount,
        })),
      })}`);
    }
    postLayoutMove = {
      nodeId: dragNodeId,
      resolution: incremental.response.routeResolution,
      affectedEdgeCount: incremental.response.affectedEdgeCount,
      ...(await auditFinalSvg(session, incremental, `${layoutCase.id} post-layout move`)),
    };
  }
  return {
    id: layoutCase.id,
    resolution: route.response.routeResolution,
    initialRouteMs,
    initialWorkerRouteMs: Number.isFinite(initialRoute.request?.__browserCapturedAt)
      && Number.isFinite(initialRoute.response?.__browserCapturedAt)
      ? initialRoute.response.__browserCapturedAt - initialRoute.request.__browserCapturedAt
      : initialRoute.routing.routeMs,
    routeMs: Number.isFinite(route.request?.__browserCapturedAt)
      && Number.isFinite(route.response.__browserCapturedAt)
      ? route.response.__browserCapturedAt - route.request.__browserCapturedAt
      : route.routing.routeMs,
    totalRouteMs,
    inputToRoutingCommitMs,
    routingCommitToVisualStableMs,
    inputToVisualStableMs,
    visualStableConfirmedAt: visualSettle.confirmedAt,
    visualTimeline,
    layoutPhaseTrace: layoutDiagnostics.phaseTrace,
    layoutSeedAudit: layoutDiagnostics.layoutSeedAudit,
    workerHeartbeatCount: layoutDiagnostics.workerHeartbeatCount,
    workerHeartbeatMaxElapsedMs: layoutDiagnostics.workerHeartbeatMaxElapsedMs,
    workerInstanceCount: layoutDiagnostics.workerInstanceCount,
    ...layoutTiming,
    slowestPhases: summarizeSlowestDisplayRoutingPhases(route.response.phaseTrace),
    canonicalMount,
    warmLayoutSwitch,
    warmLayoutSwitches,
    savedRoundtrip,
    postLayoutMove,
    semanticAudit,
    ...layoutAudit,
  };
});

await assertDisplayRoutingProductionPreview(BASE_URL);
const presetResults = [];
for (const target of PRECOMPILED_DISPLAY_ROUTE_TARGETS) {
  if (!REQUESTED_CASE || REQUESTED_CASE === target.presetId) {
    presetResults.push(await verifyPreset(target));
  }
}
const layoutResults = [];
for (const layoutCase of DISPLAY_ROUTING_LAYOUT_CASES) {
  if (!REQUESTED_CASE || REQUESTED_CASE === layoutCase.id) {
    layoutResults.push(await verifyLayout(layoutCase));
  }
}
const topologyResults = [];
if (!REQUESTED_CASE || REQUESTED_CASE === DISPLAY_ROUTING_TOPOLOGY_CASE_ID) {
  topologyResults.push(await verifyDisplayRoutingTopologyMatrix({
    baseUrl: BASE_URL,
    prepareSession,
    waitForInitialRoute: (session, label) => waitForValue(
      session,
      readFinalRouteExpression(''),
      `${label} initial route`,
    ),
    auditFinalSvg,
  }));
}
console.log(JSON.stringify({ viewport: MATRIX_VIEWPORT, presetResults, layoutResults, topologyResults }, null, 2));
