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

export const readDisplayRoutingViewportZoom = () => {
  const zoom = Number(window.reactFlowInstance?.getViewport?.()?.zoom);
  return Number.isFinite(zoom) && zoom >= 0.05 && zoom <= 8 ? zoom : null;
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

  const root = document.querySelector('.diagram-preview-root')
    ?? document.querySelector('.diagram-root')
    ?? document.querySelector('.react-flow')?.parentElement;
  const paths = [...document.querySelectorAll('.react-flow__edge path')];
  const edgeWrappers = [...document.querySelectorAll('[data-testid^="rf__edge-"]')];
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
  const parseColor = value => {
    if (typeof value !== 'string' || value.length > 128) return null;
    const normalized = value.trim().toLowerCase();
    const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const digits = hex[1].length === 3
        ? [...hex[1]].map(character => character.repeat(2)).join('')
        : hex[1];
      return {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a: 1,
      };
    }
    const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
    if (!rgb) return null;
    const alpha = rgb[4]?.endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number.parseFloat(rgb[4] || '1');
    const channels = rgb.slice(1, 4).map(Number);
    if (!channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255)
      || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
    return { r: channels[0], g: channels[1], b: channels[2], a: alpha };
  };
  const composite = (foreground, background, opacity) => {
    const alpha = Math.max(0, Math.min(1, foreground.a * opacity));
    return {
      r: foreground.r * alpha + background.r * (1 - alpha),
      g: foreground.g * alpha + background.g * (1 - alpha),
      b: foreground.b * alpha + background.b * (1 - alpha),
      a: 1,
    };
  };
  const luminance = color => {
    const channel = value => {
      const normalized = value / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return channel(color.r) * 0.2126 + channel(color.g) * 0.7152 + channel(color.b) * 0.0722;
  };
  const contrast = (first, second) => {
    const high = Math.max(luminance(first), luminance(second));
    const low = Math.min(luminance(first), luminance(second));
    return (high + 0.05) / (low + 0.05);
  };
  const backgroundLayers = [];
  let backgroundElement = root;
  for (let depth = 0; backgroundElement && depth < 8; depth += 1) {
    const color = parseColor(getComputedStyle(backgroundElement).backgroundColor);
    if (color && color.a > 0) backgroundLayers.push(color);
    if (color?.a >= 0.999) break;
    backgroundElement = backgroundElement.parentElement;
  }
  const rootBackground = backgroundLayers.reverse().reduce(
    (background, foreground) => composite(foreground, background, 1),
    { r: 255, g: 255, b: 255, a: 1 },
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
    const elementOpacity = Number.parseFloat(style.opacity || '1');
    const strokeColor = parseColor(style.stroke);
    const effectiveOpacity = strokeOpacity * (Number.isFinite(elementOpacity) ? elementOpacity : 1);
    const strokeContrast = strokeColor
      ? contrast(composite(strokeColor, rootBackground, effectiveOpacity), rootBackground)
      : 0;
    const contrastMode = path.getAttribute?.('data-edge-contrast');
    const previous = path.previousElementSibling;
    const boundaryMatches = contrastMode === 'underlay'
      && previous?.classList?.contains?.('vizly-edge-contrast-underlay')
      && previous.getAttribute?.('d') === path.getAttribute?.('d');
    const boundaryStyle = boundaryMatches ? getComputedStyle(previous) : null;
    const boundaryColor = parseColor(boundaryStyle?.stroke);
    const boundaryOpacity = Number.parseFloat(boundaryStyle?.opacity || '1')
      * Number.parseFloat(boundaryStyle?.strokeOpacity || '1');
    const boundaryContrast = boundaryColor && Number.isFinite(boundaryOpacity)
      ? contrast(composite(boundaryColor, rootBackground, boundaryOpacity), rootBackground)
      : 0;
    const effectiveContrast = contrastMode === 'underlay'
      ? boundaryContrast
      : strokeContrast;
    return [{ path, style, strokeWidth, strokeContrast, effectiveContrast, boundaryContrast }];
  });
  const invalidNonScalingPathCount = paintedPaths.filter(({ path, style }) => (
    path.getAttribute('vector-effect') !== 'non-scaling-stroke'
    && style.vectorEffect !== 'non-scaling-stroke'
  )).length;
  const invalidStrokeWidthCount = paintedPaths.filter(({ strokeWidth }) => (
    strokeWidth < 1.25 || strokeWidth > 12
  )).length;
  const lowContrastPathCount = paintedPaths.filter(({ effectiveContrast }) => effectiveContrast < 3).length;
  const lowContrastPaths = paintedPaths.filter(({ effectiveContrast }) => effectiveContrast < 3)
    .slice(0, 32)
    .map(({ path, style, strokeContrast, effectiveContrast, boundaryContrast }) => ({
      edgeId: String(path.closest?.('[data-testid^="rf__edge-"]')?.getAttribute?.('data-testid') || '')
        .replace(/^rf__edge-/, '').slice(0, 500),
      className: String(path.getAttribute?.('class') || '').slice(0, 200),
      contrastMode: String(path.getAttribute?.('data-edge-contrast') || '').slice(0, 32),
      stroke: String(style.stroke || '').slice(0, 128),
      opacity: Number.parseFloat(style.opacity || '1') * Number.parseFloat(style.strokeOpacity || '1'),
      semanticContrast: Math.round(strokeContrast * 100) / 100,
      boundaryContrast: Math.round(boundaryContrast * 100) / 100,
      effectiveContrast: Math.round(effectiveContrast * 100) / 100,
    }));
  const markerPaths = paths.filter(path => {
    const style = getComputedStyle(path);
    const marker = path.getAttribute('marker-end') || style.markerEnd;
    return visibleStyle(style) && typeof marker === 'string' && marker !== 'none' && marker !== '';
  });
  const markerAudits = markerPaths.map(path => {
    const pathStyle = getComputedStyle(path);
    const markerValue = path.getAttribute('marker-end') || pathStyle.markerEnd;
    const markerId = typeof markerValue === 'string'
      ? markerValue.match(/#([^)'"\s]+)/)?.[1] ?? ''
      : '';
    const marker = markerId && markerId.length <= 500
      ? document.getElementById?.(markerId)
      : null;
    const glyph = marker?.querySelector?.('path, polygon, polyline') ?? null;
    const glyphStyle = glyph ? getComputedStyle(glyph) : null;
    const glyphOpacity = Number.parseFloat(glyphStyle?.opacity || '1');
    const fillOpacity = Number.parseFloat(glyphStyle?.fillOpacity || '1');
    const strokeOpacity = Number.parseFloat(glyphStyle?.strokeOpacity || '1');
    const fill = parseColor(glyphStyle?.fill);
    const stroke = parseColor(glyphStyle?.stroke);
    const opacity = Number.isFinite(glyphOpacity) ? glyphOpacity : 1;
    const fillContrast = fill && Number.isFinite(fillOpacity)
      ? contrast(composite(fill, rootBackground, opacity * fillOpacity), rootBackground)
      : 0;
    const strokeContrast = stroke && Number.isFinite(strokeOpacity)
      ? contrast(composite(stroke, rootBackground, opacity * strokeOpacity), rootBackground)
      : 0;
    const hasOutlineClass = path.classList?.contains?.('vizly-edge-contrast-marker-outline--dark')
      || path.classList?.contains?.('vizly-edge-contrast-marker-outline--light');
    const outlineColor = hasOutlineClass
      ? parseColor(pathStyle.getPropertyValue?.('--vizly-edge-marker-outline-color'))
      : null;
    const hasRenderedOutline = Boolean(
      outlineColor
      && typeof pathStyle.filter === 'string'
      && pathStyle.filter !== ''
      && pathStyle.filter !== 'none',
    );
    const outlineContrast = hasRenderedOutline
      ? contrast(composite(outlineColor, rootBackground, 1), rootBackground)
      : 0;
    return {
      edgeId: String(path.closest?.('[data-testid^="rf__edge-"]')?.getAttribute?.('data-testid') || '')
        .replace(/^rf__edge-/, '').slice(0, 500),
      markerId,
      contrast: Math.max(fillContrast, strokeContrast, outlineContrast),
      semanticContrast: Math.max(fillContrast, strokeContrast),
      outlineContrast,
      outlined: hasRenderedOutline,
      resolved: Boolean(glyph),
    };
  });
  const lowContrastMarkers = markerAudits.filter(audit => !audit.resolved || audit.contrast < 3);
  const interactionCounts = edgeWrappers.map(wrapper => ({
    edgeId: String(wrapper.getAttribute?.('data-testid') || '')
      .replace(/^rf__edge-/, '').slice(0, 500),
    count: wrapper.querySelectorAll?.('.react-flow__edge-interaction')?.length ?? 0,
  }));
  const duplicateMarkerEdges = edgeWrappers.flatMap(wrapper => {
    const markerCarrierCount = [...(wrapper.querySelectorAll?.('path') ?? [])].filter(path => {
      const pathStyle = getComputedStyle(path);
      const marker = path.getAttribute?.('marker-end') || pathStyle.markerEnd;
      return visibleStyle(pathStyle) && typeof marker === 'string' && marker !== 'none' && marker !== '';
    }).length;
    return markerCarrierCount > 1
      ? [{
        edgeId: String(wrapper.getAttribute?.('data-testid') || '')
          .replace(/^rf__edge-/, '').slice(0, 500),
        markerCarrierCount,
      }]
      : [];
  });

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
  const visibleLabelFontSizes = [];
  for (const label of labels) {
    const style = getComputedStyle(label);
    if (!visibleStyle(style)) continue;
    const rect = label.getBoundingClientRect();
    if (!finiteRect(rect) || rect.width <= 1 || rect.height <= 1) continue;
    visibleLabelHeights.push(rect.height);
    visibleLabelFontSizes.push(Number.parseFloat(style.fontSize));
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
    lowContrastPathCount,
    lowContrastPaths,
    markerCount: markerPaths.length,
    markerContrastAuditedCount: markerAudits.filter(audit => audit.resolved).length,
    lowContrastMarkerCount: lowContrastMarkers.length,
    lowContrastMarkers: lowContrastMarkers.slice(0, 32).map(audit => ({
      ...audit,
      contrast: Math.round(audit.contrast * 100) / 100,
      semanticContrast: Math.round(audit.semanticContrast * 100) / 100,
      outlineContrast: Math.round(audit.outlineContrast * 100) / 100,
    })),
    interactionEdgeCount: interactionCounts.length,
    interactionPathCount: interactionCounts.reduce((total, audit) => total + audit.count, 0),
    missingInteractionPathCount: interactionCounts.filter(audit => audit.count === 0).length,
    duplicateInteractionPathCount: interactionCounts.filter(audit => audit.count > 1).length,
    duplicateMarkerEdgeCount: duplicateMarkerEdges.length,
    duplicateMarkerEdges,
    edgeAccessibleNameMissingCount: edgeWrappers.filter(wrapper => {
      const ownName = wrapper.getAttribute?.('aria-label');
      const childName = wrapper.querySelector?.('[aria-label]')?.getAttribute?.('aria-label');
      return !(typeof ownName === 'string' && ownName.trim())
        && !(typeof childName === 'string' && childName.trim());
    }).length,
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
    invalidVisibleLabelFontSizeCount: visibleLabelFontSizes.filter(fontSize => (
      !Number.isFinite(fontSize) || fontSize < 11
    )).length,
    labelNodeOverlapCount,
    labelNodeOverlaps,
  };
};
