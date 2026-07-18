import { describe, expect, it } from 'vitest';

import type { PathFindingJob, Rectangle } from '../../../types/routing';
import { createDefaultRoutingConfig, Position } from '../../../types/routing';
import { PortSelector } from '../../preprocessing/PortSelector';
import {
  chooseWorkerEndpointOrthogonalPort,
  collectWorkerPeerGroups,
  directWorkerPortToward,
  oppositeWorkerPort,
  pickWorkerPeerGroup,
  resolveWorkerPortFromTrunkAxis,
  resolveWorkerPortAnchors,
} from '../edgeRoutingWorkerBusGeometry';
import type {
  WorkerGraphEdge,
  WorkerGraphNode,
} from '../edgeRoutingWorkerContext';

const rect = (x: number, y: number, width = 100, height = 60): Rectangle => ({
  x,
  y,
  width,
  height,
});

const job = (edgeId = 'reference'): PathFindingJob => ({
  jobId: `job-${edgeId}`,
  edgeId,
  source: 'hub',
  target: 'right-a',
  sourceX: 0,
  sourceY: 0,
  targetX: 0,
  targetY: 0,
  layoutDirection: 'LR',
});

const node = (id: string, x: number, y: number): WorkerGraphNode => ({
  id,
  position: { x, y },
  measured: { width: 100, height: 60 },
});

const edge = (
  id: string,
  source: string,
  target: string,
): WorkerGraphEdge => ({ id, source, target });

describe('edgeRoutingWorkerBusGeometry', () => {
  it('coalesces a single bus edge at centered endpoint anchors', () => {
    const config = createDefaultRoutingConfig();
    const anchors = resolveWorkerPortAnchors({
      job: {
        ...job(),
        isOneToMany: true,
        outgoingIndex: 5,
        outgoingCount: 1,
      },
      config,
      selector: new PortSelector(config),
      sourceRect: rect(0, 0),
      targetRect: rect(300, 0),
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    expect(anchors.startPoint).toEqual({ x: 100, y: 30 });
    expect(anchors.endPoint).toEqual({ x: 300, y: 30 });
    expect(anchors.startOffset.x).toBe(100 + Math.max(40, config.offsets.source));
    expect(anchors.endOffset.x).toBe(300 - Math.max(40, config.offsets.target));
  });

  it('classifies direct and opposite ports deterministically', () => {
    expect(directWorkerPortToward(rect(0, 0), rect(300, 0)).port)
      .toBe(Position.Right);
    expect(directWorkerPortToward(rect(0, 0), rect(0, -300)).port)
      .toBe(Position.Top);
    expect(oppositeWorkerPort(Position.Top)).toBe(Position.Bottom);
    expect(oppositeWorkerPort(Position.Right)).toBe(Position.Left);
  });

  it('overrides a cross-axis trunk port for strongly aligned endpoints', () => {
    const source = rect(0, 0);
    const target = rect(10, 400);
    expect(chooseWorkerEndpointOrthogonalPort(
      source,
      target,
      Position.Right,
    )).toBe(Position.Bottom);
    expect(resolveWorkerPortFromTrunkAxis({
      rectangle: source,
      otherRectangle: target,
      trunkHint: {
        source: { x: -100, y: 0 },
        target: { x: -100, y: 500 },
      },
      isGlobalTrunkMember: true,
    })).toBe(Position.Bottom);
  });

  it('falls back safely when trunk points are missing or non-finite', () => {
    expect(resolveWorkerPortFromTrunkAxis({
      rectangle: rect(0, 0),
      otherRectangle: rect(-300, 0),
      trunkHint: {
        source: { x: Number.NaN, y: 0 },
        target: { x: 0, y: 100 },
      },
      isGlobalTrunkMember: false,
    })).toBe(Position.Left);
    expect(resolveWorkerPortFromTrunkAxis({
      rectangle: rect(0, 0),
      isGlobalTrunkMember: false,
    })).toBe(Position.Right);
  });

  it('selects a stable forward peer hemisphere', () => {
    const reference = job();
    const edges = [
      edge('reference', 'hub', 'right-a'),
      edge('right-b-edge', 'hub', 'right-b'),
      edge('left-edge', 'hub', 'left'),
    ];
    const edgeMap = new Map(edges.map(item => [item.id, item]));
    const nodeMap = new Map<string, WorkerGraphNode>([
      ['hub', node('hub', 0, 0)],
      ['right-a', node('right-a', 300, 0)],
      ['right-b', node('right-b', 350, 100)],
      ['left', node('left', -300, 0)],
    ]);
    const group = pickWorkerPeerGroup({
      job: reference,
      originId: 'hub',
      isSource: true,
      allPeers: edges,
      nodeMap,
      edgeMap,
    });
    expect(group.key).toBe('FWD');
    expect(group.members).toEqual(['reference', 'right-b-edge']);
  });

  it('falls back to all peers when topology context is incomplete', () => {
    const edges = [
      edge('reference', 'hub', 'right-a'),
      edge('other', 'hub', 'missing'),
    ];
    const group = pickWorkerPeerGroup({
      job: job(),
      originId: 'hub',
      isSource: true,
      allPeers: edges,
      nodeMap: new Map(),
      edgeMap: new Map(edges.map(item => [item.id, item])),
    });
    expect(group.key).toBe('ALL');
    expect(group.members).toEqual(['reference', 'other']);
  });

  it('collects independent O2M and M2O groups for dual-identity jobs', () => {
    const dual = job();
    dual.isOneToMany = true;
    dual.isManyToOne = true;
    dual.target = 'hub-target';
    const edges = [
      edge('reference', 'hub', 'hub-target'),
      edge('outgoing', 'hub', 'right-b'),
      edge('incoming', 'left', 'hub-target'),
    ];
    const edgeMap = new Map(edges.map(item => [item.id, item]));
    const nodeMap = new Map<string, WorkerGraphNode>([
      ['hub', node('hub', 0, 0)],
      ['hub-target', node('hub-target', 300, 0)],
      ['right-b', node('right-b', 350, 100)],
      ['left', node('left', -300, 0)],
    ]);
    const groups = collectWorkerPeerGroups(dual, edgeMap, nodeMap);
    expect(groups.o2mPeerGroup?.members).toEqual(['reference', 'outgoing']);
    expect(groups.m2oPeerGroup?.members).toEqual(['reference', 'incoming']);
  });
});
