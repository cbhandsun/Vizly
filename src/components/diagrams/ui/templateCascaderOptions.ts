export interface TemplateMenuItem {
  id?: unknown;
  title?: unknown;
  category?: unknown;
}

export interface TemplateMenuLeafOption {
  value: string;
  label: string;
}

export type TemplateRootGroup = 'system-templates' | 's3' | 'supabase' | 'local-workspace';

const MAX_MENU_TEXT_LENGTH = 120;

export const GENERAL_CATEGORIES = new Set(['general', '通用', 'general_template']);

export const normalizeTemplateMenuText = (value: unknown, fallback = ''): string => {
  const text = typeof value === 'string' ? value : fallback;
  return text
    .split('')
    .filter(char => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127 && char !== '<' && char !== '>';
    })
    .join('')
    .trim()
    .slice(0, MAX_MENU_TEXT_LENGTH);
};

export const normalizeTemplateMenuId = (value: unknown): string | null => {
  const id = normalizeTemplateMenuText(value);
  if (!id) return null;
  return id;
};

export const normalizeTemplateItem = (item: TemplateMenuItem): { id: string; title: string; category: string } | null => {
  const id = normalizeTemplateMenuId(item.id);
  if (!id) return null;

  const title = normalizeTemplateMenuText(item.title, id) || id;
  const category = normalizeTemplateMenuText(item.category, '其他行业') || '其他行业';
  return { id, title, category };
};

export const buildTemplateMenuLeafOptions = (
  items: readonly TemplateMenuItem[],
): TemplateMenuLeafOption[] => items.flatMap((item) => {
  const id = normalizeTemplateMenuId(item.id);
  if (!id) return [];

  return [{
    value: id,
    label: normalizeTemplateMenuText(item.title, id) || id,
  }];
});

export const buildCustomTemplateMenuLeafOptions = (
  keys: readonly unknown[],
): TemplateMenuLeafOption[] => keys.flatMap((key) => {
  const id = normalizeTemplateMenuId(key);
  return id ? [{ value: `custom:${id}`, label: id }] : [];
});

export const coerceCascaderPath = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(segment => normalizeTemplateMenuId(segment))
    .filter((segment): segment is string => !!segment);
};

export const getRootGroupFromPath = (path: readonly string[]): TemplateRootGroup | '' => {
  if (path.length === 0) return '';
  const root = path[0];
  if (root === 'system-templates' || root === 's3' || root === 'supabase' || root === 'local-workspace') {
    return root;
  }
  return '';
};
