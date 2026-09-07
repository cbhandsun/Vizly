export const replayDisplayRoutingResponseEdges = (response, request) => {
  if (Array.isArray(response?.edges)) return response.edges;
  if (
    !Array.isArray(response?.routingPatches)
    || !Array.isArray(request?.edges)
    || response.routingPatches.length !== request.edges.length
  ) return null;
  const applyPatch = (baseline, patch) => {
    if (Array.isArray(patch)) return patch;
    if (!patch || typeof patch !== 'object') return patch;
    const source = baseline && typeof baseline === 'object' && !Array.isArray(baseline)
      ? baseline
      : {};
    return Object.fromEntries(Object.entries({ ...source, ...patch }).map(([key, value]) => (
      [key, Object.prototype.hasOwnProperty.call(patch, key)
        ? applyPatch(source[key], value)
        : value]
    )));
  };
  return request.edges.map((edge, index) => {
    const patch = response.routingPatches[index];
    return patch?.id === edge?.id
      && patch.source === edge.source
      && patch.target === edge.target
      ? applyPatch(edge, patch)
      : null;
  }).every(Boolean)
    ? request.edges.map((edge, index) => applyPatch(edge, response.routingPatches[index]))
    : null;
};

export const selectDisplayRoutingAuditRoute = (
  rawResponses,
  rawRequests,
  requestId,
  replayResponseEdges = replayDisplayRoutingResponseEdges,
  expectedEdgeCount = 14,
) => {
  const hasRequestedId = typeof requestId === 'string' && requestId.length > 0;
  if (
    (hasRequestedId && requestId.length > 500)
    || typeof replayResponseEdges !== 'function'
    || !Number.isSafeInteger(expectedEdgeCount)
    || expectedEdgeCount <= 0
    || expectedEdgeCount > 5_000
  ) return null;
  const responses = Array.isArray(rawResponses) ? rawResponses.slice(-256) : [];
  const requests = Array.isArray(rawRequests) ? rawRequests.slice(-256) : [];
  for (let index = responses.length - 1; index >= 0; index -= 1) {
    const response = responses[index];
    const responseRequestId = response?.requestId;
    if (
      typeof responseRequestId !== 'string'
      || responseRequestId.length === 0
      || responseRequestId.length > 500
      || (hasRequestedId && responseRequestId !== requestId)
    ) continue;
    const request = [...requests].reverse().find(
      item => item?.requestId === responseRequestId,
    );
    const edges = replayResponseEdges(response, request);
    // A Worker request may emit progress after its decisive route. Some progress
    // payloads intentionally carry `edges: []`; they must not hide the route
    // that the canvas actually committed.
    if (Array.isArray(edges) && edges.length === expectedEdgeCount) {
      return { response, request, edges };
    }
  }
  return null;
};

export const displayRoutingFinalSvgGeometryIsClean = ({
  audit,
  commercialAudit,
  hardAudit,
  expectedPathCount,
}) => Boolean(
  audit
  && commercialAudit
  && hardAudit
  && Number.isSafeInteger(expectedPathCount)
  && expectedPathCount >= 0
  && audit.nodeScanComplete === true
  && commercialAudit.nodeScanComplete === true
  && audit.auditedPathCount === expectedPathCount
  && Array.isArray(audit.invalidEdgeIds)
  && audit.invalidEdgeIds.length === 0
  && Array.isArray(audit.intersections)
  && audit.intersections.length === 0
  && Array.isArray(audit.clearanceRisks)
  && audit.clearanceRisks.length === 0
  && commercialAudit.auditedPathCount === expectedPathCount
  && Array.isArray(commercialAudit.invalidEdgeIds)
  && commercialAudit.invalidEdgeIds.length === 0
  && Array.isArray(commercialAudit.intersections)
  && commercialAudit.intersections.length === 0
  && Array.isArray(commercialAudit.clearanceRisks)
  && commercialAudit.clearanceRisks.length === 0
  && hardAudit.auditedPathCount === expectedPathCount
  && Array.isArray(hardAudit.invalidEdgeIds)
  && hardAudit.invalidEdgeIds.length === 0
  && Array.isArray(hardAudit.nonOrthogonalEdgeIds)
  && hardAudit.nonOrthogonalEdgeIds.length === 0
  && Array.isArray(hardAudit.detachedTerminalEdgeIds)
  && hardAudit.detachedTerminalEdgeIds.length === 0
  && Array.isArray(hardAudit.shortEndpointStubEdgeIds)
  && hardAudit.shortEndpointStubEdgeIds.length === 0
  && Array.isArray(hardAudit.tinyInteriorDoglegEdgeIds)
  && hardAudit.tinyInteriorDoglegEdgeIds.length === 0
  && Array.isArray(hardAudit.excessiveBendEdgeIds)
  && hardAudit.excessiveBendEdgeIds.length === 0
  && Array.isArray(hardAudit.hairpinEdgeIds)
  && hardAudit.hairpinEdgeIds.length === 0
  && Array.isArray(hardAudit.strictCrossings)
  && hardAudit.strictCrossings.length === 0
  && Array.isArray(hardAudit.illegalOverlaps)
  && hardAudit.illegalOverlaps.length === 0
);

export const readVisibleDisplayRoutingNodeRect = (nodeId) => {
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
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  if (
    centerX < paneBounds.left
    || centerX > paneBounds.right
    || centerY < paneBounds.top
    || centerY > paneBounds.bottom
  ) return null;
  const canReceivePointer = document.elementsFromPoint(centerX, centerY)
    .some(candidate => candidate === element || element.contains(candidate));
  return canReceivePointer
    ? {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    }
    : null;
};

export const readDisplayRoutingViewportZoom = () => (
  readDisplayRoutingViewportSnapshot()?.zoom ?? null
);

export const readDisplayRoutingNodePanGesture = (nodeId) => {
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
    paneBounds.width,
    paneBounds.height,
  ];
  if (!values.every(Number.isFinite) || paneBounds.width < 20 || paneBounds.height < 20) return null;
  const samples = [
    [0.5, 0.5],
    [0.15, 0.15],
    [0.85, 0.15],
    [0.15, 0.85],
    [0.85, 0.85],
    [0.5, 0.15],
    [0.5, 0.85],
  ];
  const start = samples
    .map(([xRatio, yRatio]) => ({
      x: paneBounds.left + paneBounds.width * xRatio,
      y: paneBounds.top + paneBounds.height * yRatio,
    }))
    .find(point => document.elementFromPoint(point.x, point.y) === pane);
  if (!start) return null;
  const desiredX = paneBounds.left + paneBounds.width / 2;
  const desiredY = paneBounds.top + paneBounds.height / 2;
  const nodeCenterX = bounds.x + bounds.width / 2;
  const nodeCenterY = bounds.y + bounds.height / 2;
  const inset = 8;
  const deltaX = Math.max(
    paneBounds.left + inset - start.x,
    Math.min(paneBounds.right - inset - start.x, desiredX - nodeCenterX),
  );
  const deltaY = Math.max(
    paneBounds.top + inset - start.y,
    Math.min(paneBounds.bottom - inset - start.y, desiredY - nodeCenterY),
  );
  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return null;
  return {
    startX: start.x,
    startY: start.y,
    endX: start.x + deltaX,
    endY: start.y + deltaY,
  };
};

export const readRenderedDisplayEdgeNodeIntersections = (
  rawEdges,
  requiredClearance = 48,
) => {
  const pointInsideRect = (point, rect, inset) => (
    point.x > rect.left + inset
    && point.x < rect.right - inset
    && point.y > rect.top + inset
    && point.y < rect.bottom - inset
  );
  const edges = Array.isArray(rawEdges) ? rawEdges.slice(0, 5_000) : [];
  const boundedRequiredClearance = Number.isFinite(requiredClearance)
    ? Math.max(16, Math.min(256, requiredClearance))
    : 48;
  // Keep this scan self-contained: the reader is serialized into the browser.
  const rawModelNodes = typeof window !== 'undefined'
    && typeof window.reactFlowInstance?.getNodes === 'function'
    ? window.reactFlowInstance.getNodes() : null;
  const modelNodes = Array.isArray(rawModelNodes) ? rawModelNodes.slice(0, 5_000) : [];
  const nodeElements = [...document.querySelectorAll('.react-flow__node[data-id]')];
  const containerTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);
  const modelById = new Map();
  const omittedNodeIds = [];
  let excludedContainerCount = 0;
  let hiddenModelNodeCount = 0;
  let invalidModelNodeCount = 0;
  for (const model of modelNodes) {
    if (!model || typeof model.id !== 'string' || !model.id || model.id.length > 500
      || modelById.has(model.id) || (model.hidden !== undefined && typeof model.hidden !== 'boolean')
      || (model.type !== undefined && typeof model.type !== 'string')
      || (model.data?.collapsed !== undefined && typeof model.data.collapsed !== 'boolean')) {
      invalidModelNodeCount += 1;
      continue;
    }
    modelById.set(model.id, model);
  }
  const elementById = new Map();
  let unmatchedDomNodeCount = 0;
  for (const element of nodeElements) {
    const id = element.getAttribute?.('data-id');
    if (!modelById.has(id) || elementById.has(id)) unmatchedDomNodeCount += 1;
    elementById.set(id, element);
  }
  const scannedNodes = [];
  for (const [id, model] of modelById) {
    if (model.hidden === true) { hiddenModelNodeCount += 1; continue; }
    if (containerTypes.has(model.type) && model.data?.collapsed !== true) {
      excludedContainerCount += 1;
      continue;
    }
    const element = elementById.get(id);
    const rect = element?.getBoundingClientRect?.();
    let visible = Boolean(element);
    for (let ancestor = element; ancestor && visible; ancestor = ancestor.parentElement) {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(ancestor) : null;
      visible = Boolean(style && style.display !== 'none' && style.visibility !== 'hidden'
        && style.visibility !== 'collapse' && Number(style.opacity || 1) > 0.001);
    }
    if (!visible || !rect || ![rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
      || rect.right <= rect.left || rect.bottom <= rect.top) {
      omittedNodeIds.push(id);
      continue;
    }
    scannedNodes.push({ id, rect });
  }
  const nodeCoverage = {
    inputNodeCount: modelNodes.length,
    domNodeCount: nodeElements.length,
    scannedNodeCount: scannedNodes.length,
    excludedContainerCount,
    hiddenModelNodeCount,
    invalidModelNodeCount,
    unmatchedDomNodeCount,
    omittedNodeCount: omittedNodeIds.length,
    omittedNodeIds: omittedNodeIds.slice(0, 32),
    nodeScanComplete: Array.isArray(rawModelNodes) && rawModelNodes.length <= 5_000
      && scannedNodes.length > 0 && invalidModelNodeCount === 0
      && unmatchedDomNodeCount === 0 && omittedNodeIds.length === 0,
  };
  const nodes = scannedNodes;
  const intersections = [];
  const clearanceRisks = [];
  const invalidEdgeIds = [];
  let auditedPathCount = 0;

  for (const rawEdge of edges) {
    const edgeId = typeof rawEdge?.id === 'string' ? rawEdge.id : '';
    const source = typeof rawEdge?.source === 'string' ? rawEdge.source : '';
    const target = typeof rawEdge?.target === 'string' ? rawEdge.target : '';
    if (!edgeId || edgeId.length > 500 || !source || !target) {
      invalidEdgeIds.push(edgeId || '<missing>');
      continue;
    }
    const wrapper = [...document.querySelectorAll('[data-testid^="rf__edge-"]')]
      .find(candidate => candidate.getAttribute('data-testid') === `rf__edge-${edgeId}`);
    // Shared-trunk edges render several semantic fragments before the complete
    // edge geometry. Auditing the first `.react-flow__edge-path` therefore only
    // checked one branch fragment and could miss a node hit on the rest of the
    // route. The interaction path always carries the complete rendered route;
    // the accent trace is the equivalent fallback for older shared-trunk paint.
    const path = wrapper?.querySelector('.shared-trunk-edge-interaction')
      ?? wrapper?.querySelector('.shared-trunk-accent-trace')
      ?? wrapper?.querySelector('.react-flow__edge-path');
    if (!path) {
      invalidEdgeIds.push(edgeId);
      continue;
    }
    const length = path.getTotalLength?.();
    const matrix = path.getScreenCTM?.();
    if (!Number.isFinite(length) || length <= 0 || !matrix) {
      invalidEdgeIds.push(edgeId);
      continue;
    }
    const scale = Math.max(
      Math.hypot(matrix.a, matrix.b),
      Math.hypot(matrix.c, matrix.d),
      0.01,
    );
    const step = Math.max(0.25, Math.min(4, 2 / scale));
    const sampleCount = Math.min(20_000, Math.max(1, Math.ceil(length / step)));
    const candidateNodes = nodes.filter(node => node.id !== source && node.id !== target);
    const minimumScreenClearance = Math.max(4, boundedRequiredClearance * scale - 1);
    const nearestNodeClearance = new Map();
    auditedPathCount += 1;

    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
      const point = path.getPointAtLength((length * sampleIndex) / sampleCount);
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      const screenPoint = {
        x: matrix.a * point.x + matrix.c * point.y + matrix.e,
        y: matrix.b * point.x + matrix.d * point.y + matrix.f,
      };
      const hit = candidateNodes.find(node => pointInsideRect(screenPoint, node.rect, 1));
      if (hit) {
        intersections.push({
          edgeId,
          nodeId: hit.id,
          x: screenPoint.x,
          y: screenPoint.y,
        });
        break;
      }
      for (const node of candidateNodes) {
        const deltaX = Math.max(
          node.rect.left - screenPoint.x,
          screenPoint.x - node.rect.right,
          0,
        );
        const deltaY = Math.max(
          node.rect.top - screenPoint.y,
          screenPoint.y - node.rect.bottom,
          0,
        );
        const distance = Math.hypot(deltaX, deltaY);
        if (distance >= minimumScreenClearance) continue;
        const previous = nearestNodeClearance.get(node.id);
        if (previous === undefined || distance < previous) {
          nearestNodeClearance.set(node.id, distance);
        }
      }
    }
    for (const [nodeId, distance] of nearestNodeClearance) {
      clearanceRisks.push({
        edgeId,
        nodeId,
        clearance: distance / scale,
        requiredClearance: boundedRequiredClearance,
      });
    }
  }

  return {
    ...nodeCoverage,
    edgeCount: edges.length,
    auditedPathCount,
    invalidEdgeIds,
    intersections,
    clearanceRisks,
  };
};

export const readDisplayRoutingNodeGeometryParity = rawNodes => {
  const nodes = Array.isArray(rawNodes) ? rawNodes.slice(0, 5_000) : [];
  const finiteNumber = value => typeof value === 'number' && Number.isFinite(value)
    ? value
    : null;
  const nodeById = new Map(nodes.flatMap(node => (
    node && typeof node === 'object'
      && typeof node.id === 'string'
      && node.id.length > 0
      && node.id.length <= 500
      ? [[node.id, node]]
      : []
  )));
  const resolvePosition = (node, seen = new Set()) => {
    const absoluteX = finiteNumber(node?.positionAbsolute?.x);
    const absoluteY = finiteNumber(node?.positionAbsolute?.y);
    if (absoluteX !== null && absoluteY !== null) return { x: absoluteX, y: absoluteY };
    const localX = finiteNumber(node?.position?.x) ?? 0;
    const localY = finiteNumber(node?.position?.y) ?? 0;
    const parentId = typeof node?.parentId === 'string' ? node.parentId : '';
    if (!parentId || seen.has(parentId) || seen.size >= 100) return { x: localX, y: localY };
    const parent = nodeById.get(parentId);
    if (!parent) return { x: localX, y: localY };
    seen.add(parentId);
    const parentPosition = resolvePosition(parent, seen);
    return { x: parentPosition.x + localX, y: parentPosition.y + localY };
  };
  const readDimension = (node, dimension) => (
    finiteNumber(node?.measured?.[dimension])
      ?? finiteNumber(node?.[dimension])
      ?? finiteNumber(node?.style?.[dimension])
  );
  const path = document.querySelector('.shared-trunk-edge-interaction')
    ?? document.querySelector('.react-flow__edge path');
  const matrix = path?.getScreenCTM?.();
  if (!matrix || ![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) {
    return null;
  }
  const project = point => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  });
  let comparedNodeCount = 0;
  let excludedNodeCount = 0;
  const omittedNodeIds = [];
  let positionMismatchCount = 0;
  let sizeMismatchCount = 0;
  let maxPositionDelta = 0;
  let maxSizeDelta = 0;
  for (const [id, node] of nodeById) {
    if (node.hidden === true || (['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']
      .includes(node.type) && node.data?.collapsed !== true)) {
      excludedNodeCount += 1;
      continue;
    }
    const element = [...document.querySelectorAll(
      '.react-flow__node[data-id]',
    )].find(candidate => candidate.getAttribute('data-id') === id);
    const width = readDimension(node, 'width');
    const height = readDimension(node, 'height');
    const rect = element?.getBoundingClientRect?.();
    if (
      !element || width === null || height === null || width <= 1 || height <= 1
      || !rect || ![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)
    ) { omittedNodeIds.push(id); continue; }
    const position = resolvePosition(node);
    const projectedStart = project(position);
    const projectedEnd = project({ x: position.x + width, y: position.y + height });
    const expectedLeft = Math.min(projectedStart.x, projectedEnd.x);
    const expectedTop = Math.min(projectedStart.y, projectedEnd.y);
    const expectedWidth = Math.abs(projectedEnd.x - projectedStart.x);
    const expectedHeight = Math.abs(projectedEnd.y - projectedStart.y);
    const positionDelta = Math.hypot(rect.left - expectedLeft, rect.top - expectedTop);
    const sizeDelta = Math.hypot(rect.width - expectedWidth, rect.height - expectedHeight);
    comparedNodeCount += 1;
    maxPositionDelta = Math.max(maxPositionDelta, positionDelta);
    maxSizeDelta = Math.max(maxSizeDelta, sizeDelta);
    if (positionDelta > 1.5) positionMismatchCount += 1;
    if (sizeDelta > 1.5) sizeMismatchCount += 1;
  }
  return {
    inputNodeCount: nodes.length,
    comparedNodeCount,
    excludedNodeCount,
    omittedNodeCount: omittedNodeIds.length,
    omittedNodeIds: omittedNodeIds.slice(0, 32),
    nodeScanComplete: Array.isArray(rawNodes) && rawNodes.length <= 5_000
      && nodeById.size === nodes.length && comparedNodeCount > 0 && omittedNodeIds.length === 0,
    positionMismatchCount,
    sizeMismatchCount,
    maxPositionDelta: Math.round(maxPositionDelta * 100) / 100,
    maxSizeDelta: Math.round(maxSizeDelta * 100) / 100,
  };
};

export { readDisplayRoutingVisualScaleAudit } from './display-routing-browser-visual-scale.mjs';
import { readDisplayRoutingViewportSnapshot } from './display-routing-browser-viewport.mjs';

export { readDisplayRoutingNodeDragTarget } from './display-routing-browser-viewport.mjs';
