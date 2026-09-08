// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { stagePreferredLayoutCandidate, type LayoutCandidate } from '../layoutCandidateSelection';

const baseline: LayoutCandidate = { nodes: [], edges: [] };
const alternative: LayoutCandidate = { nodes: [], edges: [] };
const setup = () => {
  const controller = new AbortController();
  const commitSnapshot = vi.fn(() => true);
  const stage = vi.fn(async (candidate: LayoutCandidate) => ({
    committedSourceEdges: candidate.edges,
    routedEdges: candidate.edges,
    commitSnapshot,
  }));
  return { baseline, createAlternative: vi.fn(async () => alternative), stage,
    preferAlternative: vi.fn(() => true), signal: controller.signal, controller, commitSnapshot };
};

describe('off-screen layout candidate selection', () => {
  it.each([true, false])('selects one staged candidate without committing either (prefer=%s)', async prefer => {
    const args = setup();
    args.preferAlternative.mockReturnValue(prefer);
    const result = await stagePreferredLayoutCandidate(args);
    expect(result.geometry).toBe(prefer ? alternative : baseline);
    expect(args.stage.mock.calls.map(([candidate]) => candidate)).toEqual([baseline, alternative]);
    expect(args.createAlternative).toHaveBeenCalledTimes(1);
    expect(args.commitSnapshot).not.toHaveBeenCalled();
  });

  it('does not stage or compare an absent alternative', async () => {
    const args = setup();
    expect((await stagePreferredLayoutCandidate({ ...args, createAlternative: undefined })).geometry).toBe(baseline);
    expect(args.stage).toHaveBeenCalledTimes(1);
    expect(args.preferAlternative).not.toHaveBeenCalled();
    args.stage.mockClear();
    expect((await stagePreferredLayoutCandidate({ ...args, createAlternative: async () => null })).geometry).toBe(baseline);
    expect(args.stage).toHaveBeenCalledTimes(1);
  });

  it('retains the validated baseline when the optional candidate fails its hard gate', async () => {
    const args = setup();
    args.stage.mockImplementationOnce(async candidate => ({ committedSourceEdges: candidate.edges,
      routedEdges: candidate.edges, commitSnapshot: args.commitSnapshot }));
    args.stage.mockRejectedValueOnce(new Error('layout-routing-hard-quality-rejected'));
    expect((await stagePreferredLayoutCandidate(args)).geometry).toBe(baseline);
    expect(args.preferAlternative).not.toHaveBeenCalled();
    expect(args.commitSnapshot).not.toHaveBeenCalled();
  });

  it.each(['worker-timeout', 'invalid-worker-response'])('propagates %s instead of hiding it as a quality rejection', async message => {
    const args = setup();
    args.stage.mockImplementationOnce(async candidate => ({ committedSourceEdges: candidate.edges,
      routedEdges: candidate.edges, commitSnapshot: args.commitSnapshot }));
    args.stage.mockRejectedValueOnce(new Error(message));
    await expect(stagePreferredLayoutCandidate(args)).rejects.toThrow(message);
    expect(args.commitSnapshot).not.toHaveBeenCalled();
  });

  it('does not calculate an alternative after baseline staging fails', async () => {
    const args = setup();
    args.stage.mockRejectedValueOnce(new Error('layout-routing-hard-quality-rejected'));
    await expect(stagePreferredLayoutCandidate(args)).rejects.toThrow('layout-routing-hard-quality-rejected');
    expect(args.createAlternative).not.toHaveBeenCalled();
  });

  it.each(['before', 'baseline', 'generation', 'alternative'] as const)('honors cancellation during %s', async phase => {
    const args = setup();
    if (phase === 'before') args.controller.abort();
    args.createAlternative.mockImplementation(async () => {
      if (phase === 'generation') args.controller.abort();
      return alternative;
    });
    args.stage.mockImplementation(async candidate => {
      if ((phase === 'baseline' && candidate === baseline) || (phase === 'alternative' && candidate === alternative)) {
        args.controller.abort();
      }
      return { committedSourceEdges: candidate.edges, routedEdges: candidate.edges, commitSnapshot: args.commitSnapshot };
    });
    await expect(stagePreferredLayoutCandidate(args)).rejects.toThrow('layout-routing-cancelled');
    expect(args.preferAlternative).not.toHaveBeenCalled();
    expect(args.commitSnapshot).not.toHaveBeenCalled();
  });
});
