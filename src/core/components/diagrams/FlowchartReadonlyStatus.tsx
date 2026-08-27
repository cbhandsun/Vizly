export const FlowchartReadonlyStatus = ({ text }: { text: string }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      position: 'absolute',
      top: 72,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 120,
      padding: '8px 14px',
      borderRadius: 999,
      background: 'rgba(15, 23, 42, 0.9)',
      color: '#fff',
      fontSize: 13,
      fontWeight: 600,
      pointerEvents: 'none',
    }}
  >
    {text}
  </div>
);
