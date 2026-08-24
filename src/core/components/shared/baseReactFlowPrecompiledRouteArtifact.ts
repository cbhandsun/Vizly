import type { Edge } from '@xyflow/react';

import { parseRoutingLineHops } from '../../routing/routingLineHops';
import {
  BASE_DISPLAY_ROUTING_VERSION,
  isBaseReactFlowDisplayOutputRouteSignature,
  type BaseReactFlowDisplayEdgesCacheEntry,
} from './baseReactFlowDisplayCache';
import { isBaseReactFlowDisplayGeometryDigest } from './baseReactFlowDisplayInputIdentity';
import { displayTerminalHandleChangeIsAllowed } from './baseReactFlowDisplayTerminalPolicy';
import { baseReactFlowDisplayCommercialQualityIsClean } from './baseReactFlowDisplayCommercialQuality';

export const BASE_REACT_FLOW_PRECOMPILED_ROUTE_SCHEMA = 'vizly-precompiled-display-route-v1';
export const BASE_REACT_FLOW_PRECOMPILED_SOURCE_HASH_PATTERN = /^source-v1:[0-9a-f]{64}$/;
export const BASE_REACT_FLOW_PRECOMPILED_INPUT_SIGNATURE_PATTERN = /^\d{1,10}$/;

const MAX_PATCHES = 300;
const MAX_IDENTIFIER_LENGTH = 500;
const MAX_ARRAY_ITEMS = 2_000;
const MAX_TOTAL_PATH_POINTS = 200_000;
const MAX_COORDINATE = 1_000_000_000;
const PATCH_KEYS = new Set([
  'id',
  'source',
  'target',
  'type',
  'sourceHandle',
  'targetHandle',
  'data',
]);
const ROUTING_INTENT_KEYS = [
  'sharedTrunkAware',
  'sharedTrunkSynthesized',
  'isTreeBus',
  'overextendedTargetTrunkCorridorReclaimed',
] as const;
const ROUTING_DATA_KEYS = new Set([
  'computedPath',
  'elkPath',
  'treeRouting',
  'h',
  ...ROUTING_INTENT_KEYS,
]);
const TREE_ROUTING_KEYS = new Set(['effectiveSourceHandle', 'effectiveTargetHandle', 'points']);

export type BaseReactFlowPrecompiledRouteArtifact = {
  schema: typeof BASE_REACT_FLOW_PRECOMPILED_ROUTE_SCHEMA;
  routingVersion: string;
  sourceHash: string;
  inputSignature: string;
  inputGeometryDigest: string;
  outputRouteSignature: string;
  hardClean: true;
  patches: Edge[];
};

export type BaseReactFlowPrecompiledRouteArtifactExpectation = {
  inputSignature: string;
  inputGeometryDigest: string;
  sourceHash: string;
  routingVersion?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isBoundedIdentifier = (value: unknown): value is string => (
  typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTIFIER_LENGTH
);

const isRoutingPoint = (value: unknown): boolean => (
  isRecord(value)
  && Object.keys(value).length === 2
  && Object.keys(value).every(key => key === 'x' || key === 'y')
  && typeof value.x === 'number'
  && Number.isFinite(value.x)
  && Math.abs(value.x) <= MAX_COORDINATE
  && typeof value.y === 'number'
  && Number.isFinite(value.y)
  && Math.abs(value.y) <= MAX_COORDINATE
);

const isRoutingPath = (
  value: unknown,
  required: boolean,
  pointBudget: { total: number },
): boolean => {
  if (
    !Array.isArray(value)
    || value.length > MAX_ARRAY_ITEMS
    || (required && value.length < 2)
    || !value.every(isRoutingPoint)
  ) return false;
  pointBudget.total += value.length;
  return pointBudget.total <= MAX_TOTAL_PATH_POINTS;
};

const isRoutingDataPatch = (value: unknown, pointBudget: { total: number }): boolean => {
  if (!isRecord(value) || !Object.keys(value).every(key => ROUTING_DATA_KEYS.has(key))) return false;
  for (const key of ROUTING_INTENT_KEYS) {
    if (typeof value[key] !== 'undefined' && typeof value[key] !== 'boolean') return false;
  }
  if (
    typeof value.h !== 'undefined'
    && !parseRoutingLineHops(value.h)
  ) return false;
  if (
    typeof value.computedPath !== 'undefined'
    && !isRoutingPath(value.computedPath, true, pointBudget)
  ) return false;
  if (
    typeof value.elkPath !== 'undefined'
    && !isRoutingPath(value.elkPath, false, pointBudget)
  ) return false;
  if (typeof value.treeRouting !== 'undefined') {
    if (
      !isRecord(value.treeRouting)
      || !Object.keys(value.treeRouting).every(key => TREE_ROUTING_KEYS.has(key))
    ) return false;
    for (const key of ['effectiveSourceHandle', 'effectiveTargetHandle'] as const) {
      const handle = value.treeRouting[key];
      if (handle != null && (typeof handle !== 'string' || handle.length > MAX_IDENTIFIER_LENGTH)) {
        return false;
      }
    }
    if (
      typeof value.treeRouting.points !== 'undefined'
      && !isRoutingPath(value.treeRouting.points, false, pointBudget)
    ) return false;
  }
  return true;
};

const parseRoutingPatch = (value: unknown, pointBudget: { total: number }): Edge | null => {
  if (!isRecord(value) || !Object.keys(value).every(key => PATCH_KEYS.has(key))) return null;
  if (
    !isBoundedIdentifier(value.id)
    || !isBoundedIdentifier(value.source)
    || !isBoundedIdentifier(value.target)
  ) return null;
  for (const key of ['type', 'sourceHandle', 'targetHandle'] as const) {
    const item = value[key];
    if (item != null && (typeof item !== 'string' || item.length > MAX_IDENTIFIER_LENGTH)) return null;
  }
  if (typeof value.data !== 'undefined' && !isRoutingDataPatch(value.data, pointBudget)) {
    return null;
  }
  return structuredClone(value) as unknown as Edge;
};

export const parseBaseReactFlowPrecompiledRoutePatches = (
  value: unknown,
): Edge[] | null => {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > MAX_PATCHES
  ) return null;
  const pointBudget = { total: 0 };
  const patches: Edge[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const patch = parseRoutingPatch(value[index], pointBudget);
    if (!patch) return null;
    patches.push(patch);
  }
  return patches;
};

export const sanitizeBaseReactFlowPrecompiledRoutePatches = (
  sourceEdges: Edge[],
  value: unknown,
): Edge[] | null => {
  const patches = parseBaseReactFlowPrecompiledRoutePatches(value);
  if (!patches || patches.length !== sourceEdges.length) return null;
  for (let index = 0; index < patches.length; index += 1) {
    const patch = patches[index];
    const sourceEdge = sourceEdges[index];
    if (
      !sourceEdge
      || patch.id !== sourceEdge.id
      || patch.source !== sourceEdge.source
      || patch.target !== sourceEdge.target
      || (
        typeof patch.type !== 'undefined'
        && patch.type !== sourceEdge.type
        && patch.type !== 'stablePath'
      )
    ) return null;
    if (
      (Object.prototype.hasOwnProperty.call(patch, 'sourceHandle')
        && !displayTerminalHandleChangeIsAllowed(
          sourceEdge,
          'source',
          patch.sourceHandle,
          { allowRuntimeHandleChange: true },
        ))
      || (Object.prototype.hasOwnProperty.call(patch, 'targetHandle')
        && !displayTerminalHandleChangeIsAllowed(
          sourceEdge,
          'target',
          patch.targetHandle,
          { allowRuntimeHandleChange: true },
        ))
    ) return null;
    const data = patch.data && typeof patch.data === 'object' && !Array.isArray(patch.data)
      ? patch.data as Record<string, unknown>
      : null;
    const treeRouting = data?.treeRouting && typeof data.treeRouting === 'object'
      && !Array.isArray(data.treeRouting)
      ? data.treeRouting as Record<string, unknown>
      : null;
    if (
      treeRouting
      && (
        (Object.prototype.hasOwnProperty.call(treeRouting, 'effectiveSourceHandle')
          && !displayTerminalHandleChangeIsAllowed(
            sourceEdge,
            'source',
            treeRouting.effectiveSourceHandle,
            { allowRuntimeHandleChange: true },
          ))
        || (Object.prototype.hasOwnProperty.call(treeRouting, 'effectiveTargetHandle')
          && !displayTerminalHandleChangeIsAllowed(
            sourceEdge,
            'target',
            treeRouting.effectiveTargetHandle,
            { allowRuntimeHandleChange: true },
          ))
      )
    ) return null;
  }
  return patches;
};

export const parseBaseReactFlowPrecompiledRouteArtifact = (
  value: unknown,
  expectation: BaseReactFlowPrecompiledRouteArtifactExpectation,
): BaseReactFlowDisplayEdgesCacheEntry | null => {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  const expectedKeys = [
    'schema',
    'routingVersion',
    'sourceHash',
    'inputSignature',
    'inputGeometryDigest',
    'outputRouteSignature',
    'hardClean',
    'patches',
  ];
  if (keys.length !== expectedKeys.length || !keys.every(key => expectedKeys.includes(key))) {
    return null;
  }
  const routingVersion = expectation.routingVersion ?? BASE_DISPLAY_ROUTING_VERSION;
  if (
    value.schema !== BASE_REACT_FLOW_PRECOMPILED_ROUTE_SCHEMA
    || value.routingVersion !== routingVersion
    || value.sourceHash !== expectation.sourceHash
    || !BASE_REACT_FLOW_PRECOMPILED_SOURCE_HASH_PATTERN.test(expectation.sourceHash)
    || !BASE_REACT_FLOW_PRECOMPILED_INPUT_SIGNATURE_PATTERN.test(expectation.inputSignature)
    || value.inputSignature !== expectation.inputSignature
    || value.inputGeometryDigest !== expectation.inputGeometryDigest
    || !isBaseReactFlowDisplayGeometryDigest(value.inputGeometryDigest)
    || value.hardClean !== true
    || !isBaseReactFlowDisplayOutputRouteSignature(value.outputRouteSignature)
    || !Array.isArray(value.patches)
    || value.patches.length === 0
    || value.patches.length > MAX_PATCHES
  ) return null;
  const patches = parseBaseReactFlowPrecompiledRoutePatches(value.patches);
  if (!patches || !baseReactFlowDisplayCommercialQualityIsClean(patches)) return null;
  return {
    edges: patches,
    hardClean: true,
    outputRouteSignature: value.outputRouteSignature,
  };
};
