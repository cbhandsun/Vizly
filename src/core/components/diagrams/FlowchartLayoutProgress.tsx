interface FlowchartLayoutProgressProps {
  label: string;
  visible: boolean;
}

/**
 * Gives layout commands an immediate, non-blocking acknowledgement while the
 * target geometry and trusted edge routes are prepared off-screen.
 */
export const FlowchartLayoutProgress = ({ label, visible }: FlowchartLayoutProgressProps) => {
  if (!visible) return null;
  return (
    <div
      className="flowchart-layout-progress"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="flowchart-layout-progress__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
};
