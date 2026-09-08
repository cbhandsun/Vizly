import type { DisplayPoint } from './baseReactFlowDisplayGeometry';

/** Extend a short elbow leg without moving either authored endpoint. */
export const buildElbowEndpointStubPaths = (
  path: readonly DisplayPoint[], minimumStub: number,
): DisplayPoint[][] => {
  if (path.length !== 3 || !Number.isFinite(minimumStub) || minimumStub <= 0
    || minimumStub > 5000 || path.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)
      || Math.abs(p.x) > 1_000_000 || Math.abs(p.y) > 1_000_000)) return [];
  const result: DisplayPoint[][] = [];
  for (const reverse of [false, true]) {
    const [start, bend, end] = reverse ? [...path].reverse() : path;
    const horizontal = start.y === bend.y && start.x !== bend.x;
    const vertical = start.x === bend.x && start.y !== bend.y;
    if ((!horizontal && !vertical)
      || (horizontal ? bend.x !== end.x || bend.y === end.y : bend.y !== end.y || bend.x === end.x)) continue;
    const axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x';
    const shortLength = Math.abs(bend[axis] - start[axis]);
    const longLength = Math.abs(end[cross] - start[cross]);
    if (shortLength >= minimumStub || longLength < minimumStub * 2) continue;
    const outward = Math.sign(bend[axis] - start[axis]);
    const forward = Math.sign(end[cross] - start[cross]);
    const outer = bend[axis] + outward * minimumStub;
    // Prefer a turn next to the short leg, keeping the remote shared stem.
    for (const turn of new Set([start[cross] + forward * minimumStub, end[cross] - forward * minimumStub])) {
      const first = { ...start, [axis]: outer };
      const second = { ...first, [cross]: turn };
      const third = { ...end, [cross]: turn };
      const candidate = [{ ...start }, first, second, third, { ...end }];
      if (candidate.some(p => Math.abs(p.x) > 1_000_000 || Math.abs(p.y) > 1_000_000)) continue;
      result.push(reverse ? candidate.reverse() : candidate);
    }
  }
  return result;
};
