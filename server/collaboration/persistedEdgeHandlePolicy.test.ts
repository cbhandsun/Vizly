// @vitest-environment node
import { expect, it } from 'vitest';
import { restorePersistedEdgeHandlePolicy } from './persistedEdgeHandlePolicy.js';

const edge = { id: 'a-b', source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left',
  data: { manualHandleSides: ['source', 'target'], label: 'Keep' } };

it('removes inferred fixed sides for saved automatic hints without mutating the input', () => {
  const before = structuredClone(edge);
  expect(restorePersistedEdgeHandlePolicy(edge, { metadata: {
    sourceHandle: 'right', targetHandle: 'left', manualHandles: false,
  } })).toEqual({ id: 'a-b', source: 'a', target: 'b', data: { label: 'Keep' } });
  expect(edge).toEqual(before);
});

it('preserves authored manual handles and legacy explicit ports', () => {
  expect(restorePersistedEdgeHandlePolicy(edge, { metadata: { manualHandles: true } })).toBe(edge);
  expect(restorePersistedEdgeHandlePolicy(edge, { metadata: { sourceHandle: 'right' } })).toBe(edge);
  expect(restorePersistedEdgeHandlePolicy(edge, { sourceHandle: 'right', targetHandle: 'left',
    metadata: { manualHandles: false } })).toBe(edge);
});

it('preserves an authored source side while releasing only the automatic target', () => {
  expect(restorePersistedEdgeHandlePolicy(edge, { metadata: {
    manualHandles: false, manualHandleSides: ['source'],
  } })).toEqual({ ...edge, targetHandle: undefined,
    data: { ...edge.data, manualHandleSides: ['source'] } });
});

it('honors explicit automatic roles while retaining a fixed opposite port', () => {
  expect(restorePersistedEdgeHandlePolicy(edge, { metadata: { autoHandles: ['target'] } }))
    .toEqual({ ...edge, targetHandle: undefined, data: { ...edge.data, manualHandleSides: ['source'] } });
});
