import { replayDisplayRoutingResponseEdges, selectDisplayRoutingAuditRoute } from './display-routing-browser-geometry.mjs';

/** Compare committed route snapshots in diagram coordinates. Kept self-contained
 * for browser injection: graph content stays in the page; only aggregates leave.
 * Unrelated edges have neither endpoint in the explicitly edited node set.
 */
export const measureDisplayRoutingEditStability = (before, after, editedNodeIds, excludedEdgeIds = [], comparison = 'routes') => {
  const invalid = () => { throw new Error('Invalid edit stability snapshot'); };
  if (comparison !== 'routes' && comparison !== 'topology') invalid();
  const compareRoutes = comparison === 'routes';
  const list = (value, limit) => {
    if (!Array.isArray(value) || value.length > limit) invalid();
    return value;
  };
  const id = value => {
    if (typeof value !== 'string' || !value.length || value.length > 512) invalid();
    return value;
  };
  const number = value => {
    if (!Number.isFinite(value) || Math.abs(value) > 10_000_000) invalid();
    return value;
  };
  const point = value => ({ x: number(value?.x), y: number(value?.y) });
  const parse = value => {
    const nodes = new Map();
    for (const node of list(value?.nodes, 5_000)) {
      const key = id(node?.id);
      if (nodes.has(key)) invalid();
      nodes.set(key, { position: point(node.position), parent: node.parentId == null ? null : id(node.parentId) });
    }
    const absolute = new Map();
    // Iterative ancestry walk bounds work and rejects cycles/missing parents.
    for (const key of nodes.keys()) {
      const chain = [];
      const seen = new Set();
      let current = key;
      while (current !== null && !absolute.has(current)) {
        if (seen.has(current) || !nodes.has(current) || chain.length >= 128) invalid();
        seen.add(current);
        chain.push(current);
        current = nodes.get(current).parent;
      }
      let position = current === null ? { x: 0, y: 0 } : absolute.get(current);
      for (const child of chain.reverse()) {
        const local = nodes.get(child).position;
        position = point({ x: position.x + local.x, y: position.y + local.y });
        absolute.set(child, position);
      }
    }
    const edges = new Map();
    for (const edge of list(value?.edges, 5_000)) {
      const key = id(edge?.id);
      const source = id(edge.source);
      const target = id(edge.target);
      if (edges.has(key) || !nodes.has(source) || !nodes.has(target)) invalid();
      const path = compareRoutes ? list(edge.data?.computedPath, 512).map(point) : null;
      if (compareRoutes && path.length < 2) invalid();
      const handle = value => value == null ? null : id(value);
      edges.set(key, { source, target, path,
        sourceHandle: compareRoutes ? handle(edge.sourceHandle) : null,
        targetHandle: compareRoutes ? handle(edge.targetHandle) : null });
    }
    return { nodes: absolute, edges };
  };
  const first = parse(before);
  const last = parse(after);
  const edited = new Set(list(editedNodeIds, 5_000).map(id));
  const excludedEdges = new Set(list(excludedEdgeIds, 5_000).map(id));
  for (const key of excludedEdges) if (!first.edges.has(key) && !last.edges.has(key)) invalid();
  for (const key of edited) if (!first.nodes.has(key) && !last.nodes.has(key)) invalid();
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pathLength = path => path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0);
  // Remove exact duplicate points and forward collinear subdivisions only.
  // Preserve reversals: retracing a corridor is a real route change.
  const canonicalPath = path => {
    const result = [];
    for (const p of path) {
      const previous = result.at(-1);
      if (previous && previous.x === p.x && previous.y === p.y) continue;
      while (result.length >= 2) {
        const a = result.at(-2);
        const b = result.at(-1);
        const ab = { x: b.x - a.x, y: b.y - a.y };
        const bp = { x: p.x - b.x, y: p.y - b.y };
        if (ab.x * bp.y !== ab.y * bp.x || ab.x * bp.x + ab.y * bp.y < 0) break;
        result.pop();
      }
      result.push(p);
    }
    return result;
  };
  const pathsDiffer = (a, b) => a.length !== b.length
    || a.some((p, i) => distance(p, b[i]) > 0.01);
  const bends = path => {
    let count = 0;
    let previous = null;
    for (let i = 1; i < path.length; i += 1) {
      const x = path[i].x - path[i - 1].x;
      const y = path[i].y - path[i - 1].y;
      const length = Math.hypot(x, y);
      if (length === 0) continue;
      const direction = { x: x / length, y: y / length };
      if (previous && distance(previous, direction) > 1e-6) count += 1;
      previous = direction;
    }
    return count;
  };
  const added = (a, b) => [...b.keys()].filter(key => !a.has(key)).length;
  const result = {
    comparedNodeCount: 0, movedNodeCount: 0, totalNodeDisplacement: 0, maxNodeDisplacement: 0,
    comparedEdgeCount: 0, changedPortCount: 0, changedPathCount: 0, changedGeometryCount: 0,
    beforePathLength: 0, afterPathLength: 0, beforeBendCount: 0, afterBendCount: 0,
    addedNodeCount: added(first.nodes, last.nodes), removedNodeCount: added(last.nodes, first.nodes),
    addedEdgeCount: added(first.edges, last.edges), removedEdgeCount: added(last.edges, first.edges),
    rewiredEdgeCount: 0,
  };
  for (const [key, position] of first.nodes) {
    if (edited.has(key) || !last.nodes.has(key)) continue;
    const delta = distance(position, last.nodes.get(key));
    result.comparedNodeCount += 1;
    if (delta > 0.01) result.movedNodeCount += 1;
    result.totalNodeDisplacement += delta;
    result.maxNodeDisplacement = Math.max(result.maxNodeDisplacement, delta);
  }
  for (const [key, edge] of first.edges) {
    const next = last.edges.get(key);
    if (!next) continue;
    if (edge.source !== next.source || edge.target !== next.target) {
      result.rewiredEdgeCount += 1;
      continue;
    }
    if (edited.has(edge.source) || edited.has(edge.target) || excludedEdges.has(key)) continue;
    result.comparedEdgeCount += 1;
    if (!compareRoutes) continue;
    if (edge.sourceHandle !== next.sourceHandle || edge.targetHandle !== next.targetHandle) {
      result.changedPortCount += 1;
    }
    if (pathsDiffer(edge.path, next.path)) {
      result.changedPathCount += 1;
      if (pathsDiffer(canonicalPath(edge.path), canonicalPath(next.path))) result.changedGeometryCount += 1;
    }
    result.beforePathLength += pathLength(edge.path);
    result.afterPathLength += pathLength(next.path);
    result.beforeBendCount += bends(edge.path);
    result.afterBendCount += bends(next.path);
  }
  if (!compareRoutes) {
    // Missing route evidence is not zero route change. Omit these metrics so
    // the full-route projector continues to reject topology-only observations.
    for (const key of ['changedPortCount', 'changedPathCount', 'changedGeometryCount',
      'beforePathLength', 'afterPathLength', 'beforeBendCount', 'afterBendCount']) delete result[key];
  }
  return result;
};

const snapshotExpression = `(() => {
  const replay = ${replayDisplayRoutingResponseEdges.toString()};
  const select = ${selectDisplayRoutingAuditRoute.toString()};
  const edges = window.reactFlowInstance?.getEdges?.();
  const nodes = window.reactFlowInstance?.getNodes?.();
  const route = select(window.__vizlyRoutingResponses, window.__vizlyRoutingRequests,
    window.__vizlyBaseReactFlowDisplayRouting?.requestId, replay, edges?.length);
  if (!route || !Array.isArray(nodes)) throw new Error('Edit stability route unavailable');
  return { nodes, edges: route.edges };
})()`;

export const captureDisplayRoutingEditBaseline = session => session.evaluate(`(() => {
  const measure = ${measureDisplayRoutingEditStability.toString()};
  const snapshot = ${snapshotExpression};
  measure(snapshot, snapshot, []);
  window.__vizlyEditStabilityBaseline = {
    nodes: snapshot.nodes.map(node => ({ id: node.id, parentId: node.parentId,
      position: { x: node.position.x, y: node.position.y } })),
    edges: snapshot.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target,
      sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle,
      data: { computedPath: edge.data.computedPath.map(point => ({ x: point.x, y: point.y })) } })),
  };
  return true;
})()`);

export const readDisplayRoutingEditStability = (session, editedNodeIds) => session.evaluate(`(() => {
  const measure = ${measureDisplayRoutingEditStability.toString()};
  try {
    return measure(window.__vizlyEditStabilityBaseline, ${snapshotExpression}, ${JSON.stringify(editedNodeIds)});
  } finally {
    delete window.__vizlyEditStabilityBaseline;
  }
})()`);

const METRICS = Object.freeze([
  'comparedNodeCount', 'movedNodeCount', 'totalNodeDisplacement', 'maxNodeDisplacement',
  'comparedEdgeCount', 'changedPortCount', 'changedPathCount', 'changedGeometryCount', 'beforePathLength',
  'afterPathLength', 'beforeBendCount', 'afterBendCount', 'addedNodeCount',
  'removedNodeCount', 'addedEdgeCount', 'removedEdgeCount', 'rewiredEdgeCount',
]);

const TOPOLOGY_METRICS = Object.freeze(['comparedNodeCount', 'movedNodeCount',
  'totalNodeDisplacement', 'maxNodeDisplacement', 'comparedEdgeCount',
  'addedNodeCount', 'removedNodeCount', 'addedEdgeCount', 'removedEdgeCount', 'rewiredEdgeCount']);

const DERIVED_METRICS = Object.freeze([
  'meanNodeDisplacement', 'movedNodeRatio', 'changedPortRatio',
  'changedPathRatio', 'changedGeometryRatio', 'routeLengthDelta',
  'routeLengthDeltaRatio', 'bendDelta', 'bendDeltaRatio',
]);

const ratio = (numerator, denominator) => denominator > 0 ? numerator / denominator : 0;

const deriveDisplayRoutingEditStability = sample => {
  const routeLengthDelta = sample.afterPathLength - sample.beforePathLength;
  const bendDelta = sample.afterBendCount - sample.beforeBendCount;
  return {
    meanNodeDisplacement: ratio(sample.totalNodeDisplacement, sample.comparedNodeCount),
    movedNodeRatio: ratio(sample.movedNodeCount, sample.comparedNodeCount),
    changedPortRatio: ratio(sample.changedPortCount, sample.comparedEdgeCount),
    changedPathRatio: ratio(sample.changedPathCount, sample.comparedEdgeCount),
    changedGeometryRatio: ratio(sample.changedGeometryCount, sample.comparedEdgeCount),
    routeLengthDelta,
    routeLengthDeltaRatio: sample.beforePathLength > 0 ? routeLengthDelta / sample.beforePathLength
      : sample.afterPathLength > 0 ? 1 : 0,
    bendDelta,
    bendDeltaRatio: sample.beforeBendCount > 0 ? bendDelta / sample.beforeBendCount
      : sample.afterBendCount > 0 ? 1 : 0,
  };
};

const summarizeFiniteValues = (samples, keys) => Object.fromEntries(keys.map(key => {
  const sorted = samples.map(sample => sample[key]).sort((a, b) => a - b);
  if (sorted.some(value => !Number.isFinite(value) || Math.abs(value) > 1e15)) {
    throw new Error('Invalid edit stability samples');
  }
  return [key, { min: sorted[0], max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1] }];
}));

export const projectDisplayRoutingTopologyStability = value => {
  if (!value || TOPOLOGY_METRICS.some(key => !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1e15
    || (key.endsWith('Count') && !Number.isSafeInteger(value[key])))) return null;
  if (value.movedNodeCount > value.comparedNodeCount
    || value.maxNodeDisplacement > value.totalNodeDisplacement) return null;
  return Object.fromEntries(TOPOLOGY_METRICS.map(key => [key, value[key]]));
};

export const projectDisplayRoutingEditStability = value => {
  if (!value || METRICS.some(key => !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 1e15
    || (key.endsWith('Count') && !Number.isSafeInteger(value[key])))) {
    return null;
  }
  if (value.movedNodeCount > value.comparedNodeCount
    || value.changedPortCount > value.comparedEdgeCount
    || value.changedPathCount > value.comparedEdgeCount
    || value.changedGeometryCount > value.changedPathCount
    || value.maxNodeDisplacement > value.totalNodeDisplacement) return null;
  return Object.fromEntries(METRICS.map(key => [key, value[key]]));
};

export const summarizeDisplayRoutingEditStability = values => {
  if (!Array.isArray(values) || !values.length || values.length > 100) {
    throw new Error('Invalid edit stability samples');
  }
  const samples = values.map(projectDisplayRoutingEditStability);
  if (samples.some(value => value === null)) throw new Error('Incomplete edit stability samples');
  const derived = samples.map(deriveDisplayRoutingEditStability);
  return {
    sampleCount: samples.length,
    metrics: summarizeFiniteValues(samples, METRICS),
    derived: summarizeFiniteValues(derived, DERIVED_METRICS),
  };
};
