import type { Edge } from '@xyflow/react';

import { normalizeHandle } from './handleUtils';

export type EdgeTerminalRole = 'source' | 'target';
export type EdgeTerminalSide = 'top' | 'bottom' | 'left' | 'right';

export type EdgeTerminalPolicy = {
  forbidden: boolean;
  runtimeFixed: boolean;
  sourceExactFixed: boolean;
  positionFixed: boolean;
  sideFixed: boolean;
};

export type EdgeTerminalHandleChangeOptions = {
  /**
   * Runtime locks record a router-owned choice. Only a fully validated trusted
   * route may refine that choice; persistent or otherwise external patches may
   * not use this option.
   */
  allowRuntimeHandleChange?: boolean;
};

const roleFlagIsSet = (
  value: unknown,
  role: EdgeTerminalRole,
): boolean => {
  if (value === true) return true;
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (value as Record<string, unknown>)[role],
  );
};

const roleListIncludes = (
  value: unknown,
  role: EdgeTerminalRole,
): boolean => {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (String(item).toLowerCase() === role) return true;
  }
  return false;
};

const isFixedSidePolicy = (policy: string): boolean => (
  policy === 'strong'
  || policy === 'fixed'
  || policy === 'fixed-side'
  || policy === 'fixed_side'
);

const terminalHandle = (
  edge: Edge,
  role: EdgeTerminalRole,
): string | null | undefined => (
  role === 'source' ? edge.sourceHandle : edge.targetHandle
);

/**
 * Reads every supported source-authored and router-owned terminal constraint in
 * one place. This module deliberately has no dependency on display components
 * or routing strategies so both layers can enforce the same ownership rules.
 */
export const readEdgeTerminalPolicy = (
  edge: Edge,
  role: EdgeTerminalRole,
): EdgeTerminalPolicy => {
  const data = edge.data && typeof edge.data === 'object' && !Array.isArray(edge.data)
    ? edge.data as Record<string, unknown>
    : {};
  const manualHandles = data.manualHandles ?? data._manualHandles;
  const runtimeHandleLock = data.runtimeHandleLock ?? data._runtimeHandleLock;
  const rawPolicy = role === 'source'
    ? data.sourcePortPolicy ?? data.sourcePortConstraint
    : data.targetPortPolicy ?? data.targetPortConstraint;
  const policy = rawPolicy == null ? '' : String(rawPolicy).toLowerCase();
  const handleLocked = role === 'source'
    ? data.sourceHandleLocked === true
    : data.targetHandleLocked === true;
  const handlePositionLocked = role === 'source'
    ? data.sourceHandlePositionLocked === true
    : data.targetHandlePositionLocked === true;
  const forbidden = policy === 'forbidden';
  const sourceExactFixed = forbidden
    || roleFlagIsSet(manualHandles, role)
    || roleListIncludes(data.manualHandlePositions, role)
    || handleLocked
    || handlePositionLocked
    || policy === 'fixed-pos'
    || policy === 'fixed_pos';

  return {
    forbidden,
    runtimeFixed: roleFlagIsSet(runtimeHandleLock, role),
    sourceExactFixed,
    positionFixed: sourceExactFixed,
    sideFixed: sourceExactFixed
      || roleListIncludes(data.manualHandleSides, role)
      || isFixedSidePolicy(policy),
  };
};

export const edgeTerminalPositionIsFixed = (
  edge: Edge,
  role: EdgeTerminalRole,
): boolean => readEdgeTerminalPolicy(edge, role).positionFixed;

export const edgeTerminalSideIsFixed = (
  edge: Edge,
  role: EdgeTerminalRole,
): boolean => readEdgeTerminalPolicy(edge, role).sideFixed;

/** Internal routing eligibility. Runtime locks do not prevent a trusted reroute. */
export const edgeTerminalSideCanSwitch = (
  edge: Edge,
  role: EdgeTerminalRole,
  nextSide: EdgeTerminalSide,
): boolean => {
  const policy = readEdgeTerminalPolicy(edge, role);
  if (policy.forbidden) return false;
  if (!policy.sideFixed) return true;
  return normalizeHandle(terminalHandle(edge, role)) === nextSide[0];
};

/**
 * Converts a side-only geometry decision into a handle identifier. A candidate
 * that stays on the current side retains any compound/custom handle ID because
 * the candidate selected a side, not a different DOM port. Callers must first
 * use edgeTerminalSideCanSwitch when the candidate may change sides.
 */
export const resolveEdgeTerminalHandleForSide = (
  edge: Edge,
  role: EdgeTerminalRole,
  nextSide: EdgeTerminalSide,
): string | null | undefined => {
  const currentHandle = terminalHandle(edge, role);
  const currentSide = normalizeHandle(currentHandle);
  if (currentSide === nextSide[0]) return currentHandle;
  if (readEdgeTerminalPolicy(edge, role).sideFixed) return currentHandle;
  return nextSide;
};

/**
 * Trust-boundary validation for a proposed handle patch. Source-authored
 * exact/forbidden declarations are immutable. Side-only declarations may keep
 * their side. Router-owned runtime locks are mutable only for trusted results.
 */
export const edgeTerminalHandleChangeIsAllowed = (
  edge: Edge,
  role: EdgeTerminalRole,
  nextHandle: unknown,
  options: EdgeTerminalHandleChangeOptions = {},
): boolean => {
  const currentHandle = terminalHandle(edge, role);
  if (Object.is(currentHandle, nextHandle)) return true;
  const policy = readEdgeTerminalPolicy(edge, role);
  if (
    policy.forbidden
    || policy.sourceExactFixed
    || (policy.runtimeFixed && options.allowRuntimeHandleChange !== true)
  ) return false;
  if (!policy.sideFixed) return true;
  if (typeof nextHandle !== 'string') return false;
  const currentSide = normalizeHandle(currentHandle);
  const nextSide = normalizeHandle(nextHandle);
  return typeof currentSide !== 'undefined' && currentSide === nextSide;
};
