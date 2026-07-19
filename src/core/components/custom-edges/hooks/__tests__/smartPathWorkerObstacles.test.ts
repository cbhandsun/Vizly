import { describe, expect, it } from 'vitest';

import {
  buildSmartPathObstacles,
  getSmartPathAbsolutePosition,
  type SmartPathSimpleNode,
} from '../smartPathWorkerObstacles';

const node = (id: string, overrides: Partial<SmartPathSimpleNode> = {}): SmartPathSimpleNode => ({
  id,
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  ...overrides,
});

describe('smartPathWorkerObstacles', () => {
  it('separates provided container bounds and rejects malformed geometry', () => {
    const nodes = new Map<string, SmartPathSimpleNode>([
      ['group', node('group', { type: 'group' })],
    ]);
    const result = buildSmartPathObstacles(nodes, [
      { id: 'group', x: 10, y: 20, width: 200, height: 100 },
      { id: 'valid', x: 30, y: 40, width: 20, height: 10 },
      { id: 'nan', x: Number.NaN, y: 0, width: Number.NaN, height: 10 },
      { id: 'huge', x: 0, y: 0, width: Number.MAX_VALUE, height: 10 },
    ], 'source', 'target');

    expect(result.containerBounds).toEqual([
      { id: 'group', x: 10, y: 20, width: 200, height: 100 },
    ]);
    expect(result.obstacleRects).toEqual([
      { id: 'valid', x: 30, y: 40, width: 20, height: 10 },
    ]);
  });

  it('builds node obstacles while excluding endpoints, hidden, opt-out, and background nodes', () => {
    const nodes = new Map<string, SmartPathSimpleNode>([
      ['source', node('source')],
      ['target', node('target')],
      ['visible', node('visible', { position: { x: 20, y: 30 } })],
      ['hidden', node('hidden', { data: { hidden: true } })],
      ['opt-out', node('opt-out', { data: { isObstacle: false } })],
      ['behind', node('behind', { zIndex: -1 })],
      ['container', node('container', { type: 'group', position: { x: 5, y: 6 } })],
    ]);
    const result = buildSmartPathObstacles(nodes, [], 'source', 'target');

    expect(result.obstacleRects).toEqual([
      { id: 'visible', x: 20, y: 30, width: 100, height: 50 },
    ]);
    expect(result.containerBounds).toEqual([
      { id: 'container', x: 5, y: 6, width: 100, height: 50 },
    ]);
  });

  it('resolves nested positions and terminates safely on parent cycles', () => {
    const parent = node('parent', { position: { x: 100, y: 200 } });
    const child = node('child', { parentId: 'parent', position: { x: 10, y: 20 } });
    const nodes = new Map([[parent.id, parent], [child.id, child]]);
    expect(getSmartPathAbsolutePosition(child, nodes)).toEqual({ x: 110, y: 220 });

    parent.parentId = 'child';
    expect(() => getSmartPathAbsolutePosition(child, nodes)).not.toThrow();
  });
});
