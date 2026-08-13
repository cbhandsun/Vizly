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
const colorPickerSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapBranchColorPicker.tsx'),
    'utf8',
);
const shapeControlSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapNodeShapeControl.tsx'),
    'utf8',
);
const shapePickerSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapNodeShapePicker.tsx'),
    'utf8',
);
const selectionHookSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/useMindMapFloatingSelection.ts'),
    'utf8',
);
const aiPanelSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapAIQuickPanel.tsx'),
    'utf8',
);
const boundaryControlSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapBoundaryControl.tsx'),
    'utf8',
);
const boundaryEditorSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapBoundaryEditor.tsx'),
    'utf8',
);
const noteEditorSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapNoteEditorPanel.tsx'),
    'utf8',
);

describe('MindMapFloatingBar commercial interaction contract', () => {
    it('keeps node actions named, keyboard visible, and inside narrow viewports', () => {
        expect(source).toContain('role="toolbar"');
        expect(source).toContain('aria-label="节点快捷操作"');
        expect(source).toContain('aria-label={tip}');
        expect(source).toContain('aria-label="AI 节点助手"');
        expect(source).toContain('aria-label="连线颜色"');
        expect(shapeControlSource).toContain('aria-label="节点形状"');
        expect(source).toContain('aria-haspopup="dialog"');
        expect(source).toContain('aria-expanded={noteOpen}');
        expect(source).toContain('aria-controls={noteDialogId}');
        expect(css).toMatch(/\.barContainer[\s\S]*?max-width: calc\(100vw - 16px\)[\s\S]*?overflow-x: auto/);
        expect(css).toMatch(/\.btn[\s\S]*?width: 52px;[\s\S]*?height: 52px;/);
        expect(css).toContain('.btn:focus-visible');
    });

    it('keeps note editing localized, recoverable, single-flight, and touch sized', () => {
        expect(source).toContain('if (!v && noteDirty) return');
        expect(source).toContain('const targetNodeId = noteSession?.nodeId ?? obj.id');
        expect(source).toContain('key={noteSession?.nodeId ?? obj.id}');
        expect(source).toContain('throw error');
        expect(noteEditorSource).toContain("pendingAction === 'save'");
        expect(noteEditorSource).toContain('pendingRef.current');
        expect(noteEditorSource).toContain('role="alert"');
        expect(noteEditorSource).toContain("t('plugins.mindmap.noteEditor.cancel')");
        expect(css).toMatch(/\.noteBtnClear[\s\S]*?min-height: 52px;/);
        expect(css).toMatch(/\.noteBtnCancel[\s\S]*?min-height: 52px;/);
        expect(css).toMatch(/\.noteBtnSave[\s\S]*?min-height: 52px;/);
    });

    it('keeps AI popover state single-sourced and provides a configuration recovery path', () => {
        expect(source).toContain('<MindMapAIQuickPanel');
        expect(source).not.toContain('onClick={() => setAiOpen(v => !v)}');
        expect(aiPanelSource).toContain('role="alert"');
        expect(aiPanelSource).toContain('打开 AI 配置');
        expect(aiPanelSource).toContain('aria-label="运行自定义 AI 指令"');
        expect(aiPanelSource).toContain('disabled={!trimmedPrompt || customLoading}');
    });

    it('edits boundaries through a portal-safe named dialog with touch-sized colors', () => {
        expect(source).toContain('<MindMapBoundaryControl');
        expect(boundaryControlSource).toContain('getPopupContainer={() => document.body}');
        expect(boundaryControlSource).not.toContain('onClick={() =>');
        expect(boundaryEditorSource).toContain('role="radiogroup"');
        expect(boundaryEditorSource).toContain('aria-checked={selected}');
        expect(boundaryEditorSource).toContain('aria-label="外框标题"');
        expect(css).toMatch(/\.boundaryColor[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
    });

    it('creates a child through the focus-and-edit helper instead of leaving a placeholder', () => {
        expect(source).toContain('addEditableMindMapChild(mind, tpc)');
        expect(source).not.toContain('mind.addChild(tpc, cleanMindMapChildNode()); })} />');
    });

    it('waits for duplication before republishing the new selection', () => {
        expect(source).toContain('await mind.copyNode(tpc, tpc)');
        expect(source).toContain('await restoreCurrentMindMapSelectionAfterMutation(mind)');
    });

    it('rehydrates an existing instance-scoped selection after data refresh remounts', () => {
        expect(selectionHookSource).toContain('resolveSelectedMindMapTopic(activeMind, null)');
        expect(selectionHookSource).toContain('if (existingNode) onSelect([existingNode])');
        expect(selectionHookSource).toContain('resolveMindMapNodeAfterSelectionSettles');
    });

    it('uses a portal-safe, touch-sized branch color picker without double-toggling its trigger', () => {
        expect(source).toContain('<MindMapBranchColorPicker');
        expect(source).toContain('getPopupContainer={() => document.body}');
        expect(source).not.toContain('onClick={() => { setColorOpen(v => !v);');
        expect(source).toContain("event.key !== 'Enter' && event.key !== ' '");
        expect(colorPickerSource).toContain('role="radiogroup"');
        expect(colorPickerSource).toContain('aria-checked={isSelected}');
        expect(colorPickerSource).toContain('方向键选择 · Esc 关闭');
        expect(css).toMatch(/\.colorItem[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
    });

    it('uses a portal-safe, touch-sized shape dialog with explicit selection and keyboard state', () => {
        expect(source).toContain('<MindMapNodeShapeControl');
        expect(shapeControlSource).toContain('getPopupContainer={() => document.body}');
        expect(shapeControlSource).not.toContain('onClick={() =>');
        expect(shapeControlSource).toContain("event.key !== 'Enter' && event.key !== ' '");
        expect(shapePickerSource).toContain('role="radiogroup"');
        expect(shapePickerSource).toContain('aria-checked={isSelected}');
        expect(shapePickerSource).toContain('方向键选择 · Esc 关闭');
        expect(css).toMatch(/\.shapeBtn[\s\S]*?min-height: 52px;/);
    });
});
