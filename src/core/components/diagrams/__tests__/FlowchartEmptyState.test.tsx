import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { FlowchartEmptyState } from '../FlowchartEmptyState';

describe('FlowchartEmptyState', () => {
  it('renders separate desktop and mobile guidance', () => {
    const html = renderToStaticMarkup(
      <FlowchartEmptyState visible onOpenShapePicker={() => undefined} />,
    );

    expect(html).toContain('flowchart-empty-description-desktop');
    expect(html).toContain('designer.flowchart.emptyState.desktopDescription');
    expect(html).toContain('flowchart-empty-description-mobile');
    expect(html).toContain('designer.flowchart.emptyState.mobileDescription');
    expect(html).toContain('flowchart-empty-action');
    expect(html).toContain('designer.flowchart.emptyState.primaryAction');
    expect(html).toContain('type="button"');
  });

  it('renders nothing when the empty state is not visible', () => {
    expect(renderToStaticMarkup(<FlowchartEmptyState visible={false} />)).toBe('');
  });
});
