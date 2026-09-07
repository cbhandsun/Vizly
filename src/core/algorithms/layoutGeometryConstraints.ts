export type LayoutGeometryConstraints = Readonly<{
  lanes?: Readonly<{
    direction: 'TB' | 'BT' | 'LR' | 'RL';
    nodeIds: readonly string[];
    memberships?: readonly Readonly<{ nodeId: string; laneId: string }>[];
  }>;
}>;
export type LayoutGeometryReport = Readonly<{
  version: 1;
  clean: boolean;
  geometryDigest: string;
  invalidGeometry: number;
  invalidHierarchy: number;
  overlappingPairs: number;
  outsideParent: number;
  laneViolations: number;
  budgetExceeded: boolean;
}>;

const MAX_NODES = 10_000;
const MAX_COORDINATE = 1_000_000_000;
const MAX_COMPARISONS = 2_000_000;
// Match the Worker projection boundary; deeper ancestry would use a different absolute position.
export const MAX_PARENT_DEPTH = 20;
const TOLERANCE = 0.5;
const CONTAINERS = new Set(['titleGroup', 'subGroup', 'domain', 'group']);
// These annotations may intentionally cover diagram content. Their hierarchy
// and finite coordinates still cross the same boundary as ordinary nodes.
const DECORATIONS = new Set(['sticky-note', 'mindmap-boundary']);
type RecordValue = Record<string, unknown>;
type GeometryNode = {
  id: string; parentId?: string; type: string; x: number; y: number;
  width: number; height: number; hidden: boolean; collapsed: boolean; invalidSize: boolean;
};
const record = (value: unknown): RecordValue | null => value !== null
  && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
const coordinate = (value: unknown): value is number => typeof value === 'number'
  && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const identifier = (value: unknown): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= 4096;
const dimension = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && /^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/.test(value)
    ? Number.parseFloat(value) : value;
  return coordinate(parsed) && parsed > 0 ? parsed : null;
};

/** Measured geometry is the rendered size; explicit dimensions are fallbacks,
 * not permission to replace a supplied invalid measurement with a good value. */
const nodeDimension = (node: RecordValue, axis: 'width' | 'height'): number | null => {
  const measured = record(node.measured)?.[axis];
  const style = record(node.style)?.[axis];
  return dimension(measured !== undefined ? measured : style !== undefined ? style : node[axis]);
};

const parseConstraints = (value: unknown): LayoutGeometryConstraints | null => {
  if (value === undefined) return Object.freeze({});
  const input = record(value);
  if (!input || Object.keys(input).some(key => key !== 'lanes')) return null;
  if (input.lanes === undefined) return Object.freeze({});
  const lanes = record(input.lanes);
  if (!lanes || Object.keys(lanes).some(key => key !== 'direction' && key !== 'nodeIds' && key !== 'memberships')) return null;
  const direction = lanes.direction;
  if (direction !== 'TB' && direction !== 'BT' && direction !== 'LR' && direction !== 'RL') return null;
  if (!Array.isArray(lanes.nodeIds) || lanes.nodeIds.length > MAX_NODES
    || !lanes.nodeIds.every(identifier) || new Set(lanes.nodeIds).size !== lanes.nodeIds.length) return null;
  const nodeIds = Object.freeze([...lanes.nodeIds]);
  if (lanes.memberships === undefined) return Object.freeze({ lanes: Object.freeze({ direction, nodeIds }) });
  if (!Array.isArray(lanes.memberships) || lanes.memberships.length > MAX_NODES) return null;
  const laneIds = new Set(nodeIds), memberIds = new Set<string>();
  const memberships: Readonly<{ nodeId: string; laneId: string }>[] = [];
  for (const value of lanes.memberships) {
    const member = record(value);
    if (!member || Object.keys(member).some(key => key !== 'nodeId' && key !== 'laneId')
      || !identifier(member.nodeId) || !identifier(member.laneId)
      || member.nodeId === member.laneId || memberIds.has(member.nodeId) || !laneIds.has(member.laneId)) return null;
    memberIds.add(member.nodeId);
    memberships.push(Object.freeze({ nodeId: member.nodeId, laneId: member.laneId }));
  }
  return Object.freeze({ lanes: Object.freeze({ direction, nodeIds, memberships: Object.freeze(memberships) }) });
};

export const cloneLayoutGeometryConstraints = (value: unknown): LayoutGeometryConstraints | null => parseConstraints(value);

const digest = (value: unknown): string => {
  const text = JSON.stringify(value);
  let first = 2166136261, second = 2246822507;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619);
    second = Math.imul(second ^ text.charCodeAt(index), 3266489909);
  }
  return `layout-geometry-v1:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
};

/** Layout operation contract. Routing-only edits can intentionally keep user
 * geometry; explicit auto-layout must produce separated, contained nodes. */
export const evaluateLayoutGeometry = (
  nodes: unknown,
  constraints?: unknown,
): LayoutGeometryReport => {
  let invalidGeometry = 0, invalidHierarchy = 0, overlappingPairs = 0;
  let outsideParent = 0, laneViolations = 0, budgetExceeded = false;
  const normalizedConstraints = parseConstraints(constraints);
  if (!normalizedConstraints) laneViolations++;
  const parsed: GeometryNode[] = [];
  const byId = new Map<string, GeometryNode>();
  if (!Array.isArray(nodes) || nodes.length > MAX_NODES) invalidGeometry++;
  else for (const value of nodes) {
    const node = record(value), position = record(node?.position);
    if (!node || !identifier(node.id) || !position || !coordinate(position.x) || !coordinate(position.y)) {
      invalidGeometry++; continue;
    }
    const width = nodeDimension(node, 'width'), height = nodeDimension(node, 'height');
    const data = record(node.data);
    const hidden = node.hidden === true || data?.hidden === true;
    // Command normalization propagates collapsed visibility to each descendant.
    // Only a node's own visibility determines whether it needs a rendered size.
    if (node.parentId !== undefined && !identifier(node.parentId)) { invalidHierarchy++; continue; }
    if (byId.has(node.id)) { invalidHierarchy++; continue; }
    const next: GeometryNode = {
      id: node.id, parentId: typeof node.parentId === 'string' ? node.parentId : undefined,
      type: typeof node.type === 'string' ? node.type : '',
      x: position.x, y: position.y, width: width ?? 0, height: height ?? 0,
      hidden, collapsed: data?.collapsed === true, invalidSize: width === null || height === null,
    };
    parsed.push(next); byId.set(next.id, next);
  }
  const absolute = new Map<string, GeometryNode>();
  const ancestors = new Map<string, Set<string>>();
  for (const node of parsed) {
    let x = node.x, y = node.y;
    let parentId = node.parentId;
    const seen = new Set([node.id]);
    const parents = new Set<string>();
    while (parentId) {
      if (seen.has(parentId) || parents.size >= MAX_PARENT_DEPTH) { invalidHierarchy++; break; }
      seen.add(parentId); parents.add(parentId);
      const parent = byId.get(parentId);
      if (!parent || !CONTAINERS.has(parent.type)) { invalidHierarchy++; break; }
      x += parent.x; y += parent.y;
      parentId = parent.parentId;
    }
    if (!coordinate(x) || !coordinate(y) || !coordinate(x + node.width) || !coordinate(y + node.height)) invalidGeometry++;
    absolute.set(node.id, { ...node, x, y });
    ancestors.set(node.id, parents);
  }
  const visible = [...absolute.values()].filter(node => !node.hidden && !DECORATIONS.has(node.type));
  invalidGeometry += visible.filter(node => node.invalidSize).length;
  for (const node of visible) {
    if (!node.parentId) continue;
    const parent = absolute.get(node.parentId);
    if (parent && (node.x < parent.x - TOLERANCE || node.y < parent.y - TOLERANCE
      || node.x + node.width > parent.x + parent.width + TOLERANCE
      || node.y + node.height > parent.y + parent.height + TOLERANCE)) outsideParent++;
  }
  const sorted = visible.toSorted((left, right) => left.x - right.x);
  let comparisons = 0;
  outer: for (let left = 0; left < sorted.length; left++) {
    const a = sorted[left];
    for (let right = left + 1; right < sorted.length; right++) {
      const b = sorted[right];
      if (b.x >= a.x + a.width - TOLERANCE) break;
      if (++comparisons > MAX_COMPARISONS) { budgetExceeded = true; break outer; }
      if (ancestors.get(a.id)?.has(b.id) || ancestors.get(b.id)?.has(a.id)) continue;
      if (a.y < b.y + b.height - TOLERANCE && b.y < a.y + a.height - TOLERANCE) overlappingPairs++;
    }
  }
  const lanes = normalizedConstraints?.lanes;
  if (lanes) {
    const horizontal = lanes.direction === 'LR' || lanes.direction === 'RL';
    const flow = horizontal ? 'x' : 'y', length = horizontal ? 'width' : 'height';
    const cross = horizontal ? 'y' : 'x', crossLength = horizontal ? 'height' : 'width';
    const laneNodes: GeometryNode[] = [];
    for (const id of lanes.nodeIds) {
      const node = absolute.get(id);
      if (!node || node.hidden || !CONTAINERS.has(node.type)) laneViolations++;
      else laneNodes.push(node);
    }
    const baseline = laneNodes[0];
    if (baseline) for (const node of laneNodes.slice(1)) {
      if (Math.abs(node[flow] - baseline[flow]) > TOLERANCE
        || Math.abs(node[length] - baseline[length]) > TOLERANCE) laneViolations++;
    }
    // nodeIds is the declared cross-axis order, independent of flow reversal.
    const ordered = laneNodes;
    for (let index = 1; index < ordered.length; index++) {
      if (ordered[index][cross] < ordered[index - 1][cross] + ordered[index - 1][crossLength] - TOLERANCE) laneViolations++;
    }
    // Memberships describe the command's original semantic ownership, never
    // ownership inferred from the candidate we are about to accept.
    for (const member of lanes.memberships ?? []) {
      if (!absolute.has(member.nodeId) || !ancestors.get(member.nodeId)?.has(member.laneId)) laneViolations++;
    }
  }
  return Object.freeze({
    version: 1, clean: invalidGeometry + invalidHierarchy + overlappingPairs + outsideParent + laneViolations === 0 && !budgetExceeded,
    geometryDigest: digest([parsed, normalizedConstraints]),
    invalidGeometry, invalidHierarchy, overlappingPairs, outsideParent, laneViolations, budgetExceeded,
  });
};
