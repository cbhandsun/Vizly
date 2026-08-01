import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('AIChatViewLayout accessibility contract', () => {
    it('names the composer controls and keeps circular actions touch sized', () => {
        const source = readFileSync('src/components/ai/AIChatViewLayout.tsx', 'utf8');
        const css = readFileSync('src/components/ai/AIChatPanel.css', 'utf8');

        expect(source).toContain("aria-label={t('aiChat.inputLabel')}");
        expect(source).toContain("aria-label={t('aiChat.voiceInput')}");
        expect(source).toContain('aria-pressed={isListening}');
        expect(css).toMatch(/\.ai-chat-send-btn[\s\S]*?min-width: var\(--commercial-touch-target, 44px\) !important;[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important;/);
        expect(css).toMatch(/\.voice-btn[\s\S]*?min-width: var\(--commercial-touch-target, 44px\) !important;[\s\S]*?min-height: var\(--commercial-touch-target, 44px\) !important;/);
    });
});
