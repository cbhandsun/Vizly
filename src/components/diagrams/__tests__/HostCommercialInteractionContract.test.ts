import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(
    new URL(relativePath, import.meta.url),
    'utf8',
);

describe('Host commercial interaction safeguards', () => {
    it("keeps menus, confirmations, and mobile card actions touch-safe", () => {
        const globalCss = readSource('../../../index.css');
        const mobileCss = readSource('../../../pages/WorkspaceDashboard.mobile.css');
        expect(globalCss).toMatch(/\.ant-dropdown-menu-item,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important/);
        expect(globalCss).toMatch(/\.ant-popconfirm-buttons \.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(mobileCss).toMatch(/\.action-btn-glass[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
    });

    it("keeps the shortcut reference modal close action touch-safe", () => {
        const viewerSource = readSource('../../../components/DiagramViewerView.tsx');
        expect(viewerSource).toContain("import('@vizly/core/keyboard-shortcuts')");
        expect(viewerSource).not.toContain("import('@vizly/core/internal/");
        expect(viewerSource).not.toContain("import('@/core/components/diagrams/KeyboardShortcutPanel')");
        expect(viewerSource).not.toContain("import('@/core/components/ui/ShortcutsHelpModal')");
    });

    it('keeps global commercial dialogs outside the scaled canvas root', () => {
        const aiSource = readSource('../../../components/ai/AIConfigModal.tsx');
        const shareSource = readSource('../../../components/diagrams/ShareDialog.tsx');
        const storageSource = readSource('../../../components/storage/CloudStorageManagerModal.tsx');
        const collaborationSource = readSource('../../../components/ui/CollaborationModal.tsx');
        const aiCss = readSource('../../../components/ai/AIConfigModal.css');
        const globalCss = readSource('../../../index.css');

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

    it("keeps destructive reset confirmation cancel-first and touch-safe", () => {
        const globalCss = readSource('../../../index.css');
        expect(globalCss).toMatch(/\.commercial-viewport-modal \.ant-modal-confirm-btns \.ant-btn[\s\S]*?min-height: 44px/);
    });

    it('keeps AI panel header actions physically touch-safe under UI scaling', () => {
        const source = readSource('../../../components/ai/AIChatViewLayout.tsx');
        const css = readSource('../../../components/ai/AIChatPanel.css');

        expect(source.match(/className="ai-chat-inline-action"/g)).toHaveLength(3);
        expect(css).toMatch(/\.ai-chat-inline-action\.ant-btn[\s\S]*?width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
    });

    it('reflows sharing and collaboration recovery controls on narrow viewports', () => {
        const shareSource = readSource('../../../components/diagrams/ShareDialog.tsx');
        const shareCss = readSource('../../../components/diagrams/ShareDialog.css');
        const collaborationSource = readSource('../../../components/ui/CollaborationModal.tsx');
        const collaborationCss = readSource('../../../components/ui/CollaborationModal.css');

        expect(shareSource).toContain('share-dialog-viewport-modal');
        expect(shareSource).toContain('width="min(600px, calc(100vw - 32px))"');
        expect(shareSource).toContain('share-dialog-invite-controls');
        expect(shareSource).toContain('share-dialog-recovery-alert');
        expect(shareSource).toContain('aria-describedby="share-dialog-email-help"');
        expect(shareCss).toMatch(/\.share-dialog-invite-controls[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 124px auto/);
        expect(shareCss).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.share-dialog-invite-email[\s\S]*?grid-column: 1 \/ -1/);
        expect(shareCss).toMatch(/\.share-dialog-list \.ant-list-item-action \.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(shareCss).toMatch(/\.share-dialog-viewport-modal \.ant-tabs-tab,[\s\S]*?\.share-dialog-login-action\.ant-btn[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);

        expect(collaborationSource).toContain('collaboration-viewport-modal');
        expect(collaborationSource).toContain('tryCopyShareUrl');
        expect(collaborationSource).toContain('copyFailed &&');
        expect(collaborationCss).toMatch(/\.collaboration-copy-row \.ant-input,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(collaborationCss).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.collaboration-copy-row[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
    });

    it('explains that version snapshot notes are optional and supplies the default outcome', () => {
        const source = readSource('../../../components/diagrams/ui/VersionHistoryPanel.tsx');

        expect(source).toContain("aria-label={t('designer.versionHistoryPanel.messageLabel')}");
        expect(source).toContain('aria-describedby={previewVersion');
        expect(source).toContain("t('designer.versionHistoryPanel.messageHint'");
        expect(source).toContain('if (activeOperation || previewVersion) return;');
        expect(source).toContain("t('designer.versionHistoryPanel.previewReadonly')");
        expect(source).not.toMatch(/[\u3400-\u9fff]/u);
    });
});
