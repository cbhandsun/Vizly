import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceDiagramCollection } from '../WorkspaceDiagramCollection';
import type { UnifiedDiagramItem } from '../diagramManagementPage.helpers';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { title?: string }) => {
      if (key === 'workspace.unknownTime') return 'Unknown';
      if (key === 'workspace.openDiagram') return `Open diagram ${options?.title ?? ''}`;
      if (key === 'workspace.applyNamedTemplate') return `Use template ${options?.title ?? ''}`;
      if (key === 'workspace.moreActions') return `More actions for ${options?.title ?? ''}`;
      return key;
    },
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));

const renderCollection = (
  item: UnifiedDiagramItem,
  filteredItems: UnifiedDiagramItem[] = [item],
  searchQuery = '',
): string => renderToStaticMarkup(
  <WorkspaceDiagramCollection
    activeView="templates"
    onActiveViewChange={() => undefined}
    unifiedItems={[item]}
    filteredItems={filteredItems}
    sortKey="updated"
    onSortKeyChange={() => undefined}
    viewMode="grid"
    onViewModeChange={() => undefined}
    loading={false}
    onOpenDiagram={() => undefined}
    onOpenDiagramInNewTab={() => undefined}
    onContextMenu={() => undefined}
    onDeleteDiagram={() => undefined}
    onCreateBlank={() => undefined}
    searchQuery={searchQuery}
    onClearSearch={() => undefined}
  />,
);

describe('WorkspaceDiagramCollection', () => {
  it('sanitizes template thumbnail metadata again at the render boundary', () => {
    const item: UnifiedDiagramItem = {
      id: 'template-one',
      title: 'Unsafe thumbnail',
      updatedAt: Number.NaN,
      source: 'template',
      role: 'template',
      raw: {
        id: 'template-one',
        thumbnail_url: 'javascript:alert(1)',
        category: '仓储',
      } as never,
    };

    const html = renderCollection(item);

    expect(html).toContain('Unsafe thumbnail');
    expect(html).toContain('Unknown');
    expect(html).not.toContain('javascript:');
  });

  it('does not render a remote cover for an invalid storage id', () => {
    const item: UnifiedDiagramItem = {
      id: 'cloud-invalid',
      title: 'Cloud item',
      updatedAt: 0,
      source: 'supabase',
      role: 'owner',
      raw: { id: '' } as never,
    };

    expect(renderCollection(item)).not.toContain('remote-diagram-cover');
  });

  it('exposes the active filter and current sort mode without relying on color', () => {
    const item: UnifiedDiagramItem = {
      id: 'template-accessible',
      title: 'Accessible template',
      updatedAt: 1,
      source: 'template',
      role: 'template',
      raw: { id: 'template-accessible' } as never,
    };

    const html = renderCollection(item);

    expect(html).toMatch(/class="filter-tab active" aria-pressed="true"[\s\S]*?workspace\.industryTemplates/);
    expect(html).toContain('aria-label="workspace.sortBy: workspace.lastModified"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('workspace-sort-trigger-label">workspace.lastModified</span>');
    expect(html).toMatch(/aria-label="More actions for Accessible template" aria-haspopup="menu" aria-expanded="false"/);
  });

  it('renders a recoverable search result state instead of the true-empty state', () => {
    const item: UnifiedDiagramItem = {
      id: 'existing-diagram',
      title: 'Existing diagram',
      updatedAt: 1,
      source: 'local',
      role: 'owner',
      raw: { id: 'existing-diagram' } as never,
    };

    const html = renderCollection(item, [], 'missing');

    expect(html).toContain('id="workspace-diagram-results"');
    expect(html).toContain('workspace.empty.searchTitle');
    expect(html).toContain('workspace.clearSearch');
    expect(html).not.toContain('workspace.empty.title');
  });

  it('keeps sort and view controls available at the mobile breakpoint', () => {
    const css = readFileSync(new URL('../WorkspaceDashboard.mobile.css', import.meta.url), 'utf8');
    const mobileControlsRule = css.match(/\.workspace-view-controls\s*{([^}]*)}/)?.[1];

    expect(mobileControlsRule).toContain('display: flex;');
    expect(mobileControlsRule).toContain('width: 100%;');
    expect(mobileControlsRule).not.toContain('display: none;');
    expect(css).toMatch(/\.workspace-sort-trigger-label\s*{[\s\S]*?display: inline;/);
  });
});
