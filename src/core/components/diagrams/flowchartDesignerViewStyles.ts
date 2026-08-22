import type { CSSProperties } from 'react';

export const FLOWCHART_LOADING_OVERLAY_STYLE: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary, #64748b)',
    fontSize: 14,
    pointerEvents: 'none',
    zIndex: 5,
};
