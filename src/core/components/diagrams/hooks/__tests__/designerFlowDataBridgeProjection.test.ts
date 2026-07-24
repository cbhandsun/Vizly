import { describe, expect, it } from 'vitest';
import {
  analyzeDesignerCanvas,
  projectDesignerStandardEdges,
  projectDesignerStandardNodes,
} from '../designerFlowDataBridgeProjection';

describe('designer flow data bridge projection', () => {
  it('projects React Flow data into the bounded analyzer contract', () => {
    const result = analyzeDesignerCanvas(
      [{ id: 'node-a', position: { x: 0, y: 0 }, data: { label: 'A', unsafe: { nested: true } } }],
      [],
    );

    expect(result.stats.nodeCount).toBe(1);
    expect(result.issues.some(issue => issue.type === 'orphan_node')).toBe(true);
  });

  it('separates groups from standard nodes with bounded defaults', () => {
    const projected = projectDesignerStandardNodes([
      { id: 'node', position: { x: 1, y: 2 }, data: { label: 'Node' } },
      { id: 'group', type: 'titleGroup', position: { x: 3, y: 4 }, width: 200, data: { description: '<b>Group</b>' } },
    ]);
    expect(projected.standardNodes).toHaveLength(1);
    expect(projected.standardNodes[0]).toMatchObject({ id: 'node', description: '<b>Node</b>' });
    expect(projected.groups[0]).toMatchObject({ id: 'group', label: 'Group', isGroup: true });
  });

  it('normalizes smart edge types and preserves handle metadata', () => {
    expect(projectDesignerStandardEdges([{
      id: 'edge', source: 'a', target: 'b', type: 'smart', sourceHandle: 'right', data: { manualHandles: true },
    }])[0]).toMatchObject({
      type: 'main',
      metadata: { sourceHandle: 'right', manualHandles: true },
    });
  });
});
