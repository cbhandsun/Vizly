import { describe, expect, it } from 'vitest';
import {
  coerceCascaderPath,
  getRootGroupFromPath,
  normalizeTemplateItem,
  normalizeTemplateMenuText,
} from '../templateCascaderOptions';

describe('template cascader option guards', () => {
  it('normalizes template menu text and removes unsafe display characters', () => {
    expect(normalizeTemplateMenuText(' <b>Template</b>\u0000 ')).toBe('bTemplate/b');
    expect(normalizeTemplateMenuText(undefined, 'fallback')).toBe('fallback');
    expect(normalizeTemplateMenuText('x'.repeat(160))).toHaveLength(120);
  });

  it('drops templates without a usable id and normalizes title/category fallbacks', () => {
    expect(normalizeTemplateItem({ id: '', title: 'Nope' })).toBeNull();
    expect(normalizeTemplateItem({ id: 'tmpl-1', title: '', category: '' })).toEqual({
      id: 'tmpl-1',
      title: 'tmpl-1',
      category: '其他行业',
    });
  });

  it('coerces cascader paths and only accepts known root groups', () => {
    expect(coerceCascaderPath(['system-templates', 'category:general', 'tmpl-1'])).toEqual([
      'system-templates',
      'category:general',
      'tmpl-1',
    ]);
    expect(coerceCascaderPath(['system-templates', '<bad>', 42, null])).toEqual(['system-templates', 'bad']);
    expect(getRootGroupFromPath(['system-templates', 'tmpl-1'])).toBe('system-templates');
    expect(getRootGroupFromPath(['industry-templates', 'tmpl-1'])).toBe('');
  });
});
