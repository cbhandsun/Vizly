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
        expect(css).toMatch(/\.panel\s*\{[\s\S]*?top:\s*104px;/);
        expect(css).toMatch(/\.panel\s*\{[\s\S]*?right:\s*calc\(72px \+ env\(safe-area-inset-right, 0px\)\);/);
        expect(css).toContain('bottom: calc(164px + env(safe-area-inset-bottom, 0px));');
        expect(css).toContain('.outlineItem:focus-visible');
        expect(css).toContain('.outlineItem:focus-within .outlineActions');
        expect(css).toContain('.historyItem:focus-visible');
    });

    it('exposes outline operations to keyboard and assistive technology users', () => {
        const source = readSource('MindMapOutlinePanel.tsx');
        const deletionSource = readSource('useMindMapNodeDeletion.tsx');

        expect(source).toContain('aria-label="搜索大纲节点"');
        expect(source).toContain('role="tree"');
        expect(source).toContain('role="treeitem"');
        expect(source).toContain('tabIndex={rovingId === n.id ? 0 : -1}');
        expect(source).toContain('getMindMapOutlineNavigationTarget({');
        expect(source).toContain('requestDelete(node)');
        expect(source).toContain('{deleteDialog}');
        expect(source).toContain('onClick={() => setOutlineOpen(false)}');
        expect(deletionSource).toContain('mask={{ closable: !pending }}');
        expect(deletionSource).not.toContain('maskClosable=');
        expect(source).not.toContain('placeholder="🔍');
    });

    it('uses a named, confirmed, top-layer restore action for each history snapshot', () => {
        const source = readSource('MindMapHistoryPanel.tsx');
        const css = readSource('MindMapSidePanel.module.css');

        expect(source).toContain('onClick={() => setHistoryOpen(false)}');
        expect(source).toContain("aria-label={t('plugins.mindmap.history.restoreLabel'");
        expect(source).toContain('className={sidePanelStyles.historyRestoreAction}');
        expect(source).toContain("title={t('plugins.mindmap.history.restoreConfirmTitle'");
        expect(source).toContain('onConfirm={() => handleRestore(r)}');
        expect(source).toContain('placement="leftTop"');
        expect(source).toContain('autoAdjustOverflow={false}');
        expect(source).toContain('getPopupContainer={() => document.body}');
        expect(source).toContain('return createPortal((');
        expect(source).toContain('), document.body);');
        expect(css).toMatch(/\.historyPanel\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*1000;/);
        expect(source).not.toContain('history-restore-btn');
    });

    it('renders the template menu outside the horizontally scrolling toolbar', () => {
        const source = readSource('MindMapTemplates.tsx');

        expect(source).toContain('getPopupContainer={getViewportPopupContainer}');
        expect(source).toContain('open={open}');
        expect(source).toContain('aria-expanded={open}');
        expect(source).toContain('aria-haspopup="menu"');
        expect(source).toContain('<MindMapToolbarIconButton');
        expect(source).not.toContain("import { Dropdown, Button, Tooltip }");
    });

    it('keeps search controls in a named safe-area panel with reliable hit targets', () => {
        const source = readSource('MindMapSearch.tsx');
        const css = readSource('MindElixirToolbar.css');
        const plugin = readFileSync(
            resolve(process.cwd(), 'src/core/plugins/MindMapPlugin.tsx'),
            'utf8',
        );

        expect(source).toContain('role="search"');
        expect(source).toContain('aria-label="搜索并替换思维导图节点"');
        expect(source).toContain('aria-label="搜索节点"');
        expect(source).toContain('aria-controls="me-search-replace-row"');
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain('maxLength={MINDMAP_MAX_TOPIC_LENGTH}');
        expect(source).toContain('appModal.confirm({');
        expect(source).toContain('getContainer: getViewportOverlayContainer');
        expect(source).toContain('maskClosable: false');
        expect(source).toContain('aria-haspopup="dialog"');
        expect(source).toContain('returnTarget.focus({ preventScroll: true })');
        expect(source).toContain('disabled={total === 0}');
        expect(source).not.toContain('document.createElement(\'style\')');
        expect(source).not.toContain('⇌');
        expect(source).not.toContain('✓ {replaceCount}');
        expect(plugin).toContain("shortcutKey === 'h'");
        expect(plugin).toContain('replaceRequested={replaceRequested}');
        expect(css).toMatch(/\.mind-map-search-panel\s*\{[\s\S]*?top:\s*104px;[\s\S]*?right:\s*calc\(72px \+ env\(safe-area-inset-right, 0px\)\);[\s\S]*?z-index:\s*10020;/);
        expect(css).toMatch(/\.mind-map-search-icon-button\s*\{[\s\S]*?width:\s*var\(--commercial-touch-target, 44px\);[\s\S]*?height:\s*var\(--commercial-touch-target, 44px\);/);
        expect(css).toMatch(/\.mind-map-search-replace-button\s*\{[\s\S]*?min-width:\s*var\(--commercial-touch-target, 44px\);[\s\S]*?min-height:\s*var\(--commercial-touch-target, 44px\);/);
    });

    it('keeps the AI assistant below application chrome and names its inputs', () => {
        const source = readSource('MindMapAIPanel.tsx');

        expect(source).toContain('aria-label="AI 思维导图助手"');
        expect(source).toContain('aria-label="关闭 AI 思维导图助手"');
        expect(source).toContain('aria-label="AI 建图主题或业务问题"');
        expect(source).toContain('aria-label="AI 思维导图处理指令"');
        expect(source).toMatch(/const panelStyle:[\s\S]*?top:\s*104,[\s\S]*?bottom:\s*72,[\s\S]*?width:\s*'min\(380px, calc\(100% - 20px\)\)'/);
        expect(source).toMatch(/const iconButtonStyle:[\s\S]*?minWidth:\s*44,[\s\S]*?height:\s*44,/);
    });
});
