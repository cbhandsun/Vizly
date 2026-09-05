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
      className: String(path.getAttribute?.('class') || '').slice(0, 200),
      contrastMode: String(path.getAttribute?.('data-edge-contrast') || '').slice(0, 32),
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
  const activeTraceEdgeCount = edgeWrappers.filter(wrapper => (
    wrapper.classList?.contains?.('selected')
    || wrapper.matches?.(':hover')
    || wrapper.matches?.(':focus-visible')
  )).length;
  const renderPathSources = edgeWrappers.map(wrapper => {
    const graphics = wrapper.querySelector?.('.stable-path-edge-graphics');
    return graphics?.getAttribute?.('data-render-path-source') ?? 'missing';
  });
  const renderAuthorities = edgeWrappers.map(wrapper => (
    wrapper.querySelector?.('.stable-path-edge-graphics')
      ?.getAttribute?.('data-render-authority') ?? 'missing'
  ));
  const renderAttachments = edgeWrappers.map(wrapper => (
    wrapper.querySelector?.('.stable-path-edge-graphics')
      ?.getAttribute?.('data-render-attachment') ?? 'missing'
  ));
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

  const nodeRects = scannedNodes;
  const visibleLabels = [];
  let visiblePrimaryLabelCount = 0;
  let visibleDetailLabelCount = 0;
  let labelNodeOverlapCount = 0;
  const labelNodeOverlaps = [];
  const visibleLabelHeights = [];
  const visibleLabelFontSizes = [];
  for (const label of labels) {
    const style = getComputedStyle(label);
    let visible = visibleStyle(style);
    for (let ancestor = label.parentElement; ancestor && visible; ancestor = ancestor.parentElement) {
      visible = visibleStyle(getComputedStyle(ancestor));
    }
    if (!visible) continue;
    const rect = label.getBoundingClientRect();
    if (!finiteRect(rect) || rect.width <= 1 || rect.height <= 1) continue;
    visibleLabels.push({ edgeId: label.getAttribute('data-edge-id') || '<missing>', rect });
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
        labelRect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        },
        nodeRect: {
          left: overlappingNode.rect.left,
          top: overlappingNode.rect.top,
          right: overlappingNode.rect.right,
          bottom: overlappingNode.rect.bottom,
        },
      });
    }
  }

  const labelLabelOverlaps = [];
  for (let first = 0; first < visibleLabels.length; first += 1) {
    for (let second = first + 1; second < visibleLabels.length; second += 1) {
      const a = visibleLabels[first];
      const b = visibleLabels[second];
      if (Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > 2
        && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > 2) {
        labelLabelOverlaps.push({ edgeA: a.edgeId, edgeB: b.edgeId });
      }
    }
  }
  return {
    ...nodeCoverage,
    labelLabelOverlapCount: labelLabelOverlaps.length,
    labelLabelOverlaps: labelLabelOverlaps.slice(0, 32),
    zoom,
    rootBackground: {
      r: Math.round(rootBackground.r),
      g: Math.round(rootBackground.g),
      b: Math.round(rootBackground.b),
    },
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
    activeTraceEdgeCount,
    interactionPathCount: interactionCounts.reduce((total, audit) => total + audit.count, 0),
    missingInteractionPathCount: interactionCounts.filter(audit => audit.count === 0).length,
    duplicateInteractionPathCount: interactionCounts.filter(audit => audit.count > 1).length,
    computedRenderPathCount: renderPathSources.filter(source => source === 'computed').length,
    fallbackRenderPathCount: renderPathSources.filter(source => source === 'fallback').length,
    missingRenderPathSourceCount: renderPathSources.filter(source => (
      source !== 'computed' && source !== 'fallback'
    )).length,
    acceptedRenderAuthorityCount: renderAuthorities.filter(value => value === 'accepted').length,
    rejectedRenderAuthorityCount: renderAuthorities.filter(value => value === 'rejected').length,
    acceptedRenderAttachmentCount: renderAttachments.filter(value => value === 'accepted').length,
    rejectedRenderAttachmentCount: renderAttachments.filter(value => value === 'rejected').length,
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
