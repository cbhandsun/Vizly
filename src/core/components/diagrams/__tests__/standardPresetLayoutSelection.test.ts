import { describe, expect, it } from 'vitest';

import {
  createStandardPresetInitialMetadata,
  resolveInitialLayoutSelectionFromStandardLayout,
  resolveInitialLayoutSelectionFromStandardPreset,
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

  it('defaults horizontal custom domain presets to a selectable left-to-right command', () => {
    expect(resolveInitialLayoutSelectionFromStandardLayout({
      type: 'DomainHorizontalLayout',
      nodeLayout: 'grid',
    })).toEqual({
      version: 2,
      strategy: 'domain-horizontal',
      direction: 'LR',
      nodeLayout: 'grid',
      laneRankPreference: 'auto',
    });
  });

  it('keeps forest-safe custom preset layouts replayable from layout combinations', () => {
    expect(resolveInitialLayoutSelectionFromStandardPreset({
      layout: { type: 'DomainVerticalLayout', nodeLayout: 'vertical' },
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'a-b', source: 'a', target: 'b' }, { id: 'a-c', source: 'a', target: 'c' }],
    })).toEqual({
      version: 2,
      strategy: 'domain-vertical',
      direction: 'TB',
      nodeLayout: 'vertical',
      laneRankPreference: 'auto',
    });
  });

  it('normalizes complex custom preset layouts to an explicit standard preset command', () => {
    expect(resolveInitialLayoutSelectionFromStandardPreset({
      layout: { type: 'DomainVerticalLayout', nodeLayout: 'vertical' },
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'a-c', source: 'a', target: 'c' }, { id: 'b-c', source: 'b', target: 'c' }],
    })).toEqual({
      version: 2,
      strategy: 'domain-dagre',
      direction: 'TB',
      nodeLayout: 'dagre',
      laneRankPreference: 'auto',
    });
  });

  it('does not overwrite an explicit persisted layout selection', () => {
    const metadata = createStandardPresetInitialMetadata({
      layout: { direction: 'LR' },
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'a-c', source: 'a', target: 'c' }, { id: 'b-c', source: 'b', target: 'c' }],
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
