import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    calculateCanvasVisibleLeft,
    calculateCanvasVisibleRight,
    calculateQuickCloneViewportAdjustment,
    resolveFlowchartQuickCloneLabelKey,
} from '../../custom-nodes/flowchartQuickClone';

const readRelativeFile = (relativePath: string) => readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8',
);

const readLocaleString = (relativePath: string, path: string[]) => {
    const source: unknown = JSON.parse(readRelativeFile(relativePath));
    const value = path.reduce<unknown>((current, key) => (
        current && typeof current === 'object' && !Array.isArray(current)
            ? (current as Record<string, unknown>)[key]
            : undefined
    ), source);

    if (typeof value !== 'string') {
        throw new Error(`Missing locale string: ${path.join('.')}`);
    }

    return value;
};

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
        expect(shapesSource.match(/data-icon-rail-search-focus="true"/g)).toHaveLength(1);
        expect(sidebarSource).not.toContain("renderDraggableItem('Circle'");
        expect(sidebarSource).not.toContain("renderDraggableItem('Swimlane'");
        expect(sidebarSource).toContain("t('propertyPanel.options.shape.circle')");
        expect(pluginSource).toContain("import { FlowchartShapesPanel } from '../components/diagrams/FlowchartShapesPanel'");
        expect(pluginSource).not.toContain('export const FlowchartShapesPanel');
        expect(pluginModalSource).toContain('closable={false}');
        expect(pluginModalSource).toContain("aria-label={t('common.close')}");
        expect(pluginModalSource).not.toContain('<TabPane');
        expect(nodeSource).toContain("t('designer.flowchart.nodeAriaLabel'");
        expect(nodeSource).toContain('role="button"');
        expect(nodeSource).toContain('tabIndex={0}');
        expect(nodeSource).toContain("t('designer.flowchart.quickAddDirection'");
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
        for (const key of ['creationTools', 'pointer', 'marqueeEnter', 'marqueeExit', 'drawingMode', 'drawingModeExit', 'stickyNote', 'mindMap']) {
            expect(read(zh, ['designer', 'toolbar', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'toolbar', key])).toBeTypeOf('string');
        }
        for (const key of [
            'cut', 'copy', 'paste', 'duplicate', 'duplicateSelection', 'delete',
            'lock', 'unlock', 'lockSelection', 'unlockSelection', 'bringToFront',
            'bringSelectionToFront', 'sendToBack', 'sendSelectionToBack', 'align',
            'alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle',
            'alignBottom', 'distributeHorizontal', 'distributeVertical', 'matchSize',
            'matchWidth', 'matchHeight', 'matchBoth', 'group', 'selectAll', 'undo',
            'redo', 'fitView', 'addNode', 'process', 'database', 'decision', 'step',
            'zoomIn', 'zoomOut',
        ]) {
            expect(read(zh, ['designer', 'contextMenu', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'contextMenu', key])).toBeTypeOf('string');
        }
        for (const key of [
            'editLabel', 'labelInput', 'labelPlaceholder', 'moveBendPoint',
            'moveSegment', 'addWaypoint', 'deleteWaypoint',
        ]) {
            expect(read(zh, ['designer', 'edgeEditor', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'edgeEditor', key])).toBeTypeOf('string');
        }
        for (const key of ['nodeAriaLabel', 'nodeSelectedState', 'nodeLockedState', 'doubleClickToEdit', 'quickAddOrConnect', 'quickAddDirection']) {
            expect(read(zh, ['designer', 'flowchart', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'flowchart', key])).toBeTypeOf('string');
        }
        for (const key of ['title', 'desktopDescription', 'mobileDescription', 'primaryAction']) {
            expect(read(zh, ['designer', 'flowchart', 'emptyState', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'flowchart', 'emptyState', key])).toBeTypeOf('string');
            expect(read(zh, ['designer', 'architecture', 'emptyState', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'architecture', 'emptyState', key])).toBeTypeOf('string');
        }
        for (const key of ['network', 'compute', 'data', 'business']) {
            expect(read(zh, ['designer', 'architecture', 'categories', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'architecture', 'categories', key])).toBeTypeOf('string');
        }
        for (const key of ['frontend', 'gateway', 'microservice', 'messageQueue', 'cache', 'storage', 'database', 'system', 'component']) {
            expect(read(zh, ['designer', 'architecture', 'components', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'architecture', 'components', key])).toBeTypeOf('string');
        }
        for (const key of ['createRelationship', 'selectTwoComponents', 'duplicateRelationship', 'relationshipCreated', 'relationshipLabel']) {
            expect(read(zh, ['designer', 'architecture', 'toolbar', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'architecture', 'toolbar', key])).toBeTypeOf('string');
        }
        for (const [section, keys] of Object.entries({
            empty: ['title', 'description'],
            checking: ['title', 'description'],
            compliant: ['title', 'description'],
            summary: ['error', 'warning', 'info'],
            severity: ['error', 'warning', 'info'],
        })) {
            for (const key of keys) {
                expect(read(zh, ['designer', 'architecture', 'validation', section, key])).toBeTypeOf('string');
                expect(read(en, ['designer', 'architecture', 'validation', section, key])).toBeTypeOf('string');
            }
        }
        for (const key of ['sec001', 'sec002', 'sec003', 'sec004', 'sec005', 'flow001', 'flow002', 'flow003', 'flow004', 'rel002', 'net001', 'net002', 'iso001']) {
            expect(read(zh, ['designer', 'architecture', 'validation', 'rules', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'architecture', 'validation', 'rules', key])).toBeTypeOf('string');
        }
        for (const key of ['inspectIssue']) {
            expect(read(zh, ['designer', 'architecture', 'validation', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'architecture', 'validation', key])).toBeTypeOf('string');
        }
        for (const key of ['process', 'startEnd', 'decision']) {
            expect(read(zh, ['designer', 'flowchart', 'quickCloneLabels', key])).toBeTypeOf('string');
            expect(read(en, ['designer', 'flowchart', 'quickCloneLabels', key])).toBeTypeOf('string');
        }
        for (const key of ['deleteConfirmTitle', 'deleteConfirmDescription', 'deleteSuccess', 'deleteFailed']) {
            expect(read(zh, ['workspace', key])).toBeTypeOf('string');
            expect(read(en, ['workspace', key])).toBeTypeOf('string');
        }
    });

    it('states the scoped and irreversible impact of resetting local editor state', () => {
        const path = ['designer', 'toolbar', 'clearCacheContent'];
        const zhContent = readLocaleString('../../../../locales/zh.json', path);
        const enContent = readLocaleString('../../../../locales/en.json', path);

        expect(zhContent).not.toContain('所有本地缓存');
        expect(zhContent).toContain('当前图表');
        expect(zhContent).toContain('AI 配置');
        expect(zhContent).toContain('存储设置');
        expect(zhContent).toContain('其他图表');
        expect(zhContent).toContain('无法撤销');
        expect(zhContent).toMatch(/保存|导出/);
        expect(zhContent).toContain('刷新');

        expect(enContent.toLowerCase()).not.toContain('all local cache');
        expect(enContent).toContain('current diagram');
        expect(enContent).toContain('AI configuration');
        expect(enContent).toContain('storage settings');
        expect(enContent).toContain('other diagrams');
        expect(enContent).toContain('cannot be undone');
        expect(enContent).toMatch(/save|export/);
        expect(enContent).toContain('reload');
    });

    it('resolves safe localized defaults for quick-cloned shapes', () => {
        expect(resolveFlowchartQuickCloneLabelKey('pill')).toBe(
            'designer.flowchart.quickCloneLabels.startEnd',
        );
        expect(resolveFlowchartQuickCloneLabelKey('')).toBe(
            'designer.flowchart.quickCloneLabels.process',
        );
        expect(resolveFlowchartQuickCloneLabelKey({ shape: 'pill' })).toBe(
            'designer.flowchart.quickCloneLabels.process',
        );
    });

    it('keeps a quick-cloned node inside the canvas area left of an open sidebar', () => {
        expect(calculateCanvasVisibleLeft({
            containerLeft: 0,
            containerRight: 1280,
            containerWidth: 1280,
            drawerLeft: 68,
            drawerRight: 348,
            drawerWidth: 280,
            drawerHeight: 624,
            drawerVisible: true,
        })).toBe(348);
        expect(calculateCanvasVisibleLeft({
            containerLeft: 0,
            containerRight: 1280,
            containerWidth: 1280,
            drawerVisible: false,
        })).toBe(0);
        expect(calculateCanvasVisibleRight({
            containerLeft: 0,
            containerRight: 1280,
            containerWidth: 1280,
            sidebarLeft: 960,
            sidebarRight: 1280,
            sidebarWidth: 320,
            sidebarHeight: 720,
            sidebarVisible: true,
        })).toBe(960);
        expect(calculateCanvasVisibleRight({
            containerLeft: 0,
            containerRight: 390,
            containerWidth: 390,
            sidebarLeft: 0,
            sidebarRight: 390,
            sidebarWidth: 390,
            sidebarHeight: 0,
            sidebarVisible: true,
        })).toBe(390);
        expect(calculateCanvasVisibleRight({
            containerLeft: 0,
            containerRight: Number.NaN,
            containerWidth: 390,
            sidebarVisible: false,
        })).toBe(0);
        expect(calculateQuickCloneViewportAdjustment({
            containerWidth: 1280,
            containerHeight: 720,
            visibleLeft: 0,
            visibleRight: 960,
            nodeX: 1050,
            nodeY: 300,
            nodeWidth: 120,
            nodeHeight: 60,
            viewportX: 0,
            viewportY: 0,
            zoom: 1,
        })).toEqual({
            x: -630,
            y: 0,
            zoom: 1,
        });
        expect(calculateQuickCloneViewportAdjustment({
            containerWidth: 1280,
            containerHeight: 720,
            visibleLeft: 0,
            visibleRight: 960,
            nodeX: 400,
            nodeY: 300,
            nodeWidth: 120,
            nodeHeight: 60,
            viewportX: 0,
            viewportY: 0,
            zoom: 1,
        })).toBeNull();
    });

    it('rejects invalid quick-clone viewport measurements', () => {
        expect(calculateQuickCloneViewportAdjustment({
            containerWidth: Number.NaN,
            containerHeight: 720,
            visibleLeft: 0,
            visibleRight: 960,
            nodeX: 400,
            nodeY: 300,
            nodeWidth: 120,
            nodeHeight: 60,
            viewportX: 0,
            viewportY: 0,
            zoom: 1,
        })).toBeNull();
        expect(calculateQuickCloneViewportAdjustment({
            containerWidth: 1280,
            containerHeight: 720,
            visibleLeft: 0,
            visibleRight: 960,
            nodeX: 400,
            nodeY: 300,
            nodeWidth: 120,
            nodeHeight: 60,
            viewportX: 0,
            viewportY: 0,
            zoom: 0,
        })).toBeNull();
    });
});
