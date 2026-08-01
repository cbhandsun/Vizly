import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ModernFlowchartSidebar accessibility contract', () => {
    it('names navigator search and keeps tree rows touch sized', () => {
        const source = readFileSync(
            'src/core/components/diagrams/ModernFlowchartSidebar.tsx',
            'utf8',
        );
        const css = readFileSync(
            'src/core/components/diagrams/FlowchartDesigner.css',
            'utf8',
        );

        expect(source).toContain("aria-label={t('designer.sidebar.search')}");
        expect(source).toContain('className="navigator-tree-commercial"');
        expect(css).toMatch(/\.navigator-tree-commercial \.ant-tree-treenode,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
    });
});
