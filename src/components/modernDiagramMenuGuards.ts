import type { IconType } from 'react-icons';
import { FaSitemap } from 'react-icons/fa';
import type { DiagramDefinition } from '@/core/types/diagram-components';

export type DiagramCategory = NonNullable<DiagramDefinition['category']>;

const KNOWN_CATEGORIES = new Set<DiagramCategory>([
  'architecture',
  'logistics',
  'systems',
  'transport',
  'warehouse',
  'sub-system',
  'business',
  'tech',
  'debug',
  'tool',
  'other',
]);

const SAFE_THEME_ID = /^[\w.-]{1,80}$/u;
const SAFE_DIAGRAM_ID = /^[\w:./ -]{1,160}$/u;

export const normalizeDiagramId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized && SAFE_DIAGRAM_ID.test(normalized) ? normalized : null;
};

export const normalizeDiagramCategory = (value: unknown): DiagramCategory => (
  typeof value === 'string' && KNOWN_CATEGORIES.has(value as DiagramCategory)
    ? value as DiagramCategory
    : 'other'
);

export const normalizeThemeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return SAFE_THEME_ID.test(normalized) ? normalized : null;
};

export const isIconType = (value: unknown): value is IconType => typeof value === 'function';

export const getDiagramIcon = (diagram: DiagramDefinition): IconType => (
  isIconType(diagram.icon) ? diagram.icon : FaSitemap
);

export const getDiagramDataSelector = (id: string): string | null => {
  const normalized = normalizeDiagramId(id);
  if (!normalized) return null;
  const escape = globalThis.CSS?.escape;
  return `[data-diagram-id="${escape ? escape(normalized) : normalized.replace(/["\\]/g, '\\$&')}"]`;
};
