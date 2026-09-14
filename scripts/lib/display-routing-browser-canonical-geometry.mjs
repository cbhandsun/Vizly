export const readDisplayRoutingCanonicalGeometrySnapshot = (
  rawNodes,
  rawEdges,
  rawRouting = {},
) => {
  const finite = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const record = value => (
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  );
  const nodes = Array.isArray(rawNodes) ? rawNodes.slice(0, 5_000) : [];
  const edges = Array.isArray(rawEdges) ? rawEdges.slice(0, 5_000) : [];
  const routing = record(rawRouting);
  const containerTypes = new Set(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane']);
  const nodeById = new Map();
  const duplicateNodeIds = [];
  const invalidNodeIds = [];
  for (const node of nodes) {
    const id = typeof node?.id === 'string' && node.id.length > 0 && node.id.length <= 500
      ? node.id
      : null;
    if (!id) {
      invalidNodeIds.push('<invalid>');
      continue;
    }
    if (nodeById.has(id)) duplicateNodeIds.push(id);
    nodeById.set(id, node);
  }
  const union = (bounds, rect) => (
    !rect
      ? bounds
      : bounds
        ? {
          minX: Math.min(bounds.minX, rect.minX),
          minY: Math.min(bounds.minY, rect.minY),
          maxX: Math.max(bounds.maxX, rect.maxX),
          maxY: Math.max(bounds.maxY, rect.maxY),
        }
        : { ...rect }
  );
  const finalizeBounds = bounds => (
    bounds
      ? {
        minX: Math.round(bounds.minX * 100) / 100,
        minY: Math.round(bounds.minY * 100) / 100,
        maxX: Math.round(bounds.maxX * 100) / 100,
        maxY: Math.round(bounds.maxY * 100) / 100,
        width: Math.round(Math.max(0, bounds.maxX - bounds.minX) * 100) / 100,
        height: Math.round(Math.max(0, bounds.maxY - bounds.minY) * 100) / 100,
      }
      : null
  );
  const readDimension = (node, dimension) => (
    finite(node?.measured?.[dimension])
    ?? finite(node?.[dimension])
    ?? finite(node?.style?.[dimension])
  );
  const resolvePosition = (node, seen = new Set()) => {
    const absoluteX = finite(node?.positionAbsolute?.x);
    const absoluteY = finite(node?.positionAbsolute?.y);
    if (absoluteX !== null && absoluteY !== null) return { status: 'passed', x: absoluteX, y: absoluteY };
    const localX = finite(node?.position?.x);
    const localY = finite(node?.position?.y);
    if (localX === null || localY === null) return { status: 'incomplete' };
    const parentId = typeof node?.parentId === 'string' ? node.parentId : '';
    if (!parentId) return { status: 'passed', x: localX, y: localY };
    if (seen.has(parentId) || seen.size >= 100) return { status: 'incomplete', reason: 'cycle' };
    const parent = nodeById.get(parentId);
    if (!parent) return { status: 'incomplete', reason: 'missing-parent' };
    seen.add(parentId);
    const parentPosition = resolvePosition(parent, seen);
    if (parentPosition.status !== 'passed') return parentPosition;
    return { status: 'passed', x: parentPosition.x + localX, y: parentPosition.y + localY };
  };
  let leafBounds = null;
  let containerBounds = null;
  let nodeBounds = null;
  let incompleteNodeCount = 0;
  let hiddenNodeCount = 0;
  let leafNodeCount = 0;
  let containerNodeCount = 0;
  const incompleteNodeIds = [];
  for (const node of nodes) {
    const id = typeof node?.id === 'string' ? node.id : '<invalid>';
    if (node?.hidden === true || node?.data?.hidden === true) {
      hiddenNodeCount += 1;
      continue;
    }
    const position = resolvePosition(node);
    const width = readDimension(node, 'width');
    const height = readDimension(node, 'height');
    if (position.status !== 'passed' || width === null || height === null || width <= 0 || height <= 0) {
      incompleteNodeCount += 1;
      incompleteNodeIds.push(id);
      continue;
    }
    const rect = {
      minX: position.x,
      minY: position.y,
      maxX: position.x + width,
      maxY: position.y + height,
    };
    nodeBounds = union(nodeBounds, rect);
    if (containerTypes.has(String(node.type || ''))) {
      containerNodeCount += 1;
      containerBounds = union(containerBounds, rect);
    } else {
      leafNodeCount += 1;
      leafBounds = union(leafBounds, rect);
    }
  }
  let edgePathBounds = null;
  let edgePathPointCount = 0;
  let incompleteEdgePathCount = 0;
  const incompleteEdgeIds = [];
  for (const edge of edges) {
    const id = typeof edge?.id === 'string' ? edge.id : '<invalid>';
    const path = Array.isArray(edge?.data?.computedPath)
      ? edge.data.computedPath
      : Array.isArray(edge?.data?.waypoints)
        ? edge.data.waypoints
        : [];
    if (path.length === 0) {
      incompleteEdgePathCount += 1;
      incompleteEdgeIds.push(id);
      continue;
    }
    let edgeComplete = true;
    for (const point of path) {
      const x = finite(point?.x);
      const y = finite(point?.y);
      if (x === null || y === null) {
        edgeComplete = false;
        continue;
      }
      edgePathPointCount += 1;
      edgePathBounds = union(edgePathBounds, { minX: x, minY: y, maxX: x, maxY: y });
    }
    if (!edgeComplete) {
      incompleteEdgePathCount += 1;
      incompleteEdgeIds.push(id);
    }
  }
  const laneRankDecision = record(routing.laneRankDecision);
  const hasLaneRankDecision = typeof laneRankDecision.applied === 'string'
    || typeof laneRankDecision.requested === 'string';
  const contentBounds = union(nodeBounds, edgePathBounds);
  const status = invalidNodeIds.length === 0
    && duplicateNodeIds.length === 0
    && incompleteNodeCount === 0
    && leafNodeCount > 0
    && contentBounds
    ? 'passed'
    : 'incomplete';
  return {
    version: 1,
    status,
    nodeCoverage: {
      inputNodeCount: nodes.length,
      leafNodeCount,
      containerNodeCount,
      hiddenNodeCount,
      incompleteNodeCount,
      invalidNodeCount: invalidNodeIds.length,
      duplicateNodeCount: duplicateNodeIds.length,
      incompleteNodeIds: incompleteNodeIds.slice(0, 32),
      invalidNodeIds: invalidNodeIds.slice(0, 32),
      duplicateNodeIds: duplicateNodeIds.slice(0, 32),
    },
    edgeCoverage: {
      inputEdgeCount: edges.length,
      edgePathPointCount,
      incompleteEdgePathCount,
      incompleteEdgeIds: incompleteEdgeIds.slice(0, 32),
    },
    bounds: {
      leaf: finalizeBounds(leafBounds),
      containers: finalizeBounds(containerBounds),
      nodes: finalizeBounds(nodeBounds),
      edges: finalizeBounds(edgePathBounds),
      content: finalizeBounds(contentBounds),
    },
    viewport: typeof window !== 'undefined'
      ? {
        x: finite(window.reactFlowInstance?.getViewport?.()?.x),
        y: finite(window.reactFlowInstance?.getViewport?.()?.y),
        zoom: finite(window.reactFlowInstance?.getViewport?.()?.zoom),
        devicePixelRatio: finite(window.devicePixelRatio),
      }
      : undefined,
    laneRankDecision: hasLaneRankDecision
      ? {
        requested: laneRankDecision.requested,
        applied: laneRankDecision.applied,
        reason: laneRankDecision.reason,
        direction: laneRankDecision.direction,
        connectedInputFingerprint: laneRankDecision.connectedInputFingerprint,
      }
      : undefined,
  };
};
