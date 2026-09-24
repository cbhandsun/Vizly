// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceGlobalHeader } from '../WorkspaceGlobalHeader';
import { useWorkspaceSearch } from '../useWorkspaceSearch';
import { focusFirstWorkspaceResult } from '../workspaceMenuInteraction';

vi.mock('antd/es/avatar', () => ({
  default: ({ icon }: { icon?: ReactNode }) => <span>{icon}</span>,
}));

vi.mock('antd/es/dropdown', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/shared/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <button type="button">Language</button>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number; query?: string }) => {
      const values: Record<string, string> = {
        'workspace.clearSearch': 'Clear search',
        'workspace.goHome': 'Go to workspace',
        'workspace.search': 'Search workspace',
        'workspace.searchPlaceholder': 'Find your diagrams...',
        'workspace.settings': 'Settings',
        'workspace.toggleTheme': 'Toggle theme',
      };
      if (key === 'workspace.searchResultsStatus') return `${options?.count ?? 0} matching diagrams`;
      if (key === 'workspace.searchNoResultsStatus') return `No diagrams match ${options?.query ?? ''}`;
      return values[key] ?? key;
    },
  }),
}));

const SearchHarness = ({ resultCount = 0 }: { resultCount?: number }) => {
  const search = useWorkspaceSearch();
  return (
    <>
      <WorkspaceGlobalHeader
        searchTerm={search.searchTerm}
        onSearchTermChange={search.updateSearchTerm}
        searchInputRef={search.searchInputRef}
        searchResultCount={resultCount}
        onClearSearch={search.clearSearch}
        onNavigateToResults={() => focusFirstWorkspaceResult(
          document.getElementById('workspace-diagram-results'),
        )}
        onNavigateHome={() => undefined}
        settingsMenu={[]}
        isAuthenticated={false}
      />
      <div id="workspace-diagram-results">
        {resultCount > 0 ? (
          <button type="button" className="diagram-card-primary-action">
            Open first result
          </button>
        ) : null}
      </div>
    </>
  );
};

afterEach(cleanup);

describe('workspace search interactions', () => {
  it('exposes bounded search semantics and a polite result announcement', () => {
    render(<SearchHarness resultCount={2} />);
    const input = screen.getByRole('searchbox', { name: 'Search workspace' });

    expect(input).toHaveAttribute('maxlength', '120');
    expect(input).toHaveAttribute('aria-controls', 'workspace-diagram-results');
    expect(input).toHaveAttribute('aria-describedby', 'workspace-search-status');
    expect(input).toHaveAttribute('aria-keyshortcuts', 'ArrowDown Escape');

    fireEvent.change(input, { target: { value: 'roadmap' } });
    expect(screen.getByRole('status')).toHaveTextContent('2 matching diagrams');
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeVisible();
  });

  it('moves directly from an active search to the first available result with ArrowDown', () => {
    render(<SearchHarness resultCount={2} />);
    const input = screen.getByRole('searchbox', { name: 'Search workspace' });
    fireEvent.change(input, { target: { value: 'roadmap' } });
    input.focus();

    expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(false);
    expect(screen.getByRole('button', { name: 'Open first result' })).toHaveFocus();
    expect(input).toHaveValue('roadmap');
  });

  it('keeps ArrowDown inert when the active search has no available result', () => {
    render(<SearchHarness resultCount={0} />);
    const input = screen.getByRole('searchbox', { name: 'Search workspace' });
    fireEvent.change(input, { target: { value: 'missing' } });
    input.focus();

    expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(true);
    expect(input).toHaveFocus();
    expect(input).toHaveValue('missing');
  });

  it('clears with Escape and retains focus in the search field', async () => {
    render(<SearchHarness />);
    const input = screen.getByRole('searchbox', { name: 'Search workspace' });
    fireEvent.change(input, { target: { value: 'no-match' } });
    input.focus();

    expect(screen.getByRole('status')).toHaveTextContent('No diagrams match no-match');
    fireEvent.keyDown(input, { key: 'Escape' });
    await Promise.resolve();

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('clears from the visible recovery control and restores input focus', async () => {
    render(<SearchHarness />);
    const input = screen.getByRole('searchbox', { name: 'Search workspace' });
    fireEvent.change(input, { target: { value: 'missing' } });

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await Promise.resolve();

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });

  it('focuses the search field when the visible panel padding is pressed', () => {
    render(<SearchHarness />);
    const input = screen.getByRole('searchbox', { name: 'Search workspace' });
    const panel = input.closest('.workspace-search');
    if (!panel) throw new Error('Expected the search panel to wrap the input');

    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).not.toBe(input);

    // The panel is the 44px touch target; the padding around the input must
    // behave like the input instead of dropping focus on the page body.
    fireEvent.mouseDown(panel, { target: panel });

    expect(input).toHaveFocus();
  });

  it('leaves presses on the clear control to that control', () => {
    render(<SearchHarness />);
    const input = screen.getByRole('searchbox', { name: 'Search workspace' });
    fireEvent.change(input, { target: { value: 'roadmap' } });
    const clearButton = screen.getByRole('button', { name: 'Clear search' });

    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.mouseDown(clearButton);

    // Hijacking this press would move focus off the clear button and double
    // handle the clear action.
    expect(input).not.toHaveFocus();
  });
});
