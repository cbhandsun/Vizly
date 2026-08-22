export const assertDisplayRoutingVisualScaleAudit = ({
  name,
  audit,
  expectedSignature,
  expectedZoom = null,
  expectedEdgeCount = 14,
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
    || audit.duplicateMarkerEdgeCount !== 0
    || audit.edgeAccessibleNameMissingCount !== 0
    || audit.labelCount !== expectedEdgeCount
    || audit.labelNodeOverlapCount !== 0
    || (expectsOverviewLod
      ? (!audit.zoomedOut
        || audit.visiblePrimaryLabelCount < 1
        || audit.visibleDetailLabelCount !== 0)
      : (audit.zoomedOut || audit.visibleLabelCount !== audit.labelCount))
    || (audit.visibleLabelCount > 0 && (
      !Number.isFinite(audit.minimumVisibleLabelHeight)
      || audit.minimumVisibleLabelHeight < 9
      || !Number.isFinite(audit.maximumVisibleLabelHeight)
      || audit.maximumVisibleLabelHeight > 120
      || audit.invalidVisibleLabelFontSizeCount !== 0
    ));
  if (invalid) {
    throw new Error(`Fixed visual scale audit failed at ${name}:\n${JSON.stringify(audit, null, 2)}`);
  }
};
