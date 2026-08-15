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
  const isFiniteRect = rect => (
    rect
    && [rect.left, rect.top, rect.right, rect.bottom].every(Number.isFinite)
    && rect.right > rect.left
    && rect.bottom > rect.top
  );
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
  const nodeElements = [...document.querySelectorAll(
    '.react-flow__node.react-flow__node-custom[data-id]',
  )];
  const nodes = nodeElements.map(element => ({
    id: element.getAttribute('data-id'),
    rect: element.getBoundingClientRect(),
  })).filter(node => (
    typeof node.id === 'string'
    && node.id.length > 0
    && node.id.length <= 500
    && isFiniteRect(node.rect)
  ));
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
    edgeCount: edges.length,
    auditedPathCount,
    invalidEdgeIds,
    intersections,
    clearanceRisks,
  };
};

export const readDisplayRoutingVisualScaleAudit = () => {
  const instance = window.reactFlowInstance;
  const viewport = typeof instance?.getViewport === 'function'
    ? instance.getViewport()
    : null;
  const zoom = Number(viewport?.zoom);
  if (!Number.isFinite(zoom) || zoom < 0.05 || zoom > 8) return null;

  const root = document.querySelector('.diagram-root')
    ?? document.querySelector('.react-flow')?.parentElement;
  const paths = [...document.querySelectorAll('.react-flow__edge path')];
  const labels = [...document.querySelectorAll('.stable-path-edge-label')];
  const nodes = [...document.querySelectorAll(
    '.react-flow__node.react-flow__node-custom[data-id]',
  )];
  const finiteRect = rect => (
    rect
    && [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height]
      .every(Number.isFinite)
  );
  const visibleStyle = style => (
    style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || 1) > 0.001
  );
  const transparentStroke = stroke => (
    stroke === 'none'
    || stroke === 'transparent'
    || /rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(stroke)
  );

  const paintedPaths = paths.flatMap(path => {
    const style = getComputedStyle(path);
    const strokeWidth = Number.parseFloat(style.strokeWidth);
    const strokeOpacity = Number.parseFloat(style.strokeOpacity || '1');
    if (
      !visibleStyle(style)
      || transparentStroke(style.stroke)
      || !Number.isFinite(strokeWidth)
      || strokeWidth <= 0
      || !Number.isFinite(strokeOpacity)
      || strokeOpacity <= 0.001
    ) return [];
    return [{ path, style, strokeWidth }];
  });
  const invalidNonScalingPathCount = paintedPaths.filter(({ path, style }) => (
    path.getAttribute('vector-effect') !== 'non-scaling-stroke'
    && style.vectorEffect !== 'non-scaling-stroke'
  )).length;
  const invalidStrokeWidthCount = paintedPaths.filter(({ strokeWidth }) => (
    strokeWidth < 0.5 || strokeWidth > 12
  )).length;
  const markerCount = paths.filter(path => {
    const style = getComputedStyle(path);
    const marker = path.getAttribute('marker-end') || style.markerEnd;
    return visibleStyle(style) && typeof marker === 'string' && marker !== 'none' && marker !== '';
  }).length;

  const nodeRects = nodes.flatMap(node => {
    const rect = node.getBoundingClientRect();
    return finiteRect(rect)
      ? [{
        id: typeof node.getAttribute === 'function'
          ? node.getAttribute('data-id') || '<missing>'
          : '<missing>',
        rect,
      }]
      : [];
  });
  let visiblePrimaryLabelCount = 0;
  let visibleDetailLabelCount = 0;
  let labelNodeOverlapCount = 0;
  const labelNodeOverlaps = [];
  const visibleLabelHeights = [];
  for (const label of labels) {
    const style = getComputedStyle(label);
    if (!visibleStyle(style)) continue;
    const rect = label.getBoundingClientRect();
    if (!finiteRect(rect) || rect.width <= 1 || rect.height <= 1) continue;
    visibleLabelHeights.push(rect.height);
    if (label.getAttribute('data-edge-label-priority') === 'primary') {
      visiblePrimaryLabelCount += 1;
    } else {
      visibleDetailLabelCount += 1;
    }
    const overlappingNode = nodeRects.find(({ rect: nodeRect }) => (
      Math.min(rect.right, nodeRect.right) - Math.max(rect.left, nodeRect.left) > 2
      && Math.min(rect.bottom, nodeRect.bottom) - Math.max(rect.top, nodeRect.top) > 2
    ));
    if (overlappingNode) {
      labelNodeOverlapCount += 1;
      labelNodeOverlaps.push({
        edgeId: label.getAttribute('data-edge-id') || '<missing>',
        nodeId: overlappingNode.id,
        priority: label.getAttribute('data-edge-label-priority') || 'detail',
      });
    }
  }

  return {
    zoom,
    routeSignature: window.__vizlyBaseReactFlowDisplayRouting?.outputRouteSignature ?? null,
    zoomedOut: Boolean(root?.classList?.contains('diagram-zoomed-out')),
    pathCount: paths.length,
    paintedPathCount: paintedPaths.length,
    invalidNonScalingPathCount,
    invalidStrokeWidthCount,
    markerCount,
    labelCount: labels.length,
    visibleLabelCount: visibleLabelHeights.length,
    visiblePrimaryLabelCount,
    visibleDetailLabelCount,
    minimumVisibleLabelHeight: visibleLabelHeights.length
      ? Math.min(...visibleLabelHeights)
      : null,
    maximumVisibleLabelHeight: visibleLabelHeights.length
      ? Math.max(...visibleLabelHeights)
      : null,
    labelNodeOverlapCount,
    labelNodeOverlaps,
  };
};
