export const assertDisplayRoutingVisualScaleAudit = ({
  name,
  audit,
  expectedSignature,
  expectedZoom = null,
  expectedEdgeCount = 14,
  expectedLabelCount = expectedEdgeCount,
  requireOverviewPrimaryLabel = true,
}) => {
  const expectsOverviewLod = audit?.zoom < 0.4;
  const invalid = !audit
    || (expectedZoom !== null && Math.abs(audit.zoom - expectedZoom) > 0.01)
    || audit.routeSignature !== expectedSignature
    || audit.pathCount < expectedEdgeCount
    || audit.paintedPathCount < expectedEdgeCount
    || audit.invalidNonScalingPathCount !== 0
    || audit.invalidStrokeWidthCount !== 0
    || audit.lowContrastPathCount !== 0
    || audit.markerCount < 1
    || audit.markerContrastAuditedCount !== audit.markerCount
    || audit.lowContrastMarkerCount !== 0
    || audit.interactionEdgeCount !== expectedEdgeCount
    || audit.interactionPathCount !== expectedEdgeCount
    || audit.missingInteractionPathCount !== 0
    || audit.duplicateInteractionPathCount !== 0
    || audit.computedRenderPathCount !== expectedEdgeCount
    || audit.fallbackRenderPathCount !== 0
    || audit.missingRenderPathSourceCount !== 0
    || audit.duplicateMarkerEdgeCount !== 0
    || audit.edgeAccessibleNameMissingCount !== 0
    || (expectedLabelCount !== null && audit.labelCount !== expectedLabelCount)
    || audit.labelNodeOverlapCount !== 0
    || (expectsOverviewLod
      ? (!audit.zoomedOut
        || (requireOverviewPrimaryLabel && audit.visiblePrimaryLabelCount < 1)
        || (audit.activeTraceEdgeCount === 0 && audit.visibleDetailLabelCount !== 0)
        || audit.visibleDetailLabelCount > audit.activeTraceEdgeCount)
      : (audit.zoomedOut || audit.visibleLabelCount !== audit.labelCount))
    || (audit.visibleLabelCount > 0 && (
      !Number.isFinite(audit.minimumVisibleLabelHeight)
      || audit.minimumVisibleLabelHeight < 9
      || !Number.isFinite(audit.maximumVisibleLabelHeight)
      || audit.maximumVisibleLabelHeight > 120
      || audit.invalidVisibleLabelFontSizeCount !== 0
    ));
  if (invalid) {
    const summary = {
      zoom: audit?.zoom,
      rootBackground: audit?.rootBackground,
      signatureMatches: audit?.routeSignature === expectedSignature,
      expectedEdgeCount,
      expectedLabelCount,
      pathCount: audit?.pathCount,
      paintedPathCount: audit?.paintedPathCount,
      invalidNonScalingPathCount: audit?.invalidNonScalingPathCount,
      invalidStrokeWidthCount: audit?.invalidStrokeWidthCount,
      lowContrastPathCount: audit?.lowContrastPathCount,
      lowContrastPaintKinds: Array.isArray(audit?.lowContrastPaths)
        ? [...new Map(audit.lowContrastPaths.map(item => [
          JSON.stringify([
            item?.className,
            item?.contrastMode,
            item?.stroke,
            item?.opacity,
            item?.semanticContrast,
            item?.boundaryContrast,
            item?.effectiveContrast,
          ]),
          {
            className: item?.className,
            contrastMode: item?.contrastMode,
            stroke: item?.stroke,
            opacity: item?.opacity,
            semanticContrast: item?.semanticContrast,
            boundaryContrast: item?.boundaryContrast,
            effectiveContrast: item?.effectiveContrast,
          },
        ])).values()].slice(0, 8)
        : [],
      markerCount: audit?.markerCount,
      markerContrastAuditedCount: audit?.markerContrastAuditedCount,
      lowContrastMarkerCount: audit?.lowContrastMarkerCount,
      interactionEdgeCount: audit?.interactionEdgeCount,
      activeTraceEdgeCount: audit?.activeTraceEdgeCount,
      interactionPathCount: audit?.interactionPathCount,
      missingInteractionPathCount: audit?.missingInteractionPathCount,
      duplicateInteractionPathCount: audit?.duplicateInteractionPathCount,
      computedRenderPathCount: audit?.computedRenderPathCount,
      fallbackRenderPathCount: audit?.fallbackRenderPathCount,
      missingRenderPathSourceCount: audit?.missingRenderPathSourceCount,
      duplicateMarkerEdgeCount: audit?.duplicateMarkerEdgeCount,
      edgeAccessibleNameMissingCount: audit?.edgeAccessibleNameMissingCount,
      labelCount: audit?.labelCount,
      labelNodeOverlapCount: audit?.labelNodeOverlapCount,
      visibleLabelCount: audit?.visibleLabelCount,
      visiblePrimaryLabelCount: audit?.visiblePrimaryLabelCount,
      visibleDetailLabelCount: audit?.visibleDetailLabelCount,
      invalidVisibleLabelFontSizeCount: audit?.invalidVisibleLabelFontSizeCount,
    };
    throw new Error(`Fixed visual scale audit failed at ${name}: ${JSON.stringify(summary)}`);
  }
};
