import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (fileName: string) => readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2', fileName),
    'utf8',
);

describe('mind map auxiliary panel commercial audit contract', () => {
    it('keeps panel content clear of mobile application chrome', () => {
        const css = readSource('MindMapSidePanel.module.css');

        expect(css).toContain('@media (max-width: 767px)');
        expect(css).toMatch(/\.panel\s*\{[\s\S]*?top:\s*72px;/);
        expect(css).toContain('bottom: calc(164px + env(safe-area-inset-bottom, 0px));');
        expect(css).toContain('.outlineItem:focus-visible');
        expect(css).toContain('.outlineItem:focus-within .outlineActions');
        expect(css).toContain('.historyItem:focus-visible');
    });

    it('exposes outline operations to keyboard and assistive technology users', () => {
        const source = readSource('MindMapOutlinePanel.tsx');

        expect(source).toContain('aria-label="搜索大纲节点"');
        expect(source).toContain('role="tree"');
        expect(source).toContain('role="treeitem"');
        expect(source).toContain('onClick={() => setOutlineOpen(false)}');
        expect(source).not.toContain('placeholder="🔍');
    });

    it('uses a named, always-visible restore button for each history snapshot', () => {
        const source = readSource('MindMapHistoryPanel.tsx');

        expect(source).toContain('onClick={() => setHistoryOpen(false)}');
        expect(source).toContain('aria-label={`恢复 ${r.time} 的历史版本：${r.description}`}');
        expect(source).toContain('className={sidePanelStyles.historyRestoreAction}');
        expect(source).not.toContain('history-restore-btn');
    });
});
