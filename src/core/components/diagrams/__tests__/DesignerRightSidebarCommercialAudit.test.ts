import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(path, 'utf8');

describe('designer sidebar commercial touch contract', () => {
    it('keeps the rail and tab switcher physically touch-safe under UI scaling', () => {
        const source = readSource('src/core/components/diagrams/DesignerRightSidebar.tsx');
        const css = readSource('src/core/components/diagrams/FlowchartDesigner.css');

        expect(source).toContain("const COMMERCIAL_TOUCH_TARGET = 'var(--commercial-touch-target, 44px)'");
        expect(source.match(/width: COMMERCIAL_TOUCH_TARGET/g)).toHaveLength(3);
        expect(source.match(/height: COMMERCIAL_TOUCH_TARGET/g)).toHaveLength(2);
        expect(source).toContain('minHeight: COMMERCIAL_TOUCH_TARGET');
        expect(css).toMatch(/\.designer-right-sidebar \.ant-tabs-nav,[\s\S]*?\.designer-right-sidebar \.ant-tabs-tab,[\s\S]*?\.designer-right-sidebar \.ant-tabs-tab-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
    });

    it('keeps property fields, section headers, and the AI composer touch-safe', () => {
        const propertyCss = readSource('src/core/components/diagrams/PropertyPanel.css');
        const aiCss = readSource('src/components/ai/AIChatPanel.css');

        expect(propertyCss).toMatch(/\.property-collapse \.ant-collapse-header[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(propertyCss).toMatch(/\.property-collapse \.ant-input,[\s\S]*?\.property-collapse \.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important/);
        expect(propertyCss).toMatch(/\.property-panel-container \.ant-typography-copy,[\s\S]*?\.property-panel-container \.ant-input-clear-icon[\s\S]*?min-width: var\(--commercial-touch-target, 44px\)[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(propertyCss).toMatch(/@media \(max-width: 767px\), \(pointer: coarse\)[\s\S]*?\.property-collapse \.ant-input-number-handler-wrap,[\s\S]*?\.property-collapse \.ant-input-number-actions[\s\S]*?display: none/);
        expect(aiCss).toMatch(/\.ai-chat-textarea[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important/);
    });
});
