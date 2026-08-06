import { useCallback, useRef, useState } from 'react';

import { sanitizeWorkspaceSearchInput } from './workspaceSearch';

export const useWorkspaceSearch = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const updateSearchTerm = useCallback((value: unknown) => {
    setSearchTerm(sanitizeWorkspaceSearchInput(value));
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    queueMicrotask(() => searchInputRef.current?.focus());
  }, []);

  return {
    searchTerm,
    searchQuery: searchTerm.trim(),
    searchInputRef,
    updateSearchTerm,
    clearSearch,
  };
};
