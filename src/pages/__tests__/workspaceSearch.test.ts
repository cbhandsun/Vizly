import { describe, expect, it } from 'vitest';

import {
  getWorkspaceSearchFeedback,
  MAX_WORKSPACE_SEARCH_LENGTH,
  sanitizeWorkspaceSearchInput,
} from '../workspaceSearch';

describe('workspaceSearch', () => {
  it('preserves visible search text and derives a trimmed query', () => {
    expect(getWorkspaceSearchFeedback('  roadmap  ', 3.9)).toEqual({
      value: '  roadmap  ',
      query: 'roadmap',
      isActive: true,
      resultCount: 3,
    });
  });

  it('treats empty and whitespace-only values as inactive', () => {
    expect(getWorkspaceSearchFeedback('', 4).isActive).toBe(false);
    expect(getWorkspaceSearchFeedback('   ', 4).isActive).toBe(false);
  });

  it('rejects non-string external values', () => {
    expect(sanitizeWorkspaceSearchInput(null)).toBe('');
    expect(sanitizeWorkspaceSearchInput({ query: 'roadmap' })).toBe('');
  });

  it('removes control characters without interpreting visible markup', () => {
    expect(sanitizeWorkspaceSearchInput('safe\u0000\n<img src=x>')).toBe('safe<img src=x>');
  });

  it('clamps by Unicode code point without splitting surrogate pairs', () => {
    const result = sanitizeWorkspaceSearchInput('🔎'.repeat(MAX_WORKSPACE_SEARCH_LENGTH + 5));

    expect(Array.from(result)).toHaveLength(MAX_WORKSPACE_SEARCH_LENGTH);
    expect(result.endsWith('🔎')).toBe(true);
  });

  it('coerces invalid and unsafe result counts to zero', () => {
    expect(getWorkspaceSearchFeedback('query', -1).resultCount).toBe(0);
    expect(getWorkspaceSearchFeedback('query', Number.POSITIVE_INFINITY).resultCount).toBe(0);
    expect(getWorkspaceSearchFeedback('query', '12').resultCount).toBe(0);
  });
});
