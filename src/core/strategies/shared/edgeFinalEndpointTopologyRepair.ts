import type { Edge, Node as ReactFlowNode } from '@xyflow/react';

import { detectLocalDoglegRisks } from '../../algorithms/localDoglegQuality';
import {
  edgeTerminalHandleChangeIsAllowed,
  readEdgeTerminalPolicy,
} from '../../routing/utils/edgeTerminalPolicy';
import { getEdgePath } from './edgeDetachedOverlapRepair';
import {
  auditFinalSameSideEndpointOrder,
  type SameSideEndpointOrderMetrics,
} from './edgeFinalSameSideEndpointOrderRepair';
import {
  auditFinalSameSidePassageOrder,
  type SameSidePassageAudit,
  type SameSidePassageGroupAudit,
} from './edgeFinalSameSidePassageOrderRepair';
import { orientedTerminalPath, terminalMicroDoglegRepairPaths } from './edgeFinalTerminalMicroDoglegCandidates';
import {
  acceptFinalEndpointTopologyCandidate as acceptCandidate,
  type FinalEndpointTopologyRepairOptions,
} from './edgeFinalEndpointTopologyCandidateAcceptance';
import {
  EPS,
  axisOf,
  compactPath,
  nodeRect,
  terminalSide,
  withPath,
  type Point,
  type Rect,
  type Role,
  type Side,
} from './edgeSharedEndpointPortOrderGeometry';

const MAX_PATH_POINTS = 4_096;
const MAX_ABS_COORDINATE = 1_000_000_000;
const MAX_REJOIN_POINTS = 6;
const MIN_SIDE_ESCAPE_STUB = 64;
const MIN_TRUE_TRUNK_STEM = 48;
const MAX_TARGET_ALIGNMENT_DISTANCE = 96;
const MIN_TARGET_TRUNK_MEMBERS = 3;
const MAX_DUAL_TRUNK_BACKTRACK_INCREASE = 128;

type EndpointEntry = Readonly<{
  edgeIndex: number;
  edgeId: string;
  nodeId: string;
  role: Role;
  side: Side;
  path: Point[];
  rect: Rect;
  terminalCoordinate: number;
  remoteCoordinate: number;
}>;

type EndpointGroup = Readonly<{
  key: string;
  nodeId: string;
  role: Role;
  side: Side;
  entries: readonly EndpointEntry[];
}>;

export type {
  FinalEndpointTopologyCandidateValidation,
  FinalEndpointTopologyRepairOptions,
} from './edgeFinalEndpointTopologyCandidateAcceptance';

const finiteCoordinate = (value: unknown): value is number => (
  typeof value === 'number'
  && Number.isFinite(value)
  && Math.abs(value) <= MAX_ABS_COORDINATE
);

const validPath = (path: readonly Point[]): boolean => (
  path.length >= 3
  && path.length <= MAX_PATH_POINTS
  && path.every(point => finiteCoordinate(point.x) && finiteCoordinate(point.y))
);

const endpointPoint = (path: readonly Point[], role: Role): Point | undefined => (
  role === 'source' ? path[0] : path[path.length - 1]
);

const crossContainerDirectionMatchesTrunkSide = (
  edge: Edge,
  role: Role,
  side: Side,
  nodeById: ReadonlyMap<string, ReactFlowNode>,
): boolean => {
  const terminalNode = nodeById.get(edge[role]);
  const oppositeRole: Role = role === 'source' ? 'target' : 'source';
  const oppositeNode = nodeById.get(edge[oppositeRole]);
  if (
    !terminalNode?.parentId
    || !oppositeNode?.parentId
    || terminalNode.parentId === oppositeNode.parentId
  ) return false;
  const terminalRect = nodeRect(terminalNode);
  const oppositeRect = nodeRect(oppositeNode);
  if (!terminalRect || !oppositeRect) return false;
  const deltaX = oppositeRect.x + oppositeRect.width / 2
    - (terminalRect.x + terminalRect.width / 2);
  const deltaY = oppositeRect.y + oppositeRect.height / 2
    - (terminalRect.y + terminalRect.height / 2);
  if (side === 'top') return deltaY < -EPS;
  if (side === 'bottom') return deltaY > EPS;
  if (side === 'left') return deltaX < -EPS;
  return deltaX > EPS;
};

const stubPoint = (path: readonly Point[], role: Role): Point | undefined => (
  role === 'source' ? path[1] : path[path.length - 2]
);

const tangent = (point: Point, side: Side): number => (
  side === 'top' || side === 'bottom' ? point.x : point.y
);

const rectCenter = (rect: Rect, side: Side): number => (
  side === 'top' || side === 'bottom'
    ? rect.x + rect.width / 2
    : rect.y + rect.height / 2
);

const collectEndpointGroups = (
  edges: readonly Edge[],
  nodes: readonly ReactFlowNode[],
): EndpointGroup[] => {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const groups = new Map<string, {
    key: string;
    nodeId: string;
    role: Role;
    side: Side;
    entries: EndpointEntry[];
  }>();
  edges.forEach((edge, edgeIndex) => {
    const path = getEdgePath(edge);
    if (!validPath(path)) return;
    for (const role of ['source', 'target'] as const) {
      const nodeId = role === 'source' ? edge.source : edge.target;
      const remoteNodeId = role === 'source' ? edge.target : edge.source;
      const rect = nodeRect(nodeById.get(nodeId));
      const remoteRect = nodeRect(nodeById.get(remoteNodeId));
      const terminal = endpointPoint(path, role);
      const stub = stubPoint(path, role);
      if (!rect || !remoteRect || !terminal || !stub) continue;
      const handle = role === 'source' ? edge.sourceHandle : edge.targetHandle;
      const side = terminalSide(terminal, rect, handle);
      const expectedAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
      if (!side || axisOf(terminal, stub) !== expectedAxis) continue;
      const key = `${nodeId}\u001f${role}\u001f${side}`;
      const group = groups.get(key) ?? { key, nodeId, role, side, entries: [] };
      group.entries.push({
        edgeIndex,
        edgeId: edge.id,
        nodeId,
        role,
        side,
        path,
        rect,
        terminalCoordinate: tangent(terminal, side),
        remoteCoordinate: rectCenter(remoteRect, side),
      });
      groups.set(key, group);
    }
  });
  return [...groups.values()]
    .filter(group => group.entries.length >= 2)
    .sort((first, second) => first.key.localeCompare(second.key));
};

const endpointOrderImproves = (
  baseline: SameSideEndpointOrderMetrics,
  candidate: SameSideEndpointOrderMetrics,
): boolean => candidate.inversions < baseline.inversions || (
  candidate.inversions === baseline.inversions
  && (
    candidate.ambiguousLaneTies < baseline.ambiguousLaneTies
    || (
      candidate.ambiguousLaneTies === baseline.ambiguousLaneTies
      && candidate.collapsedLanePairs < baseline.collapsedLanePairs
    )
  )
);

const endpointOrderDoesNotRegress = (
  baseline: SameSideEndpointOrderMetrics,
  candidate: SameSideEndpointOrderMetrics,
): boolean => (
  candidate.inversions <= baseline.inversions
  && candidate.ambiguousLaneTies <= baseline.ambiguousLaneTies
  && candidate.collapsedLanePairs <= baseline.collapsedLanePairs
);

const escapeDefects = (group: SameSidePassageGroupAudit | undefined): number => (
  (group?.reversePassageDefects ?? 0)
  + (group?.parallelChildOverlaps ?? 0)
  + (group?.oppositeChildOverlaps ?? 0)
);

const passageDoesNotRegress = (
  baseline: SameSidePassageAudit,
  candidate: SameSidePassageAudit,
): boolean => (
  candidate.portOrderInversions <= baseline.portOrderInversions
  && candidate.reversePassageDefects <= baseline.reversePassageDefects
  && candidate.parallelChildOverlaps <= baseline.parallelChildOverlaps
  && candidate.oppositeChildOverlaps <= baseline.oppositeChildOverlaps
  && candidate.nearTrunkOpportunities <= baseline.nearTrunkOpportunities
  && candidate.invalidLegCount <= baseline.invalidLegCount
);

const localMicroDoglegCount = (edges: readonly Edge[]): number => edges.reduce(
  (total, edge) => total + detectLocalDoglegRisks(getEdgePath(edge))
    .filter(risk => risk.rule === 'local-micro-dogleg').length,
  0,
);

const adjacentEscapeImproves = (
  groupKey: string,
  baselineEdges: readonly Edge[],
  candidateEdges: readonly Edge[],
  nodes: ReactFlowNode[],
  baselineOrder: SameSideEndpointOrderMetrics,
  candidateOrder: SameSideEndpointOrderMetrics,
): boolean => {
  if (!endpointOrderDoesNotRegress(baselineOrder, candidateOrder)) return false;
  const baselinePassage = auditFinalSameSidePassageOrder(baselineEdges, nodes);
  const candidatePassage = auditFinalSameSidePassageOrder(candidateEdges, nodes);
  if (!passageDoesNotRegress(baselinePassage, candidatePassage)) return false;
  const baselineGroup = baselinePassage.groups.find(group => group.key === groupKey);
  const candidateGroup = candidatePassage.groups.find(group => group.key === groupKey);
  const passageImproves = escapeDefects(candidateGroup) < escapeDefects(baselineGroup)
    && candidatePassage.passageDefects < baselinePassage.passageDefects;
  return endpointOrderImproves(baselineOrder, candidateOrder) || passageImproves;
};

const adjacentSides = (side: Side, remoteCoordinate: number, rect: Rect): Side[] => {
  if (side === 'top' || side === 'bottom') {
    return remoteCoordinate >= rect.x + rect.width / 2
      ? ['right', 'left']
      : ['left', 'right'];
  }
  return remoteCoordinate >= rect.y + rect.height / 2
    ? ['bottom', 'top']
    : ['top', 'bottom'];
};

const boundaryCenter = (rect: Rect, side: Side): Point => {
  if (side === 'top') return { x: rect.x + rect.width / 2, y: rect.y };
  if (side === 'bottom') return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
  if (side === 'left') return { x: rect.x, y: rect.y + rect.height / 2 };
  return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
};

const liesOutward = (point: Point, terminal: Point, side: Side): boolean => {
  if (side === 'top') return terminal.y - point.y >= MIN_SIDE_ESCAPE_STUB - EPS;
  if (side === 'bottom') return point.y - terminal.y >= MIN_SIDE_ESCAPE_STUB - EPS;
  if (side === 'left') return terminal.x - point.x >= MIN_SIDE_ESCAPE_STUB - EPS;
  return point.x - terminal.x >= MIN_SIDE_ESCAPE_STUB - EPS;
};

const sideEscapePaths = (entry: EndpointEntry, nextSide: Side): Point[][] => {
  const ordered = entry.role === 'source'
    ? entry.path.map(point => ({ ...point }))
    : [...entry.path].reverse().map(point => ({ ...point }));
  const terminal = boundaryCenter(entry.rect, nextSide);
  const candidates: Point[][] = [];
  const maximumIndex = Math.min(ordered.length - 1, 2 + MAX_REJOIN_POINTS);
  for (let rejoinIndex = 2; rejoinIndex <= maximumIndex; rejoinIndex += 1) {
    const rejoin = ordered[rejoinIndex];
    if (!rejoin || !liesOutward(rejoin, terminal, nextSide)) continue;
    const bridge = nextSide === 'left' || nextSide === 'right'
      ? { x: rejoin.x, y: terminal.y }
      : { x: terminal.x, y: rejoin.y };
    const candidateOrdered = compactPath([
      terminal,
      bridge,
      ...ordered.slice(rejoinIndex).map(point => ({ ...point })),
    ]);
    if (candidateOrdered.length < 3) continue;
    if (candidateOrdered.some((point, index) => (
      index > 0 && axisOf(candidateOrdered[index - 1], point) === null
    ))) continue;
    candidates.push(entry.role === 'source'
      ? candidateOrdered
      : [...candidateOrdered].reverse());
  }
  return candidates;
};

const sharesTerminalCoordinate = (
  entry: EndpointEntry,
  entries: readonly EndpointEntry[],
): boolean => entries.some(other => (
  other !== entry
  && Math.abs(other.terminalCoordinate - entry.terminalCoordinate) <= EPS
));

/**
 * Moves one automatic singleton terminal to an adjacent side when keeping it in
 * a same-side group leaves either an ordering inversion or a harmful child
 * passage overlap. Callers can run the local passage repair first so this escape
 * is reserved for defects that cannot be resolved by ordinary lane separation.
 */
export const repairFinalSameSideAdjacentTerminalEscape = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: FinalEndpointTopologyRepairOptions = {},
): Edge[] => {
  let current = edges;
  const initialKeys = collectEndpointGroups(current, nodes).map(group => group.key);
  for (const groupKey of initialKeys) {
    const group = collectEndpointGroups(current, nodes).find(item => item.key === groupKey);
    if (!group) continue;
    const groupMetrics = auditFinalSameSideEndpointOrder(current, nodes).groups
      .find(item => item.key === group.key);
    const passageGroup = auditFinalSameSidePassageOrder(current, nodes).groups
      .find(item => item.key === group.key);
    if (
      !groupMetrics
      || (options.groupFilter && !options.groupFilter(groupMetrics))
      || (groupMetrics.inversions === 0 && escapeDefects(passageGroup) === 0)
    ) continue;
    let accepted: Edge[] | null = null;
    for (const entry of group.entries) {
      const edge = current[entry.edgeIndex];
      if (!edge || sharesTerminalCoordinate(entry, group.entries)) continue;
      const policy = readEdgeTerminalPolicy(edge, entry.role);
      if (policy.forbidden || policy.sideFixed) continue;
      for (const side of adjacentSides(entry.side, entry.remoteCoordinate, entry.rect)) {
        for (const path of sideEscapePaths(entry, side)) {
          const candidateEdges = current.map((candidateEdge, index) => (
            index === entry.edgeIndex
              ? withPath(candidateEdge, path, entry.role, side)
              : candidateEdge
          ));
          accepted = acceptCandidate(
            current,
            { edges: candidateEdges, changedEdgeIndexes: [entry.edgeIndex] },
            nodes,
            options,
            (baselineOrder, candidateOrder) => adjacentEscapeImproves(
              group.key,
              current,
              candidateEdges,
              nodes,
              baselineOrder,
              candidateOrder,
            ),
          );
          if (accepted) break;
        }
        if (accepted) break;
      }
      if (accepted) break;
    }
    if (accepted) current = accepted;
  }
  return current;
};

const terminalStemIsEligible = (entry: EndpointEntry): boolean => {
  const terminal = endpointPoint(entry.path, entry.role);
  const stub = stubPoint(entry.path, entry.role);
  if (!terminal || !stub) return false;
  const expectedAxis = entry.side === 'top' || entry.side === 'bottom' ? 'v' : 'h';
  if (axisOf(terminal, stub) !== expectedAxis) return false;
  const delta = entry.side === 'top' || entry.side === 'bottom'
    ? stub.y - terminal.y
    : stub.x - terminal.x;
  return Math.abs(delta) >= MIN_TRUE_TRUNK_STEM - EPS && Math.sign(delta) !== 0;
};

const alignTerminalStem = (entry: EndpointEntry, coordinate: number): Point[] => {
  const path = entry.path.map(point => ({ ...point }));
  const terminalIndex = entry.role === 'source' ? 0 : path.length - 1;
  const stubIndex = entry.role === 'source' ? 1 : path.length - 2;
  if (entry.side === 'top' || entry.side === 'bottom') {
    path[terminalIndex].x = coordinate;
    path[stubIndex].x = coordinate;
  } else {
    path[terminalIndex].y = coordinate;
    path[stubIndex].y = coordinate;
  }
  return compactPath(path);
};

const targetTrunkImproves = (
  groupKey: string,
  baseline: SameSideEndpointOrderMetrics,
  candidate: SameSideEndpointOrderMetrics,
): boolean => {
  const before = baseline.groups.find(group => group.key === groupKey);
  const after = candidate.groups.find(group => group.key === groupKey);
  return Boolean(
    before
    && after
    && candidate.inversions <= baseline.inversions
    && candidate.ambiguousLaneTies <= baseline.ambiguousLaneTies
    && candidate.collapsedLanePairs <= baseline.collapsedLanePairs
    && after.legalSharedTrunkTies > before.legalSharedTrunkTies,
  );
};

const sharedTerminalTrunkImproves = (
  baseline: SameSideEndpointOrderMetrics,
  candidate: SameSideEndpointOrderMetrics,
): boolean => (
  endpointOrderDoesNotRegress(baseline, candidate)
  && candidate.legalSharedTrunkTies > baseline.legalSharedTrunkTies
);

/**
 * Flattens a compact same-direction terminal stair by sliding only an automatic
 * endpoint along its existing node side. Every candidate must remove an audit
 * warning while retaining endpoint order, passage order, hard geometry, and
 * every pre-existing source/target trunk identity.
 */
export const repairFinalTerminalMicroDoglegs = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: FinalEndpointTopologyRepairOptions = {},
): Edge[] => {
  let current = edges;
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  for (let pass = 0; pass < edges.length; pass += 1) {
    const baselineMicroDoglegs = localMicroDoglegCount(current);
    if (baselineMicroDoglegs === 0) break;
    const baselineOrder = auditFinalSameSideEndpointOrder(current, nodes);
    const baselinePassage = auditFinalSameSidePassageOrder(current, nodes);
    let accepted: Edge[] | null = null;
    for (let edgeIndex = 0; edgeIndex < current.length; edgeIndex += 1) {
      const edge = current[edgeIndex];
      if (!edge) continue;
      const path = getEdgePath(edge);
      if (!validPath(path)) continue;
      const roles: Role[] = ['target', 'source'];
      roles.sort((first, second) => {
        const firstOwnsTrunk = baselineOrder.legalSharedTrunks.some(trunk => (
          trunk.role === first && trunk.edgeIds.includes(edge.id)
        ));
        const secondOwnsTrunk = baselineOrder.legalSharedTrunks.some(trunk => (
          trunk.role === second && trunk.edgeIds.includes(edge.id)
        ));
        return Number(firstOwnsTrunk) - Number(secondOwnsTrunk);
      });
      for (const role of roles) {
        const oppositeRole: Role = role === 'source' ? 'target' : 'source';
        if (!baselineOrder.legalSharedTrunks.some(trunk => (
          trunk.role === oppositeRole && trunk.edgeIds.includes(edge.id)
        ))) continue;
        const policy = readEdgeTerminalPolicy(edge, role);
        if (policy.forbidden || policy.positionFixed) continue;
        const nodeId = role === 'source' ? edge.source : edge.target;
        const rect = nodeRect(nodeById.get(nodeId));
        if (!rect) continue;
        const candidatePaths = terminalMicroDoglegRepairPaths(edge, path, role, rect);
        for (const candidatePath of candidatePaths) {
          const rerouted = withPath(edge, candidatePath);
          const candidateEdges = [...current];
          candidateEdges[edgeIndex] = {
            ...rerouted,
            data: {
              ...rerouted.data,
              terminalMicroDoglegRepaired: true,
            },
          };
          const candidateMicroDoglegs = localMicroDoglegCount(candidateEdges);
          accepted = acceptCandidate(
            current,
            { edges: candidateEdges, changedEdgeIndexes: [edgeIndex] },
            nodes,
            options,
            (before, after) => (
              candidateMicroDoglegs < baselineMicroDoglegs
              && endpointOrderDoesNotRegress(before, after)
              && passageDoesNotRegress(
                baselinePassage,
                auditFinalSameSidePassageOrder(candidateEdges, nodes),
              )
            ),
          );
          if (accepted) break;
        }
        if (accepted) break;
      }
      if (accepted) break;
    }
    if (!accepted) break;
    current = accepted;
  }
  return current;
};

const terminalTrunkStemPoint = (
  path: readonly Point[],
  role: Role,
  side: Side,
  commonStemLength: number,
): Point | null => {
  const ordered = orientedTerminalPath(path, role);
  const terminal = ordered[0];
  const stub = ordered[1];
  if (!terminal || !stub || commonStemLength < MIN_TRUE_TRUNK_STEM - EPS) return null;
  const expectedAxis = side === 'top' || side === 'bottom' ? 'v' : 'h';
  if (axisOf(terminal, stub) !== expectedAxis) return null;
  if (side === 'top' || side === 'bottom') {
    const direction = Math.sign(stub.y - terminal.y);
    if (direction === 0) return null;
    return { x: terminal.x, y: terminal.y + direction * commonStemLength };
  }
  const direction = Math.sign(stub.x - terminal.x);
  if (direction === 0) return null;
  return { x: terminal.x + direction * commonStemLength, y: terminal.y };
};

const terminalTrunkRejoinPaths = (
  terminal: Point,
  stem: Point,
  side: Side,
  path: readonly Point[],
  role: Role,
): Point[][] => {
  const candidates: Point[][] = [];
  const ordered = orientedTerminalPath(path, role);
  const maximumIndex = Math.min(ordered.length - 2, MAX_REJOIN_POINTS + 1);
  for (let rejoinIndex = 1; rejoinIndex <= maximumIndex; rejoinIndex += 1) {
    const rejoin = ordered[rejoinIndex];
    if (!rejoin) continue;
    const stemPreservingBend = side === 'top' || side === 'bottom'
      ? { x: rejoin.x, y: stem.y }
      : { x: stem.x, y: rejoin.y };
    const alternateBend = side === 'top' || side === 'bottom'
      ? { x: stem.x, y: rejoin.y }
      : { x: rejoin.x, y: stem.y };
    for (const bend of [stemPreservingBend, alternateBend]) {
      const candidateOrdered = compactPath([
        { ...terminal },
        { ...stem },
        bend,
        ...ordered.slice(rejoinIndex).map(point => ({ ...point })),
      ]);
      const candidate = role === 'source' ? candidateOrdered : candidateOrdered.reverse();
      if (!validPath(candidate)) continue;
      if (candidate.some((point, index) => (
        index > 0 && axisOf(candidate[index - 1], point) === null
      ))) continue;
      if (!candidates.some(existing => (
        existing.length === candidate.length
        && existing.every((point, index) => (
          Math.abs(point.x - candidate[index].x) <= EPS
          && Math.abs(point.y - candidate[index].y) <= EPS
        ))
      ))) candidates.push(candidate);
    }
  }
  return candidates;
};

const repairFinalSharedTerminalTrunks = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  role: Role,
  options: FinalEndpointTopologyRepairOptions = {},
): Edge[] => {
  let current = edges;
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  for (let pass = 0; pass < edges.length; pass += 1) {
    const baselineOrder = auditFinalSameSideEndpointOrder(current, nodes);
    const terminalTrunks = baselineOrder.legalSharedTrunks
      .filter(trunk => trunk.role === role)
      .sort((first, second) => (
        second.edgeIds.length - first.edgeIds.length
        || second.commonStemLength - first.commonStemLength
        || first.id.localeCompare(second.id)
      ));
    const terminalTrunkMembers = new Set(terminalTrunks.flatMap(trunk => trunk.edgeIds));
    const oppositeRole: Role = role === 'source' ? 'target' : 'source';
    const oppositeTrunkMembers = new Set(baselineOrder.legalSharedTrunks
      .filter(trunk => trunk.role === oppositeRole)
      .flatMap(trunk => trunk.edgeIds));
    let accepted: Edge[] | null = null;
    for (const trunk of terminalTrunks) {
      const ownerIndex = current.findIndex(edge => (
        trunk.edgeIds.includes(edge.id)
        && edge[role] === trunk.nodeId
        && validPath(getEdgePath(edge))
      ));
      const ownerPath = ownerIndex >= 0 ? getEdgePath(current[ownerIndex]) : [];
      const ownerOrdered = orientedTerminalPath(ownerPath, role);
      const terminal = ownerOrdered[0];
      const stem = terminalTrunkStemPoint(
        ownerPath,
        role,
        trunk.side,
        trunk.commonStemLength,
      );
      if (!terminal || !stem) continue;
      const siblingIndexes = current
        .map((edge, edgeIndex) => ({ edge, edgeIndex }))
        .filter(({ edge }) => (
          edge[role] === trunk.nodeId
          && !terminalTrunkMembers.has(edge.id)
        ))
        .sort((first, second) => first.edge.id.localeCompare(second.edge.id));
      for (const { edge, edgeIndex } of siblingIndexes) {
        const policy = readEdgeTerminalPolicy(edge, role);
        if (policy.forbidden || policy.sideFixed) continue;
        if (!edgeTerminalHandleChangeIsAllowed(
          edge,
          role,
          trunk.side,
          { allowRuntimeHandleChange: true },
        )) continue;
        const path = getEdgePath(edge);
        if (!validPath(path)) continue;
        const terminalNode = nodeById.get(trunk.nodeId);
        const terminalRect = nodeRect(terminalNode);
        const siblingTerminal = endpointPoint(path, role);
        const handle = role === 'source' ? edge.sourceHandle : edge.targetHandle;
        const currentSide = siblingTerminal && terminalRect
          ? terminalSide(siblingTerminal, terminalRect, handle)
          : null;
        if (!currentSide) continue;
        // Moving an already clean endpoint across node sides is a topology
        // change, not a harmless trunk extension. Permit it only for a true
        // dual-trunk member whose opposite endpoint identity must be retained.
        // Ordinary siblings keep their existing side/sector escape instead of
        // being pulled through a node corner merely to increase trunk ties.
        if (
          currentSide !== trunk.side
          && !oppositeTrunkMembers.has(edge.id)
          && !crossContainerDirectionMatchesTrunkSide(edge, role, trunk.side, nodeById)
        ) continue;
        for (const candidatePath of terminalTrunkRejoinPaths(
          terminal,
          stem,
          trunk.side,
          path,
          role,
        )) {
          const rerouted = withPath(edge, candidatePath, role, trunk.side);
          const candidateEdges = [...current];
          candidateEdges[edgeIndex] = {
            ...rerouted,
            data: {
              ...rerouted.data,
              sharedTrunkAware: true,
              sharedTrunkSynthesized: true,
            },
          };
          accepted = acceptCandidate(
            current,
            { edges: candidateEdges, changedEdgeIndexes: [edgeIndex] },
            nodes,
            options,
            sharedTerminalTrunkImproves,
            currentSide !== trunk.side && oppositeTrunkMembers.has(edge.id)
              ? MAX_DUAL_TRUNK_BACKTRACK_INCREASE
              : 0,
          );
          if (accepted) break;
        }
        if (accepted) break;
      }
      if (accepted) break;
    }
    if (!accepted) break;
    current = accepted;
  }
  return current;
};

/**
 * Extends an existing geometric source trunk to an automatic sibling while
 * retaining the sibling's target suffix and any target-trunk role.
 */
export const repairFinalSharedSourceTerminalTrunks = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: FinalEndpointTopologyRepairOptions = {},
): Edge[] => repairFinalSharedTerminalTrunks(edges, nodes, 'source', options);

/**
 * Extends an existing geometric target trunk to an automatic sibling while
 * retaining the sibling's source prefix and any source-trunk role.
 */
export const repairFinalSharedTargetTerminalTrunks = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: FinalEndpointTopologyRepairOptions = {},
): Edge[] => repairFinalSharedTerminalTrunks(edges, nodes, 'target', options);

/** Aligns only the final normal stems of nearby same-target edges to an existing port. */
export const repairFinalSameTargetTerminalTrunks = (
  edges: Edge[],
  nodes: ReactFlowNode[],
  options: FinalEndpointTopologyRepairOptions = {},
): Edge[] => {
  let current = edges;
  const initialKeys = collectEndpointGroups(current, nodes)
    .filter(group => group.role === 'target')
    .map(group => group.key);
  for (const groupKey of initialKeys) {
    const group = collectEndpointGroups(current, nodes).find(item => item.key === groupKey);
    if (!group || group.entries.length < MIN_TARGET_TRUNK_MEMBERS) continue;
    if (!group.entries.every(terminalStemIsEligible)) continue;
    const coordinates = [...new Set(group.entries.map(entry => entry.terminalCoordinate))]
      .sort((first, second) => first - second);
    if (coordinates.length < 2) continue;
    const maximumCoordinate = coordinates[coordinates.length - 1];
    const minimumCoordinate = coordinates[0];
    if (
      maximumCoordinate === undefined
      || minimumCoordinate === undefined
      || maximumCoordinate - minimumCoordinate > MAX_TARGET_ALIGNMENT_DISTANCE + EPS
    ) continue;
    let accepted: Edge[] | null = null;
    for (const coordinate of coordinates) {
      const changed: number[] = [];
      let allowed = true;
      const candidateEdges = [...current];
      for (const entry of group.entries) {
        if (Math.abs(entry.terminalCoordinate - coordinate) <= EPS) continue;
        const edge = candidateEdges[entry.edgeIndex];
        if (!edge || readEdgeTerminalPolicy(edge, 'target').positionFixed) {
          allowed = false;
          break;
        }
        const alignedEdge = withPath(
          edge,
          alignTerminalStem(entry, coordinate),
        );
        candidateEdges[entry.edgeIndex] = {
          ...alignedEdge,
          data: {
            ...alignedEdge.data,
            sharedTrunkAware: true,
            sharedTrunkSynthesized: true,
          },
        };
        changed.push(entry.edgeIndex);
      }
      if (!allowed || changed.length === 0) continue;
      accepted = acceptCandidate(
        current,
        { edges: candidateEdges, changedEdgeIndexes: [...new Set(changed)] },
        nodes,
        options,
        (baseline, candidate) => targetTrunkImproves(group.key, baseline, candidate),
      );
      if (accepted) break;
    }
    if (accepted) current = accepted;
  }
  return current;
};
