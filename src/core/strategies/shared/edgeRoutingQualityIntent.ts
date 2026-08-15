import type { Edge } from '@xyflow/react';

export const edgeRoutingQualityIntentToken = (edge: Edge): string => {
  const data = edge.data ?? {};
  const lineHops = data.h;
  return `${data.sharedTrunkSynthesized === true ? 1 : 0}${
    data.sharedTrunkAware === true ? 1 : 0
  }${data.isTreeBus === true ? 1 : 0}${data.treeRouting ? 1 : 0}${
    typeof lineHops === 'string' ? lineHops.slice(0, 128) : ''
  }`;
};
