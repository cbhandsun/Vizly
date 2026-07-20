import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { DiagramCardSkeleton } from '../DiagramCardSkeleton';
import { WorkspaceEmptyState } from '../WorkspaceEmptyState';
import { WorkspaceGlobalHeader } from '../WorkspaceGlobalHeader';

describe('WorkspaceDashboardChrome', () => {
  it('renders reusable loading and empty states', () => {
    const onCreate = vi.fn();
    const skeleton = renderToStaticMarkup(<DiagramCardSkeleton />);
    const empty = renderToStaticMarkup(<WorkspaceEmptyState onCreate={onCreate} />);

    expect(skeleton).toContain('skeleton-card');
    expect(empty).toContain('No diagrams');
    expect(empty).toContain('New Diagram');
  });

  it('does not render an unsafe avatar URL', () => {
    const html = renderToStaticMarkup(
      <WorkspaceGlobalHeader
        searchTerm="query"
        onSearchTermChange={() => undefined}
        onNavigateHome={() => undefined}
        settingsMenu={[]}
        isAuthenticated
        avatarUrl="javascript:alert(1)"
      />,
    );

    expect(html).toContain('Find your ideas');
    expect(html).not.toContain('javascript:');
  });
});
