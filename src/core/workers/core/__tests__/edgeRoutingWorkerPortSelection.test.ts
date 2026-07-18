import { describe, expect, it, vi } from 'vitest';

import type { PathFindingJob } from '../../../types/routing';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';
import type { PortSelector } from '../../preprocessing/PortSelector';
import { selectWorkerPorts } from '../edgeRoutingWorkerPortSelection';

const job = (overrides: Partial<PathFindingJob> = {}): PathFindingJob => ({
  jobId: 'job-edge',
  edgeId: 'edge',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 300,
  targetY: 0,
  ...overrides,
});

const selection = (sourcePos: Position, targetPos: Position, confidence: number) => ({
  sourcePos,
  targetPos,
  confidence,
});

const selector = (...results: ReturnType<typeof selection>[]) => ({
  selectPorts: vi.fn(() => results.shift() ?? selection(
    Position.Right,
    Position.Left,
    0,
  )),
}) as unknown as Pick<PortSelector, 'selectPorts'> & {
  selectPorts: ReturnType<typeof vi.fn>;
};

const apply = (
  portSelector: ReturnType<typeof selector>,
  overrides: Partial<Parameters<typeof selectWorkerPorts>[0]> = {},
) => selectWorkerPorts({
  job: job(),
  config: createDefaultRoutingConfig(),
  selector: portSelector,
  sourceRect: { x: 0, y: 0, width: 100, height: 60 },
  targetRect: { x: 300, y: 0, width: 100, height: 60 },
  obstacles: [],
  effectiveDirection: 'LR',
  portUsage: {},
  startPosition: Position.Right,
  endPosition: Position.Left,
  hasFixedSourcePort: false,
  hasFixedTargetPort: false,
  hasExplicitSource: false,
  hasExplicitTarget: false,
  isGlobalTrunkMember: false,
  ...overrides,
});

describe('edgeRoutingWorkerPortSelection', () => {
  it('accepts an unconstrained high-confidence port pair', () => {
    const result = apply(selector(selection(Position.Bottom, Position.Top, 1)));

    expect(result).toEqual({
      startPosition: Position.Bottom,
      endPosition: Position.Top,
    });
  });

  it('preserves ports already fixed by bus or trunk consensus', () => {
    const result = apply(
      selector(selection(Position.Bottom, Position.Top, 1)),
      {
        startPosition: Position.Right,
        endPosition: Position.Left,
        hasFixedSourcePort: true,
        hasFixedTargetPort: true,
        isGlobalTrunkMember: true,
      },
    );

    expect(result).toEqual({
      startPosition: Position.Right,
      endPosition: Position.Left,
    });
  });

  it('re-runs selection without constraints for a same-side overshoot', () => {
    const portSelector = selector(
      selection(Position.Left, Position.Left, 0),
      selection(Position.Right, Position.Left, 1),
    );
    const result = apply(portSelector, {
      startPosition: Position.Left,
      endPosition: Position.Left,
      hasFixedSourcePort: true,
      hasFixedTargetPort: true,
      hasExplicitSource: true,
      hasExplicitTarget: true,
    });

    expect(result).toEqual({
      startPosition: Position.Right,
      endPosition: Position.Left,
    });
    expect(portSelector.selectPorts).toHaveBeenCalledTimes(2);
    expect(portSelector.selectPorts.mock.calls[1][3]).not.toHaveProperty(
      'constrainedSourcePos',
    );
  });
});
