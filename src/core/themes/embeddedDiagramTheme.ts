import type { ThemeColor } from './types/ThemeTypes';
import { isSafeCssColor } from './themeImportSecurity';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

type ThemeColorPatch = Partial<Record<keyof ThemeColor, string>>;

export interface EmbeddedDiagramTheme {
  name: string;
  displayName?: string;
  domains: Record<string, ThemeColorPatch>;
}

const THEME_COLOR_KEYS: (keyof ThemeColor)[] = [
  'main', 'light', 'dark', 'contrast', 'border', 'background', 'text', 'shadow',
];

export const parseEmbeddedDiagramTheme = (value: unknown): EmbeddedDiagramTheme | null => {
  if (!isRecord(value) || typeof value.name !== 'string') return null;
  const name = value.name.trim().slice(0, 120);
  if (!name) return null;
  const domains: Record<string, ThemeColorPatch> = {};
  if (isRecord(value.domains)) {
    Object.entries(value.domains).slice(0, 64).forEach(([domain, rawColor]) => {
      if (!isRecord(rawColor)) return;
      const patch: ThemeColorPatch = {};
      THEME_COLOR_KEYS.forEach(key => {
        if (typeof rawColor[key] === 'string' && isSafeCssColor(rawColor[key])) {
          patch[key] = rawColor[key];
        }
      });
      if (Object.keys(patch).length > 0) domains[domain.slice(0, 120)] = patch;
    });
  }
  return {
    name,
    displayName: typeof value.displayName === 'string'
      ? value.displayName.trim().slice(0, 240)
      : undefined,
    domains,
  };
};
