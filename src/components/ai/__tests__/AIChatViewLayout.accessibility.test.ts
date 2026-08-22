import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readAIChatStyles = () => [
    readFileSync('src/components/ai/AIChatPanel.css', 'utf8'),
    readFileSync('src/components/ai/AIChatCommercialInteractions.css', 'utf8'),
].join('\n');

describe('AIChatViewLayout accessibility contract', () => {
    it('names the composer controls and keeps circular actions touch sized', () => {
        const source = readFileSync('src/components/ai/AIChatViewLayout.tsx', 'utf8');
        const css = readAIChatStyles();

        expect(source).toContain("aria-label={t('aiChat.inputLabel')}");
        expect(source).toContain("aria-label={t('aiChat.modelSelectLabel')}");
        expect(source).toContain("aria-label={t('aiChat.newConversation')}");
        expect(source).toContain("aria-label={t('aiChat.voiceInput')}");
        expect(source).toContain('aria-pressed={isListening}');
        expect(css).toMatch(/\.ai-chat-send-btn[\s\S]*?min-width: var\(--commercial-touch-target, 44px\) !important;[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important;/);
        expect(css).toMatch(/\.voice-btn[\s\S]*?min-width: var\(--commercial-touch-target, 44px\) !important;[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important;/);
    });

    it('exposes configuration recovery before a remote request can fail', () => {
        const source = readFileSync('src/components/ai/AIChatViewLayout.tsx', 'utf8');
        const css = readAIChatStyles();

        expect(source).toContain('role="status"');
        expect(source).toContain("t('aiChat.configStatusTitle')");
        expect(source).toContain("t('aiChat.configureNow')");
        expect(source).toContain('const canSubmit = configurationState.ready || canSubmitWithoutConfiguration;');
        expect(source).toContain('disabled={!loading && (!inputValue.trim() || !canSubmit)}');
        expect(source).toContain("t('aiChat.configureBeforeSending')");
        expect(css).toMatch(/\.ai-chat-configuration-status[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
    });

    it('uses keyboard-native history actions and exposes them on touch devices', () => {
        const source = readFileSync('src/components/ai/AIChatViewLayout.tsx', 'utf8');
        const css = readAIChatStyles();

        expect(source).toContain('className="ai-chat-history-main"');
        expect(source).toContain('className="ai-chat-history-action"');
        expect(source).toContain("aria-label={t('aiChat.renameConversation', { title: conv.title })}");
        expect(source).toContain("aria-label={t('aiChat.deleteConversationLabel', { title: conv.title })}");
        expect(source).not.toContain('className="item-actions" style={{ display: \'none\' }}');
        expect(css).toMatch(/\.ai-chat-new-conversation\.ant-btn,[\s\S]*?\.ai-chat-history-action\.ant-btn[\s\S]*?width: var\(--commercial-touch-target, 44px\)[\s\S]*?height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.item-actions[\s\S]*?opacity: 1/);
    });

    it('constrains the full AI surface and reflows its header on narrow screens', () => {
        const source = readFileSync('src/components/ai/AIChatPanel.tsx', 'utf8');
        const layoutSource = readFileSync('src/core/components/diagrams/DesignerRightSidebar.tsx', 'utf8');
        const css = readAIChatStyles();

        expect(source).toContain('className="ai-chat-panel-shell"');
        expect(layoutSource).toContain("maxWidth: isMobile ? MOBILE_DESIGNER_PANEL_WIDTH : '100vw'");
        expect(layoutSource).toContain("boxSizing: 'border-box'");
        expect(css).toMatch(/\.ai-chat-panel-shell\s*\{[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0/);
        expect(css).toMatch(/\.ai-chat-container\s*\{[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0/);
        expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.ai-chat-model-select[\s\S]*?max-width: min\(120px, calc\(100vw - 236px\)\)/);
        expect(css).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.ai-chat-conversation-title[\s\S]*?display: none/);
    });

    it('keeps AI configuration controls named, guarded, and mobile-safe', () => {
        const modalSource = readFileSync('src/components/ai/AIConfigModal.tsx', 'utf8');
        const statusAlertSource = readFileSync('src/components/ai/AIConfigConnectionStatusAlert.tsx', 'utf8');
        const sidebarSource = readFileSync('src/components/ai/AIConfigProviderSidebar.tsx', 'utf8');
        const discoverySource = readFileSync('src/components/ai/AIConfigModelDiscoveryModal.tsx', 'utf8');
        const newModelSource = readFileSync('src/components/ai/AIConfigNewModelForm.tsx', 'utf8');
        const modalTitleSource = readFileSync('src/components/ai/AIConfigModalTitle.tsx', 'utf8');
        const css = readFileSync('src/components/ai/AIConfigModal.css', 'utf8');

        expect(modalSource).toContain('closable={false}');
        expect(modalSource).toContain("closeLabel={t('aiConfig.close')}");
        expect(modalTitleSource).toContain('aria-label={closeLabel}');
        expect(modalSource).toContain("aria-label={t('aiConfig.baseUrlLabel')}");
        expect(modalSource).toContain("aria-label={t('aiConfig.apiKeyLabel')}");
        expect(modalSource).toContain("t('aiConfig.currentActive', { name: model.name || model.id })");
        expect(modalSource).not.toContain("t('aiConfig.currentActive', 'Active')");
        expect(modalSource).toContain("const message = t('aiConfig.connection.failureNotice');");
        expect(modalSource).toContain("appMessage.warning(t('aiConfig.invalidProviderBaseUrl', { name: provider.name }))");
        expect(modalSource).toContain("appMessage.warning(t('aiConfig.invalidProviderBaseUrl', { name: invalidProvider.name }))");
        expect(modalSource).not.toContain('formatAIProviderRequestError');
        expect(modalSource).not.toContain('的 Base URL 必须使用');
        expect(modalSource).toContain("t('aiConfig.modelAdded', { id: model.id })");
        expect(newModelSource).toContain('disabled={!validation.ok}');
        expect(newModelSource).toContain("'aria-invalid': issueField === field");
        expect(newModelSource).toContain('role="alert"');
        expect(modalSource).toContain('disabled={!selectedProviderReadiness?.ready || isFetchingModels}');
        expect(modalSource).toContain('disabled={!selectedProviderReadiness?.ready || isTesting}');
        expect(statusAlertSource).toContain('className="ai-config-readiness-alert"');
        expect(modalSource).toContain('<AIConfigConnectionStatusAlert');
        expect(statusAlertSource).toContain("type={readiness.ready ? feedback.tone : 'warning'}");
        expect(statusAlertSource).not.toContain("readiness.ready ? 'success' : 'warning'");
        expect(statusAlertSource).toContain("role={readiness.ready ? feedback.role : 'status'}");
        expect(sidebarSource).toContain("aria-label={t('aiConfig.searchLabel')}");
        expect(sidebarSource).toContain("aria-label={t('aiConfig.providerToggleLabel', { name: provider.name })}");
        expect(sidebarSource).toContain('type="button"');
        expect(discoverySource).toContain("aria-label={t('aiConfig.discoverySearchLabel')}");
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.ai-config-layout[\s\S]*?flex-direction: column/);
        expect(css).toMatch(/\.ai-config-provider-select:focus-visible[\s\S]*?outline: 2px solid/);
    });

    it('keeps the lazy AI configuration modal mounted after first open so focus can return', () => {
        const viewerSource = readFileSync('src/components/DiagramViewerView.tsx', 'utf8');

        expect(viewerSource).toContain('const [hasMountedAIConfig, setHasMountedAIConfig] = useState(aiConfigVisible)');
        expect(viewerSource).toContain('setHasMountedAIConfig(true)');
        expect(viewerSource).toContain('renderAIConfigModal={hasMountedAIConfig ? (');
        expect(viewerSource).not.toContain('renderAIConfigModal={aiConfigVisible ? (');
    });
});
