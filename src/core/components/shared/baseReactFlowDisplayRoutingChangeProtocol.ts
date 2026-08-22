import type { BaseReactFlowRoutingChangeSet } from './baseReactFlowDisplayRoutingChangeSet';

const MAX_GRAPH_ITEMS = 10_000;
const MAX_IDENTIFIER_LENGTH = 20_000;
const ROUTING_CHANGE_REASONS = new Set<BaseReactFlowRoutingChangeSet['reason']>([
  'node-drag',
  'node-resize',
  'node-add',
  'node-remove',
  'edge-add',
  'edge-remove',
  'port-policy',
  'container-change',
  'layout',
  'unknown',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
  && (
    Object.getPrototypeOf(value) === Object.prototype
    || Object.getPrototypeOf(value) === null
  )
);

const parseIdentifierList = (value: unknown): string[] | null => {
  if (!Array.isArray(value) || value.length > MAX_GRAPH_ITEMS) return null;
  const identifiers = new Set<string>();
  for (const item of value) {
    if (
      typeof item !== 'string'
      || item.length === 0
      || item.length > MAX_IDENTIFIER_LENGTH
      || identifiers.has(item)
    ) return null;
    identifiers.add(item);
  }
  return [...identifiers];
};

export const parseDisplayRoutingChangeSet = (
  value: unknown,
): BaseReactFlowRoutingChangeSet | null => {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (
    keys.length !== 5
    || !keys.every(key => (
      key === 'reason'
      || key === 'changedNodeIds'
      || key === 'changedEdgeIds'
      || key === 'topologyChanged'
      || key === 'geometryChanged'
    ))
    || typeof value.reason !== 'string'
    || !ROUTING_CHANGE_REASONS.has(value.reason as BaseReactFlowRoutingChangeSet['reason'])
    || typeof value.topologyChanged !== 'boolean'
    || typeof value.geometryChanged !== 'boolean'
  ) return null;
  const changedNodeIds = parseIdentifierList(value.changedNodeIds);
  const changedEdgeIds = parseIdentifierList(value.changedEdgeIds);
  return changedNodeIds && changedEdgeIds
    ? {
      reason: value.reason as BaseReactFlowRoutingChangeSet['reason'],
      changedNodeIds,
      changedEdgeIds,
      topologyChanged: value.topologyChanged,
      geometryChanged: value.geometryChanged,
    }
    : null;
};

export const parseDisplayRoutingIdentifierList = parseIdentifierList;
