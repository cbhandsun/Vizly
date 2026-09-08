import { estimateEdgeLabelRect, type EdgeLabelPoint as Point, type EdgeLabelRect as Rect } from './edgeLabelAvoidance';
import type { EdgeLabelSize } from './edgeLabelMeasurement';

export interface EdgeLabelArrangementInput {
  id: string;
  path: readonly Point[];
  labelPath: readonly Point[];
  anchor: Point;
  preferredCenter: Point;
  text: string;
  size?: EdgeLabelSize;
  scale: number;
  manual: boolean;
  allowManualReflow?: boolean;
  obstacles: readonly Rect[];
}

export interface EdgeLabelPlacement {
  center: Point;
  rect: Rect;
  anchor: Point;
  leaderEnd?: Point;
  status: 'placed' | 'manual' | 'unresolved';
  conflicts: number;
}

const finite = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1_000_000;
const validPoint = (point: Point) => point && finite(point.x) && finite(point.y);
const validRect = (rect: Rect) => validPoint(rect) && Number.isFinite(rect.width)
  && Number.isFinite(rect.height) && rect.width > 0 && rect.height > 0
  && rect.width <= 100_000 && rect.height <= 100_000;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const expand = (rect: Rect, gap: number): Rect => ({
  x: rect.x - gap, y: rect.y - gap, width: rect.width + gap * 2, height: rect.height + gap * 2,
});
export const edgeLabelRectsConflict = (a: Rect, b: Rect, gap = 8): boolean => (
  a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
  && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
);

// Slab clipping handles both orthogonal routes and diagonal annotation leaders.
export const edgeLabelSegmentIntersectsRect = (a: Point, b: Point, rect: Rect): boolean => {
  let near = 0;
  let far = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, rect.x, rect.x + rect.width],
    [a.y, b.y - a.y, rect.y, rect.y + rect.height],
  ]) {
    if (Math.abs(delta) < 0.0001) {
      if (start <= min || start >= max) return false;
    } else {
      const t1 = (min - start) / delta;
      const t2 = (max - start) / delta;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near >= far) return false;
    }
  }
  return near < far;
};

const pathHits = (path: readonly Point[], rect: Rect): boolean => path.some((point, index) => (
  index > 0 && edgeLabelSegmentIntersectsRect(path[index - 1], point, rect)
));

const project = (point: Point, a: Point, b: Point): Point => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t };
};

const nearestAnchor = (point: Point, path: readonly Point[]): Point => {
  let nearest = path[0] ?? point;
  for (let i = 1; i < path.length; i += 1) {
    const candidate = project(point, path[i - 1], path[i]);
    if (distance(candidate, point) < distance(nearest, point)) nearest = candidate;
  }
  return nearest;
};

const leaderEnd = (anchor: Point, center: Point, rect: Rect): Point | undefined => {
  const dx = anchor.x - center.x;
  const dy = anchor.y - center.y;
  const ratio = Math.max(Math.abs(dx) / (rect.width / 2), Math.abs(dy) / (rect.height / 2));
  if (ratio <= 1) return undefined;
  return { x: center.x + dx / ratio, y: center.y + dy / ratio };
};

const candidatesFor = (input: EdgeLabelArrangementInput, obstacleBoundaries = false): Point[] => {
  if (input.manual) return [input.preferredCenter];
  const rect = estimateEdgeLabelRect(input.anchor, input.text, input.scale, input.size);
  const segments = input.labelPath.slice(1).map((b, index) => {
    const a = input.labelPath[index];
    return { a, b, near: project(input.anchor, a, b) };
  }).sort((a, b) => distance(a.near, input.anchor) - distance(b.near, input.anchor)).slice(0, 8);
  const candidates: Point[] = obstacleBoundaries ? [] : [input.preferredCenter];
  for (const { a, b, near } of segments) {
    const vertical = Math.abs(a.x - b.x) < Math.abs(a.y - b.y);
    const halfCross = (vertical ? rect.width : rect.height) / 2;
    const halfAlong = (vertical ? rect.height : rect.width) / 2;
    const boundaryAnchors = obstacleBoundaries ? input.obstacles.filter(validRect).flatMap(obstacle => {
      const start = vertical ? obstacle.y : obstacle.x;
      const end = start + (vertical ? obstacle.height : obstacle.width);
      // A short semantic segment may not contain enough room for the label.
      // Bound the center's retreat; nearestAnchor still pins its leader to it.
      return [start - halfAlong - 10, end + halfAlong + 10]
        .map(value => vertical ? { x: near.x, y: value } : { x: value, y: near.y })
        .filter(point => distance(point, project(point, a, b)) <= 320);
    }) : [];
    const anchors = obstacleBoundaries
      ? [...new Map(boundaryAnchors.map(point => [`${point.x},${point.y}`, point])).values()]
        .sort((first, second) => distance(first, input.anchor) - distance(second, input.anchor)).slice(0, 8)
      : [near, project({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, a, b), a, b];
    for (const anchor of anchors) {
      for (const retreat of [0, 40, 100, 200, 320]) {
        for (const side of [1, -1]) {
          candidates.push(vertical
            ? { x: anchor.x + side * (halfCross + 10 + retreat), y: anchor.y }
            : { x: anchor.x, y: anchor.y + side * (halfCross + 10 + retreat) });
        }
      }
    }
  }
  return [...new Map(candidates.filter(validPoint).map(p => [`${p.x},${p.y}`, p])).values()];
};

// Readability scaling can make labels wider than the fixed retreat range.
// Try the actual content boundaries only after the cheaper search is exhausted.
const contentBoundaryCandidates = (input: EdgeLabelArrangementInput, content: readonly Rect[]): Point[] => {
  const rect = estimateEdgeLabelRect(input.anchor, input.text, input.scale, input.size);
  const reach = Math.max(320, rect.width, rect.height);
  const nearby = content.map(obstacle => ({ obstacle, center: {
    x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height / 2,
  } })).sort((a, b) => distance(a.center, input.anchor) - distance(b.center, input.anchor)).slice(0, 16);
  const alongX = new Set([input.preferredCenter.x]);
  const alongY = new Set([input.preferredCenter.y]);
  for (const { obstacle } of nearby) {
    alongX.add(obstacle.x - rect.width / 2 - 10);
    alongX.add(obstacle.x + obstacle.width + rect.width / 2 + 10);
    alongY.add(obstacle.y - rect.height / 2 - 10);
    alongY.add(obstacle.y + obstacle.height + rect.height / 2 + 10);
  }
  // At most 33 × 33 centers, including free intervals between two blockers.
  const candidates = [...alongX].flatMap(x => [...alongY].map(y => ({ x, y })))
    .filter(point => validPoint(point) && distance(point, nearestAnchor(point, input.labelPath)) <= reach);
  return [...new Map(candidates.map(point => [`${point.x},${point.y}`, point])).values()];
};

/** Bounded deterministic greedy packing. It never modifies routes or hides text.
 * Fixed manual labels reserve space first; automatic labels use up to eight nearby
 * semantic segments and a 320px retreat. If fixed anchors fail, each segment
 * also tries eight nearby obstacle-boundary centers within a 320px along-axis
 * retreat. If content is still covered, a final search combines boundaries of
 * sixteen nearby content rectangles, within one label dimension (minimum 320).
 * Their leaders stay on the semantic path. Exhaustion is unresolved,
 * not a claim that an arbitrary dense graph is collision-free. */
export const arrangeEdgeLabels = (inputs: readonly EdgeLabelArrangementInput[]): ReadonlyMap<string, EdgeLabelPlacement> => {
  const valid = inputs.filter(input => input.id && validPoint(input.anchor) && validPoint(input.preferredCenter)
    && input.path.length >= 2 && input.path.length <= 512 && input.path.every(validPoint)
    && input.labelPath.length >= 2 && input.labelPath.length <= 512 && input.labelPath.every(validPoint));
  const paths = valid.map(input => input.path);
  const nodes = [...new Map(valid.flatMap(input => input.obstacles.filter(validRect))
    .map(rect => [`${rect.x},${rect.y},${rect.width},${rect.height}`, rect])).values()];
  const terminals = paths.flatMap(path => [path[0], path[path.length - 1]])
    .map(point => ({ x: point.x - 12, y: point.y - 12, width: 24, height: 24 }));
  const result = new Map<string, EdgeLabelPlacement>();
  const occupied: EdgeLabelPlacement[] = [];
  const labels = valid.filter(input => input.text).sort((a, b) => (
    Number(b.manual && !b.allowManualReflow) - Number(a.manual && !a.allowManualReflow)
  ) || Number(b.manual) - Number(a.manual)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const input of labels) {
    const preferredRect = estimateEdgeLabelRect(input.preferredCenter, input.text, input.scale, input.size);
    // Only a readability-scaled relative offset may leave its saved position,
    // and only when that position would cover content. Its input stays intact.
    const reflowManual = input.manual && input.allowManualReflow === true && (
      nodes.some(node => edgeLabelRectsConflict(preferredRect, node, 10))
      || occupied.some(other => edgeLabelRectsConflict(preferredRect, other.rect))
    );
    const searchInput = reflowManual ? { ...input, manual: false } : input;
    let best: EdgeLabelPlacement | undefined;
    let bestCost = Infinity;
    let bestContentConflicts = Infinity;
    // Search obstacle-adjacent intervals only when the cheaper fixed anchors
    // cannot place this label. Keep the same collision checks and manual intent.
    for (const pass of [0, 1, 2]) {
      if (pass > 0 && (searchInput.manual || best?.conflicts === 0)) break;
      if (pass === 2 && bestContentConflicts === 0) break;
      const candidates = pass === 2
        ? contentBoundaryCandidates(searchInput, [...nodes, ...occupied.map(other => other.rect)])
        : candidatesFor(searchInput, pass === 1);
      for (const center of candidates) {
        const rect = estimateEdgeLabelRect(center, input.text, input.scale, input.size);
        const nodeConflicts = nodes.filter(node => edgeLabelRectsConflict(rect, node, 10)).length;
        const labelConflicts = occupied.filter(other => edgeLabelRectsConflict(rect, other.rect)).length;
        const contentConflicts = nodeConflicts + labelConflicts;
        // Content conflicts are the primary ordering key. A worse candidate
        // cannot win regardless of route/leader cost, and cannot be conflict-free.
        if (contentConflicts > bestContentConflicts) continue;
        const anchor = nearestAnchor(center, input.labelPath);
        const end = leaderEnd(anchor, center, rect);
        const terminalConflicts = terminals.filter(terminal => edgeLabelRectsConflict(rect, terminal, 4)).length;
        const pathRect = expand(rect, 8);
        const pathConflicts = paths.filter(path => pathHits(path, pathRect)).length;
        const blockedLeader = end && nodes.some(node => edgeLabelSegmentIntersectsRect(anchor, end, expand(node, 2)));
        const leaderLabelConflicts = occupied.filter(other => (
          (end && edgeLabelSegmentIntersectsRect(anchor, end, expand(other.rect, 2)))
          || (other.leaderEnd && edgeLabelSegmentIntersectsRect(other.anchor, other.leaderEnd, expand(rect, 2)))
        )).length;
        const conflicts = nodeConflicts + labelConflicts + terminalConflicts + pathConflicts
          + Number(Boolean(blockedLeader)) + leaderLabelConflicts;
        // Never trade covered text or a business node for fewer line crossings.
        // Remaining line/leader conflicts still report an unresolved placement.
        const cost = conflicts * 1_000_000 + distance(center, input.preferredCenter)
          + distance(anchor, input.anchor) * 0.25;
        if (contentConflicts < bestContentConflicts || (contentConflicts === bestContentConflicts && cost < bestCost)) {
          bestContentConflicts = contentConflicts;
          bestCost = cost;
          best = { center, rect, anchor, leaderEnd: blockedLeader ? undefined : end,
            status: searchInput.manual ? 'manual' : conflicts ? 'unresolved' : 'placed', conflicts };
        }
        if (conflicts === 0 && distance(center, input.preferredCenter) < 0.01) break;
      }
    }
    if (best) { result.set(input.id, best); occupied.push(best); }
  }
  return result;
};
