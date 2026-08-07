import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapFloatingBar.tsx'),
    'utf8',
);
const css = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/FloatingBar.module.css'),
    'utf8',
);

describe('MindMapFloatingBar commercial interaction contract', () => {
    it('keeps node actions named, keyboard visible, and inside narrow viewports', () => {
        expect(source).toContain('role="toolbar"');
        expect(source).toContain('aria-label="节点快捷操作"');
        expect(source).toContain('aria-label={tip}');
        expect(source).toContain('aria-label="AI 扩展子主题"');
        expect(source).toContain('aria-label="连线颜色"');
        expect(source).toContain('aria-label="节点形状"');
        expect(source).toContain("aria-label={obj.note ? '编辑备注' : '添加备注'}");
        expect(css).toMatch(/\.barContainer[\s\S]*?max-width: calc\(100vw - 16px\)[\s\S]*?overflow-x: auto/);
        expect(css).toContain('.btn:focus-visible');
    });

    it('creates a child through the focus-and-edit helper instead of leaving a placeholder', () => {
        expect(source).toContain('addEditableMindMapChild(mind, tpc)');
        expect(source).not.toContain('mind.addChild(tpc, cleanMindMapChildNode()); })} />');
    });

    it('rehydrates an existing instance-scoped selection after data refresh remounts', () => {
        expect(source).toContain('resolveSelectedMindMapTopic(mind, null)');
        expect(source).toContain('if (existingNode) onSelect([existingNode])');
    });
});
