import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { buildEdgeLabelObstacles } from '../edgeLabelObstacles';

describe('label obstacle visibility', () => {
  it('treats a collapsed group as a solid label obstacle and allows labels inside expanded groups', () => {
    const nodes: Node[] = [false, true].map(collapsed => ({
      id: String(collapsed), type: 'subGroup', position: { x: 200, y: 80 },
      width: 691, height: 736, data: { collapsed },
    }));
    expect(buildEdgeLabelObstacles(nodes)).toEqual([
      { x: 200, y: 80, width: 691, height: 736 },
    ]);
  });

  it.each(['titleGroup', 'subGroup', 'group', 'domain', 'subDomain', 'swimlane'])(
    'includes collapsed %s measured geometry', type => {
      expect(buildEdgeLabelObstacles([{
        id: 'group', type, position: { x: 21, y: 34 }, width: 20, height: 20,
        measured: { width: 691, height: 736 }, data: { collapsed: true },
      }])).toEqual([{ x: 21, y: 34, width: 691, height: 736 }]);
    },
  );

  it('excludes hidden and empty nodes and invalid measurements without mutating the source', () => {
    const nodes: Node[] = [
      { id: 'hidden', hidden: true, position: { x: 0, y: 0 }, width: 80, height: 40, data: {} },
      { id: 'zero', position: { x: 0, y: 0 }, width: 0, height: 40, data: {} },
      { id: 'bad', position: { x: 0, y: 0 }, width: Infinity, height: 40, data: {} },
      { id: 'bad-flag', type: 'subGroup', position: { x: 0, y: 0 }, width: 80, height: 40, data: { collapsed: 'true' } },
      { id: 'safe', type: 'custom', position: { x: 30, y: 40 }, width: 80, height: 40,
        data: { label: '<script>alert(1)</script>', collapsed: 'true' } },
    ];
    const before = structuredClone(nodes);
    expect(buildEdgeLabelObstacles(nodes)).toEqual([{ x: 30, y: 40, width: 80, height: 40 }]);
    expect(nodes).toEqual(before);
    expect(buildEdgeLabelObstacles([])).toEqual([]);
  });

  it('resolves nested parent-relative positions while preferring actual measured absolute positions', () => {
    const nodes: Array<Node & { positionAbsolute?: { x: number; y: number } }> = [
      { id: 'outer', type: 'group', position: { x: 100, y: 200 }, data: {} },
      { id: 'inner', type: 'group', parentId: 'outer', position: { x: 20, y: 30 }, data: {} },
      { id: 'folded', type: 'subGroup', parentId: 'inner', position: { x: 5, y: 6 },
        width: 80, height: 40, data: { collapsed: true } },
    ];
    expect(buildEdgeLabelObstacles(nodes)).toEqual([{ x: 125, y: 236, width: 80, height: 40 }]);
    nodes[2] = { ...nodes[2], positionAbsolute: { x: 450, y: 600 } };
    expect(buildEdgeLabelObstacles(nodes)).toEqual([{ x: 450, y: 600, width: 80, height: 40 }]);
  });

  it('excludes descendants of hidden or collapsed parents and rejects cyclic ancestry', () => {
    const nodes: Node[] = [
      { id: 'hidden', hidden: true, type: 'group', position: { x: 0, y: 0 }, data: {} },
      { id: 'folded', type: 'group', position: { x: 0, y: 0 }, data: { collapsed: true } },
      ...['hidden', 'folded'].map(parentId => ({ id: `child-${parentId}`, parentId,
        position: { x: 0, y: 0 }, width: 80, height: 40, data: {} })),
      { id: 'cycle', parentId: 'cycle', position: { x: 0, y: 0 }, width: 80, height: 40, data: {} },
    ];
    expect(buildEdgeLabelObstacles(nodes)).toEqual([]);
  });
});
