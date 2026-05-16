import { MarkerType } from '@xyflow/react';
import { THEMES } from './flowStyles';

export const EDGE_STYLES = {
  default: {
    style: { strokeWidth: 2, stroke: '#94a3b8' },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
  },
  core: {
    style: { strokeWidth: 3, stroke: THEMES.core.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.core.color },
    animated: true,
  },
  channel: {
    style: { strokeWidth: 2, stroke: THEMES.channel.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.channel.color },
  },
  midend: {
    style: { strokeWidth: 2, stroke: THEMES.midend.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.midend.color },
  },
  scm: {
    style: { strokeWidth: 2, stroke: THEMES.scm.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.scm.color },
  },
  logistics: {
    style: { strokeWidth: 2, stroke: THEMES.logistics.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.logistics.color },
  },
  corp: {
    style: { strokeWidth: 2, stroke: THEMES.corp.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.corp.color },
  },
  data: {
    style: { strokeWidth: 2, stroke: THEMES.data.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.data.color },
  },
  infra: {
    style: { strokeWidth: 2, stroke: THEMES.infra.color },
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: THEMES.infra.color },
  },
};

export const createEdge = (source: string, target: string, style = EDGE_STYLES.default) => ({
  id: `${source}-${target}`,
  source,
  target,
  ...style,
});

export const createCoreFlowEdges = (nodes: string[]) => {
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push(createEdge(nodes[i], nodes[i + 1], EDGE_STYLES.core));
  }
  return edges;
};

export const createDomainInternalEdges = (domain: string, nodes: string[], style = EDGE_STYLES.default) => {
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      edges.push(createEdge(`${domain}-${nodes[i]}`, `${domain}-${nodes[j]}`, style));
    }
  }
  return edges;
};

export const createDataFlowEdges = (sources: string[], targets: string[], style = EDGE_STYLES.data) => {
  const edges = [];
  for (const source of sources) {
    for (const target of targets) {
      edges.push(createEdge(source, target, style));
    }
  }
  return edges;
};
