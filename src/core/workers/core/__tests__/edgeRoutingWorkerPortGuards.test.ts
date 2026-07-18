import { describe, expect, it, vi } from 'vitest';

import type { PathFindingJob, Rectangle } from '../../../types/routing';
import { Position } from '../../../types/routing';
import { applyWorkerPortGuards } from '../edgeRoutingWorkerPortGuards';
import type { WorkerGraphNode } from '../edgeRoutingWorkerContext';

const rect = (x: number, y: number, width = 100, height = 60): Rectangle => ({
  x,
  y,
  width,
  height,
});

const job = (overrides: Partial<PathFindingJob> = {}): PathFindingJob => ({
  jobId: 'job-edge',
  edgeId: 'edge',
  source: 'source',
  target: 'target',
  sourceX: 0,
  sourceY: 0,
  targetX: 0,
  targetY: 0,
  ...overrides,
});

const node = (id: string, parentId?: string): WorkerGraphNode => ({
  id,
  position: { x: 0, y: 0 },
  measured: { width: 100, height: 60 },
  ...(parentId ? { parentId } : {}),
});

const apply = ({
  sourceRect = rect(0, 0),
  targetRect = rect(300, 0),
  routingJob = job(),
  sourceNode = node('source'),
  targetNode = node('target'),
  startPosition = Position.Right,
  endPosition = Position.Left,
  isGlobalTrunkMember = false,
  hasExplicitSource = false,
  hasExplicitTarget = false,
  onDebug,
}: {
  sourceRect?: Rectangle;
  targetRect?: Rectangle;
  routingJob?: PathFindingJob;
  sourceNode?: WorkerGraphNode;
  targetNode?: WorkerGraphNode;
  startPosition?: Position;
  endPosition?: Position;
  isGlobalTrunkMember?: boolean;
  hasExplicitSource?: boolean;
  hasExplicitTarget?: boolean;
  onDebug?: (message: string) => void;
} = {}) => applyWorkerPortGuards({
  job: routingJob,
  sourceNode,
  targetNode,
  sourceRect,
  targetRect,
  routingObstacles: [],
  startPosition,
  endPosition,
  isGlobalTrunkMember,
  hasExplicitSource,
  hasExplicitTarget,
  onDebug,
});

describe('edgeRoutingWorkerPortGuards', () => {
  it('selects a deterministic shared bypass port for aligned reverse edges', () => {
    const result = apply({ routingJob: job({ isReverseEdge: true }) });

    expect(result.isReverseBypassActive).toBe(true);
    expect(result.reverseBypassSide).toBe(Position.Top);
    expect(result.startPosition).toBe(Position.Top);
    expect(result.endPosition).toBe(Position.Top);
  });

  it('skips U-turn bypass for diagonal reverse edges and reports the decision', () => {
    const onDebug = vi.fn();
    const result = apply({
      routingJob: job({ isReverseEdge: true }),
      targetRect: rect(200, 200),
      onDebug,
    });

    expect(result.isReverseBypassActive).toBe(false);
    expect(result.reverseBypassSide).toBeNull();
    expect(onDebug).toHaveBeenCalledOnce();
  });

  it('repairs ports that initially face away from the peer node', () => {
    const result = apply({
      startPosition: Position.Left,
      endPosition: Position.Right,
    });

    expect(result.startPosition).toBe(Position.Right);
    expect(result.endPosition).toBe(Position.Left);
  });

  it('turns horizontal ports into vertical ports for a tall C-shaped route', () => {
    const result = apply({
      targetRect: rect(10, 300),
      startPosition: Position.Right,
      endPosition: Position.Left,
    });

    expect(result.startPosition).toBe(Position.Bottom);
    expect(result.endPosition).toBe(Position.Top);
  });

  it('uses inward-facing lateral ports across different parent groups', () => {
    const result = apply({
      sourceNode: node('source', 'left-group'),
      targetNode: node('target', 'right-group'),
      startPosition: Position.Top,
      endPosition: Position.Bottom,
    });

    expect(result.isCrossGroupEdge).toBe(true);
    expect(result.startPosition).toBe(Position.Right);
    expect(result.endPosition).toBe(Position.Left);
  });

  it('does not override explicit endpoint handles', () => {
    const result = apply({
      routingJob: job({ isReverseEdge: true }),
      startPosition: Position.Left,
      endPosition: Position.Right,
      hasExplicitSource: true,
      hasExplicitTarget: true,
    });

    expect(result.isReverseBypassActive).toBe(false);
    expect(result.startPosition).toBe(Position.Left);
    expect(result.endPosition).toBe(Position.Right);
  });

  it('leaves global trunk members outside local bypass and shape guards', () => {
    const result = apply({
      routingJob: job({ isReverseEdge: true }),
      targetRect: rect(10, 300),
      startPosition: Position.Right,
      endPosition: Position.Left,
      isGlobalTrunkMember: true,
    });

    expect(result.isReverseBypassActive).toBe(false);
    expect(result.startPosition).toBe(Position.Right);
    expect(result.endPosition).toBe(Position.Left);
  });
});
