/** Bounded browser-local observation. Only aggregate numbers leave the page. */
export const createEditProcessSampler = ({ read, now, requestFrame, cancelFrame, setTimer, clearTimer }) => {
  const started = now();
  const moved = new Set();
  let baseline;
  let frame;
  let timer;
  let previous = started;
  const result = { status: 'running', readMode: 'computed-node-transform', sampleCount: 0, monitoredNodeCount: 0,
    maxNodeDisplacement: 0, movedNodeCount: 0, maxSampleGapMs: 0, measurementMs: 0,
    readMs: 0, comparisonMs: 0, maxSampleMs: 0, initialMs: 0, finalMs: 0, frameMs: 0, frameCount: 0, elapsedMs: 0 };
  const finish = status => {
    if (result.status === 'running') { result.status = status; result.elapsedMs = Math.max(0, now() - started); }
    cancelFrame(frame);
    clearTimer(timer);
    return { ...result };
  };
  const sample = phase => {
    const begin = now();
    let readFinished = begin;
    try {
      let points;
      try { points = read(phase); } finally { readFinished = now(); }
      if (!Array.isArray(points) || points.length === 0 || points.length > 256) throw new Error();
      const current = new Map();
      for (const point of points) {
        if (typeof point?.id !== 'string' || !point.id || point.id.length > 512 || current.has(point.id)
          || !Number.isFinite(point.x) || !Number.isFinite(point.y)
          || Math.abs(point.x) > 10_000_000 || Math.abs(point.y) > 10_000_000) throw new Error();
        current.set(point.id, { x: point.x, y: point.y });
      }
      if (!baseline) { baseline = current; result.monitoredNodeCount = current.size; }
      if (current.size !== baseline.size) throw new Error();
      for (const [id, original] of baseline) {
        const point = current.get(id);
        if (!point) throw new Error();
        const displacement = Math.hypot(point.x - original.x, point.y - original.y);
        result.maxNodeDisplacement = Math.max(result.maxNodeDisplacement, displacement);
        if (displacement > 0.01) moved.add(id);
      }
      result.sampleCount += 1;
      result.movedNodeCount = moved.size;
      result.maxSampleGapMs = Math.max(result.maxSampleGapMs, begin - previous);
      previous = begin;
    } catch { finish('unavailable'); }
    const end = now();
    result.readMs += Math.max(0, readFinished - begin);
    result.comparisonMs += Math.max(0, end - readFinished);
    result.measurementMs += Math.max(0, end - begin);
    result.maxSampleMs = Math.max(result.maxSampleMs, end - begin);
    result[phase] += Math.max(0, end - begin);
    if (phase === 'frameMs') result.frameCount += 1;
  };
  const tick = () => {
    if (result.status !== 'running') return;
    sample('frameMs');
    if (result.sampleCount >= 240) finish('sample-limit');
    if (result.status === 'running') frame = requestFrame(tick);
  };
  sample('initialMs');
  if (result.status === 'running') {
    frame = requestFrame(tick);
    timer = setTimer(() => finish('time-limit'), 10_000);
  }
  return { stop: () => {
    if (result.status === 'running') sample('finalMs');
    return finish('completed');
  } };
};

export const readEditProcessDomPoints = editedNodeId => {
  // React Flow publishes absolute canvas positions as sibling node transforms.
  // Read resolved CSS (including transform transitions), without forcing layout
  // through getBoundingClientRect for every node in every animation frame.
  const elements = document.querySelectorAll('.react-flow__node[data-id]');
  if (elements.length > 257) return null;
  return [...elements].filter(element => element.getAttribute('data-id') !== editedNodeId).map(element => {
    if (element.parentElement?.closest('.react-flow__node')) throw new Error('Nested node DOM unsupported');
    const style = getComputedStyle(element);
    if (['translate', 'rotate', 'scale', 'offsetPath'].some(key => style[key] && style[key] !== 'none')) {
      throw new Error('Independent node transform unsupported');
    }
    const transform = new DOMMatrix(style.transform);
    if (!transform.is2D || transform.a !== 1 || transform.d !== 1 || transform.b !== 0 || transform.c !== 0
      || style.left !== '0px' || style.top !== '0px') throw new Error('Node placement unsupported');
    const point = { id: element.getAttribute('data-id'), x: transform.e, y: transform.f };
    return point;
  });
};

export const startEditProcessSampling = (session, editedNodeId) => session.evaluate(`(() => {
  window.__vizlyEditProcessSampler?.stop();
  const read = ${readEditProcessDomPoints.toString()};
  window.__vizlyEditProcessSampler = (${createEditProcessSampler.toString()})({
    read: () => read(${JSON.stringify(editedNodeId)}), now: () => performance.now(),
    requestFrame: callback => {
      const handle = { frame: null, task: null };
      handle.frame = requestAnimationFrame(() => { handle.task = setTimeout(callback, 0); });
      return handle;
    },
    cancelFrame: handle => { if (handle) { cancelAnimationFrame(handle.frame); clearTimeout(handle.task); } },
    setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: id => clearTimeout(id),
  });
})()`);

export const projectEditProcessReport = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !['completed', 'sample-limit', 'time-limit', 'unavailable'].includes(value.status)
    || value.readMode !== 'computed-node-transform') return null;
  const result = { status: value.status, readMode: value.readMode };
  for (const key of ['sampleCount', 'monitoredNodeCount', 'movedNodeCount', 'maxNodeDisplacement',
    'maxSampleGapMs', 'measurementMs', 'readMs', 'comparisonMs', 'maxSampleMs', 'initialMs', 'finalMs', 'frameMs', 'frameCount', 'elapsedMs']) {
    const number = value[key];
    const count = ['sampleCount', 'monitoredNodeCount', 'movedNodeCount', 'frameCount'].includes(key);
    if (!Number.isFinite(number) || number < 0 || (count && (!Number.isSafeInteger(number) || number > 256))) return null;
    result[key] = number;
  }
  return result;
};

export const stopEditProcessSampling = async session => projectEditProcessReport(await session.evaluate(`(() => {
  try { return window.__vizlyEditProcessSampler?.stop() ?? null; }
  finally { delete window.__vizlyEditProcessSampler; }
})()`));
