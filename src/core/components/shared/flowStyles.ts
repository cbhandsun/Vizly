import { MarkerType } from '@xyflow/react';
import type React from 'react';
import { type EdgeStyleToken, type FlowStylePreset } from './DiagramStyleManager';
// useDiagramStylePreset_v2 import removed to break circular dependency.

export const THEMES = {
  oms: { border: '#7E57C2', color: '#7E57C2' },
  wms: { border: '#039BE5', color: '#039BE5' },
  tms: { border: '#43A047', color: '#43A047' },
  data: { border: '#F57C00', color: '#F57C00' },
  external: { border: '#546E7A', color: '#546E7A' },
  midend: { border: '#1976D2', color: '#1976D2' },
  // 兼容架构图中使用的域键
  ch: { border: '#1976D2', color: '#1976D2' },
  fe: { border: '#0288D1', color: '#0288D1' },
  scm: { border: '#00796B', color: '#00796B' },
  logistics: { border: '#795548', color: '#795548' },
  corp: { border: '#E65100', color: '#E65100' },
  infra: { border: '#455A64', color: '#455A64' },
  core: { border: '#0288D1', color: '#0288D1' },
  strategy: { border: '#43A047', color: '#43A047' },
  financial: { border: '#D81B60', color: '#D81B60' },
  channel: { border: '#1976D2', color: '#1976D2' },
};

export const FLOW_STYLES = {
  main: {
    style: { stroke: '#212121', strokeWidth: 3 },
    arrow: { type: MarkerType.ArrowClosed, color: '#212121', width: 20, height: 20 },
  },
  status: {
    style: { stroke: '#D81B60', strokeWidth: 2, strokeDasharray: '8 5' },
    arrow: { type: MarkerType.ArrowClosed, color: '#D81B60', width: 16, height: 16 },
  },
  support: {
    style: { stroke: THEMES.data.border, strokeWidth: 2, strokeDasharray: '5 5' },
    arrow: { type: MarkerType.ArrowClosed, color: THEMES.data.border, width: 16, height: 16 },
  },
  dependency: {
    style: { stroke: '#455A64', strokeWidth: 2, strokeDasharray: '6 4' },
    arrow: { type: MarkerType.ArrowClosed, color: '#455A64', width: 16, height: 16 },
  },
  data: {
    style: { stroke: THEMES.data.border, strokeWidth: 2 },
    arrow: { type: MarkerType.ArrowClosed, color: THEMES.data.border, width: 16, height: 16 },
  },
};

export const NODE_STYLES = {
  base: {
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '12px 24px',
    boxSizing: 'border-box' as const,
    boxShadow: '0 4px 8px rgba(0,0,0,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: '12px',
    height: '12px',
    background: 'transparent',
    border: 'none',
  },
  content: {
    fontSize: '1.1rem',
    lineHeight: '1.5',
    textAlign: 'center' as const,
  },
};

export const EDGE_LABEL_STYLE = {
  fontSize: '0.85rem',
  fill: '#666',
  fontWeight: 500,
};

// ===== 动态样式（基于 DiagramStyleManager 预设） =====

type ReactFlowEdgeCssVars = {
  '--xy-edge-stroke': string;
  '--xy-edge-stroke-width': number;
};

type ReactFlowEdgeStyle = React.CSSProperties & ReactFlowEdgeCssVars;

function tokenToFlowStyle(token: EdgeStyleToken) {
  const style: ReactFlowEdgeStyle = {
    stroke: token.color,
    strokeWidth: token.width,
    '--xy-edge-stroke': token.color,
    '--xy-edge-stroke-width': token.width,
    ...(token.dash ? { strokeDasharray: token.dash } : {}),
  };

  return {
    style,
    arrow: {
      type: MarkerType.ArrowClosed,
      color: token.arrow.color,
      width: token.arrow.width,
      height: token.arrow.height,
    },
  };
}

export function getFlowStylesForPreset(preset: FlowStylePreset) {
  return {
    main: tokenToFlowStyle(preset.edges.main),
    status: tokenToFlowStyle(preset.edges.status),
    support: tokenToFlowStyle(preset.edges.support),
    dependency: tokenToFlowStyle(preset.edges.dependency),
    data: tokenToFlowStyle(preset.edges.data),
  } as const;
}

// useFlowStyles removed to prevent circular dependencies. 
// Consumers should import from src/core/hooks/useFlowStyles.
