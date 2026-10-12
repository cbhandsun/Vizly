// @vitest-environment node
import { describe, expect, it } from 'vitest';
import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';

function strings(value: unknown, prefix = ''): Record<string, string> {
    if (typeof value === 'string') return { [prefix]: value };
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
        Object.entries(strings(child, prefix ? `${prefix}.${key}` : key))));
}

describe('actual host mind-map property-panel translations', () => {
    it('provides the same complete nonempty contract in both supported locales', () => {
        const english = strings(en.plugins.mindmap.propertyPanel);
        const chinese = strings(zh.plugins.mindmap.propertyPanel);
        expect(Object.keys(english).sort()).toEqual(Object.keys(chinese).sort());
        expect(Object.keys(english).length).toBeGreaterThan(40);
        for (const locale of [english, chinese]) {
            for (const text of Object.values(locale)) expect(text.trim()).not.toBe('');
        }
    });

    it.each([en, zh])('contains every supported task, tag, shape and shortcut label', resource => {
        const panel = strings(resource.plugins.mindmap.propertyPanel);
        const requirements = {
            taskStatuses: ['todo', 'doing', 'done'],
            taskPriorities: ['none', 'low', 'medium', 'high'],
            presetTags: ['important', 'todo', 'done', 'risk', 'idea', 'question'],
            shapes: ['default', 'oval', 'rectangle', 'underline', 'diamond'],
            shortcuts: ['addChild', 'addSibling', 'deleteNode', 'edit', 'undo'],
        };
        for (const [group, keys] of Object.entries(requirements)) {
            for (const key of keys) expect(panel[`${group}.${key}`]?.trim(), `${group}.${key}`).toBeTruthy();
        }
    });
});
