// @vitest-environment node

import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceDiagramCollection } from '../WorkspaceDiagramCollection';
import type {
  FilterViewType,
  UnifiedDiagramItem,
  ViewMode,
  WorkspaceInventoryScope,
} from '../diagramManagementPage.helpers';
import type { WorkspaceInventoryLoadFailureReason } from '../workspaceInventoryLoad';

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
  activeView: FilterViewType = 'templates',
  viewMode: ViewMode = 'grid',
  loadedInventoryScopes: ReadonlySet<WorkspaceInventoryScope> = new Set(['documents', 'templates']),
  loadFailure: WorkspaceInventoryLoadFailureReason | null = null,
  onRetryLoad: () => void = () => undefined,
): string => renderToStaticMarkup(
  <WorkspaceDiagramCollection
    activeView={activeView}
    onActiveViewChange={() => undefined}
    unifiedItems={[item]}
    loadedInventoryScopes={loadedInventoryScopes}
    filteredItems={filteredItems}
    sortKey="updated"
    onSortKeyChange={() => undefined}
    viewMode={viewMode}
    onViewModeChange={() => undefined}
    loading={false}
    loadFailure={loadFailure}
    onRetryLoad={onRetryLoad}
    isAuthenticated
    onRequestAuth={() => undefined}
    openingDiagramKeys={new Set()}
    onOpenDiagram={() => undefined}
    onOpenDiagramInNewTab={() => undefined}
    onContextMenu={() => undefined}
    onDeleteDiagram={() => undefined}
    onCreateBlank={() => undefined}
    searchQuery={searchQuery}
    onClearSearch={() => undefined}
  />,
);

const renderOpeningCollection = (
  item: UnifiedDiagramItem,
  viewMode: ViewMode = 'grid',
): string => renderToStaticMarkup(
  <WorkspaceDiagramCollection
    activeView="recent"
    onActiveViewChange={() => undefined}
    unifiedItems={[item]}
    loadedInventoryScopes={new Set(['documents', 'templates'])}
    filteredItems={[item]}
    sortKey="updated"
    onSortKeyChange={() => undefined}
    viewMode={viewMode}
    onViewModeChange={() => undefined}
    loading={false}
    loadFailure={null}
    onRetryLoad={() => undefined}
    isAuthenticated
    onRequestAuth={() => undefined}
    openingDiagramKeys={new Set([`${item.source}:${item.id}`])}
    onOpenDiagram={() => undefined}
    onOpenDiagramInNewTab={() => undefined}
    onContextMenu={() => undefined}
    onDeleteDiagram={() => undefined}
    onCreateBlank={() => undefined}
    searchQuery=""
    onClearSearch={() => undefined}
  />,
);

const renderLoadingCollection = (): string => renderToStaticMarkup(
  <WorkspaceDiagramCollection
    activeView="templates"
    onActiveViewChange={() => undefined}
    unifiedItems={[]}
    loadedInventoryScopes={new Set(['documents'])}
    filteredItems={[]}
    sortKey="updated"
    onSortKeyChange={() => undefined}
    viewMode="grid"
    onViewModeChange={() => undefined}
    loading
    loadFailure={null}
    onRetryLoad={() => undefined}
    isAuthenticated
    onRequestAuth={() => undefined}
    openingDiagramKeys={new Set()}
    onOpenDiagram={() => undefined}
    onOpenDiagramInNewTab={() => undefined}
    onContextMenu={() => undefined}
    onDeleteDiagram={() => undefined}
    onCreateBlank={() => undefined}
    searchQuery=""
    onClearSearch={() => undefined}
  />,
);

describe('WorkspaceDiagramCollection', () => {
  it('announces the loading state instead of exposing an unexplained blank region', () => {
    const html = renderLoadingCollection();

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="workspace.loadingData"');
    expect(html).toContain('skeleton-card');
  });

  it('replaces an unbounded loading state with a recoverable timeout result', () => {
    const retry = vi.fn();
    const html = renderCollection(
      {
        id: 'template-placeholder',
        title: 'Template placeholder',
        updatedAt: 0,
        source: 'template',
        role: 'template',
        raw: {} as never,
      },
      [],
      '',
      'templates',
      'grid',
      new Set(['documents']),
      'timeout',
      retry,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('workspace.empty.loadErrorTitle');
    expect(html).toContain('workspace.empty.loadTimeoutDescription');
    expect(html).toContain('workspace.retryLoad');
    expect(html).not.toContain('skeleton-card');
  });

  it('omits counts for inventory scopes that have not been loaded', () => {
    const item: UnifiedDiagramItem = {
      id: 'local-known',
      title: 'Known local diagram',
      updatedAt: 1,
      source: 'local',
      role: 'owner',
      raw: { id: 'local-known' } as never,
    };
    const html = renderCollection(
      item,
      [item],
      '',
      'recent',
      'list',
      new Set(['documents']),
    );

    expect(html).toMatch(/workspace\.local<span class="filter-tab-count">1<\/span>/);
    expect(html).not.toMatch(/workspace\.industryTemplates<span class="filter-tab-count">/);
    expect(html).not.toMatch(/workspace\.generalTemplates<span class="filter-tab-count">/);
  });

  it('reports the bounded number of documents actually available in Recent', () => {
    const items: UnifiedDiagramItem[] = Array.from({ length: 35 }, (_, index) => ({
      id: `diagram-${index}`,
      title: `Diagram ${index}`,
      updatedAt: index + 1,
      source: 'local',
      role: 'owner',
      raw: { id: `diagram-${index}` } as never,
    }));
    const html = renderToStaticMarkup(
      <WorkspaceDiagramCollection
        activeView="recent"
        onActiveViewChange={() => undefined}
        unifiedItems={items}
        loadedInventoryScopes={new Set(['documents', 'templates'])}
        filteredItems={items.slice(0, 30)}
        sortKey="updated"
        onSortKeyChange={() => undefined}
        viewMode="list"
        onViewModeChange={() => undefined}
        loading={false}
        loadFailure={null}
        onRetryLoad={() => undefined}
        isAuthenticated
        onRequestAuth={() => undefined}
        openingDiagramKeys={new Set()}
        onOpenDiagram={() => undefined}
        onOpenDiagramInNewTab={() => undefined}
        onContextMenu={() => undefined}
        onDeleteDiagram={() => undefined}
        onCreateBlank={() => undefined}
        searchQuery=""
        onClearSearch={() => undefined}
      />,
    );

    expect(html).toMatch(/workspace\.recent<span class="filter-tab-count">30<\/span>/);
  });

  it('makes the empty-workspace create action non-repeatable while creation is pending', () => {
    const html = renderToStaticMarkup(
      <WorkspaceDiagramCollection
        activeView="recent"
        onActiveViewChange={() => undefined}
        unifiedItems={[]}
        loadedInventoryScopes={new Set(['documents', 'templates'])}
        filteredItems={[]}
        sortKey="updated"
        onSortKeyChange={() => undefined}
        viewMode="grid"
        onViewModeChange={() => undefined}
        loading={false}
        loadFailure={null}
        onRetryLoad={() => undefined}
        isAuthenticated
        onRequestAuth={() => undefined}
        isCreatingDiagram
        openingDiagramKeys={new Set()}
        onOpenDiagram={() => undefined}
        onOpenDiagramInNewTab={() => undefined}
        onContextMenu={() => undefined}
        onDeleteDiagram={() => undefined}
        onCreateBlank={() => undefined}
        searchQuery=""
        onClearSearch={() => undefined}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('workspace.creatingDiagram');
  });

  it('exposes a visible, non-repeatable busy state while a diagram is opening', () => {
    const item: UnifiedDiagramItem = {
      id: 'slow-cloud-diagram',
      title: 'Slow cloud diagram',
      updatedAt: 1,
      source: 's3',
      role: 'owner',
      raw: { id: 'slow-cloud-diagram' } as never,
    };

    const html = renderOpeningCollection(item);

    expect(html).toContain('diagram-card is-opening');
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
    expect(html).toContain('role="status"');
    expect(html).toContain('workspace.openingDiagram');

    const listHtml = renderOpeningCollection(item, 'list');
    expect(listHtml).toContain('diagram-list-row is-opening');
    expect(listHtml).toContain('diagram-open-pending list');
  });

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

  it('localizes diagram type badges in grid and list views with a safe fallback', () => {
    const mindMap: UnifiedDiagramItem = {
      id: 'mindmap-localized',
      title: 'Mind map',
      updatedAt: 1,
      source: 'local',
      role: 'owner',
      raw: { id: 'mindmap-localized', type: 'mindmap' } as never,
    };
    const remoteTemplate: UnifiedDiagramItem = {
      id: 'template-default-type',
      title: 'Template',
      updatedAt: 1,
      source: 'template',
      role: 'template',
      raw: { id: 'template-default-type' } as never,
    };

    expect(renderCollection(mindMap)).toContain('workspace.diagramTypes.mindmap');
    expect(renderCollection(mindMap, [mindMap], '', 'recent', 'list'))
      .toContain('workspace.diagramTypes.mindmap');
    expect(renderCollection(remoteTemplate)).toContain('workspace.diagramTypes.default');
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
    expect(html).toContain('role="group" aria-label="workspace.filterBy"');
    expect(html).toContain('role="group" aria-label="workspace.viewMode"');
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

  it('renders a contextual recovery action for an empty filtered view', () => {
    const item: UnifiedDiagramItem = {
      id: 'local-only',
      title: 'Local diagram',
      updatedAt: 1,
      source: 'local',
      role: 'owner',
      raw: { id: 'local-only' } as never,
    };

    const html = renderCollection(item, [], '', 'cloud');

    expect(html).toContain('workspace.empty.filterTitle');
    expect(html).toContain('workspace.empty.filterDescription');
    expect(html).toContain('workspace.viewRecent');
    expect(html).not.toContain('workspace.newDiagram');
  });

  it('keeps sort and view controls available at the mobile breakpoint', () => {
    const css = readFileSync(new URL('../WorkspaceDashboard.mobile.css', import.meta.url), 'utf8');
    const mobileControlsRule = css.match(/\.workspace-view-controls\s*{([^}]*)}/)?.[1];

    expect(mobileControlsRule).toContain('display: flex;');
    expect(mobileControlsRule).toContain('width: 100%;');
    expect(mobileControlsRule).not.toContain('display: none;');
    expect(css).toMatch(/\.workspace-view-controls \.view-toggle-btn\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/);
    expect(css).toMatch(/\.workspace-sort-trigger-label\s*{[\s\S]*?display: inline;/);

    const desktopCss = readFileSync(new URL('../WorkspaceDashboard.css', import.meta.url), 'utf8');
    expect(desktopCss).toMatch(/\.workspace-sort-trigger\s*{[\s\S]*?min-width: 132px;/);
    expect(desktopCss).toMatch(/\.workspace-sort-trigger-label\s*{[\s\S]*?display: inline;/);
  });
});
