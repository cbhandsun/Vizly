import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_SAMPLE_INTERVAL_MS = 34;
const DEFAULT_REQUIRED_QUIET_MS = 250;
const MAX_SAMPLES = 192;

export const resolveDisplayRoutingLayoutVisualTimeoutMs = (
  waitTimeoutMs,
  fallbackMs = DEFAULT_TIMEOUT_MS,
) => {
  const fallback = Number.isFinite(fallbackMs)
    ? Math.max(100, Math.min(30_000, fallbackMs))
    : DEFAULT_TIMEOUT_MS;
  return Number.isFinite(waitTimeoutMs)
    ? Math.max(100, Math.min(30_000, waitTimeoutMs))
    : fallback;
};

const fingerprintValues = (values) => {
  const text = values.join('\0');
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const boundedCount = value => (
  Number.isSafeInteger(value) && value >= 0 && value <= 100_000 ? value : null
);

/**
 * Reads only aggregate presentation evidence. It deliberately avoids returning
 * node ids, SVG path data, or diagram content to the host verifier.
 */
export const readDisplayRoutingLayoutVisualSnapshot = (optionsValue) => {
  const options = optionsValue && typeof optionsValue === 'object' ? optionsValue : {};
  const expectedRequestId = typeof options.expectedRequestId === 'string'
    && options.expectedRequestId.length > 0
    && options.expectedRequestId.length <= 500
    ? options.expectedRequestId
    : null;
  const expectedNodeCount = boundedCount(options.expectedNodeCount);
  const expectedEdgeCount = boundedCount(options.expectedEdgeCount);
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const instance = window.reactFlowInstance;
  const viewportValue = instance?.getViewport?.();
  const viewport = {
    x: Number(viewportValue?.x),
    y: Number(viewportValue?.y),
    zoom: Number(viewportValue?.zoom),
  };
  const viewportIsFinite = [viewport.x, viewport.y, viewport.zoom].every(Number.isFinite)
    && Math.abs(viewport.x) <= 10_000_000
    && Math.abs(viewport.y) <= 10_000_000
    && viewport.zoom >= 0.05
    && viewport.zoom <= 8;
  const currentNodes = instance?.getNodes?.();
  const currentEdges = instance?.getEdges?.();
  const nodeElements = [...document.querySelectorAll('.react-flow__node[data-id]')]
    .sort((left, right) => String(left.getAttribute('data-id') || '')
      .localeCompare(String(right.getAttribute('data-id') || '')));
  const edgeElements = [...document.querySelectorAll('.react-flow__edge[data-id]')]
    .sort((left, right) => String(left.getAttribute('data-id') || '')
      .localeCompare(String(right.getAttribute('data-id') || '')));
  const nodeGeometry = nodeElements.map((element) => {
    const bounds = element.getBoundingClientRect();
    const values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if (!values.every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return null;
    const rounded = values.map(value => Math.round(value * 20) / 20);
    return `${element.getAttribute('data-id') || ''}:${rounded.join(',')}`;
  });
  const paths = edgeElements.map((wrapper) => {
    const path = wrapper.querySelector('.shared-trunk-edge-interaction')
      ?? wrapper.querySelector('.shared-trunk-accent-trace')
      ?? wrapper.querySelector('.react-flow__edge-path');
    const data = path?.getAttribute('d');
    return typeof data === 'string' && data.length > 0
      ? `${wrapper.getAttribute('data-id') || ''}:${data}`
      : null;
  });
  const layoutTrigger = [...document.querySelectorAll('button')]
    .find(button => /自动布局|layout/i.test(button.getAttribute('aria-label') || ''));
  const committing = Boolean(document.querySelector('.vizly-layout-committing'));
  const layoutBusy = layoutTrigger?.getAttribute('aria-busy') === 'true';
  const sampledAtValue = performance.timeOrigin + performance.now();
  const sampledAt = Number.isFinite(sampledAtValue) ? sampledAtValue : Date.now();
  const nodeCount = Array.isArray(currentNodes) ? currentNodes.length : null;
  const edgeCount = Array.isArray(currentEdges) ? currentEdges.length : null;
  const renderedNodeCount = nodeElements.length;
  const renderedEdgeCount = edgeElements.length;
  const renderedPathCount = paths.filter(Boolean).length;
  const countsMatch = expectedNodeCount !== null
    && expectedEdgeCount !== null
    && nodeCount === expectedNodeCount
    && edgeCount === expectedEdgeCount
    && renderedNodeCount === expectedNodeCount
    && renderedEdgeCount === expectedEdgeCount
    && renderedPathCount === expectedEdgeCount;
  const ready = expectedRequestId !== null
    && routing.stage === 'final-applied'
    && routing.renderAuthorityStatus === 'accepted'
    && routing.requestId === expectedRequestId
    && Boolean(layoutTrigger)
    && !committing
    && !layoutBusy
    && viewportIsFinite
    && countsMatch
    && nodeGeometry.every(Boolean)
    && paths.every(Boolean);

  return {
    sampledAt,
    ready,
    requestId: typeof routing.requestId === 'string' ? routing.requestId : null,
    stage: typeof routing.stage === 'string' ? routing.stage : null,
    committing,
    layoutBusy,
    nodeCount,
    edgeCount,
    renderedNodeCount,
    renderedEdgeCount,
    renderedPathCount,
    viewport: viewportIsFinite ? viewport : null,
    nodeGeometryFingerprint: nodeGeometry.every(Boolean)
      ? fingerprintValues(nodeGeometry)
      : null,
    pathFingerprint: paths.every(Boolean) ? fingerprintValues(paths) : null,
  };
};

export const displayRoutingLayoutVisualSnapshotsMatch = (left, right) => Boolean(
  left?.ready
  && right?.ready
  && left.requestId === right.requestId
  && left.nodeCount === right.nodeCount
  && left.edgeCount === right.edgeCount
  && left.renderedNodeCount === right.renderedNodeCount
  && left.renderedEdgeCount === right.renderedEdgeCount
  && left.renderedPathCount === right.renderedPathCount
  && left.nodeGeometryFingerprint === right.nodeGeometryFingerprint
  && left.pathFingerprint === right.pathFingerprint
  && left.viewport
  && right.viewport
  && [
    left.viewport.x,
    left.viewport.y,
    left.viewport.zoom,
    right.viewport.x,
    right.viewport.y,
    right.viewport.zoom,
  ].every(Number.isFinite)
  && Math.abs(left.viewport.x - right.viewport.x) <= 0.05
  && Math.abs(left.viewport.y - right.viewport.y) <= 0.05
  && Math.abs(left.viewport.zoom - right.viewport.zoom) <= 0.0001
);

export const resolveDisplayRoutingLayoutVisualStability = (
  samplesValue,
  requiredQuietMs = DEFAULT_REQUIRED_QUIET_MS,
) => {
  const samples = Array.isArray(samplesValue) ? samplesValue : [];
  const quietMs = Number.isFinite(requiredQuietMs)
    ? Math.max(100, Math.min(2_000, requiredQuietMs))
    : DEFAULT_REQUIRED_QUIET_MS;
  if (samples.length < 2) return null;
  const confirmed = samples[samples.length - 1];
  if (!confirmed?.ready || !Number.isFinite(confirmed.sampledAt)) return null;
  let stableStartIndex = samples.length - 1;
  while (stableStartIndex > 0) {
    const previous = samples[stableStartIndex - 1];
    const current = samples[stableStartIndex];
    if (
      !Number.isFinite(previous?.sampledAt)
      || previous.sampledAt > current.sampledAt
      || !displayRoutingLayoutVisualSnapshotsMatch(previous, confirmed)
    ) break;
    stableStartIndex -= 1;
  }
  const stableSinceAt = samples[stableStartIndex].sampledAt;
  if (confirmed.sampledAt - stableSinceAt < quietMs) return null;
  return {
    stableSinceAt,
    confirmedAt: confirmed.sampledAt,
    sampleCount: samples.length - stableStartIndex,
  };
};

export const displayRoutingLayoutVisualSnapshotExpression = options => `(() => {
  const boundedCount = ${boundedCount.toString()};
  const fingerprintValues = ${fingerprintValues.toString()};
  const readSnapshot = ${readDisplayRoutingLayoutVisualSnapshot.toString()};
  return readSnapshot(${JSON.stringify(options)});
})()`;

export const waitForStableDisplayRoutingLayoutVisual = async ({
  session,
  expectedRequestId,
  expectedNodeCount,
  expectedEdgeCount,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  requiredQuietMs = DEFAULT_REQUIRED_QUIET_MS,
  now = Date.now,
  wait = delay,
}) => {
  if (!session || typeof session.evaluate !== 'function') {
    throw new Error('A browser session is required to verify layout visual stability');
  }
  if (typeof expectedRequestId !== 'string' || expectedRequestId.length === 0) {
    throw new Error('A committed layout request id is required to verify visual stability');
  }
  if (boundedCount(expectedNodeCount) === null || boundedCount(expectedEdgeCount) === null) {
    throw new Error('Finite expected layout node and edge counts are required');
  }
  const boundedTimeoutMs = resolveDisplayRoutingLayoutVisualTimeoutMs(timeoutMs);
  const boundedSampleIntervalMs = Number.isFinite(sampleIntervalMs)
    ? Math.max(16, Math.min(250, sampleIntervalMs))
    : DEFAULT_SAMPLE_INTERVAL_MS;
  const expression = displayRoutingLayoutVisualSnapshotExpression({
    expectedRequestId,
    expectedNodeCount,
    expectedEdgeCount,
  });
  const deadline = now() + boundedTimeoutMs;
  const samples = [];
  let latest = null;
  while (now() < deadline) {
    latest = await session.evaluate(expression);
    samples.push(latest);
    if (samples.length > MAX_SAMPLES) samples.shift();
    const proof = resolveDisplayRoutingLayoutVisualStability(samples, requiredQuietMs);
    if (proof) return { ...proof, snapshot: latest };
    await wait(boundedSampleIntervalMs);
  }
  throw new Error(
    `Timed out waiting for layout visual stability\n${JSON.stringify(latest, null, 2)}`,
  );
};
