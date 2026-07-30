import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => {
      const values: Record<string, string> = {
        'common.language': 'Language',
        'workspace.chooseDiagramType': 'Choose a diagram type',
        'workspace.documentCount': `${options?.count ?? 0} documents`,
        'workspace.empty.description': 'Create a diagram to get started.',
        'workspace.empty.title': 'No diagrams yet',
        'workspace.goHome': 'Go to workspace',
        'workspace.newDiagram': 'New diagram',
        'workspace.newFlowchart': 'New flowchart',
        'workspace.diagramTypes.architecture': 'Architecture',
        'workspace.diagramTypes.mindmap': 'Mind map',
        'workspace.diagramTypes.timeline': 'Timeline',
        'workspace.diagramTypeDescriptions.architecture': 'Map systems and dependencies',
        'workspace.diagramTypeDescriptions.mindmap': 'Explore ideas and relationships',
        'workspace.diagramTypeDescriptions.timeline': 'Plan milestones and schedules',
        'workspace.search': 'Search workspace',
        'workspace.searchPlaceholder': 'Find your diagrams...',
        'workspace.settings': 'Settings',
        'workspace.title': 'Workspace',
        'workspace.toggleTheme': 'Toggle theme',
      };
      return values[key] ?? key;
    },
    i18n: {
      language: 'en',
      resolvedLanguage: 'en',
      changeLanguage: vi.fn(),
    },
  }),
}));

import { DiagramCardSkeleton } from '../DiagramCardSkeleton';
import { WorkspaceEmptyState } from '../WorkspaceEmptyState';
import {
  PRIMARY_WORKSPACE_TEMPLATE,
  WorkspaceCompactHeader,
} from '../WorkspaceCompactHeader';
import { WorkspaceGlobalHeader } from '../WorkspaceGlobalHeader';

describe('WorkspaceDashboardChrome', () => {
  it('renders reusable loading and empty states', () => {
    const onCreate = vi.fn();
    const skeleton = renderToStaticMarkup(<DiagramCardSkeleton />);
    const empty = renderToStaticMarkup(<WorkspaceEmptyState onCreate={onCreate} />);

    expect(skeleton).toContain('skeleton-card');
    expect(empty).toContain('No diagrams yet');
    expect(empty).toContain('New diagram');
  });

  it('renders a semantic page heading and separate new-diagram controls', () => {
    const html = renderToStaticMarkup(
      <WorkspaceCompactHeader documentCount={12} onCreateTemplate={() => undefined} />,
    );

    expect(html).toContain('<h1');
    expect(html).toContain('12 documents');
    expect(html).toContain('Choose a diagram type');
    expect(html).toContain('New flowchart');
    expect(html).toContain('create-btn-main');
    expect(html).toContain('create-btn-menu');
    expect(PRIMARY_WORKSPACE_TEMPLATE).toBe('flowchart');
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

    expect(html).toContain('Find your diagrams');
    expect(html).toContain('aria-label="Search workspace"');
    expect(html).not.toContain('javascript:');
  });
});
