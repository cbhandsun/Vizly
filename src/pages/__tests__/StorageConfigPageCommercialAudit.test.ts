import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('storage configuration commercial safeguards', () => {
    it('provides semantic navigation, persistent status, timeout, and mutually exclusive actions', () => {
        const source = readSource('../StorageConfigPage.tsx');

        expect(source).toContain('<button');
        expect(source).toContain('className="storage-config-brand"');
        expect(source).toContain('className="storage-config-page-title"');
        expect(source).toContain('level={1}');
        expect(source).toContain('tabIndex={-1}');
        expect(source).toContain('<StorageSecretInput');
        expect(source).toContain("t('storageConfig.form.accessKeyVisibilityLabel')");
        expect(source).toContain("t('storageConfig.form.secretKeyVisibilityLabel')");
        expect(source).toContain("extra={t('storageConfig.form.endpointTooltip')}");
        expect(source).toContain("extra={t('storageConfig.form.forcePathStyleTooltip')}");
        expect(source).not.toContain("tooltip={t('storageConfig.form.endpointTooltip')}");
        expect(source).not.toContain("tooltip={t('storageConfig.form.forcePathStyleTooltip')}");
        expect(source).toContain('aria-live="polite"');
        expect(source).toContain('onFinishFailed={handleValidationFailure}');
        expect(source).toContain("form.scrollToField(fieldName, { block: 'center', focus: true })");
        expect(source).toContain("invalid: { type: 'error'");
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
        expect(css).toMatch(/\.storage-config-page-title:focus\s*\{[\s\S]*?outline:\s*none/);
        expect(css).toMatch(/\.storage-secret-visibility\s*\{[\s\S]*?width:\s*var\(--commercial-touch-target, 44px\);[\s\S]*?height:\s*var\(--commercial-touch-target, 44px\)/);
        expect(css).toContain('.storage-secret-visibility:focus-visible');
    });
});
