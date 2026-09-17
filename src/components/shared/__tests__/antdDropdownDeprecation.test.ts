import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath: string) => readFileSync(
    resolve(process.cwd(), relativePath),
    'utf8',
);

/**
 * antd 6 deprecates `overlayClassName` in favour of `classNames.root`. The
 * deprecated prop still styles popups, so the regression is silent console
 * noise on every route rather than a visible break — exactly the kind of drift
 * that disappears unless a test pins the modern prop.
 */
const DROPDOWN_CONSUMERS = [
    'src/components/ExportTools.tsx',
    'src/components/shared/LanguageSwitcher.tsx',
    'src/core/components/diagrams/TopActionButtons.tsx',
    'src/core/components/diagrams/ModernFlowchartToolbar.tsx',
];

describe('antd dropdown deprecation migration', () => {
    it.each(DROPDOWN_CONSUMERS)(
        'styles %s through classNames.root instead of the deprecated overlayClassName',
        (relativePath) => {
            const source = readSource(relativePath);

            expect(source).not.toMatch(/overlayClassName=/);
            expect(source).toMatch(/classNames=\{\{\s*root:/);
        },
    );

    it('keeps the export, save, and flowchart menus using their documented class names', () => {
        expect(readSource('src/components/ExportTools.tsx'))
            .toContain('classNames={{ root: EXPORT_MENU_OVERLAY_CLASS }}');
        expect(readSource('src/core/components/diagrams/TopActionButtons.tsx'))
            .toContain('classNames={{ root: SAVE_MENU_OVERLAY_CLASS }}');

        const toolbar = readSource('src/core/components/diagrams/ModernFlowchartToolbar.tsx');
        expect(toolbar).toContain("classNames={{ root: 'flowchart-layout-menu' }}");
        expect(toolbar).toContain("classNames={{ root: 'flowchart-more-menu' }}");
        expect(toolbar).toContain("classNames={{ root: 'flowchart-mobile-more-menu' }}");
    });
});
