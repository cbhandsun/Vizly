import { FLOWCHART_LOADING_OVERLAY_STYLE } from './flowchartDesignerViewStyles';

interface FlowchartLoadingOverlayProps {
  label: string;
}

export function FlowchartLoadingOverlay({ label }: FlowchartLoadingOverlayProps) {
  return <div style={FLOWCHART_LOADING_OVERLAY_STYLE}>{label}</div>;
}
