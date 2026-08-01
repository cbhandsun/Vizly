import { sanitizeInlineHtml } from '../../utils/sanitizeHtml';

const MAX_ACCESSIBLE_LABEL_LENGTH = 256;

export interface ContainerNodeAccessibilityInput {
  accessibleName: string;
  selected: boolean;
  collapsed: boolean;
  childCount: number;
}

export interface ContainerNodeAccessibilityProps {
  role: 'treeitem';
  tabIndex: 0;
  'aria-label': string;
  'aria-selected': boolean;
  'aria-expanded'?: boolean;
}

export const toContainerAccessibleText = (value: unknown, fallback: string): string => {
  const fallbackText = typeof fallback === 'string' ? fallback.trim() : '';
  const candidate = typeof value === 'string' ? sanitizeInlineHtml(value) : '';
  const plainText = candidate
    .replace(/<br\s*\/?\s*>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  return (plainText || fallbackText || 'Group').slice(0, MAX_ACCESSIBLE_LABEL_LENGTH);
};

export const createContainerNodeAccessibilityProps = ({
  accessibleName,
  selected,
  collapsed,
  childCount,
}: ContainerNodeAccessibilityInput): ContainerNodeAccessibilityProps => ({
  role: 'treeitem',
  tabIndex: 0,
  'aria-label': accessibleName,
  'aria-selected': selected,
  ...(childCount > 0 ? { 'aria-expanded': !collapsed } : {}),
});
