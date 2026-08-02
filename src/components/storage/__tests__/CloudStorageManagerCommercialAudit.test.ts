import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('cloud storage manager commercial safeguards', () => {
    it('binds operations to an immutable provider and preserves recoverable failure states', () => {
        const source = readSource('../CloudStorageManagerModal.tsx');

        expect(source).toContain('unifiedStorage.getProvider(requestedProvider)');
        expect(source).toContain("handleOpenCloud(item, 'supabase')");
        expect(source).toContain('isCloudStorageManagerScopeCurrent(requestScope, scopeRef.current)');
        expect(source).toContain('cloudLoadFailed &&');
        expect(source).toContain('sharedLoadFailed &&');
        expect(source).toContain('setSelectedIds(new Set())');
        expect(source).not.toContain('appMessage.error(error.message)');
    });

    it('keeps modal controls touch-safe and reflows provider and batch actions', () => {
        const css = readSource('../CloudStorageManagerModal.css');

        expect(css).toMatch(/\.cloud-storage-manager-modal \.ant-btn,[\s\S]*?min-height: var\(--commercial-touch-target, 44px\)/);
        expect(css).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.cloud-storage-manager-title[\s\S]*?flex-direction: column/);
        expect(css).toMatch(/\.cloud-storage-manager-batch-actions \.ant-btn[\s\S]*?width: 100%/);
    });
});
