import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirToolbar.tsx'), 'utf8');
const themeSelectorSource = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapThemeSelector.tsx'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindElixirToolbar.css'), 'utf8');
const topToolbarSource = readFileSync(resolve(process.cwd(), 'src/components/ui/ModernTopToolbar.tsx'), 'utf8');

describe('MindElixirToolbar commercial interaction contract', () => {
    it('uses one accessible toolbar button contract and semantic toolbar boundaries', () => {
        expect(source).toContain('role="toolbar"');
        expect(source).toContain('aria-label="思维导图工具"');
        expect(source).toContain('aria-label="思维导图布局方向"');
        expect(source.match(/getPopupContainer=\{getViewportPopupContainer\}/g)).toHaveLength(4);
        expect(themeSelectorSource).toContain('getPopupContainer={getViewportPopupContainer}');
        expect(themeSelectorSource).toContain('role="menuitemradio"');
        expect(themeSelectorSource).toContain('aria-checked={selected}');
        expect(themeSelectorSource).toContain('aria-controls={menuId}');
        expect(source).toContain("aria-expanded={openMenu === 'export'}");
        expect(source).toContain("aria-expanded={openMenu === 'import'}");
        expect(source).toContain("aria-expanded={openMenu === 'background'}");
        expect(source).not.toContain('<Button');
        expect(source).not.toContain('let _isFocused');
        expect(topToolbarSource).toMatch(/vizly-plugin-context-toolbar-portal[\s\S]*?min-w-0 max-w-full/);
    });

    it('keeps every tool reachable by touch and keyboard without text-symbol icons', () => {
        expect(css).toMatch(/\.mind-elixir-toolbar-button[\s\S]*?min-width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/\.mind-elixir-toolbar-zoom-reset[\s\S]*?min-width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(source).toContain('<button');
        expect(source).not.toContain('⊞');
        expect(source).not.toContain('☰');
        expect(source).not.toContain('🕒');
    });
});
