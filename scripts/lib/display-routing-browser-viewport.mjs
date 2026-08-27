import { setTimeout as delay } from 'node:timers/promises';

export const readDisplayRoutingNodeDragTarget = (nodeId) => {
  if (typeof nodeId !== 'string' || nodeId.length === 0 || nodeId.length > 500) return null;
  const element = [...document.querySelectorAll('.react-flow__node[data-id]')]
    .find(candidate => candidate.getAttribute('data-id') === nodeId);
  const pane = document.querySelector('.react-flow__pane');
  if (!element || !pane) return null;
  const bounds = element.getBoundingClientRect();
  const paneBounds = pane.getBoundingClientRect();
  const values = [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    paneBounds.left,
    paneBounds.top,
    paneBounds.right,
    paneBounds.bottom,
  ];
  if (!values.every(Number.isFinite) || bounds.width <= 1 || bounds.height <= 1) return null;

  const ratios = [0.5, 0.35, 0.65, 0.2, 0.8];
  for (const yRatio of ratios) {
    for (const xRatio of ratios) {
      const x = bounds.x + bounds.width * xRatio;
      const y = bounds.y + bounds.height * yRatio;
      if (
        x < paneBounds.left
        || x > paneBounds.right
        || y < paneBounds.top
        || y > paneBounds.bottom
      ) continue;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === element || element.contains(hit))) return { x, y };
    }
  }
  return null;
};

export const readDisplayRoutingViewportSnapshot = () => {
  const viewport = window.reactFlowInstance?.getViewport?.();
  const x = Number(viewport?.x);
  const y = Number(viewport?.y);
  const zoom = Number(viewport?.zoom);
  return [x, y, zoom].every(Number.isFinite)
    && Math.abs(x) <= 10_000_000
    && Math.abs(y) <= 10_000_000
    && zoom >= 0.05
    && zoom <= 8
    ? { x, y, zoom }
    : null;
};

export const displayRoutingViewportSamplesAreStable = (
  samplesValue,
  requiredQuietMs = 250,
) => {
  const samples = Array.isArray(samplesValue) ? samplesValue : [];
  const quietMs = Number.isFinite(requiredQuietMs)
    ? Math.max(100, Math.min(2_000, requiredQuietMs))
    : 250;
  if (samples.length < 2 || !samples.every(sample => (
    sample
    && Number.isFinite(sample.x)
    && Number.isFinite(sample.y)
    && Number.isFinite(sample.zoom)
    && Number.isFinite(sample.sampledAt)
  ))) return false;
  const reference = samples[samples.length - 1];
  const referenceHasTarget = Number.isFinite(reference.targetX)
    && Number.isFinite(reference.targetY);
  let stableStartIndex = samples.length - 1;
  while (stableStartIndex > 0) {
    const sample = samples[stableStartIndex - 1];
    const sampleHasTarget = Number.isFinite(sample.targetX)
      && Number.isFinite(sample.targetY);
    if (
      sample.sampledAt > samples[stableStartIndex].sampledAt
      || sampleHasTarget !== referenceHasTarget
      || Math.abs(sample.x - reference.x) > 0.05
      || Math.abs(sample.y - reference.y) > 0.05
      || Math.abs(sample.zoom - reference.zoom) > 0.0001
      || (referenceHasTarget && (
        Math.abs(sample.targetX - reference.targetX) > 0.05
        || Math.abs(sample.targetY - reference.targetY) > 0.05
      ))
    ) break;
    stableStartIndex -= 1;
  }
  return reference.sampledAt - samples[stableStartIndex].sampledAt >= quietMs;
};

export const displayRoutingViewportSnapshotsMatch = (left, right) => Boolean(
  left
  && right
  && [left.x, left.y, left.zoom, right.x, right.y, right.zoom].every(Number.isFinite)
  && Math.abs(left.x - right.x) <= 0.05
  && Math.abs(left.y - right.y) <= 0.05
  && Math.abs(left.zoom - right.zoom) <= 0.0001
);

export const displayRoutingDragSnapshotExpression = nodeId => `(() => {
  const readViewport = ${readDisplayRoutingViewportSnapshot.toString()};
  const readNodeDragTarget = ${readDisplayRoutingNodeDragTarget.toString()};
  return {
    viewport: readViewport(),
    target: readNodeDragTarget(${JSON.stringify(nodeId)}),
  };
})()`;

export const waitForStableDisplayRoutingViewport = async (
  session,
  nodeId,
  timeoutMs = 3_000,
) => {
  const deadline = Date.now() + timeoutMs;
  const samples = [];
  const expression = displayRoutingDragSnapshotExpression(nodeId);
  while (Date.now() < deadline) {
    const snapshot = await session.evaluate(expression);
    if (!snapshot?.viewport) {
      samples.length = 0;
      await delay(34);
      continue;
    }
    samples.push({
      ...snapshot.viewport,
      ...(snapshot.target ? { targetX: snapshot.target.x, targetY: snapshot.target.y } : {}),
      sampledAt: Date.now(),
    });
    if (samples.length > 128) samples.shift();
    if (displayRoutingViewportSamplesAreStable(samples, 250)) return snapshot;
    await delay(34);
  }
  throw new Error('Timed out waiting for the display routing viewport to stabilize');
};
