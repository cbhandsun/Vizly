import { describe, expect, it } from 'vitest';

import {
  createStandardPresetInitialMetadata,
  resolveInitialLayoutSelectionFromStandardLayout,
} from '../standardPresetLayoutSelection';

describe('standardPresetLayoutSelection', () => {
  it('projects a left-to-right standard DomainDagre seed into a selectable menu state', () => {
    expect(resolveInitialLayoutSelectionFromStandardLayout({
      direction: 'LR',
      spacing: { horizontal: 72, vertical: 48 },
    })).toEqual({
      version: 2,
      strategy: 'domain-dagre',
      direction: 'LR',
      nodeLayout: 'dagre',
      laneRankPreference: 'auto',
    });
  });

  it('preserves custom domain arrangements from standard preset layout metadata', () => {
    expect(resolveInitialLayoutSelectionFromStandardLayout({
      type: 'DomainVerticalLayout',
      nodeLayout: 'vertical',
      direction: 'TB',
    })).toEqual({
      version: 2,
      strategy: 'domain-vertical',
      direction: 'TB',
      nodeLayout: 'vertical',
      laneRankPreference: 'auto',
    });
  });

  it('does not overwrite an explicit persisted layout selection', () => {
    const metadata = createStandardPresetInitialMetadata({
      layout: { direction: 'LR' },
      metadata: {
        title: 'Preset',
        layoutSelection: {
          version: 2,
          strategy: 'domain-lanes',
          direction: 'BT',
          nodeLayout: 'grid',
          laneRankPreference: 'compact',
        },
      },
    });

    expect(metadata.layoutSelection).toEqual({
      version: 2,
      strategy: 'domain-lanes',
      direction: 'BT',
      nodeLayout: 'grid',
      laneRankPreference: 'compact',
    });
  });
});
