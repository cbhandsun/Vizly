import type { Edge, Node } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';

import type { NodeTemplate } from '../hooks/useNodeTemplates';
import { buildFlowchartTemplateApplyPlan } from '../flowchartTemplateApply';

describe('flowchartTemplateApply', () => {
  it('expands a template using the current viewport coordinates and zoom', () => {
    const template: NodeTemplate = {
      id: 'tpl-1',
      name: 'Template',
      category: 'General',
      nodeType: 'custom',
      data: { label: 'Template Node' },
      createdAt: 123,
    };
    const nodes: Node[] = [
      {
        id: 'node-1',
        type: 'custom',
        position: { x: 10, y: 20 },
        data: { label: 'Applied' },
      },
    ];
    const edges: Edge[] = [];
    const createFromTemplate = vi.fn(() => ({ nodes, edges }));

    const plan = buildFlowchartTemplateApplyPlan({
      template,
      viewport: { x: 120, y: 240, zoom: 1.5 },
      createFromTemplate,
    });

    expect(createFromTemplate).toHaveBeenCalledWith(template, 120, 240, 1.5);
    expect(plan).toEqual({ nodes, edges });
  });
});
