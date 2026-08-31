/**
 * Installs aggregate-only route and worker probes before the application
 * starts. The browser verifier owns the observations; production routing
 * behavior never depends on this script.
 */
export const DISPLAY_ROUTING_BROWSER_CAPTURE_SCRIPT = `(() => {
  const NativeWorker = window.Worker;
  window.__vizlyRoutingRequests = [];
  window.__vizlyRoutingResponses = [];
  window.__vizlyBoundedCandidates = [];
  window.__vizlyLongTasks = [];
  window.__vizlyRenderedRouteSamples = [];
  window.__vizlyLayoutVisualEvents = [];
  window.__vizlyWorkerHeartbeats = [];
  window.__vizlyRouteSamplingEnabled = true;
  let previousRenderedRouteFingerprint = '';
  let previousLayoutBusy = null;
  let previousLayoutCommitting = null;
  let previousLayoutProgressVisible = null;
  let previousViewportFingerprint = '';
  let pendingDiagnosticCloneTasks = 0;
  let workerInstanceSequence = 0;
  let requestSequence = 0;
  let responseSequence = 0;
  const readLayoutSeedAudit = () => {
    const routing = window.__vizlyBaseReactFlowDisplayRouting;
    const boundedCount = value => Number.isSafeInteger(value)
      && value >= 0
      && value <= 100_000
      ? value
      : null;
    if (
      typeof routing?.layoutSeedTerminalsAttached !== 'boolean'
      || typeof routing?.layoutSeedTerminalsAnchored !== 'boolean'
    ) return null;
    const obstacleHits = boundedCount(routing.layoutSeedObstacleHits);
    const strictCrossings = boundedCount(routing.layoutSeedStrictCrossings);
    if (obstacleHits === null || strictCrossings === null) return null;
    return {
      terminalsAttached: routing.layoutSeedTerminalsAttached,
      terminalsAnchored: routing.layoutSeedTerminalsAnchored,
      obstacleHits,
      strictCrossings,
    };
  };
  const recordLayoutVisualEvent = (type, value) => {
    const sampledAt = performance.timeOrigin + performance.now();
    if (!Number.isFinite(sampledAt)) return;
    window.__vizlyLayoutVisualEvents.push({ type, value, sampledAt });
    // A long Worker job can emit more than 128 diagnostic completions. Keep
    // its lifecycle transitions; otherwise a visible progress indicator is
    // incorrectly reported as missing when its start was evicted by noise.
    if (window.__vizlyLayoutVisualEvents.length > 128) {
      const transient = window.__vizlyLayoutVisualEvents.findIndex(event => (
        event.type === 'diagnostic-clone-backlog-drained'
        || event.type === 'viewport-change'
        || event.type === 'route-path-change'
      ));
      window.__vizlyLayoutVisualEvents.splice(Math.max(0, transient), 1);
    }
  };
  const recordWorkerHeartbeat = ({
    workerInstanceId,
    requestOrdinal,
    attemptOrdinal,
    operation,
    startedAt,
  }) => {
    const sampledAt = Date.now();
    window.__vizlyWorkerHeartbeats.push({
      workerInstanceId,
      requestOrdinal,
      attemptOrdinal,
      operation,
      sampledAt,
      elapsedMs: Math.max(0, sampledAt - startedAt),
    });
    window.__vizlyWorkerHeartbeats = window.__vizlyWorkerHeartbeats.slice(-128);
  };
  const recordFitDispatch = () => {
    recordLayoutVisualEvent('fit-dispatched', true);
    queueMicrotask(() => recordLayoutVisualEvent('fit-listeners-returned', true));
  };
  window.addEventListener?.('diagramControl', event => {
    if (event?.detail?.action !== 'fit') return;
    recordFitDispatch();
  }, true);
  window.addEventListener?.('vizly:diagram-control-request', event => {
    const detail = event?.detail;
    if (
      detail?.schema !== 'vizly-diagram-control-request-v1'
      || detail?.action !== 'fit'
      || detail?.mode !== 'layout-commit'
    ) return;
    recordFitDispatch();
  }, true);
  try {
    const longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__vizlyLongTasks.push({
          startedAt: performance.timeOrigin + entry.startTime,
          durationMs: entry.duration,
        });
      }
      window.__vizlyLongTasks = window.__vizlyLongTasks.slice(-64);
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {}
  const sampleRenderedRoutes = () => {
    if (!window.__vizlyRouteSamplingEnabled) {
      requestAnimationFrame(sampleRenderedRoutes);
      return;
    }
    const wrappers = [...document.querySelectorAll('[data-testid^="rf__edge-"]')];
    const paths = wrappers.map(wrapper => (
      wrapper.querySelector('.shared-trunk-edge-interaction')
      ?? wrapper.querySelector('.shared-trunk-accent-trace')
      ?? wrapper.querySelector('.react-flow__edge-path')
    )).map(path => path?.getAttribute('d') || '');
    if (paths.length > 0) {
      const fingerprint = paths.join('||');
      if (fingerprint !== previousRenderedRouteFingerprint) {
        previousRenderedRouteFingerprint = fingerprint;
        recordLayoutVisualEvent('route-path-change', paths.length);
        window.__vizlyRenderedRouteSamples.push({
          at: performance.now(),
          pathCount: paths.length,
          fingerprint,
        });
        window.__vizlyRenderedRouteSamples = window.__vizlyRenderedRouteSamples.slice(-16);
      }
    }
    const layoutTrigger = [...document.querySelectorAll('button')]
      .find(button => /\u81ea\u52a8\u5e03\u5c40|layout/i.test(button.getAttribute?.('aria-label') || ''));
    const layoutBusy = layoutTrigger?.getAttribute?.('aria-busy') === 'true';
    if (layoutBusy !== previousLayoutBusy) {
      previousLayoutBusy = layoutBusy;
      recordLayoutVisualEvent('layout-busy', layoutBusy);
    }
    const layoutProgressVisible = Boolean(
      document.querySelector?.('.flowchart-layout-progress'),
    );
    if (layoutProgressVisible !== previousLayoutProgressVisible) {
      previousLayoutProgressVisible = layoutProgressVisible;
      recordLayoutVisualEvent('layout-progress', layoutProgressVisible);
    }
    const layoutCommitting = Boolean(document.querySelector?.('.vizly-layout-committing'));
    if (layoutCommitting !== previousLayoutCommitting) {
      previousLayoutCommitting = layoutCommitting;
      recordLayoutVisualEvent('layout-committing', layoutCommitting);
    }
    const viewport = window.reactFlowInstance?.getViewport?.();
    if (
      Number.isFinite(viewport?.x)
      && Number.isFinite(viewport?.y)
      && Number.isFinite(viewport?.zoom)
    ) {
      const viewportFingerprint = [viewport.x, viewport.y, viewport.zoom]
        .map(value => Math.round(value * 10_000) / 10_000)
        .join(':');
      if (viewportFingerprint !== previousViewportFingerprint) {
        previousViewportFingerprint = viewportFingerprint;
        recordLayoutVisualEvent('viewport-change', true);
      }
    }
    requestAnimationFrame(sampleRenderedRoutes);
  };
  requestAnimationFrame(sampleRenderedRoutes);
  class CapturingWorker extends NativeWorker {
    constructor(...args) {
      super(...args);
      this.__vizlyWorkerInstanceId = 'worker-' + String(workerInstanceSequence += 1);
      this.__vizlyRequestAttemptCounts = new Map();
      this.__vizlyResponseCounts = new Map();
      this.__vizlyActiveRequestHeartbeats = new Map();
      this.addEventListener('message', event => {
        const response = event?.data;
        if (!response || typeof response.requestId !== 'string') return;
        const receivedAt = Date.now();
        // This listener is installed before the application's listener. Defer
        // diagnostic cloning to the next task so both the other listeners and
        // their Promise continuations can commit first. A microtask is too early:
        // it would be queued before the application resolves its Worker promise.
        pendingDiagnosticCloneTasks += 1;
        setTimeout(() => {
          const cloneStartedAt = performance.now();
          try {
            if (response.boundedCandidate) {
              window.__vizlyBoundedCandidates.push(structuredClone(response));
              window.__vizlyBoundedCandidates = window.__vizlyBoundedCandidates.slice(-16);
            }
            const capturedResponse = structuredClone(response);
            const matchingRequest = [...window.__vizlyRoutingRequests].reverse().find(request => (
              request?.requestId === response.requestId
              && request?.__browserWorkerInstanceId === this.__vizlyWorkerInstanceId
            ));
            const requestOrdinal = matchingRequest?.__browserRequestOrdinal;
            const responseKey = Number.isSafeInteger(requestOrdinal)
              ? String(requestOrdinal)
              : response.requestId;
            const responseOrdinalWithinRequest = (this.__vizlyResponseCounts.get(responseKey) || 0) + 1;
            this.__vizlyResponseCounts.set(responseKey, responseOrdinalWithinRequest);
            if (
              Number.isSafeInteger(requestOrdinal)
              && (typeof response.hardClean === 'boolean' || typeof response.routeResolution === 'string')
            ) {
              const heartbeatId = this.__vizlyActiveRequestHeartbeats.get(requestOrdinal);
              if (heartbeatId !== undefined) clearInterval(heartbeatId);
              this.__vizlyActiveRequestHeartbeats.delete(requestOrdinal);
            }
            capturedResponse.__browserCapturedAt = receivedAt;
            capturedResponse.__browserCloneMs = performance.now() - cloneStartedAt;
            capturedResponse.__browserWorkerInstanceId = this.__vizlyWorkerInstanceId;
            capturedResponse.__browserRequestOrdinal = requestOrdinal;
            capturedResponse.__browserAttemptOrdinal = matchingRequest?.__browserAttemptOrdinal;
            capturedResponse.__browserResponseOrdinal = responseSequence += 1;
            capturedResponse.__browserResponseOrdinalWithinRequest = responseOrdinalWithinRequest;
            const protocolVersion = response?.commitReceipt?.protocolVersion
              ?? response?.sessionRef?.protocolVersion;
            if (
              typeof protocolVersion === 'string'
              && /^[a-z0-9:_-]{1,64}$/i.test(protocolVersion)
            ) capturedResponse.__browserProtocolVersion = protocolVersion;
            capturedResponse.__browserRoutingVersion = matchingRequest?.__browserRoutingVersion;
            window.__vizlyRoutingResponses.push(capturedResponse);
            // Full-route progress can emit dozens of aggregate responses after
            // a bounded layout repair completes. Preserve completed responses
            // separately from the rolling progress tail so the decisive
            // candidate result cannot be evicted before timeout diagnostics.
            const completed = window.__vizlyRoutingResponses.filter(item => (
              typeof item?.hardClean === 'boolean'
              || typeof item?.routeResolution === 'string'
            )).slice(-16);
            const progress = window.__vizlyRoutingResponses.filter(item => (
              typeof item?.hardClean !== 'boolean'
              && typeof item?.routeResolution !== 'string'
            )).slice(-196);
            window.__vizlyRoutingResponses = [...completed, ...progress];
          } catch {}
          pendingDiagnosticCloneTasks = Math.max(0, pendingDiagnosticCloneTasks - 1);
          if (pendingDiagnosticCloneTasks === 0) {
            recordLayoutVisualEvent('diagnostic-clone-backlog-drained', true);
          }
        }, 0);
      });
    }
    postMessage(message, transfer) {
      if (message && typeof message.requestId === 'string') {
        try {
          const cloneStartedAt = performance.now();
          const capturedRequest = structuredClone(message);
          const attemptOrdinal = (this.__vizlyRequestAttemptCounts.get(message.requestId) || 0) + 1;
          this.__vizlyRequestAttemptCounts.set(message.requestId, attemptOrdinal);
          capturedRequest.__browserCloneMs = performance.now() - cloneStartedAt;
          capturedRequest.__browserCapturedAt = Date.now();
          capturedRequest.__browserWorkerInstanceId = this.__vizlyWorkerInstanceId;
          capturedRequest.__browserRequestOrdinal = requestSequence += 1;
          capturedRequest.__browserAttemptOrdinal = attemptOrdinal;
          capturedRequest.__browserLayoutSeedAudit = readLayoutSeedAudit();
          const routingVersion = message?.inputIdentity?.routingVersion;
          if (
            typeof routingVersion === 'string'
            && /^[a-z0-9:_-]{1,64}$/i.test(routingVersion)
          ) capturedRequest.__browserRoutingVersion = routingVersion;
          window.__vizlyRoutingRequests.push(capturedRequest);
          window.__vizlyRoutingRequests = window.__vizlyRoutingRequests.slice(-16);
          const heartbeat = {
            workerInstanceId: this.__vizlyWorkerInstanceId,
            requestOrdinal: capturedRequest.__browserRequestOrdinal,
            attemptOrdinal,
            operation: typeof message.operation === 'string' ? message.operation : 'unknown',
            startedAt: capturedRequest.__browserCapturedAt,
          };
          recordWorkerHeartbeat(heartbeat);
          const heartbeatId = setInterval(() => recordWorkerHeartbeat(heartbeat), 1_000);
          this.__vizlyActiveRequestHeartbeats.set(
            capturedRequest.__browserRequestOrdinal,
            heartbeatId,
          );
        } catch {}
      }
      return typeof transfer === 'undefined'
        ? super.postMessage(message)
        : super.postMessage(message, transfer);
    }
    terminate() {
      for (const heartbeatId of this.__vizlyActiveRequestHeartbeats.values()) {
        clearInterval(heartbeatId);
      }
      this.__vizlyActiveRequestHeartbeats.clear();
      return super.terminate();
    }
  }
  window.Worker = CapturingWorker;
})()`;
