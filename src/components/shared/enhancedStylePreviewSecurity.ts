import type { FlowStylePreset } from '@/core/components/shared/DiagramStyleManager';
import { toSafeThemePreviewColor } from '@/core/themes/themePreviewSecurity';

export const toSafeSvgIdPart = (value: unknown, fallback = 'preset'): string => {
  const text = typeof value === 'string' ? value : fallback;
  const safe = text.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
  return safe || fallback;
};

export const toBoundedNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
};

export const getPreviewEdgeColor = (value: unknown, fallback = '#64748b'): string => (
  toSafeThemePreviewColor(value) || fallback
);

export const getSafePresetTranslationKey = (preset: FlowStylePreset): string => (
  `style.preset.${toSafeSvgIdPart(preset.name, 'standard')}`
);
