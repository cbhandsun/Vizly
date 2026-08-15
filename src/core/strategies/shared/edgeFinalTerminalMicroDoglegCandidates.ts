import type { Edge } from '@xyflow/react';

import { detectLocalDoglegRisks } from '../../algorithms/localDoglegQuality';
import {
  EPS,
  axisOf,
  compactPath,
  terminalSide,
  type Point,
  type Rect,
  type Role,
} from './edgeSharedEndpointPortOrderGeometry';

const COMMERCIAL_TERMINAL_BRANCH_OFFSETS = [80, 96] as const;

export const orientedTerminalPath = (path: readonly Point[], role: Role): Point[] => (
  role === 'source'
    ? path.map(point => ({ ...point }))
    : [...path].reverse().map(point => ({ ...point }))
);

export const terminalMicroDoglegRepairPaths = (
  edge: Edge,
  path: readonly Point[],
  role: Role,
  rect: Rect,
): Point[][] => {
  const ordered = compactPath(orientedTerminalPath(path, role));
  if (ordered.length < 4) return [];
  const terminal = ordered[0];
  const stub = ordered[1];
  const bridgeEnd = ordered[2];
  const continuation = ordered[3];
  if (!terminal || !stub || !bridgeEnd || !continuation) return [];
  const terminalAxis = axisOf(terminal, stub);
  const bridgeAxis = axisOf(stub, bridgeEnd);
  const continuationAxis = axisOf(bridgeEnd, continuation);
  if (!terminalAxis || !bridgeAxis || terminalAxis === bridgeAxis || continuationAxis !== terminalAxis) return [];
  const terminalDirection = terminalAxis === 'v'
    ? Math.sign(stub.y - terminal.y)
    : Math.sign(stub.x - terminal.x);
  const continuationDirection = continuationAxis === 'v'
    ? Math.sign(continuation.y - bridgeEnd.y)
    : Math.sign(continuation.x - bridgeEnd.x);
  if (terminalDirection === 0 || terminalDirection !== continuationDirection) return [];
  const hasAuditedTerminalRisk = detectLocalDoglegRisks(ordered).some(risk => (
    risk.rule === 'local-micro-dogleg'
    && risk.index === 0
    && (risk.type === 'V-H-V') === (terminalAxis === 'v')
  ));
  if (!hasAuditedTerminalRisk) return [];

  const handle = role === 'source' ? edge.sourceHandle : edge.targetHandle;
  const side = terminalSide(terminal, rect, handle);
  if (!side) return [];
  const results: Point[][] = [];
  const addCandidate = (candidateOrdered: Point[]): void => {
    const compacted = compactPath(candidateOrdered);
    if (
      compacted.length < 2
      || compacted.some((point, index) => index > 0 && axisOf(compacted[index - 1], point) === null)
      || detectLocalDoglegRisks(compacted).some(risk => risk.rule === 'local-micro-dogleg' && risk.index === 0)
    ) return;
    const candidate = role === 'source' ? compacted : [...compacted].reverse();
    if (!results.some(existing => (
      existing.length === candidate.length
      && existing.every((point, index) => (
        Math.abs(point.x - candidate[index].x) <= EPS
        && Math.abs(point.y - candidate[index].y) <= EPS
      ))
    ))) results.push(candidate);
  };

  const alignedTerminal = terminalAxis === 'v'
    ? { x: bridgeEnd.x, y: terminal.y }
    : { x: terminal.x, y: bridgeEnd.y };
  if (terminalSide(alignedTerminal, rect, handle) === side) {
    addCandidate([alignedTerminal, ...ordered.slice(2).map(point => ({ ...point }))]);
  }

  const terminalCoordinate = terminalAxis === 'v' ? terminal.x : terminal.y;
  const trunkCoordinate = terminalAxis === 'v' ? bridgeEnd.x : bridgeEnd.y;
  const branchDirection = Math.sign(terminalCoordinate - trunkCoordinate);
  if (branchDirection !== 0) {
    for (const offset of COMMERCIAL_TERMINAL_BRANCH_OFFSETS) {
      const branchCoordinate = trunkCoordinate + branchDirection * offset;
      const widenedTerminal = terminalAxis === 'v'
        ? { x: branchCoordinate, y: terminal.y }
        : { x: terminal.x, y: branchCoordinate };
      if (terminalSide(widenedTerminal, rect, handle) !== side) continue;
      const widenedStub = terminalAxis === 'v'
        ? { x: branchCoordinate, y: stub.y }
        : { x: stub.x, y: branchCoordinate };
      addCandidate([widenedTerminal, widenedStub, ...ordered.slice(2).map(point => ({ ...point }))]);
    }
  }
  return results;
};
