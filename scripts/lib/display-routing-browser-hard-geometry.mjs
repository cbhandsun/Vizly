/**
 * Independently audits the complete interaction-path `d` emitted for every
 * logical edge. StablePathEdge deliberately renders this path as strict M/L
 * geometry, so the browser gate can inspect the final SVG without trusting a
 * Worker report or a fragment/marker carrier.
 */
export const readRenderedDisplayEdgeHardGeometryAudit = (rawEdges, rawNodes) => {
  const MAX_ITEMS = 5_000;
  const MAX_POINTS = 512;
  const MAX_FINDINGS = 64;
  const EPS = 0.5;
  const MIN_ENDPOINT_STUB = 32;
  const MIN_INTERIOR_SEGMENT = 24;
  const MIN_PENALIZED_OVERLAP = 24;
  const SHARED_TRUNK_EPS = 4;
  const HAIRPIN_BRIDGE = 140;
  const edges = Array.isArray(rawEdges) ? rawEdges.slice(0, MAX_ITEMS) : [];
  const nodes = Array.isArray(rawNodes) ? rawNodes.slice(0, MAX_ITEMS) : [];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const finiteDimension = value => {
    if (finite(value)) return value;
    if (typeof value !== 'string' || !/^\d+(?:\.\d+)?(?:px)?$/i.test(value.trim())) return null;
    const parsed = Number.parseFloat(value);
    return finite(parsed) ? parsed : null;
  };
  const sourceNodeById = new Map(nodes.flatMap(node => (
    node && typeof node === 'object'
      && typeof node.id === 'string' && node.id.length > 0 && node.id.length <= 500
      ? [[node.id, node]]
      : []
  )));
  const resolvePosition = (node, seen = new Set()) => {
    if (finite(node?.positionAbsolute?.x) && finite(node?.positionAbsolute?.y)) {
      return { x: node.positionAbsolute.x, y: node.positionAbsolute.y };
    }
    const local = {
      x: finite(node?.position?.x) ? node.position.x : 0,
      y: finite(node?.position?.y) ? node.position.y : 0,
    };
    const parentId = typeof node?.parentId === 'string' ? node.parentId : '';
    if (!parentId || seen.has(parentId) || seen.size >= 100) return local;
    const parent = sourceNodeById.get(parentId);
    if (!parent) return local;
    seen.add(parentId);
    const parentPosition = resolvePosition(parent, seen);
    return { x: parentPosition.x + local.x, y: parentPosition.y + local.y };
  };
  const nodeRectById = new Map([...sourceNodeById].flatMap(([id, node]) => {
    const width = finiteDimension(node?.measured?.width ?? node?.width ?? node?.style?.width);
    const height = finiteDimension(node?.measured?.height ?? node?.height ?? node?.style?.height);
    if (!finite(width) || !finite(height) || width <= 1 || height <= 1) return [];
    const position = resolvePosition(node);
    return [[id, { x: position.x, y: position.y, width, height }]];
  }));
  const side = value => {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return ['top', 'right', 'bottom', 'left'].find(item => (
      normalized === item || normalized.endsWith(`-${item}`) || normalized.startsWith(`${item}-`)
    )) ?? null;
  };
  const parsePath = value => {
    if (typeof value !== 'string' || value.length === 0 || value.length > 100_000) return null;
    const tokens = value.match(/[ML]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    if (value.replace(/[ML]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?|[\s,]+/gi, '') !== '') return null;
    if (tokens[0]?.toUpperCase() !== 'M') return null;
    const points = [];
    let index = 0;
    let command = '';
    while (index < tokens.length) {
      if (/^[ML]$/i.test(tokens[index])) command = tokens[index++].toUpperCase();
      if ((command !== 'M' && command !== 'L') || index + 1 >= tokens.length) return null;
      const x = Number(tokens[index++]);
      const y = Number(tokens[index++]);
      if (!finite(x) || !finite(y)) return null;
      points.push({ x, y });
      if (points.length > MAX_POINTS) return null;
      command = 'L';
    }
    return points.length >= 2 ? points : null;
  };
  const axis = (a, b) => (
    Math.abs(a.y - b.y) <= EPS && Math.abs(a.x - b.x) > EPS ? 'h'
      : Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) > EPS ? 'v'
        : null
  );
  const length = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const direction = (a, b, segmentAxis) => Math.sign(
    segmentAxis === 'h' ? b.x - a.x : b.y - a.y,
  );
  const recordFinding = (findings, finding) => {
    if (findings.length < MAX_FINDINGS) findings.push(finding);
  };
  const terminalIsValid = (edge, path, role) => {
    const terminalSide = side(role === 'source' ? edge.sourceHandle : edge.targetHandle);
    const rect = nodeRectById.get(role === 'source' ? edge.source : edge.target);
    const endpoint = role === 'source' ? path[0] : path[path.length - 1];
    const neighbor = role === 'source' ? path[1] : path[path.length - 2];
    if (!terminalSide || !rect || !endpoint || !neighbor) return false;
    const onSide = terminalSide === 'left'
      ? Math.abs(endpoint.x - rect.x) <= 2 && endpoint.y >= rect.y - 2 && endpoint.y <= rect.y + rect.height + 2
      : terminalSide === 'right'
        ? Math.abs(endpoint.x - (rect.x + rect.width)) <= 2 && endpoint.y >= rect.y - 2 && endpoint.y <= rect.y + rect.height + 2
        : terminalSide === 'top'
          ? Math.abs(endpoint.y - rect.y) <= 2 && endpoint.x >= rect.x - 2 && endpoint.x <= rect.x + rect.width + 2
          : Math.abs(endpoint.y - (rect.y + rect.height)) <= 2 && endpoint.x >= rect.x - 2 && endpoint.x <= rect.x + rect.width + 2;
    if (!onSide || length(endpoint, neighbor) < MIN_ENDPOINT_STUB - EPS) return false;
    const segmentAxis = axis(endpoint, neighbor);
    const outward = terminalSide === 'left'
      ? neighbor.x < endpoint.x - EPS
      : terminalSide === 'right'
        ? neighbor.x > endpoint.x + EPS
        : terminalSide === 'top'
          ? neighbor.y < endpoint.y - EPS
          : neighbor.y > endpoint.y + EPS;
    if (!segmentAxis || !outward) return false;
    if (role === 'target') {
      const tangent = terminalSide === 'left' || terminalSide === 'right' ? endpoint.y : endpoint.x;
      const minimum = terminalSide === 'left' || terminalSide === 'right' ? rect.y : rect.x;
      const maximum = minimum + (terminalSide === 'left' || terminalSide === 'right' ? rect.height : rect.width);
      if (tangent <= minimum + 2 || tangent >= maximum - 2) return false;
    }
    return true;
  };

  const invalidEdgeIds = [];
  const nonOrthogonalEdgeIds = [];
  const detachedTerminalEdgeIds = [];
  const detachedTerminalFindings = [];
  const shortEndpointStubEdgeIds = [];
  const tinyInteriorDoglegEdgeIds = [];
  const hairpinEdgeIds = [];
  const audited = [];
  for (const [edgeIndex, edge] of edges.entries()) {
    const edgeId = typeof edge?.id === 'string' && edge.id.length > 0 && edge.id.length <= 500
      ? edge.id
      : '';
    const wrapper = edgeId ? [...document.querySelectorAll('[data-testid^="rf__edge-"]')]
      .find(candidate => candidate.getAttribute('data-testid') === `rf__edge-${edgeId}`) : null;
    const pathElement = wrapper?.querySelector('.shared-trunk-edge-interaction');
    const points = parsePath(pathElement?.getAttribute?.('d'));
    if (!edgeId || !points || typeof edge?.source !== 'string' || typeof edge?.target !== 'string') {
      recordFinding(invalidEdgeIds, edgeId || '<missing>');
      continue;
    }
    const segments = points.slice(0, -1).map((a, segmentIndex) => ({
      a,
      b: points[segmentIndex + 1],
      axis: axis(a, points[segmentIndex + 1]),
      segmentIndex,
      segmentCount: points.length - 1,
    }));
    if (segments.some(segment => !segment.axis)) recordFinding(nonOrthogonalEdgeIds, edgeId);
    const sourceTerminalValid = terminalIsValid(edge, points, 'source');
    const targetTerminalValid = terminalIsValid(edge, points, 'target');
    if (!sourceTerminalValid || !targetTerminalValid) {
      recordFinding(detachedTerminalEdgeIds, edgeId);
      recordFinding(detachedTerminalFindings, {
        edgeIndex,
        sourceSide: side(edge.sourceHandle),
        targetSide: side(edge.targetHandle),
        sourceTerminalValid,
        targetTerminalValid,
      });
    }
    if (length(points[0], points[1]) < MIN_ENDPOINT_STUB - EPS
      || length(points[points.length - 2], points[points.length - 1]) < MIN_ENDPOINT_STUB - EPS) {
      recordFinding(shortEndpointStubEdgeIds, edgeId);
    }
    if (points.slice(1, -2).some((point, index) => (
      length(point, points[index + 2]) < MIN_INTERIOR_SEGMENT - EPS
    ))) recordFinding(tinyInteriorDoglegEdgeIds, edgeId);
    const orthogonalSegments = segments.filter(segment => segment.axis).map(segment => ({
      ...segment,
      direction: direction(segment.a, segment.b, segment.axis),
      length: length(segment.a, segment.b),
    }));
    if (orthogonalSegments.some((first, index) => {
      const middle = orthogonalSegments[index + 1];
      const last = orthogonalSegments[index + 2];
      return Boolean(middle && last
        && first.axis === last.axis
        && first.direction === -last.direction
        && middle.length < HAIRPIN_BRIDGE - EPS);
    })) recordFinding(hairpinEdgeIds, edgeId);
    audited.push({ edge, edgeId, points, segments: orthogonalSegments });
  }

  const related = (first, second) => first.source === second.source
    || first.target === second.target
    || first.source === second.target
    || first.target === second.source;
  const adjacent = (segments, segment, offset) => segments.find(candidate => (
    candidate.segmentIndex === segment.segmentIndex + offset
  )) ?? null;
  const sameTrunkPoint = (first, second) => (
    Math.abs(first.x - second.x) <= SHARED_TRUNK_EPS
    && Math.abs(first.y - second.y) <= SHARED_TRUNK_EPS
  );
  const segmentInside = (first, second) => first.axis === second.axis && (
    first.axis === 'h'
      ? Math.min(first.a.x, first.b.x) > Math.min(second.a.x, second.b.x) + EPS
        && Math.max(first.a.x, first.b.x) < Math.max(second.a.x, second.b.x) - EPS
      : Math.min(first.a.y, first.b.y) > Math.min(second.a.y, second.b.y) + EPS
        && Math.max(first.a.y, first.b.y) < Math.max(second.a.y, second.b.y) - EPS
  );
  const endpointChainContains = (firstSegment, secondSegment, firstSegments, secondSegments, target) => {
    const firstOffset = target
      ? firstSegment.segmentCount - 1 - firstSegment.segmentIndex
      : firstSegment.segmentIndex;
    const secondOffset = target
      ? secondSegment.segmentCount - 1 - secondSegment.segmentIndex
      : secondSegment.segmentIndex;
    if (firstOffset !== secondOffset || firstOffset < 0) return false;
    for (let offset = 0; offset <= firstOffset; offset += 1) {
      const firstIndex = target ? firstSegment.segmentCount - 1 - offset : offset;
      const secondIndex = target ? secondSegment.segmentCount - 1 - offset : offset;
      const first = firstSegments.find(segment => segment.segmentIndex === firstIndex);
      const second = secondSegments.find(segment => segment.segmentIndex === secondIndex);
      if (!first || !second || first.axis !== second.axis) return false;
      const [firstStart, firstEnd] = target ? [first.b, first.a] : [first.a, first.b];
      const [secondStart, secondEnd] = target ? [second.b, second.a] : [second.a, second.b];
      if (!sameTrunkPoint(firstStart, secondStart)) return false;
      const firstDelta = first.axis === 'h' ? firstEnd.x - firstStart.x : firstEnd.y - firstStart.y;
      const secondDelta = second.axis === 'h' ? secondEnd.x - secondStart.x : secondEnd.y - secondStart.y;
      if (firstDelta * secondDelta <= EPS) return false;
      if (offset < firstOffset && !sameTrunkPoint(firstEnd, secondEnd)) return false;
    }
    return true;
  };
  const terminalHandleSide = value => {
    const token = typeof value === 'string' ? value.trim().toLowerCase()[0] : '';
    return ['l', 'r', 't', 'b'].includes(token) ? token : null;
  };
  const distinctSharedEndpointPorts = (first, second) => {
    if (first.source === second.source) {
      const firstSide = terminalHandleSide(first.sourceHandle);
      const secondSide = terminalHandleSide(second.sourceHandle);
      return firstSide !== null && secondSide !== null && firstSide !== secondSide;
    }
    if (first.target === second.target) {
      const firstSide = terminalHandleSide(first.targetHandle);
      const secondSide = terminalHandleSide(second.targetHandle);
      return firstSide !== null && secondSide !== null && firstSide !== secondSide;
    }
    return false;
  };
  const internalContained = (contained, carrier, segments, overlap) => {
    if (contained.axis !== carrier.axis
      || Math.abs(contained.length - overlap) > EPS
      || contained.segmentIndex <= 0
      || contained.segmentIndex >= contained.segmentCount - 1) return false;
    const before = adjacent(segments, contained, -1);
    const after = adjacent(segments, contained, 1);
    return Boolean(before && after && before.axis !== contained.axis && after.axis !== contained.axis);
  };
  const permittedRelatedOverlap = (first, second, firstSegment, secondSegment, firstSegments, secondSegments, overlap) => {
    if (firstSegment.direction !== 0 && secondSegment.direction !== 0
      && firstSegment.direction !== secondSegment.direction) return false;
    const endpointTrunk = (first.source === second.source && endpointChainContains(
      firstSegment, secondSegment, firstSegments, secondSegments, false,
    )) || (first.target === second.target && endpointChainContains(
      firstSegment, secondSegment, firstSegments, secondSegments, true,
    ));
    if (endpointTrunk) return true;
    if (!distinctSharedEndpointPorts(first, second)) return false;
    return internalContained(firstSegment, secondSegment, firstSegments, overlap)
      || internalContained(secondSegment, firstSegment, secondSegments, overlap);
  };
  const oppositeSides = (before, after, junction) => {
    const beforeDelta = junction.axis === 'h'
      ? before.a.y - junction.a.y : before.a.x - junction.a.x;
    const afterDelta = junction.axis === 'h'
      ? after.b.y - junction.a.y : after.b.x - junction.a.x;
    return Math.abs(beforeDelta) > EPS && Math.abs(afterDelta) > EPS
      && Math.sign(beforeDelta) === -Math.sign(afterDelta);
  };
  const boundedCrossingJunction = (first, second, firstSegments, secondSegments, overlap) => ([
    [first, second, firstSegments],
    [second, first, secondSegments],
  ].some(([junction, blocker, segments]) => {
    if (Math.abs(junction.length - MIN_PENALIZED_OVERLAP) > EPS
      || Math.abs(overlap - junction.length) > EPS
      || junction.direction === 0 || junction.direction !== blocker.direction
      || junction.segmentIndex <= 0 || junction.segmentIndex >= junction.segmentCount - 1
      || !segmentInside(junction, blocker)) return false;
    const before = adjacent(segments, junction, -1);
    const after = adjacent(segments, junction, 1);
    return Boolean(before && after && before.axis !== junction.axis && after.axis !== junction.axis
      && oppositeSides(before, after, junction));
  }));
  const crossingTouchesSharedEndpoint = (first, second, firstSegment, secondSegment) => (
    (first.source === second.source
      && firstSegment.segmentIndex === 0 && secondSegment.segmentIndex === 0
      && sameTrunkPoint(firstSegment.a, secondSegment.a))
    || (first.target === second.target
      && firstSegment.segmentIndex === firstSegment.segmentCount - 1
      && secondSegment.segmentIndex === secondSegment.segmentCount - 1
      && sameTrunkPoint(firstSegment.b, secondSegment.b))
  );
  const softCrossingBridgeIsDeclared = (first, second, firstSegment, secondSegment, x, y) => {
    const bridge = `;${x},${y};`;
    const firstHops = first.data && typeof first.data === 'object' ? first.data.h : null;
    const secondHops = second.data && typeof second.data === 'object' ? second.data.h : null;
    if (!(typeof firstHops === 'string' && firstHops.includes(bridge))
      && !(typeof secondHops === 'string' && secondHops.includes(bridge))) return false;
    const crossingPoint = { x, y };
    return [firstSegment, secondSegment].every(segment => (
      length(segment.a, crossingPoint) >= MIN_INTERIOR_SEGMENT
      && length(segment.b, crossingPoint) >= MIN_INTERIOR_SEGMENT
    ));
  };
  const strictCrossings = [];
  const illegalOverlaps = [];
  for (let firstIndex = 0; firstIndex < audited.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < audited.length; secondIndex += 1) {
      const first = audited[firstIndex];
      const second = audited[secondIndex];
      for (const firstSegment of first.segments) {
        for (const secondSegment of second.segments) {
          if (firstSegment.axis !== secondSegment.axis) {
            const horizontal = firstSegment.axis === 'h' ? firstSegment : secondSegment;
            const vertical = firstSegment.axis === 'v' ? firstSegment : secondSegment;
            const x = vertical.a.x;
            const y = horizontal.a.y;
            if (x > Math.min(horizontal.a.x, horizontal.b.x) + EPS
              && x < Math.max(horizontal.a.x, horizontal.b.x) - EPS
              && y > Math.min(vertical.a.y, vertical.b.y) + EPS
              && y < Math.max(vertical.a.y, vertical.b.y) - EPS) {
              if (!softCrossingBridgeIsDeclared(
                first.edge, second.edge, firstSegment, secondSegment, x, y,
              ) && !crossingTouchesSharedEndpoint(
                first.edge, second.edge, firstSegment, secondSegment,
              )) recordFinding(strictCrossings, { edgeA: first.edgeId, edgeB: second.edgeId });
            }
            continue;
          }
          const sameLane = firstSegment.axis === 'h'
            ? Math.abs(firstSegment.a.y - secondSegment.a.y) <= SHARED_TRUNK_EPS
            : Math.abs(firstSegment.a.x - secondSegment.a.x) <= SHARED_TRUNK_EPS;
          if (!sameLane) continue;
          const firstStart = firstSegment.axis === 'h' ? firstSegment.a.x : firstSegment.a.y;
          const firstEnd = firstSegment.axis === 'h' ? firstSegment.b.x : firstSegment.b.y;
          const secondStart = secondSegment.axis === 'h' ? secondSegment.a.x : secondSegment.a.y;
          const secondEnd = secondSegment.axis === 'h' ? secondSegment.b.x : secondSegment.b.y;
          const overlap = Math.min(Math.max(firstStart, firstEnd), Math.max(secondStart, secondEnd))
            - Math.max(Math.min(firstStart, firstEnd), Math.min(secondStart, secondEnd));
          if (overlap < MIN_PENALIZED_OVERLAP) continue;
          const pairIsRelated = related(first.edge, second.edge);
          if ((!pairIsRelated && boundedCrossingJunction(
            firstSegment, secondSegment, first.segments, second.segments, overlap,
          )) || (pairIsRelated && permittedRelatedOverlap(
            first.edge,
            second.edge,
            firstSegment,
            secondSegment,
            first.segments,
            second.segments,
            overlap,
          ))) continue;
          recordFinding(illegalOverlaps, { edgeA: first.edgeId, edgeB: second.edgeId, overlap });
        }
      }
    }
  }
  return {
    edgeCount: edges.length,
    auditedPathCount: audited.length,
    invalidEdgeIds,
    nonOrthogonalEdgeIds,
    detachedTerminalEdgeIds,
    detachedTerminalFindings,
    shortEndpointStubEdgeIds,
    tinyInteriorDoglegEdgeIds,
    hairpinEdgeIds,
    strictCrossings,
    illegalOverlaps,
  };
};
