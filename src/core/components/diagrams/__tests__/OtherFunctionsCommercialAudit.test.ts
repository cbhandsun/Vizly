import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(
    new URL(relativePath, import.meta.url),
    'utf8',
);

describe('other-function commercial interaction safeguards', () => {
    it('keeps the JSON editor inside narrow viewports with reachable actions', () => {
        const source = readSource('../JsonEditorModal.tsx');
        const css = readSource('../JsonEditorModal.css');

        expect(source).toContain('rootClassName="json-editor-modal"');
        expect(source).toContain('zIndex={2100}');
        expect(css).toMatch(/\.json-editor-modal \.ant-modal[\s\S]*?max-width: calc\(100vw - 32px\)/);
        expect(css).toMatch(/\.json-editor-modal \.ant-modal-footer \.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/\.json-editor-modal \.ant-modal-close[\s\S]*?width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.json-editor-modal \.ant-modal-footer > div > div[\s\S]*?width: 100%/);
    });

    it('keeps advanced export controls named, touch-safe, and explicitly reflowed on mobile', () => {
        const source = readSource('../ui/AdvancedExportModal.tsx');
        const css = readSource('../ui/AdvancedExportModal.css');

        expect(source).toContain('rootClassName="advanced-export-modal"');
        expect(source).toContain("'aria-label': t('common.close')");
        expect(source).toContain('aria-label={t(\'advancedExport.formatLabel\')}');
        expect(source).toContain('aria-label={t(\'advancedExport.dpiLabel\')}');
        expect(css).toMatch(/\.advanced-export-modal \.ant-modal-close,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toContain('.advanced-export-modal .advanced-export-dpi-select,');
        expect(css).toMatch(/\.advanced-export-format-group\.ant-radio-group[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
        expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
        expect(css).toMatch(/\.advanced-export-modal \.ant-modal-footer \.ant-btn:first-child[\s\S]*?grid-column: 1 \/ -1/);
    });

    it('reflows plugin discovery and management controls on narrow viewports', () => {
        const source = readSource('../ui/PluginManagerModal.tsx');
        const css = readSource('../ui/PluginMarketplace.css');

        expect(source).toContain('COMMERCIAL_VIEWPORT_MODAL_CLASS');
        expect(source).toContain('getContainer={getViewportOverlayContainer}');
        expect(source).toContain('zIndex={COMMERCIAL_VIEWPORT_MODAL_Z_INDEX}');
        expect(source).toContain('className="marketplace-toolbar"');
        expect(source).toContain("aria-label={`${t('pluginMarketplace.discoverMore')} · ${t('pluginMarketplace.comingSoon')}`}");
        expect(source).toContain("aria-label={t('pluginMarketplace.searchPlaceholder')}");
        expect(source).toContain('className="plugin-card-switch-target"');
        expect(source).toContain("isActive ? 'pluginMarketplace.disablePlugin' : 'pluginMarketplace.enablePlugin'");
        expect(source).toContain("appMessage.error(t('pluginMarketplace.statusChangeFailed'))");
        expect(source).toContain('alt=""');
        expect(source).toContain('aria-hidden="true"');
        expect(css).toMatch(/\.plugin-manager-modal \.ant-modal[\s\S]*?width: calc\(100vw - 16px\) !important/);
        expect(css).toMatch(/\.plugin-card-switch-target[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/\.marketplace-toolbar\.ant-space[\s\S]*?flex-direction: column/);
        expect(css).toMatch(/\.marketplace-discover-button\.ant-btn[\s\S]*?z-index: 2/);
        expect(css).toMatch(/\.plugin-grid[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
    });

    it('keeps menus, confirmations, and mobile card actions touch-safe', () => {
        const globalCss = readSource('../../../../index.css');
        const mobileCss = readSource('../../../../pages/WorkspaceDashboard.mobile.css');
        const toolbarSource = readSource('../ModernFlowchartToolbar.tsx');
        const flowchartCss = readSource('../FlowchartVisualPolish.css');

        expect(globalCss).toMatch(/\.ant-dropdown-menu-item,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important/);
        expect(globalCss).toMatch(/\.ant-popconfirm-buttons \.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(mobileCss).toMatch(/\.action-btn-glass[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
        expect(toolbarSource).toContain('autoAdjustOverflow');
        expect(toolbarSource).not.toContain('autoAdjustOverflow={false}');
        expect(toolbarSource).toContain('overlayClassName="flowchart-mobile-more-menu"');
        expect(flowchartCss).toMatch(/\.flowchart-mobile-more-menu[\s\S]*?max-height: calc\(100vh - 112px\)[\s\S]*?overflow-y: auto/);
    });

    it('keeps the shortcut reference modal close action touch-safe', () => {
        const panelSource = readSource('../KeyboardShortcutPanel.tsx');
        const modalSource = readSource('../../ui/ShortcutsHelpModal.tsx');
        const flowchartModalSource = readSource('../FlowchartShortcutsHelpModal.tsx');
        const panelCss = readSource('../KeyboardShortcutPanel.css');
        const modalCss = readSource('../../ui/ShortcutsHelpModal.css');

        expect(panelSource).toContain('rootClassName="keyboard-shortcut-panel"');
        expect(panelSource).toContain('<FaKeyboard aria-hidden="true" />');
        expect(modalSource).toContain('getContainer={() => document.body}');
        expect(flowchartModalSource).toContain('getContainer={() => document.body}');
        expect(panelCss).toMatch(/\.keyboard-shortcut-panel \.ant-modal-close[\s\S]*?width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(modalCss).toMatch(/\.commercial-shortcuts-modal \.ant-modal-close[\s\S]*?width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(modalCss).toMatch(/\.commercial-shortcuts-modal \.ant-modal[\s\S]*?max-width: calc\(100vw - 16px\)/);
    });

    it('keeps global commercial dialogs outside the scaled canvas root', () => {
        const aiSource = readSource('../../../../components/ai/AIConfigModal.tsx');
        const shareSource = readSource('../../../../components/diagrams/ShareDialog.tsx');
        const storageSource = readSource('../../../../components/storage/CloudStorageManagerModal.tsx');
        const collaborationSource = readSource('../../../../components/ui/CollaborationModal.tsx');
        const aiCss = readSource('../../../../components/ai/AIConfigModal.css');
        const globalCss = readSource('../../../../index.css');

        for (const source of [aiSource, shareSource, storageSource, collaborationSource]) {
            expect(source).toContain('getViewportOverlayContainer');
            expect(source).toContain('COMMERCIAL_VIEWPORT_MODAL_CLASS');
            expect(source).toContain('COMMERCIAL_VIEWPORT_MODAL_Z_INDEX');
            expect(source).not.toContain("getElementById('app-root-layout')");
        }
        expect(aiSource).toContain('rootClassName={`${COMMERCIAL_VIEWPORT_MODAL_CLASS} ai-config-viewport-modal`}');
        expect(aiCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.ai-config-layout[\s\S]*?flex-direction: column/);
        expect(aiCss).toMatch(/\.ai-config-provider-sidebar[\s\S]*?max-height: 232px/);
        expect(aiCss).toMatch(/\.ai-config-provider-items[\s\S]*?flex-direction: row !important/);
        expect(globalCss).toMatch(/\.commercial-viewport-modal \.ant-modal-close,[\s\S]*?min-height: 44px/);
    });

    it('keeps AI panel header actions physically touch-safe under UI scaling', () => {
        const source = readSource('../../../../components/ai/AIChatViewLayout.tsx');
        const css = readSource('../../../../components/ai/AIChatPanel.css');

        expect(source.match(/className="ai-chat-inline-action"/g)).toHaveLength(3);
        expect(css).toMatch(/\.ai-chat-inline-action\.ant-btn[\s\S]*?width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
    });

    it('keeps the restored share action named and physically touch-safe', () => {
        const source = readSource('../TopActionButtons.tsx');

        expect(source).toContain("aria-label={t('designer.toolbar.share')}");
        expect(source).toContain("height: 'var(--commercial-touch-target, 44px)'");
        expect(source).toContain("minWidth: 'var(--commercial-touch-target, 44px)'");
    });

    it('reflows sharing and collaboration recovery controls on narrow viewports', () => {
        const shareSource = readSource('../../../../components/diagrams/ShareDialog.tsx');
        const shareCss = readSource('../../../../components/diagrams/ShareDialog.css');
        const collaborationSource = readSource('../../../../components/ui/CollaborationModal.tsx');
        const collaborationCss = readSource('../../../../components/ui/CollaborationModal.css');

        expect(shareSource).toContain('share-dialog-viewport-modal');
        expect(shareSource).toContain('share-dialog-invite-controls');
        expect(shareSource).toContain('share-dialog-recovery-alert');
        expect(shareSource).toContain('aria-describedby="share-dialog-email-help"');
        expect(shareCss).toMatch(/\.share-dialog-invite-controls[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 124px auto/);
        expect(shareCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.share-dialog-invite-email[\s\S]*?grid-column: 1 \/ -1/);
        expect(shareCss).toMatch(/\.share-dialog-list \.ant-list-item-action \.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);

        expect(collaborationSource).toContain('collaboration-viewport-modal');
        expect(collaborationSource).toContain('tryCopyShareUrl');
        expect(collaborationSource).toContain('copyFailed &&');
        expect(collaborationCss).toMatch(/\.collaboration-copy-row \.ant-input,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(collaborationCss).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.collaboration-copy-row[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
    });

    it('explains that version snapshot notes are optional and supplies the default outcome', () => {
        const source = readSource('../../../../components/diagrams/ui/VersionHistoryPanel.tsx');

        expect(source).toContain('aria-label="版本备注（选填）"');
        expect(source).toContain('aria-describedby={previewVersion');
        expect(source).toContain('留空时将使用“手动保存的版本快照”');
        expect(source).toContain('if (isSaving || previewVersion) return;');
        expect(source).toContain('退出预览后才能创建新快照');
    });

    it('opens find and replace through explicit state instead of delayed DOM coupling', () => {
        const handlerSource = readSource('../hooks/useDesignerEventHandlers.ts');

        expect(handlerSource).toContain('setCanvasSearchReplaceVisible(false);');
        expect(handlerSource).toContain('setCanvasSearchReplaceVisible(true);');
        expect(handlerSource).not.toContain('document.querySelector(\'[title="查找替换 (Ctrl+H)"]\')');
        expect(handlerSource).not.toContain('setTimeout(() =>');
    });
});
