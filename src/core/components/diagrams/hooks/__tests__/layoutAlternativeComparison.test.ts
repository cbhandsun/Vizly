import { beforeEach, expect, it, vi } from 'vitest';
import { createLayoutAlternativeComparison } from '../layoutAlternativeComparison';
import { LayoutType } from '../../../../types/layout';
const mocks = vi.hoisted(() => ({ aligned: vi.fn(), create: vi.fn(), prefer: vi.fn() }));
vi.mock('../alignedLaneLayout', () => ({ createAlignedLaneComparison: mocks.aligned }));
vi.mock('../compactGroupedLayout', () => ({ createCompactGroupedLayout: mocks.create, preferCompactGroupedLayout: mocks.prefer }));
const input = { nodes: [], edges: [], options: { type: LayoutType.DAGRE }, direction: 'LR' as const,
  context: {}, onSelectedDecision: vi.fn(), compactGroups: false, globalLanes: false, hasPreservedNodes: false };
const decision = { version: 1 as const, policyVersion: 1 as const, requested: 'auto' as const,
  applied: 'global' as const, reason: 'global-preserved' as const, direction: 'LR' as const,
  connectedInputFingerprint: 'test', metrics: {} };
beforeEach(() => vi.clearAllMocks());
it('does not create alternatives for focused, unrelated or non-global layouts', async () => {
  for (const changes of [{}, { compactGroups: true, hasPreservedNodes: true },
    { globalLanes: true }, { globalLanes: true, decision: { ...decision, applied: 'compact' as const } }]) {
    expect(await createLayoutAlternativeComparison({ ...input, ...changes })).toBeUndefined();
  }
  expect(mocks.aligned).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('defers compact geometry calculation until staging asks for it', async () => {
  const comparison = await createLayoutAlternativeComparison({ ...input, compactGroups: true });
  expect(mocks.create).not.toHaveBeenCalled();
  if (!comparison) throw new Error('Missing compact comparison');
  await comparison.create();
  expect(mocks.create).toHaveBeenCalledWith(input.nodes, input.edges, input.options, 'LR', input.context);
  expect(mocks.aligned).not.toHaveBeenCalled();
});
it('passes current global metadata and selection callback to the lane comparison', async () => {
  await createLayoutAlternativeComparison({ ...input, globalLanes: true, decision });
  expect(mocks.aligned).toHaveBeenCalledWith(expect.objectContaining({ decision,
    onSelectedDecision: input.onSelectedDecision, direction: 'LR' }));
  expect(mocks.create).not.toHaveBeenCalled();
});
