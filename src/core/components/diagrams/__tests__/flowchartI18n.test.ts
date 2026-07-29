import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const readRelativeFile = (relativePath: string) => readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
);

describe('flowchart interaction copy', () => {
    it('uses translations for alignment and primary shape labels', () => {
        const toolbarSource = readRelativeFile('../FloatingContextToolbar.tsx');
        const shapesSource = readRelativeFile('../FlowchartShapesPanel.tsx');
        const sidebarSource = readRelativeFile('../ModernFlowchartSidebar.tsx');
        const pluginSource = readRelativeFile('../../../plugins/FlowchartPlugin.tsx');
        const pluginModalSource = readRelativeFile('../ui/PluginManagerModal.tsx');
        const nodeSource = readRelativeFile('../../custom-nodes/FlowchartNode.tsx');

        expect(toolbarSource).not.toContain('label="Align Left"');
        expect(toolbarSource).toContain("t('designer.toolbar.alignL')");
        expect(toolbarSource).toContain("labelKey: 'propertyPanel.options.shape.rectangle'");
        expect(shapesSource).not.toContain("label: 'Circle'");
        expect(shapesSource).toContain("t('designer.sidebar.searchComponents')");
        expect(sidebarSource).not.toContain("renderDraggableItem('Circle'");
        expect(sidebarSource).not.toContain("renderDraggableItem('Swimlane'");
        expect(sidebarSource).toContain("t('propertyPanel.options.shape.circle')");
        expect(pluginSource).toContain("import { FlowchartShapesPanel } from '../components/diagrams/FlowchartShapesPanel'");
        expect(pluginSource).not.toContain('export const FlowchartShapesPanel');
        expect(pluginModalSource).toContain('closable={false}');
        expect(pluginModalSource).toContain("aria-label={t('common.close')}");
        expect(pluginModalSource).not.toContain('<TabPane');
        expect(nodeSource).toContain("t('designer.flowchart.nodeAriaLabel'");
        expect(nodeSource).not.toContain('`${shape} 节点:');
    });

    it('keeps Chinese and English translation keys aligned', () => {
        const zh = JSON.parse(readRelativeFile('../../../../locales/zh.json')) as Record<string, unknown>;
        const en = JSON.parse(readRelativeFile('../../../../locales/en.json')) as Record<string, unknown>;
        const read = (source: Record<string, unknown>, path: string[]) => path.reduce<unknown>(
            (value, key) => value && typeof value === 'object' && !Array.isArray(value)
                ? (value as Record<string, unknown>)[key]
                : undefined,
            source,
        );

        for (const key of ['alignL', 'alignC', 'alignR', 'alignT', 'alignM', 'alignB', 'distributeH', 'distributeV']) {
            expect(read(zh, ['designer', 'toolbar', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'toolbar', key])).toBeTypeOf('string');
        }
        for (const key of ['nodeAriaLabel', 'nodeSelectedState', 'nodeLockedState', 'doubleClickToEdit', 'quickAddOrConnect']) {
            expect(read(zh, ['designer', 'flowchart', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'flowchart', key])).toBeTypeOf('string');
        }
    });
});
