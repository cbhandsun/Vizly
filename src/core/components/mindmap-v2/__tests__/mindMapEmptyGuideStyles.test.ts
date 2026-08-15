import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapEmptyGuide.module.css'), 'utf8');

describe('mind map empty guide commercial styling', () => {
    it('keeps the guide above the root node with theme-aware readable surfaces', () => {
        expect(css).toContain('bottom: calc(50% + 48px)');
        expect(css).toContain('right: var(--right-sidebar-offset, 0px)');
        expect(css).toContain('left: var(--left-sidebar-offset, 0px)');
        expect(css).not.toContain('left: 50%');
        expect(css).toContain('width: auto');
        expect(css).toContain('color: var(--main-color, #1f2937)');
        expect(css).toContain('background: color-mix(in srgb, var(--main-bgcolor, #ffffff) 94%, #6366f1 6%)');
    });

    it('provides visible keyboard focus and respects reduced motion', () => {
        expect(css).toContain('.dismiss:focus-visible');
        expect(css).toContain('outline: 2px solid #4f46e5');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('animation: none');
        expect(css).toContain('env(safe-area-inset-right, 0px)');
        expect(css).toContain('env(safe-area-inset-left, 0px)');
    });
});
