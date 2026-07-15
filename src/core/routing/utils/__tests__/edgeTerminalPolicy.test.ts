import type { Edge } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import {
  edgeTerminalHandleChangeIsAllowed,
  edgeTerminalPositionIsFixed,
  edgeTerminalSideCanSwitch,
  readEdgeTerminalPolicy,
  resolveEdgeTerminalHandleForSide,
} from '../edgeTerminalPolicy';

const edge = (
  data: Record<string, unknown> = {},
  sourceHandle: string | null = 'source-right-port-1',
  targetHandle: string | null = 'target-left-port-1',
): Edge => ({
  id: 'edge',
  source: 'source',
  target: 'target',
  sourceHandle,
  targetHandle,
  data,
});

describe('edgeTerminalPolicy', () => {
  it.each([
    ['manualHandles=true', { manualHandles: true }],
    ['manual handle role', { manualHandles: { source: true } }],
    ['legacy manual handle', { _manualHandles: { source: true } }],
    ['manual position', { manualHandlePositions: ['SOURCE'] }],
    ['handle lock', { sourceHandleLocked: true }],
    ['position lock', { sourceHandlePositionLocked: true }],
    ['fixed position policy', { sourcePortPolicy: 'fixed-pos' }],
    ['forbidden constraint', { sourcePortConstraint: 'forbidden' }],
  ])('treats %s as an immutable source-authored exact terminal', (_name, data) => {
    const candidate = edge(data);

    expect(readEdgeTerminalPolicy(candidate, 'source').sourceExactFixed).toBe(true);
    expect(edgeTerminalPositionIsFixed(candidate, 'source')).toBe(true);
    expect(edgeTerminalSideCanSwitch(candidate, 'source', 'top')).toBe(false);
    expect(edgeTerminalHandleChangeIsAllowed(
      candidate,
      'source',
      'top',
      { allowRuntimeHandleChange: true },
    )).toBe(false);
  });

  it.each([
    ['manual side', { manualHandleSides: ['source'] }],
    ['strong policy', { sourcePortPolicy: 'strong' }],
    ['fixed side constraint', { sourcePortConstraint: 'fixed_side' }],
  ])('keeps %s on its declared side without claiming an exact position', (_name, data) => {
    const candidate = edge(data);

    expect(readEdgeTerminalPolicy(candidate, 'source')).toMatchObject({
      sourceExactFixed: false,
      positionFixed: false,
      sideFixed: true,
    });
    expect(edgeTerminalSideCanSwitch(candidate, 'source', 'right')).toBe(true);
    expect(edgeTerminalSideCanSwitch(candidate, 'source', 'bottom')).toBe(false);
  });

  it.each([
    ['runtime boolean', { runtimeHandleLock: true }],
    ['runtime role', { runtimeHandleLock: { source: true } }],
    ['legacy runtime role', { _runtimeHandleLock: { source: true } }],
  ])('allows trusted internal routing to refine %s but rejects untrusted patches', (_name, data) => {
    const candidate = edge(data);

    expect(readEdgeTerminalPolicy(candidate, 'source')).toMatchObject({
      runtimeFixed: true,
      sourceExactFixed: false,
      sideFixed: false,
    });
    expect(edgeTerminalSideCanSwitch(candidate, 'source', 'bottom')).toBe(true);
    expect(edgeTerminalHandleChangeIsAllowed(candidate, 'source', 'bottom')).toBe(false);
    expect(edgeTerminalHandleChangeIsAllowed(
      candidate,
      'source',
      'bottom',
      { allowRuntimeHandleChange: true },
    )).toBe(true);
  });

  it('preserves a compound handle for same-side routing and materializes a switched side', () => {
    const candidate = edge();

    expect(resolveEdgeTerminalHandleForSide(candidate, 'source', 'right'))
      .toBe('source-right-port-1');
    expect(resolveEdgeTerminalHandleForSide(candidate, 'source', 'bottom')).toBe('bottom');
  });

  it('fails closed for malformed or empty terminal metadata', () => {
    const malformed = edge({
      manualHandles: ['source'],
      manualHandleSides: 'source',
      runtimeHandleLock: ['source'],
      sourcePortPolicy: { value: 'fixed' },
    }, null);

    expect(readEdgeTerminalPolicy(malformed, 'source')).toMatchObject({
      forbidden: false,
      runtimeFixed: false,
      sourceExactFixed: false,
      sideFixed: false,
    });
    expect(edgeTerminalSideCanSwitch(malformed, 'source', 'right')).toBe(true);
    expect(resolveEdgeTerminalHandleForSide(malformed, 'source', 'right')).toBe('right');
  });
});
