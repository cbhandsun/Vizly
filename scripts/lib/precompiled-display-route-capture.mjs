/**
 * Generation accepts one final hard-clean route/validate response. A standalone
 * later `:repair` response remains invalid because it has a different request
 * identity; an in-job full-route repair is represented by one final response.
 */
export const isFreshFullRouteResolution = value => (
  value === 'full-route' || value === 'full-route-repaired'
);

export const isFreshFullRouteRequestResponse = (request, response) => (
  Boolean(request)
  && typeof request === 'object'
  && request.operation === 'route'
  && !Array.isArray(request.candidateEdges)
  && (
    response?.routeResolution === 'full-route'
    || response?.routeResolution === 'full-route-repaired'
  )
);

export const isMatchingHardCleanDisplayWorkerResponse = (request, response) => (
  Boolean(request)
  && typeof request === 'object'
  && (request.operation === 'route' || request.operation === 'validate-or-route')
  && typeof request.requestId === 'string'
  && request.requestId.length > 0
  && Array.isArray(request.edges)
  && Boolean(response)
  && typeof response === 'object'
  && response.requestId === request.requestId
  && response.hardClean === true
  && (
    response.routeResolution === 'validated-candidate'
    || response.routeResolution === 'repaired-candidate'
    || response.routeResolution === 'full-route'
    || response.routeResolution === 'full-route-repaired'
  )
  && Array.isArray(response.edges)
  && response.edges.length === request.edges.length
);

export const createPrecompiledDisplayRoutePatches = (sourceEdges, routedEdges) => {
  let totalPathPoints = 0;
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const isIdentifier = value => typeof value === 'string' && value.length > 0 && value.length <= 500;
  const copyToken = value => (
    value == null || (typeof value === 'string' && value.length <= 500)
      ? value
      : Symbol.for('invalid-precompiled-route-token')
  );
  const copyPath = (value, required) => {
    if (!Array.isArray(value) || value.length > 2_000 || (required && value.length < 2)) return null;
    totalPathPoints += value.length;
    if (totalPathPoints > 200_000) return null;
    const path = [];
    for (const point of value) {
      if (
        !isRecord(point)
        || !Object.keys(point).every(key => key === 'x' || key === 'y')
        || typeof point.x !== 'number'
        || !Number.isFinite(point.x)
        || Math.abs(point.x) > 1_000_000_000
        || typeof point.y !== 'number'
        || !Number.isFinite(point.y)
        || Math.abs(point.y) > 1_000_000_000
      ) return null;
      path.push({ x: point.x, y: point.y });
    }
    return path;
  };

  if (!Array.isArray(sourceEdges) || !Array.isArray(routedEdges) || sourceEdges.length !== routedEdges.length) {
    return null;
  }
  const patches = [];
  for (let index = 0; index < routedEdges.length; index += 1) {
    const source = sourceEdges[index];
    const routed = routedEdges[index];
    if (
      !isRecord(source)
      || !isRecord(routed)
      || !isIdentifier(routed.id)
      || !isIdentifier(routed.source)
      || !isIdentifier(routed.target)
      || routed.id !== source.id
      || routed.source !== source.source
      || routed.target !== source.target
    ) return null;
    const patch = { id: routed.id, source: routed.source, target: routed.target };
    for (const key of ['type', 'sourceHandle', 'targetHandle']) {
      if (routed[key] == null) {
        if (source[key] != null) return null;
        continue;
      }
      const token = copyToken(routed[key]);
      if (typeof token === 'symbol') return null;
      if (key === 'type' && token !== source.type && token !== 'stablePath') return null;
      // Worker requests are projected before routing, while runtime replay is
      // merged over the unprojected business edge. Persist the complete
      // rendered terminal/type contract so a candidate does not depend on
      // projection-only defaults that are absent from the source diagram.
      patch[key] = token;
    }
    const sourceData = isRecord(source.data) ? source.data : {};
    const routedData = isRecord(routed.data) ? routed.data : null;
    if (!routedData) return null;
    const data = {};
    const computedPath = copyPath(routedData.computedPath, true);
    if (!computedPath) return null;
    data.computedPath = computedPath;
    if (typeof routedData.h !== 'undefined') {
      if (typeof routedData.h !== 'string' || routedData.h.length > 128) return null;
      data.h = routedData.h;
    } else if (typeof sourceData.h !== 'undefined') {
      return null;
    }
    if (typeof routedData.elkPath !== 'undefined') {
      const elkPath = copyPath(routedData.elkPath, false);
      if (!elkPath) return null;
      data.elkPath = elkPath;
    } else if (typeof sourceData.elkPath !== 'undefined') {
      return null;
    }
    if (typeof routedData.treeRouting !== 'undefined') {
      if (!isRecord(routedData.treeRouting)) return null;
      const treeRouting = {};
      for (const key of ['effectiveSourceHandle', 'effectiveTargetHandle']) {
        if (typeof routedData.treeRouting[key] === 'undefined') continue;
        const token = copyToken(routedData.treeRouting[key]);
        if (typeof token === 'symbol') return null;
        treeRouting[key] = token;
      }
      if (typeof routedData.treeRouting.points !== 'undefined') {
        const points = copyPath(routedData.treeRouting.points, false);
        if (!points) return null;
        treeRouting.points = points;
      }
      data.treeRouting = treeRouting;
    } else if (typeof sourceData.treeRouting !== 'undefined') {
      return null;
    }
    for (const key of [
      'sharedTrunkAware',
      'sharedTrunkSynthesized',
      'isTreeBus',
      'overextendedTargetTrunkCorridorReclaimed',
    ]) {
      if (typeof routedData[key] !== 'undefined') {
        if (typeof routedData[key] !== 'boolean') return null;
        data[key] = routedData[key];
      } else if (sourceData[key] === true) {
        return null;
      }
    }
    patch.data = data;
    patches.push(patch);
  }
  return patches;
};

/**
 * Replays a generated artifact using the same full-tree contract as the
 * application registry. Other routing fields are flat values/arrays and use
 * normal patch replacement semantics.
 */
export const replayPrecompiledDisplayRoutePatches = (sourceEdges, patches) => {
  if (
    !Array.isArray(sourceEdges)
    || !Array.isArray(patches)
    || sourceEdges.length !== patches.length
  ) return null;
  const replayed = [];
  for (let index = 0; index < sourceEdges.length; index += 1) {
    const source = sourceEdges[index];
    const patch = patches[index];
    if (
      !source
      || typeof source !== 'object'
      || Array.isArray(source)
      || !patch
      || typeof patch !== 'object'
      || Array.isArray(patch)
      || patch.id !== source.id
      || patch.source !== source.source
      || patch.target !== source.target
    ) return null;
    const sourceData = source.data && typeof source.data === 'object' && !Array.isArray(source.data)
      ? source.data
      : {};
    const patchData = patch.data && typeof patch.data === 'object' && !Array.isArray(patch.data)
      ? patch.data
      : {};
    const data = { ...sourceData, ...patchData };
    if (Object.prototype.hasOwnProperty.call(patchData, 'treeRouting')) {
      data.treeRouting = patchData.treeRouting;
    }
    replayed.push({ ...source, ...patch, data });
  }
  return replayed;
};

export const replayTrustedDisplayRoutePatches = (sourceEdges, patches) => {
  if (
    !Array.isArray(sourceEdges)
    || !Array.isArray(patches)
    || sourceEdges.length !== patches.length
  ) return null;
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const isSafeKey = key => key !== '__proto__' && key !== 'prototype' && key !== 'constructor';
  const apply = (baseline, patch) => {
    if (Array.isArray(patch)) return patch;
    if (!isRecord(patch)) return patch;
    const baselineRecord = isRecord(baseline) ? baseline : {};
    const merged = { ...baselineRecord };
    for (const [key, value] of Object.entries(patch)) {
      if (isSafeKey(key)) merged[key] = apply(baselineRecord[key], value);
    }
    return merged;
  };
  const replayed = [];
  for (let index = 0; index < sourceEdges.length; index += 1) {
    const source = sourceEdges[index];
    const patch = patches[index];
    if (
      !isRecord(source)
      || !isRecord(patch)
      || patch.id !== source.id
      || patch.source !== source.source
      || patch.target !== source.target
    ) return null;
    replayed.push(apply(source, patch));
  }
  return replayed;
};

/**
 * Compares exactly the fields consumed by route-v2 signatures. This is a
 * generation-time proof that the serialized patch can recreate the response
 * whose hard report and signature are persisted.
 */
export const precompiledDisplayRouteContractsMatch = (leftEdges, rightEdges) => {
  if (
    !Array.isArray(leftEdges)
    || !Array.isArray(rightEdges)
    || leftEdges.length !== rightEdges.length
  ) return false;
  const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const token = value => (value == null ? '' : value);
  const path = value => (typeof value === 'undefined' ? ['absent'] : value);
  const project = edge => {
    if (!isRecord(edge)) return null;
    const data = isRecord(edge.data) ? edge.data : {};
    const treeRouting = isRecord(data.treeRouting) ? data.treeRouting : {};
    return [
      edge.id,
      edge.source,
      edge.target,
      token(edge.type),
      token(edge.sourceHandle),
      token(edge.targetHandle),
      token(treeRouting.effectiveSourceHandle),
      token(treeRouting.effectiveTargetHandle),
      `${data.sharedTrunkSynthesized === true ? 1 : 0}${
        data.sharedTrunkAware === true ? 1 : 0
      }${data.isTreeBus === true ? 1 : 0}${data.treeRouting ? 1 : 0}${
        typeof data.h === 'string' ? data.h.slice(0, 128) : ''
      }`,
      path(data.computedPath),
      path(data.elkPath),
      path(treeRouting.points),
    ];
  };
  for (let index = 0; index < leftEdges.length; index += 1) {
    const left = project(leftEdges[index]);
    const right = project(rightEdges[index]);
    if (!left || !right || JSON.stringify(left) !== JSON.stringify(right)) return false;
  }
  return true;
};

export const renderPrecompiledDisplayRouteCaptureExpression = targetId => `(async () => {
  const isMatchingResponse = ${isMatchingHardCleanDisplayWorkerResponse.toString()};
  const isFreshRequestResponse = ${isFreshFullRouteRequestResponse.toString()};
  const createPatches = ${createPrecompiledDisplayRoutePatches.toString()};
  const replayPatches = ${replayPrecompiledDisplayRoutePatches.toString()};
  const replayTrustedPatches = ${replayTrustedDisplayRoutePatches.toString()};
  const routeContractsMatch = ${precompiledDisplayRouteContractsMatch.toString()};
  const hashQueryIndex = window.location.hash.indexOf('?');
  const activeTargetId = hashQueryIndex >= 0
    ? new URLSearchParams(window.location.hash.slice(hashQueryIndex + 1)).get('diagram')
    : null;
  const routing = window.__vizlyBaseReactFlowDisplayRouting || {};
  const request = window.__vizlyPrecompiledRouteRequest;
  const response = window.__vizlyPrecompiledRouteResponse;
  const committed = window.__vizlyPrecompiledCommittedRoute;
  if (activeTargetId !== ${JSON.stringify(targetId)}
    || routing.stage !== 'final-applied'
    || routing.workerAbortCount !== 0
    || routing.requestId !== request?.requestId
    || !isMatchingResponse(request, response)
    || !isFreshRequestResponse(request, response)
    || routing.workerResolution !== response.routeResolution
    || typeof routing.inputGeometryDigest !== 'string'
    || !/^geometry-v1:[0-9a-f]{32}$/.test(routing.inputGeometryDigest)
    || typeof routing.outputRouteSignature !== 'string'
    || !/^route-v2:\\d{1,3}:\\d{1,6}:[0-9a-f]{16}$/.test(routing.outputRouteSignature)
    || typeof routing.routingVersion !== 'string'
    || routing.routingVersion.length === 0
    || committed?.presetId !== ${JSON.stringify(targetId)}
    || committed.inputSignature !== routing.signature
    || committed.inputGeometryDigest !== routing.inputGeometryDigest
    || committed.outputRouteSignature !== routing.outputRouteSignature
    || !Array.isArray(committed.sourceEdges)
    || !Array.isArray(committed.displayPatches)
    || committed.sourceEdges.length !== request.edges.length) return null;
  const committedEdges = replayTrustedPatches(committed.sourceEdges, committed.displayPatches);
  if (!committedEdges) return null;
  const patches = createPatches(committed.sourceEdges, committedEdges);
  if (!patches) return null;
  const replayedEdges = replayPatches(committed.sourceEdges, patches);
  if (!replayedEdges || !routeContractsMatch(replayedEdges, committedEdges)) return null;
  return {
    targetId: ${JSON.stringify(targetId)},
    routing,
    requestShape: {
      operation: request.operation,
      candidateEdges: Array.isArray(request.candidateEdges) ? request.candidateEdges.length : 0,
      nodes: request.nodes.length,
      edges: request.edges.length,
    },
    patches,
    inputGeometryDigest: routing.inputGeometryDigest,
    outputRouteSignature: routing.outputRouteSignature,
    workerResolution: response.routeResolution,
    workerDurationMs: response.workerDurationMs,
  };
})()`;
