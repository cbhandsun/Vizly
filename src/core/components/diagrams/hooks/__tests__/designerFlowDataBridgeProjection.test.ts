import { describe, expect, it } from 'vitest';
import { projectDesignerStandardEdges, projectDesignerStandardNodes } from '../designerFlowDataBridgeProjection';

describe('designer flow data bridge projection', () => {
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
