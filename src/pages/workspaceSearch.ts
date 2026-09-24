export const MAX_WORKSPACE_SEARCH_LENGTH = 120;

const isControlCharacter = (character: string): boolean => {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
};

export const sanitizeWorkspaceSearchInput = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return Array.from(value)
    .filter(character => !isControlCharacter(character))
    .slice(0, MAX_WORKSPACE_SEARCH_LENGTH)
    .join('');
};

const coerceResultCount = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
};

export interface WorkspaceSearchFeedback {
  value: string;
  query: string;
  isActive: boolean;
  resultCount: number;
}

export const getWorkspaceSearchFeedback = (
  value: unknown,
  resultCount: unknown,
): WorkspaceSearchFeedback => {
  const safeValue = sanitizeWorkspaceSearchInput(value);
  const query = safeValue.trim();
  return {
    value: safeValue,
    query,
    isActive: query.length > 0,
    resultCount: coerceResultCount(resultCount),
  };
};
