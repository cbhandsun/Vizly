import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('storage configuration commercial safeguards', () => {
    it('provides semantic navigation, persistent status, timeout, and mutually exclusive actions', () => {
        const source = readSource('../StorageConfigPage.tsx');

        expect(source).toContain('<button');
        expect(source).toContain('className="storage-config-brand"');
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain('new AbortController()');
        expect(source).toContain('storageService.testConnection(values, controller.signal)');
        expect(source).toContain('disabled={testing}');
        expect(source).toContain('disabled={loading}');
        expect(source).not.toContain('<div className="workspace-header-brand"');
    });

    it('keeps controls touch-safe and stacks actions on narrow screens', () => {
        const css = readSource('../StorageConfigPage.css');

        expect(css).toMatch(/\.storage-config-page\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;/);
        expect(css).toContain('overscroll-behavior-y: contain');
        expect(css).toMatch(/\.storage-config-form \.ant-btn,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.storage-config-actions \.ant-btn[\s\S]*?width: 100%/);
        expect(css).toContain('.storage-config-brand:focus-visible');
    });
});
