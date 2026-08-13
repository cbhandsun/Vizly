import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirToolbar.tsx'), 'utf8');
const themeSelectorSource = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapThemeSelector.tsx'), 'utf8');
const directionSelectorSource = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapDirectionSelector.tsx'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirToolbar.css'), 'utf8');
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

    it('keeps every tool reachable by touch and keyboard without text-symbol icons', () => {
        expect(css).toMatch(/\.mind-elixir-toolbar-button[\s\S]*?min-width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/\.mind-elixir-toolbar \{[\s\S]*?width: 100%;[\s\S]*?overflow-x: auto;/);
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

    it('routes visible toolbar copy through production translations', () => {
        expect(source).not.toContain('label="撤销');
        expect(source).not.toContain('label="重做');
        expect(source).not.toContain('label="导出思维导图"');
        expect(source).not.toContain("label: '纯色背景'");
        expect(directionSelectorSource).not.toContain("label: '双向展开'");
        expect(themeSelectorSource).not.toContain('aria-label="选择思维导图主题"');
        expect(source.match(/plugins\.mindmap\.toolbar\./g)?.length).toBeGreaterThanOrEqual(35);
    });
});
