import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AIChatViewLayout accessibility contract', () => {
    it('names the composer controls and keeps circular actions touch sized', () => {
        const source = readFileSync('src/components/ai/AIChatViewLayout.tsx', 'utf8');
        const css = readFileSync('src/components/ai/AIChatPanel.css', 'utf8');

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
        const css = readFileSync('src/components/ai/AIChatPanel.css', 'utf8');

        expect(source).toContain('role="status"');
        expect(source).toContain("t('aiChat.configStatusTitle')");
        expect(source).toContain("t('aiChat.configureNow')");
        expect(css).toMatch(/\.ai-chat-configuration-status[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
    });

    it('keeps AI configuration controls named, guarded, and mobile-safe', () => {
        const modalSource = readFileSync('src/components/ai/AIConfigModal.tsx', 'utf8');
        const sidebarSource = readFileSync('src/components/ai/AIConfigProviderSidebar.tsx', 'utf8');
        const discoverySource = readFileSync('src/components/ai/AIConfigModelDiscoveryModal.tsx', 'utf8');
        const css = readFileSync('src/components/ai/AIConfigModal.css', 'utf8');

        expect(modalSource).toContain('closable={false}');
        expect(modalSource).toContain("aria-label={t('aiConfig.close')}");
        expect(modalSource).toContain("aria-label={t('aiConfig.baseUrlLabel')}");
        expect(modalSource).toContain("aria-label={t('aiConfig.apiKeyLabel')}");
        expect(modalSource).toContain('disabled={!selectedProviderReadiness?.ready || isFetchingModels}');
        expect(modalSource).toContain('disabled={!selectedProviderReadiness?.ready || isTesting}');
        expect(modalSource).toContain('className="ai-config-readiness-alert"');
        expect(sidebarSource).toContain("aria-label={t('aiConfig.searchLabel')}");
        expect(sidebarSource).toContain("aria-label={t('aiConfig.providerToggleLabel', { name: provider.name })}");
        expect(sidebarSource).toContain('type="button"');
        expect(discoverySource).toContain("aria-label={t('aiConfig.discoverySearchLabel')}");
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.ai-config-layout[\s\S]*?flex-direction: column/);
        expect(css).toMatch(/\.ai-config-provider-select:focus-visible[\s\S]*?outline: 2px solid/);
    });
});
