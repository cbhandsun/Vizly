// @vitest-environment node
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../../../../locales/en.json';
import zh from '../../../../locales/zh.json';

const contract = (resource: typeof en | typeof zh) => ({
  common: resource.common, designer: resource.designer,
  propertyPanel: resource.propertyPanel, export: resource.export,
  mindmapImport: resource.mindmapImport, edgeToolbar: resource.edgeToolbar,
  style: resource.style, plugins: { mindmap: resource.plugins.mindmap,
    timeline: resource.plugins.timeline },
});
const strings = (value: unknown, prefix = ''): Record<string, string> => {
  if (typeof value === 'string') return { [prefix]: value };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) =>
    Object.entries(strings(child, prefix ? `${prefix}.${key}` : key))));
};
const normalizedKeys = (value: Record<string, string>) => [...new Set(Object.keys(value)
  .map(key => key.replace(/_(?:one|other)$/, '')))].sort();

describe('actual App resources supplied to Core components', () => {
  it('provides complete nonempty bilingual component copy with locale-specific plurals', () => {
    const english = strings(contract(en));
    const chinese = strings(contract(zh));
    expect(normalizedKeys(english)).toEqual(normalizedKeys(chinese));
    expect(normalizedKeys(english).length).toBeGreaterThan(2000);
    for (const locale of [english, chinese]) {
      for (const [key, text] of Object.entries(locale)) expect(text.trim(), key).not.toBe('');
    }
  });

  it.each(['en', 'zh'] as const)('resolves count-sensitive %s UI copy without fallback resources', async language => {
    const instance = createInstance();
    await instance.init({ lng: language, fallbackLng: false,
      resources: { en: { translation: en }, zh: { translation: zh } } });
    const keys = ['designer.diffOverlay.summaryNode', 'designer.saveStatus.secondsAgo',
      'designer.historyPanel.changeCount', 'designer.historyPanel.beforeDelete',
      'designer.historyPanel.beforeDuplicate'];
    for (const key of keys) {
      for (const count of [0, 1, 2, 1000]) {
        const text = instance.t(key, { count });
        expect(text.trim(), `${key}:${count}`).not.toBe('');
        expect(text, `${key}:${count}`).not.toBe(key);
        expect(text).not.toContain('{{count}}');
      }
    }
  });
});
