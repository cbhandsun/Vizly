// @vitest-environment node
import type { Edge, Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { auditFinalSameSideEndpointOrder } from '../../../strategies/shared/edgeFinalSameSideEndpointOrderRepair';

import * as outerCandidates from '../baseReactFlowDisplayOuterPortCandidates';
import { repairResidualOuterPortTransactionWithHardGate } from '../baseReactFlowDisplayOuterPortTransaction';
import { getDisplayHardQualityGateReport } from '../baseReactFlowDisplayQualityGates';
import { createDisplayRoutingTopologyPlan } from '../baseReactFlowDisplayRoutingTopologyPlan';
import {
  buildReservedRoutingGroupCandidates,
  createRoutingGroupContract,
  routingGroupOccupiesReservedLanes,
  routingGroupPreservesAuthoredTerminals,
  routingGroupContractVariants,
} from '../baseReactFlowDisplayRoutingGroupContract';
import {
  repairDisplayRoutingGroupTransaction,
  type RoutingGroupTransactionDiagnostics,
} from '../baseReactFlowDisplayRoutingGroupTransaction';
import type { DisplayRoutingPhaseTrace } from '../baseReactFlowDisplayRoutingTrace';

const node = (id: string, x: number, y: number, width = 100, height = 100): Node => ({
  id, position: { x, y }, measured: { width, height }, data: {},
});

const edge = (id: string, source: string, target: string, sourceHandle: string,
  targetHandle: string, coordinates: number[][]): Edge => ({
  id, source, target, sourceHandle, targetHandle,
  data: { computedPath: coordinates.map(([x, y]) => ({ x, y })) },
});

const reservationGraph = () => ({
  nodes: [node('source', 0, 0), node('a', 300, 400), node('b', 600, 400),
    node('left', 160, 125, 60, 50), node('right', 460, 125, 60, 50)],
  edges: [
    edge('source-a', 'source', 'a', 'bottom', 'top', [[50, 100], [50, 140], [350, 140], [350, 400]]),
    edge('source-b', 'source', 'b', 'bottom', 'top', [[50, 100], [50, 160], [650, 160], [650, 400]]),
    edge('other', 'left', 'right', 'right', 'left', [[220, 150], [460, 150]]),
  ],
});

const hubGraph = () => ({
  nodes: [node('hub', 0, 0), node('destination', 0, -200),
    node('left', -10, 125, 50, 50), node('right', 100, 125, 50, 50),
    node('companion', 250, 275, 50, 50)],
  edges: [
    edge('outgoing', 'hub', 'destination', 'top', 'bottom', [[50, 0], [50, -100]]),
    edge('crossing', 'left', 'right', 'right', 'left', [[40, 150], [100, 150]]),
    edge('incoming', 'companion', 'hub', 'left', 'bottom',
      [[250, 300], [202, 300], [202, 200], [50, 200], [50, 100]]),
  ],
});

afterEach(() => vi.restoreAllMocks());

describe('affected routing group transaction', () => {
  it('requires the entire reserved unit to occupy its declared lanes, not merely prefer them', () => {
    const { edges, nodes } = reservationGraph();
    const plan = createDisplayRoutingTopologyPlan(nodes, edges);
    const contract = createRoutingGroupContract(plan, edges, [0]);
    expect(contract?.memberIndexes).toEqual([0, 1]);
    expect(contract).not.toBeNull();
    if (!contract) return;
    expect(routingGroupOccupiesReservedLanes(contract, edges)).toBe(false);
    const candidates = buildReservedRoutingGroupCandidates(edges, contract);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(routingGroupOccupiesReservedLanes(contract, candidate)).toBe(true);
      expect(routingGroupOccupiesReservedLanes(contract, [candidate[0], edges[1], edges[2]])).toBe(false);
      expect(candidate[2]).toBe(edges[2]);
    }
  });

  it('accepts a complete reserved bundle only after the real atomic and final gates pass', () => {
    const { edges, nodes } = reservationGraph();
    const before = JSON.stringify({ edges, nodes });
    let consumed = 0;
    const diagnostics: RoutingGroupTransactionDiagnostics = {};
    const repaired = repairDisplayRoutingGroupTransaction(edges, edges, nodes, {
      topologyPlan: createDisplayRoutingTopologyPlan(nodes, edges), primaryEdgeIndexes: [0],
      consumeEvaluation: () => ++consumed <= 12,
      finalCandidateIsAccepted: candidate => getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean,
      diagnostics,
    });
    expect(repaired).not.toBe(edges);
    expect(diagnostics.accepted).toBe('reserved-group');
    expect(getDisplayHardQualityGateReport(repaired, nodes, 'polished').hardClean).toBe(true);
    expect(consumed).toBeLessThanOrEqual(12);
    expect(JSON.stringify({ edges, nodes })).toBe(before);
  });

  it('repairs a shared hub companion through the production outer-port entry and its real gates', () => {
    const { edges, nodes } = hubGraph();
    const traces: DisplayRoutingPhaseTrace[] = [];
    // Control the primary proposal only; the group search and all acceptance gates are real.
    vi.spyOn(outerCandidates, 'buildBoundedOuterPortTransactionCandidates').mockReturnValue([{
      edges, movingEdgeIndex: 0, ringAxis: 'x', ringLane: 0, transitionLane: 0, quickScore: 0,
    }]);
    const repaired = repairResidualOuterPortTransactionWithHardGate(edges, nodes, 64, {
      onPhaseTrace: trace => traces.push(trace),
    });
    expect(repaired).not.toBe(edges);
    expect(repaired[2].targetHandle).not.toBe('bottom');
    expect(getDisplayHardQualityGateReport(repaired, nodes, 'polished').hardClean).toBe(true);
    expect(traces.at(-1)?.candidateCount).toBeLessThanOrEqual(64);
  });

  it('commits reserved sibling paths together through the production outer-port entry', () => {
    const { edges, nodes } = reservationGraph();
    vi.spyOn(outerCandidates, 'buildBoundedOuterPortTransactionCandidates').mockReturnValue([{
      edges, movingEdgeIndex: 0, ringAxis: 'y', ringLane: 140, transitionLane: 50, quickScore: 0,
    }]);
    const repaired = repairResidualOuterPortTransactionWithHardGate(edges, nodes, 64);
    expect(repaired).not.toBe(edges);
    expect(repaired[0].data?.computedPath).not.toEqual(edges[0].data?.computedPath);
    expect(repaired[1].data?.computedPath).not.toEqual(edges[1].data?.computedPath);
    expect(repaired[2]).toEqual(edges[2]);
    expect(getDisplayHardQualityGateReport(repaired, nodes, 'polished').hardClean).toBe(true);
  });

  it('keeps the baseline when final acceptance rejects all otherwise feasible proposals', () => {
    const { edges, nodes } = reservationGraph();
    let consumed = 0;
    const finalGate = vi.fn(() => false);
    const result = repairDisplayRoutingGroupTransaction(edges, edges, nodes, {
      topologyPlan: createDisplayRoutingTopologyPlan(nodes, edges), primaryEdgeIndexes: [0],
      consumeEvaluation: () => consumed++ < 3, finalCandidateIsAccepted: finalGate,
    });
    expect(result).toBe(edges);
    expect(finalGate).toHaveBeenCalledTimes(1);
  });

  it('never changes a fixed custom port, its exact position, or source data', () => {
    const { edges, nodes } = hubGraph();
    edges[2] = { ...edges[2], data: { ...edges[2].data,
      manualHandles: { target: true }, label: '<img src=x onerror=alert(1)>',
    } };
    let consumed = 0;
    const result = repairDisplayRoutingGroupTransaction(edges, edges, nodes, {
      topologyPlan: createDisplayRoutingTopologyPlan(nodes, edges), primaryEdgeIndexes: [0, 1],
      consumeEvaluation: () => ++consumed <= 12,
      finalCandidateIsAccepted: candidate => getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean,
    });
    expect(routingGroupPreservesAuthoredTerminals(edges, result)).toBe(true);
    expect(result[2].targetHandle).toBe('bottom');
    expect(result[2].data?.label).toBe('<img src=x onerror=alert(1)>');
    const moved = edges.map((item, index) => index === 2 ? { ...item, targetHandle: 'right' } : item);
    expect(routingGroupPreservesAuthoredTerminals(edges, moved)).toBe(false);
  });

  it('does not trade an established target trunk for a different shared hub role', () => {
    const { edges, nodes } = hubGraph();
    nodes.push(node('companion-two', 500, 275, 50, 50));
    edges.push(edge('incoming-two', 'companion-two', 'hub', 'left', 'bottom',
      [[500, 300], [452, 300], [452, 200], [50, 200], [50, 100]]));
    expect(auditFinalSameSideEndpointOrder(edges, nodes).legalSharedTrunks.some(trunk => (
      trunk.role === 'target' && trunk.edgeIds.includes('incoming') && trunk.edgeIds.includes('incoming-two')
    ))).toBe(true);
    let used = 0;
    const repaired = repairDisplayRoutingGroupTransaction(edges, edges, nodes, {
      topologyPlan: createDisplayRoutingTopologyPlan(nodes, edges), primaryEdgeIndexes: [0, 1],
      consumeEvaluation: () => ++used <= 12, finalCandidateIsAccepted: () => true,
    });
    expect(repaired).toBe(edges);
  });

  it('does not spend evaluations on invalid or oversized affected selections', () => {
    const { edges, nodes } = reservationGraph();
    const consume = vi.fn(() => true);
    for (const indexes of [[], [NaN], [-1], [99], [0, 1, 2]]) {
      expect(repairDisplayRoutingGroupTransaction(edges, edges, nodes, {
        topologyPlan: createDisplayRoutingTopologyPlan(nodes, edges), primaryEdgeIndexes: indexes,
        consumeEvaluation: consume, finalCandidateIsAccepted: () => true,
      })).toBe(edges);
    }
    expect(consume).not.toHaveBeenCalled();
  });

  it('keeps both roles of a dual group in one reservation and releases an incomplete unit', () => {
    const nodes = [node('s1', 0, 0), node('s2', 150, 0), node('t1', 300, 600), node('t2', 450, 600)];
    const edges = [
      edge('a', 's1', 't1', 'bottom', 'top', [[50, 100], [50, 250], [350, 250], [350, 600]]),
      edge('b', 's1', 't2', 'bottom', 'top', [[50, 100], [50, 250], [500, 250], [500, 600]]),
      edge('c', 's2', 't1', 'bottom', 'top', [[200, 100], [200, 300], [350, 300], [350, 600]]),
      edge('d', 's2', 't2', 'bottom', 'top', [[200, 100], [200, 300], [500, 300], [500, 600]]),
    ];
    const plan = createDisplayRoutingTopologyPlan(nodes, edges);
    const contract = createRoutingGroupContract(plan, edges, [0]);
    expect(contract?.memberIndexes).toEqual([0, 1, 2, 3]);
    expect(contract?.lanes.filter(lane => lane.edgeIndex === 0).map(lane => lane.role).sort())
      .toEqual(['source', 'target']);
    if (!contract) return;
    for (const variant of routingGroupContractVariants(contract)) {
      for (const groupIndex of contract.groupIndexes) {
        expect(variant.lanes.filter(lane => lane.groupIndex === groupIndex).map(lane => lane.coordinate).sort())
          .toEqual(contract.lanes.filter(lane => lane.groupIndex === groupIndex).map(lane => lane.coordinate).sort());
      }
    }
    const incomplete = { ...plan, corridorReservations: { ...plan.corridorReservations,
      reservations: plan.corridorReservations.reservations.map((reservation, index) => index === 0
        ? { ...reservation, status: 'exhausted' as const } : reservation),
    } };
    expect(createRoutingGroupContract(incomplete, edges, [0])).toBeNull();
  });

  it('has the same hard-safe result when input member order is reversed', () => {
    const { edges, nodes } = reservationGraph();
    const results = [edges, [...edges].reverse()].map(input => {
      let count = 0;
      return repairDisplayRoutingGroupTransaction(input, input, nodes, {
        topologyPlan: createDisplayRoutingTopologyPlan(nodes, input),
        primaryEdgeIndexes: [input.findIndex(item => item.id === 'source-a')],
        consumeEvaluation: () => ++count <= 12,
        finalCandidateIsAccepted: candidate => getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean,
      });
    });
    for (const result of results) expect(getDisplayHardQualityGateReport(result, nodes, 'polished').hardClean).toBe(true);
    const paths = (result: Edge[]) => result.map(item => [item.id, item.data?.computedPath])
      .sort((first, second) => String(first[0]).localeCompare(String(second[0])));
    expect(paths(results[0])).toEqual(paths(results[1]));
  });

  it('borrows at most the remaining caller budget and never publishes a partially checked bundle', () => {
    const { edges, nodes } = reservationGraph();
    for (const available of [0, 1, 2]) {
      let used = 0;
      const finalGate = vi.fn((candidate: Edge[]) => getDisplayHardQualityGateReport(candidate, nodes, 'polished').hardClean);
      const result = repairDisplayRoutingGroupTransaction(edges, edges, nodes, {
        topologyPlan: createDisplayRoutingTopologyPlan(nodes, edges), primaryEdgeIndexes: [0],
        consumeEvaluation: () => {
          if (used >= available) return false;
          used += 1;
          return true;
        },
        finalCandidateIsAccepted: finalGate,
      });
      expect(result).toBe(edges);
      expect(used).toBeLessThanOrEqual(available);
    }
  });

  it('fails closed on invalid geometry, duplicate graph identity and malformed lane ownership', () => {
    const { edges, nodes } = reservationGraph();
    const invalid = edges.map((item, index) => index === 0
      ? { ...item, data: { ...item.data, computedPath: [{ x: NaN, y: 1 }, { x: Infinity, y: 2 }] } } : item);
    const consume = vi.fn(() => true);
    for (const input of [invalid, [edges[0], edges[0], edges[2]]]) {
      expect(repairDisplayRoutingGroupTransaction(input, input, nodes, {
        topologyPlan: createDisplayRoutingTopologyPlan(nodes, input), primaryEdgeIndexes: [0],
        consumeEvaluation: consume, finalCandidateIsAccepted: () => true,
      })).toBe(input);
    }
    expect(consume).not.toHaveBeenCalled();
    const plan = createDisplayRoutingTopologyPlan(nodes, edges);
    const invalidOwnership = { ...plan, corridorReservations: { ...plan.corridorReservations,
      reservations: plan.corridorReservations.reservations.map(reservation => ({ ...reservation,
        memberAssignments: reservation.memberAssignments.map(assignment => ({ ...assignment, laneCenter: Infinity })),
      })),
    } };
    expect(createRoutingGroupContract(invalidOwnership, edges, [0])).toBeNull();
  });
});
