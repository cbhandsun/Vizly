import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
    createMindMapPropertyPanelOptions,
    MIND_MAP_PROPERTY_SHAPES,
    MIND_MAP_PROPERTY_SHORTCUTS,
} from '../mindMapPropertyPanelOptions';

const readLocale = (locale: 'en' | 'zh') => JSON.parse(readFileSync(
    resolve(process.cwd(), `src/locales/${locale}.json`),
    'utf8',
)) as { plugins: { mindmap: { propertyPanel: Record<string, unknown> } } };

const propertyPanelSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapPropertyPanel.tsx'),
    'utf8',
);
const controlsSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapPropertyPanelControls.tsx'),
    'utf8',
);
const linkFieldSource = readFileSync(
    resolve(process.cwd(), 'src/core/components/mindmap-v2/MindMapPropertyLinkField.tsx'),
    'utf8',
);

const collectStringPaths = (value: unknown, prefix = ''): string[] => {
    if (typeof value === 'string') return [prefix];
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, child]) =>
        collectStringPaths(child, prefix ? `${prefix}.${key}` : key));
};

describe('mind map property panel localization', () => {
    it('localizes labels while preserving persisted task values', () => {
        const labels: Record<string, string> = {
            'plugins.mindmap.propertyPanel.presetTags.important': 'Important',
            'plugins.mindmap.propertyPanel.taskStatuses.doing': 'In progress',
            'plugins.mindmap.propertyPanel.taskPriorities.high': 'High',
        };
        const options = createMindMapPropertyPanelOptions(key => labels[key] ?? key);

        expect(options.presetTags[0]?.text).toBe('Important');
        expect(options.taskStatuses.find(option => option.value === 'doing')?.label).toBe('In progress');
        expect(options.taskPriorities.find(option => option.value === '高')).toEqual({
            label: 'High',
            value: '高',
        });
    });

    it('keeps every generated option key present in both supported locales', () => {
        for (const locale of ['en', 'zh'] as const) {
            const panel = readLocale(locale).plugins.mindmap.propertyPanel;
            const t = (key: string): string => {
                const path = key.replace('plugins.mindmap.propertyPanel.', '').split('.');
                let value: unknown = panel;
                for (const segment of path) {
                    value = typeof value === 'object' && value !== null
                        ? (value as Record<string, unknown>)[segment]
                        : undefined;
                }
                if (typeof value !== 'string') throw new Error(`Missing ${locale} translation: ${key}`);
                return value;
            };

            const options = createMindMapPropertyPanelOptions(t);
            expect(options.presetTags).toHaveLength(6);
            expect(options.taskStatuses).toHaveLength(3);
            expect(options.taskPriorities).toHaveLength(4);
            for (const shape of MIND_MAP_PROPERTY_SHAPES) {
                expect(t(`plugins.mindmap.propertyPanel.shapes.${shape.translationKey}`)).not.toBe('');
            }
            for (const shortcut of MIND_MAP_PROPERTY_SHORTCUTS) {
                expect(t(`plugins.mindmap.propertyPanel.shortcuts.${shortcut.translationKey}`)).not.toBe('');
            }
        }
    });

    it('keeps the complete property-panel locale contract aligned and non-empty', () => {
        const enPanel = readLocale('en').plugins.mindmap.propertyPanel;
        const zhPanel = readLocale('zh').plugins.mindmap.propertyPanel;
        const enPaths = collectStringPaths(enPanel).sort();
        const zhPaths = collectStringPaths(zhPanel).sort();

        expect(enPaths).toEqual(zhPaths);
        expect(enPaths.length).toBeGreaterThan(40);
        for (const locale of [enPanel, zhPanel]) {
            for (const path of collectStringPaths(locale)) {
                const value = path.split('.').reduce<unknown>((current, segment) =>
                    typeof current === 'object' && current !== null
                        ? (current as Record<string, unknown>)[segment]
                        : undefined, locale);
                expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
            }
        }
    });

    it('names interactive fields and keeps presentation and link validation in focused modules', () => {
        expect(propertyPanelSource).toContain("aria-label={t(propertyKey('nodeTextInput'))}");
        expect(propertyPanelSource).toContain("aria-label={t(propertyKey('taskStatus'))}");
        expect(propertyPanelSource).toContain('aria-pressed={shapeClass === key}');
        expect(propertyPanelSource).toContain('aria-pressed={branchWidth === w}');
        expect(propertyPanelSource).not.toContain('style: { ...node.style');
        expect(propertyPanelSource).toContain("reshape({ style: { fontSize: `${v}px` } })");
        expect(propertyPanelSource).toContain('reshape({ style: { color: c || undefined } })');
        expect(propertyPanelSource).toContain('reshape({ style: { background: c || undefined } })');
        expect(propertyPanelSource).not.toContain("'📍 根节点'");
        expect(propertyPanelSource).not.toContain("'📝 节点属性'");
        expect(propertyPanelSource).not.toContain("'rgba(255,255,255,0.6)'");
        expect(propertyPanelSource).not.toContain('{preview}');
        expect(propertyPanelSource).toContain('<PropertyShapeIcon icon={icon} />');
        expect(propertyPanelSource).toContain('className={styles.shapeButton}');
        expect(propertyPanelSource).toContain('className={styles.branchButton}');
        expect(propertyPanelSource).toContain('<MindMapPropertyLinkField');
        expect(propertyPanelSource).toContain('<MindMapPropertyNoteField');
        expect(propertyPanelSource).toContain('sourceKey={node.id}');
        expect(propertyPanelSource).toContain('onCommit={note => reshapeWithResult({ note })}');
        expect(propertyPanelSource).not.toContain('reshape({ note: cleanNote })');
        expect(linkFieldSource).toContain('toSafeExternalUrl(trimmed)');
        expect(linkFieldSource).toContain('aria-invalid={Boolean(state.error)}');
        expect(linkFieldSource).toContain('aria-describedby={state.error ? errorId : undefined}');
        expect(linkFieldSource).toContain('className={styles.error} role="alert"');
        expect(controlsSource).not.toContain('💡 点击节点可编辑属性');
        expect(controlsSource).toContain('aria-pressed={isActive}');
        expect(controlsSource).not.toContain('option.theme.name');
    });
});
