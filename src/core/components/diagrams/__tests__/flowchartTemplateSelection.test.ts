import { describe, expect, it } from 'vitest';

import type { NodeTemplate } from '../hooks/useNodeTemplates';
import { findFlowchartTemplateById } from '../flowchartTemplateSelection';

const template: NodeTemplate = {
    id: 'tpl-order',
    name: '订单节点',
    category: '业务',
    nodeType: 'flowchart',
    data: { label: '订单' },
    createdAt: 1,
};

describe('flowchart template selection', () => {
    it('resolves the template selected by the sidebar id', () => {
        expect(findFlowchartTemplateById([template], ' tpl-order ')).toBe(template);
    });

    it('rejects empty, unknown, and oversized ids', () => {
        expect(findFlowchartTemplateById([template], '')).toBeUndefined();
        expect(findFlowchartTemplateById([template], 'missing')).toBeUndefined();
        expect(findFlowchartTemplateById([template], 'x'.repeat(129))).toBeUndefined();
    });
});
