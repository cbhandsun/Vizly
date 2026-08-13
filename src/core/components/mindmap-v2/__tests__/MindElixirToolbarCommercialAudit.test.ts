import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirToolbar.tsx'), 'utf8');
const themeSelectorSource = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapThemeSelector.tsx'), 'utf8');
const directionSelectorSource = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapDirectionSelector.tsx'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirToolbar.css'), 'utf8');
const wrapperCss = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirWrapper.css'), 'utf8');
const topToolbarSource = readFileSync(resolve(process.cwd(), 'src/components/ui/ModernTopToolbar.tsx'), 'utf8');
const topActionButtonsSource = readFileSync(resolve(process.cwd(), 'src/core/components/diagrams/TopActionButtons.tsx'), 'utf8');
const iconButtonSource = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapToolbarIconButton.tsx'), 'utf8');

describe('MindElixirToolbar commercial interaction contract', () => {
    it('uses one accessible toolbar button contract and semantic toolbar boundaries', () => {
        expect(source).toContain('role="toolbar"');
        expect(source).toContain("aria-label={t('plugins.mindmap.toolbar.label')}");
        expect(directionSelectorSource).toContain("'plugins.mindmap.toolbar.direction.current'");
        expect(directionSelectorSource).toContain('virtual={false}');
        expect(directionSelectorSource).toContain('open={open}');
        expect(source.match(/getPopupContainer=\{getViewportPopupContainer\}/g)).toHaveLength(3);
        expect(directionSelectorSource).toContain('getPopupContainer={getViewportPopupContainer}');
        expect(themeSelectorSource).toContain('getPopupContainer={getViewportPopupContainer}');
        expect(themeSelectorSource).toContain('open={open || suppressTooltip ? false : undefined}');
        expect(themeSelectorSource).toContain('role="menuitemradio"');
        expect(themeSelectorSource).toContain('aria-checked={selected}');
        expect(themeSelectorSource).toContain('aria-controls={menuId}');
        expect(themeSelectorSource).toContain("'plugins.mindmap.toolbar.chooseTheme'");
        expect(themeSelectorSource).toContain("'plugins.mindmap.toolbar.currentTheme'");
        expect(source).toContain("aria-expanded={openMenu === 'export'}");
        expect(source).toContain("aria-expanded={openMenu === 'import'}");
        expect(source).toContain("aria-expanded={openMenu === 'background'}");
        expect(source.match(/suppressTooltip=\{openMenu !== null\}/g)).toHaveLength(4);
        expect(iconButtonSource).toContain('open={suppressTooltip ? false : undefined}');
        expect(source).not.toContain('<Button');
        expect(source).not.toContain('let _isFocused');
        expect(topToolbarSource).toMatch(/vizly-plugin-context-toolbar-portal[\s\S]*?min-w-0 max-w-full[\s\S]*?flex-1 w-full/);
        expect(topActionButtonsSource).toContain("minWidth: 0, maxWidth: '100%', width: '100%'");
    });

    it('exposes undo and redo only when the native history lifecycle allows them', () => {
        expect(source).toContain('useSyncExternalStore(');
        expect(source).toContain('subscribeMindMapHistoryAvailability(mind, listener)');
        expect(source).toContain('disabled={!mind || !historyAvailability.canUndo}');
        expect(source).toContain('disabled={!mind || !historyAvailability.canRedo}');
        expect(source).toContain("logMindmapToolbarHistoryFailure('undo', error)");
        expect(source).toContain("logMindmapToolbarHistoryFailure('redo', error)");
    });

    it('keeps every tool reachable by touch and keyboard without text-symbol icons', () => {
        expect(css).toMatch(/\.mind-elixir-toolbar-button[\s\S]*?min-width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/\.vizly-mindmap-toolbar \{[\s\S]*?width: 100%;[\s\S]*?overflow-x: auto;/);
        expect(css).toMatch(/\.mind-elixir-toolbar-zoom-reset[\s\S]*?min-width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(source).toContain('<button');
        expect(source).not.toContain('⊞');
        expect(source).not.toContain('☰');
        expect(source).not.toContain('🕒');
        expect(source).toContain('<BgColorsOutlined />');
        expect(source).toContain('<BorderlessTableOutlined />');
        expect(source).toContain('<EllipsisOutlined />');
        expect(source).not.toContain('backgroundImage:');
        expect(source).toMatch(/MindMapThemeSelector[\s\S]*?data-testid="mindmap-shortcuts-trigger"[\s\S]*?\/\* Undo \/ Redo \*\//);
    });

    it('avoids the mind-elixir vendor toolbar class that forces absolute positioning', () => {
        expect(source).toContain('className="vizly-mindmap-toolbar"');
        expect(source).not.toContain('className="mind-elixir-toolbar"');
        expect(css).not.toMatch(/(^|\n)\.mind-elixir-toolbar\s*\{/);
    });

    it('routes visible toolbar copy through production translations', () => {
        expect(source).not.toContain('label="撤销');
        expect(source).not.toContain('label="重做');
        expect(source).not.toContain('label="导出思维导图"');
        expect(source).not.toContain("label: '纯色背景'");
        expect(directionSelectorSource).not.toContain("label: '双向展开'");
        expect(themeSelectorSource).not.toContain('aria-label="选择思维导图主题"');
        expect(source.match(/plugins\.mindmap\.toolbar\./g)?.length).toBeGreaterThanOrEqual(35);
    });

    it('numbers the current MindElixir hierarchy instead of obsolete topic markup', () => {
        expect(wrapperCss).toContain('#vizly-mind-elixir-root[data-numbering] me-nodes');
        expect(wrapperCss).toContain('#vizly-mind-elixir-root[data-numbering] me-main > me-wrapper');
        expect(wrapperCss).toContain('me-children > me-wrapper > me-parent > me-tpc::before');
        expect(wrapperCss).toContain('content: counters(me-seq, ".") ".";');
        expect(wrapperCss).toContain('opacity: 0.78;');
        expect(wrapperCss).not.toContain('me-children > me-wrapper > me-tpc::before');
    });

    it('only enables branch balancing in the two-way layout where it is visible', () => {
        expect(source).toContain("disabled={!mind || currentDir !== 'LR'}");
        expect(source).toContain("t('plugins.mindmap.toolbar.direction.twoWay')");
        expect(source).toContain('applyMindMapAutoArrangeTransaction(mind)');
    });

    it('keeps the displayed zoom synchronized with every toolbar command', () => {
        expect(source).toContain("setZoomVal(applyMindMapZoomCommand(mind, 'in'))");
        expect(source).toContain("setZoomVal(applyMindMapZoomCommand(mind, 'out'))");
        expect(source).toContain("setZoomVal(applyMindMapZoomCommand(mind, 'reset'))");
        expect(source).toContain('toMindMapZoomPercent(mind.scaleVal)');
        expect(source).toContain('disabled={zoomVal <= MIND_MAP_MIN_SCALE * 100}');
        expect(source).toContain('disabled={zoomVal >= MIND_MAP_MAX_SCALE * 100}');
        expect(source).toContain('logMindmapToolbarZoomFailure(error)');
    });
});
