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

const renderCollection = (item: UnifiedDiagramItem): string => renderToStaticMarkup(
  <WorkspaceDiagramCollection
    activeView="templates"
    onActiveViewChange={() => undefined}
    unifiedItems={[item]}
    filteredItems={[item]}
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
});
