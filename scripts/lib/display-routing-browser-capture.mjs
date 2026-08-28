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
  window.__vizlyRouteSamplingEnabled = true;
  let previousRenderedRouteFingerprint = '';
  let previousLayoutBusy = null;
  let previousLayoutCommitting = null;
  let previousViewportFingerprint = '';
  let pendingDiagnosticCloneTasks = 0;
  const recordLayoutVisualEvent = (type, value) => {
    const sampledAt = performance.timeOrigin + performance.now();
    if (!Number.isFinite(sampledAt)) return;
    window.__vizlyLayoutVisualEvents.push({ type, value, sampledAt });
    window.__vizlyLayoutVisualEvents = window.__vizlyLayoutVisualEvents.slice(-128);
  };
  window.addEventListener?.('diagramControl', event => {
    if (event?.detail?.action !== 'fit') return;
    recordLayoutVisualEvent('fit-dispatched', true);
    queueMicrotask(() => recordLayoutVisualEvent('fit-handler-returned', true));
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
            capturedResponse.__browserCapturedAt = receivedAt;
            capturedResponse.__browserCloneMs = performance.now() - cloneStartedAt;
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
            )).slice(-64);
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
          capturedRequest.__browserCloneMs = performance.now() - cloneStartedAt;
          capturedRequest.__browserCapturedAt = Date.now();
          window.__vizlyRoutingRequests.push(capturedRequest);
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
