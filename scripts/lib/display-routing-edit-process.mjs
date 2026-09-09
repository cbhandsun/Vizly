/** Bounded browser-local observation. Only aggregate numbers leave the page. */
export const createEditProcessSampler = ({ read, now, requestFrame, cancelFrame, setTimer, clearTimer, dispose = () => {} }) => {
  const started = now();
  const moved = new Set();
  const movedLabels = new Set();
  let baseline;
  let previousRoutes;
  let previousLabels;
  let lastChangeAt = started;
  let frame;
  let timer;
  let previous = started;
  const result = { status: 'running', readMode: 'computed-node-transform+rendered-route-label', sampleCount: 0, monitoredNodeCount: 0,
    monitoredRouteCount: 0, monitoredLabelCount: 0,
    maxNodeDisplacement: 0, movedNodeCount: 0, maxSampleGapMs: 0, measurementMs: 0,
    routePathSwitchCount: 0, portSwitchCount: 0, maxMissingRouteCount: 0,
    routeMissingSampleCount: 0,
    maxLabelDisplacement: 0, movedLabelCount: 0, maxMissingLabelCount: 0,
    labelMissingSampleCount: 0, maxHiddenLabelCount: 0, maxLabelConflictCount: 0,
    finalQuietMs: 0,
    readMs: 0, comparisonMs: 0, maxSampleMs: 0, initialMs: 0, finalMs: 0, frameMs: 0, frameCount: 0, elapsedMs: 0 };
  const finish = status => {
    if (result.status === 'running') {
      const finishedAt = now();
      result.status = status;
      result.elapsedMs = Math.max(0, finishedAt - started);
      result.finalQuietMs = Math.max(0, finishedAt - lastChangeAt);
      dispose();
    }
    cancelFrame(frame);
    clearTimer(timer);
    return { ...result };
  };
  const sample = phase => {
    const begin = now();
    let readFinished = begin;
    try {
      let snapshot;
      try { snapshot = read(phase); } finally { readFinished = now(); }
      const points = Array.isArray(snapshot) ? snapshot : snapshot?.points;
      if (!Array.isArray(points) || points.length === 0 || points.length > 256) throw new Error();
      const current = new Map();
      for (const point of points) {
        if (typeof point?.id !== 'string' || !point.id || point.id.length > 512 || current.has(point.id)
          || !Number.isFinite(point.x) || !Number.isFinite(point.y)
          || Math.abs(point.x) > 10_000_000 || Math.abs(point.y) > 10_000_000) throw new Error();
        current.set(point.id, { x: point.x, y: point.y });
      }
      const routes = Array.isArray(snapshot) ? [] : snapshot?.routes;
      const labels = Array.isArray(snapshot) ? [] : snapshot?.labels;
      if (!Array.isArray(routes) || routes.length > 512 || !Array.isArray(labels) || labels.length > 512) throw new Error();
      const routeMap = new Map();
      for (const route of routes) {
        if (typeof route?.id !== 'string' || !route.id || route.id.length > 512 || routeMap.has(route.id)
          || typeof route.path !== 'string' || route.path.length === 0 || route.path.length > 100_000
          || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,+eE\s-]+$/.test(route.path)
          || ![route.sourceHandle, route.targetHandle].every(value => value === null
            || (typeof value === 'string' && value.length <= 512))) throw new Error();
        routeMap.set(route.id, route);
      }
      const labelMap = new Map();
      for (const label of labels) {
        if (typeof label?.id !== 'string' || !label.id || label.id.length > 512 || labelMap.has(label.id)
          || !Number.isFinite(label.x) || !Number.isFinite(label.y)
          || Math.abs(label.x) > 10_000_000 || Math.abs(label.y) > 10_000_000
          || typeof label.visible !== 'boolean' || !Number.isSafeInteger(label.conflicts)
          || label.conflicts < 0 || label.conflicts > 1_000_000) throw new Error();
        labelMap.set(label.id, label);
      }
      if (!baseline) {
        baseline = { nodes: current, routes: routeMap, labels: labelMap };
        previousRoutes = routeMap;
        previousLabels = labelMap;
        result.monitoredNodeCount = current.size;
        result.monitoredRouteCount = routeMap.size;
        result.monitoredLabelCount = labelMap.size;
      }
      if (current.size !== baseline.nodes.size) throw new Error();
      for (const [id, original] of baseline.nodes) {
        const point = current.get(id);
        if (!point) throw new Error();
        const displacement = Math.hypot(point.x - original.x, point.y - original.y);
        result.maxNodeDisplacement = Math.max(result.maxNodeDisplacement, displacement);
        if (displacement > 0.01) moved.add(id);
      }
      let changed = routeMap.size !== previousRoutes?.size || labelMap.size !== previousLabels?.size;
      const missingRoutes = [...baseline.routes.keys()].filter(id => !routeMap.has(id)).length;
      result.maxMissingRouteCount = Math.max(result.maxMissingRouteCount, missingRoutes);
      if (missingRoutes > 0) result.routeMissingSampleCount += 1;
      for (const [id, route] of routeMap) {
        const prior = previousRoutes?.get(id);
        if (prior?.path !== undefined && prior.path !== route.path) {
          result.routePathSwitchCount += 1;
          changed = true;
        }
        if (prior && (prior.sourceHandle !== route.sourceHandle || prior.targetHandle !== route.targetHandle)) {
          result.portSwitchCount += 1;
          changed = true;
        }
      }
      previousRoutes = routeMap;
      const missingLabels = [...baseline.labels.keys()].filter(id => !labelMap.has(id)).length;
      result.maxMissingLabelCount = Math.max(result.maxMissingLabelCount, missingLabels);
      if (missingLabels > 0) result.labelMissingSampleCount += 1;
      let hiddenLabels = 0, labelConflicts = 0;
      for (const [id, label] of labelMap) {
        if (!label.visible) hiddenLabels += 1;
        labelConflicts += label.conflicts;
        const original = baseline.labels.get(id);
        if (!original) continue;
        const displacement = Math.hypot(label.x - original.x, label.y - original.y);
        result.maxLabelDisplacement = Math.max(result.maxLabelDisplacement, displacement);
        if (displacement > 0.01) movedLabels.add(id);
        const prior = previousLabels?.get(id);
        if (prior && (Math.hypot(label.x - prior.x, label.y - prior.y) > 0.01
          || label.visible !== prior.visible || label.conflicts !== prior.conflicts)) changed = true;
      }
      if (missingRoutes > 0 || missingLabels > 0) changed = true;
      if (changed) lastChangeAt = begin;
      previousLabels = labelMap;
      result.movedLabelCount = movedLabels.size;
      result.maxHiddenLabelCount = Math.max(result.maxHiddenLabelCount, hiddenLabels);
      result.maxLabelConflictCount = Math.max(result.maxLabelConflictCount, labelConflicts);
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

export const readEditProcessDomPoints = (editedNodeId, animatedTransforms = new Set()) => {
  // React Flow publishes absolute canvas positions as sibling node transforms.
  // Read resolved CSS (including transform transitions), without forcing layout
  // through getBoundingClientRect for every node in every animation frame.
  const elements = document.querySelectorAll('.react-flow__node[data-id]');
  if (elements.length > 257) return null;
  return [...elements].filter(element => element.getAttribute('data-id') !== editedNodeId).map(element => {
    if (element.parentElement?.closest('.react-flow__node')) throw new Error('Nested node DOM unsupported');
    const inline = element.style;
    const activeTransformAnimation = animatedTransforms.has(element);
    // React Flow writes ordinary positions inline. Read computed style only
    // while a real transform animation is active or the inline contract is absent.
    const style = activeTransformAnimation || !inline?.transform ? getComputedStyle(element) : inline;
    if (['translate', 'rotate', 'scale', 'offsetPath'].some(key => style[key] && style[key] !== 'none')) {
      throw new Error('Independent node transform unsupported');
    }
    const transform = new DOMMatrix(style.transform);
    if (!transform.is2D || transform.a !== 1 || transform.d !== 1 || transform.b !== 0 || transform.c !== 0
      || (style.left && style.left !== '0px') || (style.top && style.top !== '0px')) throw new Error('Node placement unsupported');
    const point = { id: element.getAttribute('data-id'), x: transform.e, y: transform.f };
    return point;
  });
};

export const parseEditProcessLabelTransform = value => {
  if (typeof value !== 'string' || value.length > 512) return null;
  const number = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)';
  const match = new RegExp(`^translate\\(\\s*-50%\\s*,\\s*-50%\\s*\\)\\s*translate\\(\\s*${number}px\\s*,\\s*${number}px\\s*\\)(?:\\s*scale\\([^\\r\\n]{1,96}\\))?$`, 'i').exec(value);
  if (!match) return null;
  const x = Number(match[1]), y = Number(match[2]);
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) <= 10_000_000 && Math.abs(y) <= 10_000_000
    ? { x, y } : null;
};

export const parseEditProcessSvgLabelTransform = (value, bounds) => {
  if (typeof value !== 'string' || value.length > 512 || !bounds || typeof bounds !== 'object') return null;
  const number = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)';
  const match = new RegExp(`^translate\\(\\s*${number}(?:\\s*,\\s*|\\s+)${number}\\s*\\)$`, 'i').exec(value);
  const values = [match?.[1], match?.[2], bounds.x, bounds.y, bounds.width, bounds.height].map(Number);
  if (!match || !values.every(Number.isFinite) || values.some(numberValue => Math.abs(numberValue) > 10_000_000)
    || values[4] < 0 || values[5] < 0) return null;
  return { x: values[0] + values[2] + values[4] / 2, y: values[1] + values[3] + values[5] / 2 };
};

export const readEditProcessDomSnapshot = (editedNodeId, animatedTransforms = new Set()) => {
  const points = readEditProcessDomPoints(editedNodeId, animatedTransforms);
  const instanceEdges = window.reactFlowInstance?.getEdges?.();
  const wrappers = [...document.querySelectorAll('.react-flow__edge[data-id]')];
  const customLabelElements = [...document.querySelectorAll('[data-edge-id][data-edge-label-placement]')];
  const fallbackLabelElements = [...document.querySelectorAll('.react-flow__edge-textwrapper')];
  if (!Array.isArray(points) || !Array.isArray(instanceEdges) || instanceEdges.length > 512
    || wrappers.length > 512 || customLabelElements.length + fallbackLabelElements.length > 512) return null;
  const edgeById = new Map(instanceEdges.map(edge => [edge.id, edge]));
  const routes = wrappers.map(wrapper => {
    const id = wrapper.getAttribute('data-id');
    const edge = edgeById.get(id);
    const path = wrapper.querySelector('.shared-trunk-edge-interaction')
      ?? wrapper.querySelector('.shared-trunk-accent-trace')
      ?? wrapper.querySelector('.react-flow__edge-path');
    return { id, path: path?.getAttribute('d'),
      sourceHandle: edge?.sourceHandle ?? null, targetHandle: edge?.targetHandle ?? null };
  });
  const labelsById = new Map();
  for (const element of customLabelElements) {
    const position = parseEditProcessLabelTransform(element.style?.transform);
    const conflicts = Number(element.getAttribute('data-edge-label-conflicts') ?? 0);
    const label = { id: element.getAttribute('data-edge-id'), x: position?.x, y: position?.y,
      visible: !element.hidden && element.getAttribute('aria-hidden') !== 'true'
        && element.style?.display !== 'none' && element.style?.visibility !== 'hidden'
        && Number(element.style?.opacity || 1) > 0,
      conflicts };
    labelsById.set(label.id, label);
  }
  for (const element of fallbackLabelElements) {
    const wrapper = element.closest?.('.react-flow__edge[data-id]');
    const id = wrapper?.getAttribute('data-id');
    if (labelsById.has(id)) continue;
    const background = element.querySelector('.react-flow__edge-textbg');
    const text = element.querySelector('.react-flow__edge-text');
    const position = parseEditProcessSvgLabelTransform(element.getAttribute('transform'), {
      x: background?.getAttribute('x'), y: background?.getAttribute('y'),
      width: background?.getAttribute('width'), height: background?.getAttribute('height'),
    });
    const style = text ? getComputedStyle(text) : null;
    labelsById.set(id, { id, x: position?.x, y: position?.y,
      visible: element.getAttribute('visibility') !== 'hidden' && Boolean(text)
        && style?.display !== 'none' && style?.visibility !== 'hidden' && Number(style?.opacity || 1) > 0,
      conflicts: 0 });
  }
  return { points, routes, labels: [...labelsById.values()] };
};

export const startEditProcessSampling = (session, editedNodeId) => session.evaluate(`(() => {
  window.__vizlyEditProcessSampler?.stop();
  const readEditProcessDomPoints = ${readEditProcessDomPoints.toString()};
  const parseEditProcessLabelTransform = ${parseEditProcessLabelTransform.toString()};
  const parseEditProcessSvgLabelTransform = ${parseEditProcessSvgLabelTransform.toString()};
  const read = ${readEditProcessDomSnapshot.toString()};
  const animatedTransforms = new Set();
  const nodeTarget = event => event.target?.closest?.('.react-flow__node[data-id]') ?? null;
  const animationStarted = event => {
    if (event.type === 'transitionrun' && event.propertyName !== 'transform') return;
    const target = nodeTarget(event);
    if (target) animatedTransforms.add(target);
  };
  const animationFinished = event => {
    if (event.type === 'transitionend' && event.propertyName !== 'transform') return;
    const target = nodeTarget(event);
    if (target) animatedTransforms.delete(target);
  };
  for (const type of ['transitionrun', 'animationstart']) document.addEventListener(type, animationStarted, true);
  for (const type of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) {
    document.addEventListener(type, animationFinished, true);
  }
  const dispose = () => {
    for (const type of ['transitionrun', 'animationstart']) document.removeEventListener(type, animationStarted, true);
    for (const type of ['transitionend', 'transitioncancel', 'animationend', 'animationcancel']) {
      document.removeEventListener(type, animationFinished, true);
    }
    animatedTransforms.clear();
  };
  window.__vizlyEditProcessSampler = (${createEditProcessSampler.toString()})({
    read: () => read(${JSON.stringify(editedNodeId)}, animatedTransforms), now: () => performance.now(), dispose,
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
    || value.readMode !== 'computed-node-transform+rendered-route-label') return null;
  const result = { status: value.status, readMode: value.readMode };
  for (const key of ['sampleCount', 'monitoredNodeCount', 'monitoredRouteCount', 'monitoredLabelCount',
    'movedNodeCount', 'maxNodeDisplacement', 'routePathSwitchCount', 'portSwitchCount', 'maxMissingRouteCount',
    'routeMissingSampleCount', 'maxLabelDisplacement', 'movedLabelCount', 'maxMissingLabelCount',
    'labelMissingSampleCount', 'maxHiddenLabelCount', 'maxLabelConflictCount', 'finalQuietMs',
    'maxSampleGapMs', 'measurementMs', 'readMs', 'comparisonMs', 'maxSampleMs', 'initialMs', 'finalMs', 'frameMs', 'frameCount', 'elapsedMs']) {
    const number = value[key];
    const count = ['sampleCount', 'monitoredNodeCount', 'monitoredRouteCount', 'monitoredLabelCount',
      'movedNodeCount', 'routePathSwitchCount', 'portSwitchCount', 'maxMissingRouteCount',
      'routeMissingSampleCount', 'movedLabelCount', 'maxMissingLabelCount', 'labelMissingSampleCount',
      'maxHiddenLabelCount', 'maxLabelConflictCount', 'frameCount'].includes(key);
    const smallStructuralCount = ['sampleCount', 'monitoredNodeCount',
      'movedNodeCount', 'frameCount'].includes(key);
    const largeStructuralCount = ['monitoredRouteCount', 'monitoredLabelCount', 'movedLabelCount'].includes(key);
    const countLimit = smallStructuralCount ? 256 : largeStructuralCount ? 512 : 1_000_000;
    if (!Number.isFinite(number) || number < 0
      || (count && (!Number.isSafeInteger(number) || number > countLimit))) return null;
    result[key] = number;
  }
  return result;
};

export const stopEditProcessSampling = async session => projectEditProcessReport(await session.evaluate(`(() => {
  try { return window.__vizlyEditProcessSampler?.stop() ?? null; }
  finally { delete window.__vizlyEditProcessSampler; }
})()`));
