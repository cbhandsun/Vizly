import type { Edge } from '@xyflow/react';

const MAX_CANONICAL_LINE_HOPS_LENGTH = 128;
const oversizedLineHopTokens = new WeakMap<Edge, Readonly<{
  lineHops: string;
  token: string;
}>>();
let nextOversizedLineHopToken = 1;

const edgeRoutingQualityIntentFlags = (edge: Edge): string => {
  const data = edge.data ?? {};
  return `${data.sharedTrunkSynthesized === true ? 1 : 0}${
    data.sharedTrunkAware === true ? 1 : 0
  }${data.isTreeBus === true ? 1 : 0}${data.treeRouting ? 1 : 0}`;
};

const edgeRoutingLineHops = (edge: Edge): string => {
  const lineHops = edge.data?.h;
  return typeof lineHops === 'string' ? lineHops : '';
};

export const edgeRoutingQualityIntentToken = (edge: Edge): string => {
  return `${edgeRoutingQualityIntentFlags(edge)}${
    edgeRoutingLineHops(edge).slice(0, MAX_CANONICAL_LINE_HOPS_LENGTH)
  }`;
};

/**
 * Production input is bounded to 128 characters. Direct-core oversized input
 * receives an identity-scoped token so it cannot collide or retain an unbounded
 * string in strong signature caches; copied invalid input deliberately bypasses reuse.
 */
export const edgeRoutingExactQualityIntentToken = (edge: Edge): string => {
  const flags = edgeRoutingQualityIntentFlags(edge);
  const lineHops = edgeRoutingLineHops(edge);
  if (lineHops.length <= MAX_CANONICAL_LINE_HOPS_LENGTH) return `${flags}${lineHops}`;
  const cached = oversizedLineHopTokens.get(edge);
  if (cached?.lineHops === lineHops) return `${flags}${cached.token}`;
  const token = `oversized:${nextOversizedLineHopToken}:${lineHops.length}`;
  nextOversizedLineHopToken += 1;
  oversizedLineHopTokens.set(edge, { lineHops, token });
  return `${flags}${token}`;
};
