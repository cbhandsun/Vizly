// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagramDefinition } from '@/core/types/diagram-components';

const { toggleFavoriteMock } = vi.hoisted(() => ({ toggleFavoriteMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/core/hooks/useConfigIntegration', () => ({
  useConfigIntegration: () => [{ isReady: false, integration: undefined }],
}));

vi.mock('@/core/hooks/usePanelZoom', () => ({
  usePanelZoom: () => ({ scale: 1, onWheel: vi.fn() }),
}));

vi.mock('@/core/hooks/useDiagramFilter', () => ({
  useDiagramFilter: (diagrams: DiagramDefinition[]) => ({
    searchTerm: '',
    setSearchTerm: vi.fn(),
    selectedTags: [],
    setSelectedTags: vi.fn(),
    matchMode: 'any',
    setMatchMode: vi.fn(),
    filteredDiagrams: diagrams,
    tagStats: { allTags: [], counts: new Map<string, number>() },
  }),
}));

vi.mock('@/core/hooks/useDiagramHostStorage', () => ({
  useDiagramHostStorage: () => ({
    favoriteDiagrams: [],
    toggleFavorite: toggleFavoriteMock,
    clearFavorites: vi.fn(),
  }),
}));

vi.mock('@/core/utils/diagramMenuStorage', () => ({
  readCollapsedGroups: () => ({}),
  readMenuScrollTop: () => null,
  writeCollapsedGroups: vi.fn(),
  writeMenuScrollTop: vi.fn(),
}));

vi.mock('../auth/AuthStatus', () => ({ AuthStatusCompact: () => null }));

import ModernDiagramMenu from '../ModernDiagramMenu';

const diagram: DiagramDefinition = {
  id: 'orders',
  name: 'Orders',
  category: 'business',
  component: () => null,
};

describe('ModernDiagramMenu row interactions', () => {
  it('separates diagram selection from favorite activation', () => {
    const onSelectDiagram = vi.fn();
    toggleFavoriteMock.mockClear();
    render(
      <ModernDiagramMenu
        diagrams={[diagram]}
        selectedDiagram="orders"
        onSelectDiagram={onSelectDiagram}
      />,
    );

    const selection = screen.getByRole('button', { name: 'Orders' });
    const favorite = screen.getByRole('button', { name: 'designer.menu.favorite' });
    expect(selection).toHaveAttribute('aria-current', 'page');
    expect(selection).toHaveClass('min-h-11');
    expect(favorite).toHaveClass('h-11');
    expect(selection.contains(favorite)).toBe(false);

    fireEvent.keyDown(favorite, { key: 'Enter' });
    fireEvent.click(favorite);
    expect(toggleFavoriteMock).toHaveBeenCalledWith('orders');
    expect(onSelectDiagram).not.toHaveBeenCalled();

    fireEvent.click(selection);
    expect(onSelectDiagram).toHaveBeenCalledWith('orders');
  });
});
