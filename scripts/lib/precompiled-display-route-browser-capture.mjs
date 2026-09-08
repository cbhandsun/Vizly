import { createPrecompiledDisplayRouteTimingRecorder } from './precompiled-display-route-capture.mjs';
import { installDisplayRoutingBrowserBootProbe } from './display-routing-browser-lifecycle.mjs';
import { installPrecompiledRouteLongTaskProbe } from './precompiled-display-route-long-tasks.mjs';

export const PRECOMPILED_DISPLAY_ROUTE_BROWSER_CAPTURE_SCRIPT = `(() => {
  const NativeWorker = window.Worker;
  const markBoot = (${installDisplayRoutingBrowserBootProbe.toString()})(true);
  window.__vizlyPrecompiledRouteLongTasks = (${installPrecompiledRouteLongTaskProbe.toString()})();
  const createTimingRecorder = ${createPrecompiledDisplayRouteTimingRecorder.toString()};
  window.__vizlyDisplayRoutingDiagnosticsEnabled = true;
  window.__vizlyPrecompiledRouteRequest = null;
  window.__vizlyPrecompiledRouteResponse = null;
  window.__vizlyPrecompiledRouteTiming = null;
  window.__vizlyPrecompiledCommittedRoute = null;
  window.__vizlyPrecompiledRouteWorkerErrors = [];
  window.__vizlyPrecompiledRoutePageErrors = [];
  window.__vizlyPrecompiledRouteCaptureErrors = [];
  const recordPageError = code => {
    window.__vizlyPrecompiledRoutePageErrors.push(code);
    window.__vizlyPrecompiledRoutePageErrors = window.__vizlyPrecompiledRoutePageErrors.slice(-8);
  };
  window.addEventListener('error', event => recordPageError(
    event.target && event.target !== window ? 'resource-error' : 'script-error',
  ), true);
  window.addEventListener('unhandledrejection', () => recordPageError('unhandled-rejection'));
  class CapturingWorker extends NativeWorker {
    constructor(...args) {
      super(...args);
      markBoot('workerConstructedMs');
      this.routeTiming = createTimingRecorder(Date.now());
      this.addEventListener('message', event => {
        const response = event?.data;
        const request = window.__vizlyPrecompiledRouteRequest;
        if (response && request && response.requestId === request.requestId) {
          markBoot('workerResponseMs');
          window.__vizlyPrecompiledRouteTiming = this.routeTiming.received(response, Date.now(), performance.now());
          try { window.__vizlyPrecompiledRouteResponse = structuredClone(response); } catch {
            window.__vizlyPrecompiledRouteCaptureErrors.push('response-clone-failed');
            window.__vizlyPrecompiledRouteCaptureErrors = window.__vizlyPrecompiledRouteCaptureErrors.slice(-8);
          }
        }
      });
      this.addEventListener('error', () => {
        window.__vizlyPrecompiledRouteWorkerErrors.push({
          kind: 'worker-error',
        });
        window.__vizlyPrecompiledRouteWorkerErrors =
          window.__vizlyPrecompiledRouteWorkerErrors.slice(-8);
      });
      this.addEventListener('messageerror', () => {
        window.__vizlyPrecompiledRouteWorkerErrors.push({
          kind: 'worker-message-deserialization-failed',
        });
        window.__vizlyPrecompiledRouteWorkerErrors =
          window.__vizlyPrecompiledRouteWorkerErrors.slice(-8);
      });
    }
    postMessage(message, transfer) {
      if (message && (message.operation === 'route' || message.operation === 'validate-or-route')) {
        markBoot('workerRequestMs');
        try { window.__vizlyPrecompiledRouteRequest = structuredClone(message); } catch {
          window.__vizlyPrecompiledRouteCaptureErrors.push('request-clone-failed');
          window.__vizlyPrecompiledRouteCaptureErrors = window.__vizlyPrecompiledRouteCaptureErrors.slice(-8);
        }
        this.routeTiming.posted(message.requestId, Date.now(), performance.now());
      }
      return typeof transfer === 'undefined'
        ? super.postMessage(message)
        : super.postMessage(message, transfer);
    }
  }
  window.Worker = CapturingWorker;
})()`;
