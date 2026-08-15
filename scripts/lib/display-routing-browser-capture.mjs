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
  window.__vizlyRenderedRouteSamples = [];
  let previousRenderedRouteFingerprint = '';
  const sampleRenderedRoutes = () => {
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
        window.__vizlyRenderedRouteSamples.push({
          at: performance.now(),
          pathCount: paths.length,
          fingerprint,
        });
        window.__vizlyRenderedRouteSamples = window.__vizlyRenderedRouteSamples.slice(-16);
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
        try {
          if (response.boundedCandidate) {
            window.__vizlyBoundedCandidates.push(structuredClone(response));
            window.__vizlyBoundedCandidates = window.__vizlyBoundedCandidates.slice(-16);
          }
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
